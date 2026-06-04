import { z } from "npm:zod@3.25.76";
import { SupabaseClient } from "npm:@supabase/supabase-js@2.76.1";
import type {
  EnrichedSupportResult,
  PlanningRecord,
  SupportData,
  VisuelRecord,
} from "../types.ts";

// --- Zod schemas (AR10) ---

export const ragSearchInput = z.object({
  query: z
    .string()
    .describe(
      "Structured search terms: 'Catégorie: X | Lectorat: Y | Canal: Z | Thème: W'",
    ),
  keyword: z
    .string()
    .optional()
    .describe(
      "Most specific categorie or lectorat term for hybrid keyword matching (e.g. 'dentiste', 'PME')",
    ),
  matchCount: z
    .number()
    .optional()
    .default(40)
    .describe("Max results to return"),
});

export const ragSearchOutput = z.object({
  supports: z.array(
    z.object({
      variant_slug: z.string(),
      support_name: z.string(),
      canal: z.string(),
      categorie: z.string().nullable(),
      lectorat: z.string().nullable(),
      tarif_brut: z.string().nullable(),
      tarif_net: z.string().nullable(),
      periodicite_print: z.string().nullable(),
      diffusion_print: z.number().nullable(),
      visites_par_mois_web: z.number().nullable(),
      pages_vues_par_mois_web: z.number().nullable(),
      nombre_envois_nl: z.number().nullable(),
      format_print: z.string().nullable(),
      similarity: z.number(),
      visuels: z.array(z.object({
        type_de_format: z.string().nullable(),
        fichier_url: z.string().nullable(),
        notes: z.string().nullable(),
      })).nullable(),
      specs_techniques: z.string().nullable(),
    }),
  ),
  total: z.number(),
  inserted: z.number(), // actual rows newly inserted or reactivated (differs from total when dedup skips existing)
  thresholdUsed: z.number(),
});

// --- Embedding generation (direct OpenAI call, not EF-to-EF) ---

async function generateEmbedding(query: string): Promise<number[]> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: query,
      encoding_format: "float",
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Embedding API error: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

// --- Map RAG result to immutable support_data JSONB (AR15) ---

function toSupportData(result: EnrichedSupportResult): SupportData {
  const planningData = result.planning_data || [];
  return {
    support_name: result.support,
    support_slug: result.support_slug,
    variant_slug: result.variant_slug,
    categorie: result.categorie,
    lectorat: result.lectorat,
    canal: result.canal,
    type_tarif: (['forfait', 'cpm', 'pack', 'unitaire'].includes(result.type_tarif ?? '')
      ? result.type_tarif as 'forfait' | 'cpm' | 'pack' | 'unitaire'
      : 'forfait'),
    periodicite_print: result.periodicite_print,
    diffusion_print: result.diffusion_print,
    format_print: result.format_print,
    visites_par_mois_web: result.visites_par_mois_web,
    pages_vues_par_mois_web: result.pages_vues_par_mois_web,
    nombre_envois_nl: result.nombre_envois_nl,
    tarif_brut: result.tarif_brut,
    tarif_net: result.tarif_net,
    similarity: result.similarity,
    dates_parution: planningData
      .filter((p: PlanningRecord) => p.type === "Parution")
      .map((p: PlanningRecord) => ({
        date: p.date,
        periodicite: p.periodicite,
        specs_techniques: p.specs_techniques,
        notes: p.notes,
      })),
    dates_bouclage: planningData
      .filter((p: PlanningRecord) => p.type === "Bouclage")
      .map((p: PlanningRecord) => ({
        date: p.date,
        periodicite: p.periodicite,
        specs_techniques: p.specs_techniques,
        notes: p.notes,
      })),
    visuels_data: result.visuels_data || null,
    contacts_data: result.contacts_data || null,
    url: result.url || null,
    periodicite_nl: result.periodicite_nl || null,
    abonnes_nl: result.abonnes_nl ?? null,
    taux_ouverture_nl: result.taux_ouverture_nl ?? null,
    format_nl: result.format_nl || null,
    format_web: result.format_web || null,
  };
}

// --- Main execute function (AR10: clients received as parameters) ---

