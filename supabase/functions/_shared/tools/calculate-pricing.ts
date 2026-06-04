import { z } from 'npm:zod@3';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const calculatePricingInput = z.object({
  remise_1: z.number().min(0).max(100).optional().describe(
    'Remise régie (première remise) en pourcentage 0-100. Ex: 20 pour 20%.'
  ),
  remise_exceptionnelle: z.number().min(0).max(100).optional().describe(
    'Remise exceptionnelle en pourcentage 0-100. Ex: 5 pour 5%.'
  ),
  remise_2: z.number().min(0).max(100).optional().describe(
    'Remise commerciale (deuxième remise) en pourcentage 0-100. Ex: 10 pour 10%.'
  ),
  reset_remises: z.boolean().optional().describe(
    'When true, resets ALL remises (remise_1, remise_exceptionnelle, remise_2) to 0. Use when the user wants to remove discounts.'
  ),
  scope: z.union([z.literal('all'), z.array(z.string())]).default('all').describe(
    '"all" to apply to all selected supports, or an array of variant_slug values for specific supports.'
  ),
});

export const calculatePricingOutput = z.object({
  affectedCount: z.number(),
  toastMessage: z.string(),
});

export async function executeCalculatePricing(
  input: z.infer<typeof calculatePricingInput>,
  clients: { userClient: SupabaseClient; adminClient: SupabaseClient },
  context: { conversationId: string; orgId: string }
): Promise<z.infer<typeof calculatePricingOutput>> {
  const { remise_1, remise_exceptionnelle, remise_2, scope } = input;
  const { conversationId } = context;

  // Build query for affected rows
  let query = clients.adminClient
    .from('campaign_supports')
    .select('id, deal_overrides')
    .eq('conversation_id', conversationId)
    .eq('is_selected', true);

  if (Array.isArray(scope)) {
    query = query.in('support_data->>variant_slug', scope);
  }

  const { data: rows, error: fetchError } = await query;
  if (fetchError) throw new Error(`Fetch failed: ${fetchError.message}`);
  if (!rows?.length) {
    return { affectedCount: 0, toastMessage: 'Aucun support trouvé dans la sélection.' };
  }

  // Build partial overrides object with only the provided remise fields
  const partial: Record<string, number> = {};
  if (input.reset_remises) {
    partial.remise_1 = 0;
    partial.remise_exceptionnelle = 0;
    partial.remise_2 = 0;
  } else {
    if (remise_1 !== undefined) partial.remise_1 = remise_1;
    if (remise_exceptionnelle !== undefined) partial.remise_exceptionnelle = remise_exceptionnelle;
    if (remise_2 !== undefined) partial.remise_2 = remise_2;
  }

  if (Object.keys(partial).length === 0) {
    return { affectedCount: 0, toastMessage: 'Aucun paramètre de remise fourni.' };
  }

  // Merge into each row's deal_overrides (preserving existing fields)
  const updateResults = await Promise.all(
    rows.map(({ id, deal_overrides }) => {
      const merged = { ...(deal_overrides as Record<string, unknown> ?? {}), ...partial };
      return clients.adminClient
        .from('campaign_supports')
        .update({ deal_overrides: merged })
        .eq('id', id);
    })
  );

  // Check for update errors
  for (const result of updateResults) {
    if (result.error) {
      console.error(`[calculate-pricing] Update error:`, result.error);
      throw new Error(`Update failed: ${result.error.message}`);
    }
  }

  const count = rows.length;
  console.log(`[calculate-pricing] Applied ${JSON.stringify(partial)} to ${count} supports in conversationId=${conversationId}`);

  const toastMessage = input.reset_remises
    ? `Remises réinitialisées sur ${count} support${count > 1 ? 's' : ''}`
    : `Remise appliquée à ${count} support${count > 1 ? 's' : ''}`;

  return { affectedCount: count, toastMessage };
}
