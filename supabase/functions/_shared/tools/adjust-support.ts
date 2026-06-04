import { z } from 'npm:zod@3';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const adjustSupportInput = z.object({
  variantSlug: z.string().describe(
    'The variant_slug of the support to adjust. Find it in the current working set.'
  ),
  quantite: z.number().int().min(1).optional().describe(
    'Number of insertions (Print) or sends (NL). Overrides default quantity of 1.'
  ),
  date_parution: z.string().optional().describe(
    'Publication date override, e.g. "15 mars 2025". Replaces deal_overrides.date_parution.'
  ),
  date_bouclage: z.string().optional().describe(
    'Deadline (bouclage) date override. Replaces deal_overrides.date_bouclage.'
  ),
  reset: z.boolean().optional().describe(
    'If true, clears quantite, date_parution, date_bouclage from deal_overrides (preserves remises).'
  ),
});

export const adjustSupportOutput = z.object({
  affectedCount: z.number(),
  toastMessage: z.string(),
});

export async function executeAdjustSupport(
  input: z.infer<typeof adjustSupportInput>,
  clients: { userClient: SupabaseClient; adminClient: SupabaseClient },
  context: { conversationId: string; orgId: string }
): Promise<z.infer<typeof adjustSupportOutput>> {
  const { variantSlug, quantite, date_parution, date_bouclage, reset } = input;
  const { conversationId } = context;

  // Fetch target support
  const { data: rows, error: fetchError } = await clients.adminClient
    .from('campaign_supports')
    .select('id, deal_overrides, support_data')
    .eq('conversation_id', conversationId)
    .eq('is_selected', true)
    .filter('support_data->>variant_slug', 'eq', variantSlug)
    .limit(1);

  if (fetchError) throw new Error(`Fetch failed: ${fetchError.message}`);
  if (!rows?.length) return { affectedCount: 0, toastMessage: 'Support non trouvé dans la sélection.' };

  const row = rows[0];
  const supportName = (row.support_data as Record<string, string>).support_name ?? variantSlug;

  let toastMessage: string;

  if (reset) {
    // Reset: clear qty+date overrides via direct update (intentional full overwrite)
    const existing = (row.deal_overrides as Record<string, unknown>) ?? {};
    const { quantite: _q, date_parution: _dp, date_bouclage: _db, ...preserved } = existing as {
      quantite?: unknown;
      date_parution?: unknown;
      date_bouclage?: unknown;
      [k: string]: unknown;
    };

    const { error: updateError } = await clients.adminClient
      .from('campaign_supports')
      .update({ deal_overrides: preserved })
      .eq('id', row.id);

    if (updateError) throw new Error(`Update failed: ${updateError.message}`);
    toastMessage = `Valeurs d'origine restaurées pour ${supportName}.`;
  } else {
    const patch: Record<string, unknown> = {};
    if (quantite !== undefined) patch.quantite = quantite;
    if (date_parution !== undefined) patch.date_parution = date_parution;
    if (date_bouclage !== undefined) patch.date_bouclage = date_bouclage;

    if (Object.keys(patch).length === 0) {
      return { affectedCount: 0, toastMessage: 'Aucun ajustement à appliquer.' };
    }

    // Atomic JSONB merge via RPC — prevents race conditions with builder
    const { error: rpcError } = await clients.adminClient
      .rpc('merge_deal_overrides', {
        p_support_id: row.id,
        p_overrides: patch,
      });

    if (rpcError) throw new Error(`Merge RPC failed: ${rpcError.message}`);

    const parts: string[] = [];
    if (quantite !== undefined) parts.push(`${quantite} insertion${quantite > 1 ? 's' : ''}`);
    if (date_parution !== undefined) parts.push(`parution le ${date_parution}`);
    if (date_bouclage !== undefined) parts.push(`bouclage le ${date_bouclage}`);
    toastMessage = `${supportName} mis à jour : ${parts.join(', ')}.`;
  }

  console.log(`[adjust-support] Updated ${variantSlug} in ${conversationId}`);
  return { affectedCount: 1, toastMessage };
}
