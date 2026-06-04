import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { streamText, generateText, tool, UIMessage, convertToModelMessages, stepCountIs } from "npm:ai@6.0.97";
import { createGateway } from "npm:@ai-sdk/gateway@3.0.115";
import { createClients, getCorsHeaders } from "../_shared/clients.ts";
import { buildSystemPrompt, type RuleRow } from "../_shared/prompts/system-prompt.ts";
import {
  ragSearchInput,
  executeRagSearch,
} from "../_shared/tools/rag-search.ts";
import {
  refineSelectionInput,
  executeRefineSelection,
} from "../_shared/tools/refine-selection.ts";
import {
  calculatePricingInput,
  executeCalculatePricing,
} from "../_shared/tools/calculate-pricing.ts";
import {
  adjustSupportInput,
  executeAdjustSupport,
} from "../_shared/tools/adjust-support.ts";
import {
  collectMetadataInput,
  executeCollectMetadata,
} from "../_shared/tools/collect-metadata.ts";
import {
  generateExcelInput,
  executeGenerateExcel,
} from "../_shared/tools/generate-excel.ts";
import {
  generatePptInput,
  executeGeneratePpt,
} from "../_shared/tools/generate-ppt.ts";
import {
  draftEmailInput,
  executeDraftEmail,
} from "../_shared/tools/draft-email.ts";
import type { ChatRequest } from "../_shared/types.ts";

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  try {
    // --- Auth preamble (AR14) ---
    const clients = await createClients(req);

    // --- Parse request ---
    const body: ChatRequest = await req.json();
    const { messages } = body;
    let { conversationId } = body;
    let isNewConversation = false;

    // --- Input validation (cheap — runs before any DB queries) ---
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "messages array is required" }),
        {
          status: 400,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        },
      );
    }
    if (messages.length > 100) {
      return new Response(
        JSON.stringify({ error: "Too many messages (max 100)" }),
        {
          status: 400,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        },
      );
    }
    for (const msg of messages) {
      const content = typeof msg.content === "string" ? msg.content : "";
      const partsText = (msg.parts ?? [])
        .filter((p: { type: string }) => p.type === "text")
        .map((p: { text?: string }) => p.text || "")
        .join("");
      if (content.length > 10_000 || partsText.length > 10_000) {
        return new Response(
          JSON.stringify({ error: "Message content too long (max 10,000 characters)" }),
          {
            status: 400,
            headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          },
        );
      }
    }

    // --- Cross-org access prevention (CRITICAL) ---
    if (conversationId) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(conversationId)) {
        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      const { data: conv } = await clients.adminClient
        .from("leo_conversations")
        .select("organization_id")
        .eq("id", conversationId)
        .single();
      if (!conv || conv.organization_id !== clients.orgId) {
        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
    }

    // --- Conversation creation (AC7, FR33) ---
    if (!conversationId) {
      const { data: conversation, error: convError } = await clients.adminClient
        .from("leo_conversations")
        .insert({
          user_id: clients.user.id,
          organization_id: clients.orgId,
          title: "Nouvelle campagne",
          status: "draft",
          metadata: {},
        })
        .select("id")
        .single();

      if (convError || !conversation) {
        console.error("[chat-orchestrator] Conversation creation error:", convError);
        return new Response(
          JSON.stringify({ error: "Failed to create conversation" }),
          {
            status: 500,
            headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          },
        );
      }

      conversationId = conversation.id;
      isNewConversation = true;
    }

    // --- Eager user message save (ADR-9, AC6) ---
    const lastUserMessage = [...messages]
      .reverse()
      .find((m: UIMessage) => m.role === "user");

    if (lastUserMessage) {
      const userParts = lastUserMessage.parts ??
        [{ type: "text", text: typeof lastUserMessage.content === "string" ? lastUserMessage.content : "" }];

      const { error: userMsgError } = await clients.adminClient.from("leo_messages").insert({
        conversation_id: conversationId,
        role: "user",
        parts: userParts,
      });
      if (userMsgError) {
        console.error("[chat-orchestrator] User message save error:", userMsgError);
      }
    }

    // --- Working set context for system prompt (stable indices across all supports) ---
    const { data: allSupports, error: workingSetError } = await clients.adminClient
      .from('campaign_supports')
      .select('id, support_data, is_selected')
      .eq('conversation_id', conversationId!)
      .order('created_at', { ascending: true });

    if (workingSetError) {
      console.error("[chat-orchestrator] Working set query error:", workingSetError);
    }

    // Assign stable 1-based index across ALL supports (selected + removed) by insertion order
    type SupportRow = { id: string; support_data: Record<string, unknown>; is_selected: boolean };
    const stableIndexMap = new Map(
      (allSupports as SupportRow[] ?? []).map((s, i) => [s.id, i + 1])
    );

    const selectedSupports = (allSupports as SupportRow[] ?? []).filter(s => s.is_selected);
    const deactivatedSupports = (allSupports as SupportRow[] ?? []).filter(s => !s.is_selected);

    const workingSetContext = selectedSupports.length
      ? selectedSupports
          .map(s => {
            const d = s.support_data;
            const idx = stableIndexMap.get(s.id) ?? '?';
            const periodicite = d.periodicite_print ? ` | Périodicité: ${d.periodicite_print}` : '';
            return `${idx}. slug: "${d.variant_slug}" | Nom: "${d.support_name}" | Canal: ${d.canal}${periodicite}`;
          })
          .join('\n')
      : null;

    // Give LÉO visibility into deactivated supports (removed by user or filtered out by canal).
    // This prevents LÉO from being blind after a filter sequence and enables re-activation.
    const deactivatedContext = deactivatedSupports.length
      ? deactivatedSupports
          .map(s => {
            const d = s.support_data;
            const idx = stableIndexMap.get(s.id) ?? '?';
            return `${idx}. slug: "${d.variant_slug}" | Nom: "${d.support_name}" | Canal: ${d.canal}`;
          })
          .join('\n')
      : null;

    // --- Metadata context for system prompt ---
    let metadataContext: string | null = null;
    {
      const { data: convMeta } = await clients.adminClient
        .from('leo_conversations')
        .select('metadata')
        .eq('id', conversationId!)
        .single();

      const meta = (convMeta?.metadata as Record<string, string>) ?? {};
      if (Object.keys(meta).length > 0) {
        metadataContext = Object.entries(meta)
          .map(([k, v]) => `- ${k}: ${v}`)
          .join('\n');
      }
    }

    // --- Fetch agent rules (org + user) ---
    const [{ data: orgRulesData }, { data: userRulesData }] = await Promise.all([
      clients.adminClient
        .from('org_rules')
        .select('title, content')
        .eq('organization_id', clients.orgId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
      clients.adminClient
        .from('user_rules')
        .select('title, content')
        .eq('user_id', clients.user.id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
    ]);

    const orgRules = (orgRulesData as RuleRow[] | null) ?? [];
    const userRules = (userRulesData as RuleRow[] | null) ?? [];

    // --- Vercel AI Gateway provider ---
    const gateway = createGateway({
      apiKey: Deno.env.get("AI_GATEWAY_API_KEY")!,
    });

    // --- Tool registration (AR10) ---
    const ragSearch = tool({
      description:
        "Search media supports by target audience, channel, or topic. Use when the user describes a target, sector, or media need.",
      inputSchema: ragSearchInput,
      execute: async (input) =>
        executeRagSearch(input, clients, {
          conversationId: conversationId!,
          orgId: clients.orgId,
        }),
    });

    const refineSelection = tool({
      description:
        'Modify the current working set: remove matching supports, add new supports via search, or filter to a single canal. ' +
        'Use when the user wants to refine, remove, add to, or filter their current selection.',
      inputSchema: refineSelectionInput,
      execute: async (input) =>
        executeRefineSelection(input, clients, {
          conversationId: conversationId!,
          orgId: clients.orgId,
        }),
    });

    const calculatePricing = tool({
      description:
        'Apply cascade discounts (remise régie, exceptionnelle, commerciale) to the working set. ' +
        'Use when the user mentions percentages with "remise", "réduction", "rabais" or wants to see net totals with discounts applied.',
      inputSchema: calculatePricingInput,
      execute: async (input) =>
        executeCalculatePricing(input, clients, {
          conversationId: conversationId!,
          orgId: clients.orgId,
        }),
    });

    const adjustSupport = tool({
      description:
        'Adjust quantity (insertions for Print/NL), publication date (date_parution), or deadline (date_bouclage) ' +
        'for a specific support in the working set. Also handles reset of those overrides. ' +
        'Do NOT use for discount percentages — use calculatePricing for that.',
      inputSchema: adjustSupportInput,
      execute: async (input) =>
        executeAdjustSupport(input, clients, {
          conversationId: conversationId!,
          orgId: clients.orgId,
        }),
    });

    const collectMetadata = tool({
      description:
        'Save campaign metadata. Fields: agence, annonceur, campagne, contact_nom, contact_email, budget, cible, objectif, periode, canaux, secteurs_exclus. ' +
        'Use mode "quick" for silent mid-conversation updates (1-2 fields). Use mode "full" for complete collection at export time.',
      inputSchema: collectMetadataInput,
      execute: async (input) =>
        executeCollectMetadata(input, clients, {
          conversationId: conversationId!,
          orgId: clients.orgId,
        }),
    });

    const generateExcel = tool({
      description:
        'Generate an Excel devis from the current working set. ' +
        'Checks metadata completeness and support count before creating the export job. ' +
        'Use when the user asks to generate a devis, export, or Excel.',
      inputSchema: generateExcelInput,
      execute: async (input) =>
        executeGenerateExcel(input, clients, {
          conversationId: conversationId!,
          orgId: clients.orgId,
        }),
    });

    const generatePpt = tool({
      description:
        'Generate a PowerPoint presentation (deck) with the selected supports. ' +
        'Call this when the user asks for a PPT, deck, présentation, or PowerPoint.',
      inputSchema: generatePptInput,
      execute: async (input) =>
        executeGeneratePpt(input, clients, {
          conversationId: conversationId!,
          orgId: clients.orgId,
        }),
    });

    const draftEmail = tool({
      description:
        'Prepare campaign context for drafting a professional cover email. ' +
        'Call when the user asks to write, draft, or compose a cover email for the deliverables.',
      inputSchema: draftEmailInput,
      execute: async (input) =>
        executeDraftEmail(input, clients, {
          conversationId: conversationId!,
          orgId: clients.orgId,
        }),
    });

    const { z } = await import("npm:zod@3");
    const suggestNextSteps = tool({
      description:
        'Suggest 2-3 relevant next actions for the user after completing a response. ' +
        'Call at the end of responses where a clear next step exists (after ragSearch results, after generating email, after export). ' +
        'Provide 2-3 short French action strings as suggestions.',
      inputSchema: z.object({
        suggestions: z.array(z.string()).describe(
          'Array of 2-3 short French action strings the user can click to send, e.g. ["Générer le devis Excel", "Rédiger l\'email", "Affiner la sélection"]'
        ),
      }),
      execute: async (input) => ({ suggestions: input.suggestions }),
    });

    // --- Stream response (AC1) ---
    const result = streamText({
      model: gateway("anthropic/claude-sonnet-4-6"),
      system: buildSystemPrompt(workingSetContext, metadataContext, orgRules, userRules, deactivatedContext),
      messages: await convertToModelMessages(messages),
      tools: { ragSearch, refineSelection, calculatePricing, adjustSupport, collectMetadata, generateExcel, generatePpt, draftEmail, suggestNextSteps },
      maxTokens: 4096,
      stopWhen: stepCountIs(8),
    });

    // Consume stream to ensure onFinish fires even if client disconnects
    result.consumeStream();

    // --- Return streaming response (UI Message Stream v2) ---
    return result.toUIMessageStreamResponse({
      originalMessages: messages,
      onFinish: async ({ responseMessage }) => {
        // --- Deferred assistant message save (ADR-9, AC6) ---
        // responseMessage.parts is already in UIMessage format (dynamic-tool, etc.)
        try {
          await clients.adminClient.from("leo_messages").insert({
            conversation_id: conversationId,
            role: "assistant",
            parts: responseMessage.parts,
          });
        } catch (saveErr) {
          console.error("[chat-orchestrator] Deferred assistant save error:", saveErr);
        }

        // --- Generate conversation title on first message ---
        if (isNewConversation && conversationId) {
          try {
            const userText = messages
              .filter((m: UIMessage) => m.role === "user")
              .map((m: UIMessage) => {
                // AI SDK v6: text lives in parts, content may be empty
                const fromParts = (m.parts ?? [])
                  .filter((p: { type: string }) => p.type === "text")
                  .map((p: { text?: string }) => p.text || "")
                  .join("");
                return fromParts || (typeof m.content === "string" ? m.content : "");
              })
              .join("\n")
              .slice(0, 800);

            const assistantText = responseMessage.parts
              .filter((p: { type: string }) => p.type === "text")
              .map((p: { text?: string }) => p.text || "")
              .join("\n")
              .slice(0, 300);

            const { text: generatedTitle } = await generateText({
              model: gateway("anthropic/claude-haiku-4-5"),
              maxTokens: 30,
              messages: [
                {
                  role: "system",
                  content: `Tu génères des titres courts pour des conversations de médiaplanning. Analyse le message et produis un titre de 3 à 6 mots.

Le titre doit commencer par le nom du client/annonceur/marque qui paie la campagne, suivi d'un tiret cadratin, suivi du produit ou service promu.

Ne mets jamais la cible ou l'audience dans le titre. Décris ce qui est vendu, pas à qui.

AMEX — Cartes Pro
CNAM — Vaccination Grippe
Leroy Merlin — Rénovation Printemps
BNP Paribas — Compte Pro

Si tu ne trouves pas de nom d'annonceur, utilise le secteur et le produit.

Réponds uniquement avec le titre.`,
                },
                {
                  role: "user",
                  content: `Message utilisateur:\n${userText}\n\nRéponse assistant:\n${assistantText}`,
                },
              ],
            });

            const title = generatedTitle.trim().replace(/^["']|["']$/g, "").slice(0, 100);
            if (title) {
              await clients.adminClient
                .from("leo_conversations")
                .update({ title })
                .eq("id", conversationId);
              console.log(`[chat-orchestrator] Generated title: "${title}" for ${conversationId}`);
            }
          } catch (titleErr) {
            console.error("[chat-orchestrator] Title generation error:", titleErr);
          }
        }
      },
      headers: {
        ...getCorsHeaders(req),
        "X-Conversation-Id": conversationId!,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";

    // Auth errors → 401 (AC5)
    if (message === "Unauthorized" || message === "Missing authorization") {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Valid user but no org configured → 403
    if (message === "No organization") {
      return new Response(JSON.stringify({ error: "No organization configured for this user" }), {
        status: 403,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    console.error("[chat-orchestrator] Error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
