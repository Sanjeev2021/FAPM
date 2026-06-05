import { z } from 'npm:zod@3';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const draftEmailInput = z.object({});

export const draftEmailOutput = z.object({
  status: z.enum(['ready', 'metadata_required', 'no_supports']),
  email_body_html: z.string().optional(),
  campaign_summary: z.object({
    annonceur: z.string(),
    regie: z.string(),   // issuing org (PLS) — used for signature
    agence: z.string(),  // intermediary buying agency (Havas, OMD…) — empty for direct sales
    campagne: z.string().nullable(),
    contact_nom: z.string().nullable(),
    contact_email: z.string().nullable(),
    budget: z.string().nullable(),
    cible: z.string().nullable(),
    objectif: z.string().nullable(),
    periode: z.string().nullable(),
    canaux: z.string().nullable(),
    total_supports: z.number(),
    supports_by_canal: z.object({
      Print: z.number(),
      Web: z.number(),
      NL: z.number(),
    }),
    total_brut: z.number(),
    total_net: z.number(),
    has_excel_export: z.boolean(),
    has_ppt_export: z.boolean(),
    supports_detail: z.array(z.object({
      name: z.string(),
      canal: z.string(),
      periodicite: z.string().nullable(),
      diffusion: z.number().nullable(),
      visites_web: z.number().nullable(),
      tarif_brut: z.string().nullable(),
      quantite: z.number(),
      net: z.number(),
    })),
  }).optional(),
  missing_fields: z.array(z.string()).optional(),
  toastMessage: z.string(),
});

// agence is optional — direct sales have no intermediary agency
const REQUIRED_METADATA = ['annonceur'];
const AGENCY_DISCOUNT = 0.15;

function parseTarifText(tarif: string | null): number {
  if (!tarif || tarif.toLowerCase().includes('pas de tarif')) return 0;
  let normalized = tarif.replace(/[^\d.,]/g, '');
  if (normalized.includes('.') && normalized.includes(',')) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else {
    normalized = normalized.replace(',', '.');
  }
  return parseFloat(normalized) || 0;
}