export async function executeRagSearch(
  input: z.infer<typeof ragSearchInput>,
  clients: { userClient: SupabaseClient; adminClient: SupabaseClient },
  context: { conversationId: string; orgId: string },
  canalOverride?: "Print" | "Web" | "NL",
  keepExisting = false,
): Promise<z.infer<typeof ragSearchOutput>> {
  // 1. Generate embedding for the query
  const embedding = await generateEmbedding(input.query);
  const matchCount = input.matchCount ?? 20;

  // Validate structured query format (Task 5 fallback check)
  if (input.query && !input.query.includes("Catégorie:") && !input.query.includes("Lectorat:")) {
    console.warn("[ragSearch] Query not structured, embedding raw text:", input.query);
  }

  // 2. Single RPC call to match_supports_enriched (p_canal + p_keyword now functional)
  // Only use per-canal filter when canalOverride is explicitly set by internal callers.
  const { data, error } = await clients.adminClient.rpc(
    "match_supports_enriched",
    {
      query_embedding: embedding,
      match_count: matchCount,
      org_id: context.orgId,
      p_canal: canalOverride ?? null,
      p_keyword: input.keyword ?? null,
    },
  );
  if (error) {
    console.error("[ragSearch] RPC error:", error);
    return { supports: [], total: 0, inserted: 0, thresholdUsed: 0 };
  }
  const filtered: EnrichedSupportResult[] = data || [];

  // 4. Write results to campaign_supports via admin client (AR15: immutable support_data)
  // When keepExisting=false (the default for standalone ragSearch calls), deactivate the entire
  // current selection before inserting new results. This makes a new search always replace the
  // previous selection, matching user intent ("actually I want lawyers" should not accumulate
  // on top of the previous pediatricians search). keepExisting=true is set by refineSelection(add)
  // mode, which is the only place where accumulating on the existing selection is correct.
  if (!keepExisting) {
    const { error: clearError } = await clients.adminClient
      .from("campaign_supports")
      .update({ is_selected: false })
      .eq("conversation_id", context.conversationId)
      .eq("is_selected", true);
    if (clearError) {
      console.error("[ragSearch] clear existing selection error:", clearError);
    }
  }

  // Insert individually with variant_slug deduplication — campaign_supports has no unique
  // constraint on (conversation_id, variant_slug), so we guard manually.
  // Re-activate soft-deleted rows (is_selected=false) instead of skipping — supports FR14.
  let insertedCount = 0;
  if (filtered.length > 0) {
    for (const r of filtered) {
      const variantSlug = r.variant_slug;
      const { data: existing } = await clients.adminClient
        .from("campaign_supports")
        .select("id, is_selected")
        .eq("conversation_id", context.conversationId)
        .filter("support_data->>variant_slug", "eq", variantSlug)
        .limit(1);

      if (!existing || existing.length === 0) {
        // New support — insert
        const { error: insertError } = await clients.adminClient
          .from("campaign_supports")
          .insert({
            conversation_id: context.conversationId,
            organization_id: context.orgId,
            support_data: toSupportData(r),
            deal_overrides: {},
            is_selected: true,
          });
        if (insertError) {
          console.error("[ragSearch] campaign_supports insert error:", insertError);
        } else {
          insertedCount++;
        }
      } else if (existing[0].is_selected === false) {
        // Previously soft-deleted — reactivate (FR14)
        const { error: reactivateError } = await clients.adminClient
          .from("campaign_supports")
          .update({ is_selected: true })
          .eq("id", existing[0].id);
        if (reactivateError) {
          console.error("[ragSearch] campaign_supports reactivate error:", reactivateError);
        } else {
          insertedCount++;
        }
      }
      // else: already active — skip (true dedup)
    }
  }

  // 5. Return typed result for artifact rendering
  const thresholdUsed =
    filtered.length > 0 ? filtered[0].threshold_used : 0;

  return {
    supports: filtered.map((r: EnrichedSupportResult) => {
      const planningData: PlanningRecord[] = r.planning_data || [];
      const visuelData: VisuelRecord[] = r.visuels_data || [];

      // Pick first specs_techniques from any planning entry that has one
      const specs = planningData.find((p) => p.specs_techniques)?.specs_techniques ?? null;

      // Map visuels to a clean shape (fichier_url = Google Drive link)
      const visuels = visuelData.length > 0
        ? visuelData.map((v) => ({
            type_de_format: v.type_de_format ?? null,
            fichier_url: v.fichier_url ?? null,
            notes: v.notes ?? null,
          }))
        : null;

      return {
        variant_slug: r.variant_slug,
        support_name: r.support,
        canal: r.canal,
        categorie: r.categorie,
        lectorat: r.lectorat,
        tarif_brut: r.tarif_brut,
        tarif_net: r.tarif_net,
        periodicite_print: r.periodicite_print,
        diffusion_print: r.diffusion_print,
        visites_par_mois_web: r.visites_par_mois_web,
        pages_vues_par_mois_web: r.pages_vues_par_mois_web,
        nombre_envois_nl: r.nombre_envois_nl,
        format_print: r.format_print,
        similarity: r.similarity,
        visuels,
        specs_techniques: specs,
      };
    }),
    total: filtered.length,
    inserted: insertedCount,
    thresholdUsed,
  };
}
