import { z } from 'npm:zod@3';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const collectMetadataInput = z.object({
  mode: z.enum(['full', 'quick']).default('full').describe('Use "quick" when updating 1-2 fields mid-conversation. Use "full" for initial complete metadata collection.'),
  agence: z.string().optional().describe('Agency name (e.g. "Havas Media")'),
  annonceur: z.string().optional().describe('Advertiser / client name (e.g. "AMEX", "CNAM")'),
  campagne: z.string().optional().describe('Campaign name or reference (e.g. "Fil rouge annuel B2B")'),
  contact_nom: z.string().optional().describe('Contact person full name'),
  contact_email: z.string().optional().describe('Contact person email'),
  budget: z.string().optional().describe('Campaign budget as stated (e.g. "20 000 €", "29K€ HT", "15000")'),
  cible: z.string().optional().describe('Target audience description (e.g. "Entrepreneurs, chefs d\'entreprise, PME")'),
  objectif: z.string().optional().describe('Campaign objective (e.g. "Génération de leads", "Notoriété")'),
  periode: z.string().optional().describe('Campaign period (e.g. "Avril-Juin", "T2 2026", "début octobre")'),
  canaux: z.string().optional().describe('Preferred channels (e.g. "Print + Web", "Web uniquement", "Newsletter")'),
  secteurs_exclus: z.string().optional().describe('Sectors to exclude (e.g. "Construction, Agences de voyage, Associations")'),
});

export const collectMetadataOutput = z.object({
  saved: z.boolean(),
  complete: z.boolean(),
  mode: z.enum(['full', 'quick']).default('full'),
  existing: z.record(z.string()),
  missing: z.array(z.string()),
  updatedFields: z.array(z.string()).optional(),
  toastMessage: z.string().optional(),
});

const REQUIRED_FIELDS = ['agence', 'annonceur'];

export async function executeCollectMetadata(
  input: z.infer<typeof collectMetadataInput>,
  clients: { userClient: SupabaseClient; adminClient: SupabaseClient },
  context: { conversationId: string; orgId: string }
): Promise<z.infer<typeof collectMetadataOutput>> {
  const { conversationId } = context;

  // Fetch current metadata
  const { data: conv, error: fetchError } = await clients.adminClient
    .from('leo_conversations')
    .select('metadata')
    .eq('id', conversationId)
    .single();

  if (fetchError) throw new Error(`Fetch failed: ${fetchError.message}`);
  const existing = (conv?.metadata as Record<string, string>) ?? {};

  // Build patch from provided fields (exclude 'mode' from patch)
  const patch: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === 'mode') continue;
    if (value !== undefined && value !== '') patch[key] = value;
  }

  // Merge contact_nom + contact_email into a single "contact" field for export
  const contactNom = patch.contact_nom || existing.contact_nom || '';
  const contactEmail = patch.contact_email || existing.contact_email || '';
  if (contactNom || contactEmail) {
    patch.contact = [contactNom, contactEmail].filter(Boolean).join('\n');
  }

  let saved = false;
  if (Object.keys(patch).length > 0) {
    const merged = { ...existing, ...patch };
    const { error: updateError } = await clients.adminClient
      .from('leo_conversations')
      .update({ metadata: merged })
      .eq('id', conversationId);
    if (updateError) throw new Error(`Update failed: ${updateError.message}`);

    saved = true;
    Object.assign(existing, patch); // reflect merged state
    console.log(`[collect-metadata] Saved ${JSON.stringify(patch)} for conversation ${conversationId}`);
  }

  const missing = REQUIRED_FIELDS.filter(f => !existing[f]);

  const updatedFields = Object.keys(patch).filter(k => k !== 'contact');
  const mode = input.mode ?? 'full';

  // Build a descriptive toast for quick mode
  let toastMessage: string | undefined;
  if (saved && mode === 'quick' && updatedFields.length > 0) {
    const labels: Record<string, string> = {
      agence: 'agence', annonceur: 'annonceur', campagne: 'campagne',
      contact_nom: 'contact', contact_email: 'email', budget: 'budget',
      cible: 'cible', objectif: 'objectif', periode: 'période',
      canaux: 'canaux', secteurs_exclus: 'exclusions',
    };
    const parts = updatedFields.map(f => `${labels[f] || f}: ${patch[f]}`);
    toastMessage = `✓ ${parts.join(', ')}`;
  } else if (saved) {
    toastMessage = 'Métadonnées campagne mises à jour.';
  }

  return {
    saved,
    complete: missing.length === 0,
    mode,
    existing,
    missing,
    updatedFields: saved ? updatedFields : undefined,
    toastMessage,
  };
}