function computeNet(brut: number, remise1: number, remiseExc: number, remise2: number): number {
  return brut * (1 - (remise1 || 0) / 100) * (1 - (remiseExc || 0) / 100) * (1 - (remise2 || 0) / 100) * (1 - AGENCY_DISCOUNT);
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export async function executeDraftEmail(
  _input: z.infer<typeof draftEmailInput>,
  clients: { userClient: SupabaseClient; adminClient: SupabaseClient },
  context: { conversationId: string; orgId: string }
): Promise<z.infer<typeof draftEmailOutput>> {
  const { conversationId, orgId } = context;

  // Check selected supports exist
  const { data: supports, error: supportsError } = await clients.adminClient
    .from('campaign_supports')
    .select('support_data, deal_overrides')
    .eq('conversation_id', conversationId)
    .eq('is_selected', true);

  if (supportsError) throw new Error(`Fetch supports failed: ${supportsError.message}`);
  if (!supports || supports.length === 0) {
    return { status: 'no_supports', toastMessage: 'Aucun support sélectionné.' };
  }

  // Check metadata completeness
  const { data: conv, error: convError } = await clients.adminClient
    .from('leo_conversations')
    .select('metadata')
    .eq('id', conversationId)
    .single();

  if (convError) throw new Error(`Conversation fetch failed: ${convError.message}`);
  const metadata = (conv?.metadata as Record<string, string>) ?? {};
  const missing = REQUIRED_METADATA.filter(f => !metadata[f]);

  // Fetch the régie (org) name — this is the document issuer, not the buying agency
  const { data: org } = await clients.adminClient
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .single();
  const regieName = org?.name || 'PLS';

  if (missing.length > 0) {
    return { status: 'metadata_required', missing_fields: missing, toastMessage: 'Métadonnées requises avant de rédiger l\'email.' };
  }

  // Group by canal, compute totals, and collect per-support details
  const canalCounts: Record<string, number> = { Print: 0, Web: 0, NL: 0 };
  let totalBrut = 0;
  let totalNet = 0;
  const supportsDetail: Array<{
    name: string; canal: string; periodicite: string | null;
    diffusion: number | null; visites_web: number | null;
    tarif_brut: string | null; quantite: number; net: number;
  }> = [];

  for (const s of supports) {
    const sd = s.support_data as {
      support_name: string; canal: string; tarif_brut: string | null;
      nombre_envois_nl?: number | null; periodicite_print?: string | null;
      diffusion_print?: number | null; visites_par_mois_web?: number | null;
    };
    const ov = (s.deal_overrides as { quantite?: number; remise_1?: number; remise_exceptionnelle?: number; remise_2?: number }) ?? {};
    const canal = sd.canal;
    canalCounts[canal] = (canalCounts[canal] || 0) + 1;

    const brut = parseTarifText(sd.tarif_brut);
    const qty = ov.quantite ?? (canal === 'NL' ? (sd.nombre_envois_nl ?? 1) : 1);
    const brutTotal = brut * qty;
    const net = computeNet(brutTotal, ov.remise_1 ?? 0, ov.remise_exceptionnelle ?? 0, ov.remise_2 ?? 0);

    totalBrut += brutTotal;
    totalNet += net;

    supportsDetail.push({
      name: sd.support_name,
      canal,
      periodicite: sd.periodicite_print ?? null,
      diffusion: sd.diffusion_print ?? null,
      visites_web: sd.visites_par_mois_web ?? null,
      tarif_brut: sd.tarif_brut,
      quantite: qty,
      net: round2(net),
    });
  }

  // Check for existing completed exports
  const { data: exports } = await clients.adminClient
    .from('export_jobs')
    .select('type')
    .eq('conversation_id', conversationId)
    .eq('status', 'completed');

  const exportTypes = new Set((exports ?? []).map((e: { type: string }) => e.type));

  const campaignSummary = {
    annonceur: metadata.annonceur || '',
    regie: regieName,
    agence: metadata.agence || '',
    campagne: metadata.campagne || null,
    contact_nom: metadata.contact_nom || null,
    contact_email: metadata.contact_email || null,
    budget: metadata.budget || null,
    cible: metadata.cible || null,
    objectif: metadata.objectif || null,
    periode: metadata.periode || null,
    canaux: metadata.canaux || null,
    total_supports: supports.length,
    supports_by_canal: {
      Print: canalCounts.Print || 0,
      Web: canalCounts.Web || 0,
      NL: canalCounts.NL || 0,
    },
    total_brut: round2(totalBrut),
    total_net: round2(totalNet),
    has_excel_export: exportTypes.has('excel'),
    has_ppt_export: exportTypes.has('ppt'),
    supports_detail: supportsDetail,
  };

  console.log(`[draft-email] Campaign summary for conversation ${conversationId}: ${supports.length} supports, ${round2(totalNet)}€ net`);

  // Generate static email body HTML
  const emailBodyHtml = buildEmailHtml(campaignSummary);

  return {
    status: 'ready',
    email_body_html: emailBodyHtml,
    campaign_summary: campaignSummary,
    toastMessage: 'Rédaction de l\'email en cours.',
  };
}

function formatEuro(n: number): string {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function buildEmailHtml(summary: {
  annonceur: string;
  regie: string;
  agence: string;
  campagne: string | null;
  contact_nom: string | null;
  total_supports: number;
  supports_by_canal: { Print: number; Web: number; NL: number };
  total_brut: number;
  total_net: number;
  has_excel_export: boolean;
  has_ppt_export: boolean;
}): string {
  const greeting = summary.contact_nom
    ? `Bonjour ${summary.contact_nom},`
    : 'Bonjour Madame, Monsieur,';

  const campaignLine = summary.campagne
    ? ` — campagne &laquo;&nbsp;${summary.campagne}&nbsp;&raquo;`
    : '';

  // When an intermediary agency is named, address the email to them on behalf of the advertiser
  const forLine = summary.agence
    ? `pour <strong>${summary.agence}</strong> / <strong>${summary.annonceur}</strong>`
    : `pour <strong>${summary.annonceur}</strong>`;

  const canalRows = [
    { label: 'Print', count: summary.supports_by_canal.Print },
    { label: 'Web', count: summary.supports_by_canal.Web },
    { label: 'Newsletter', count: summary.supports_by_canal.NL },
  ].filter(r => r.count > 0);

  const canalRowsHtml = canalRows.map(r =>
    `<tr><td style="padding:6px 12px;border:1px solid #e5e7eb;">${r.label}</td><td style="padding:6px 12px;border:1px solid #e5e7eb;text-align:center;">${r.count}</td></tr>`
  ).join('');

  const attachments: string[] = [];
  if (summary.has_excel_export) attachments.push('Devis Excel');
  if (summary.has_ppt_export) attachments.push('Présentation PowerPoint');
  const attachmentsLine = attachments.length > 0
    ? `<p style="margin:16px 0 8px;font-size:14px;">Pièces jointes : ${attachments.join(', ')}</p>`
    : '';

  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;color:#1f2937;">
  <p style="margin:0 0 16px;font-size:14px;">${greeting}</p>
  <p style="margin:0 0 16px;font-size:14px;">Veuillez trouver ci-joint notre proposition media ${forLine}${campaignLine}.</p>
  <h3 style="margin:24px 0 12px;font-size:15px;color:#374151;">Récapitulatif</h3>
  <table style="border-collapse:collapse;width:100%;margin-bottom:8px;">
    <thead>
      <tr style="background:#f9fafb;">
        <th style="padding:6px 12px;border:1px solid #e5e7eb;text-align:left;font-size:13px;">Canal</th>
        <th style="padding:6px 12px;border:1px solid #e5e7eb;text-align:center;font-size:13px;">Supports</th>
      </tr>
    </thead>
    <tbody style="font-size:13px;">
      ${canalRowsHtml}
    </tbody>
  </table>
  <p style="margin:8px 0;font-size:13px;color:#6b7280;">Total brut : ${formatEuro(summary.total_brut)} — Total net : <strong>${formatEuro(summary.total_net)}</strong></p>
  ${attachmentsLine}
  <p style="margin:24px 0 0;font-size:14px;">Cordialement,<br/>L'équipe ${summary.regie}</p>
</div>`;
}
