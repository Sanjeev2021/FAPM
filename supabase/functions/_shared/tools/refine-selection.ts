import { z } from 'npm:zod@3';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { executeRagSearch } from './rag-search.ts';

export const refineSelectionInput = z.object({
  mode: z.enum(['remove', 'add', 'filter', 'keep']).describe(
    'remove: soft-delete matching supports (is_selected=false); ' +
    'add: RAG-search new supports and accumulate into working set; ' +
    'filter: keep only one canal, soft-delete the rest; ' +
    'keep: keep only the specified supports, soft-delete all others'
  ),
  variantSlugsToRemove: z.array(z.string()).optional().describe(
    'For remove mode only: variant_slug values from the current working set to soft-delete. ' +
    'Choose from the slugs listed in your working set context.'
  ),
  query: z.string().optional().describe(
    'For add mode only: natural language search query (e.g., "newsletters pharmaciens Île-de-France")'
  ),
  variantSlugsToKeep: z.array(z.string()).optional().describe(
    'For keep mode only: variant_slug values to KEEP. All other selected supports will be soft-deleted.'
  ),
  canal: z.enum(['Print', 'Web', 'NL']).optional().describe(
    'For add mode: optional canal filter for the new search. ' +
    'For filter mode: the canal to KEEP (all others will be soft-deleted).'
  ),
});

// Documentation schema — AI SDK v6 tool() has no outputSchema parameter,
// but this defines the expected return shape for type safety and future use.
export const refineSelectionOutput = z.object({
  mode: z.enum(['remove', 'add', 'filter', 'keep']),
  affectedCount: z.number(),
  toastMessage: z.string(),
});

export async function executeRefineSelection(
  input: z.infer<typeof refineSelectionInput>,
  clients: { userClient: SupabaseClient; adminClient: SupabaseClient },
  context: { conversationId: string; orgId: string }
): Promise<z.infer<typeof refineSelectionOutput>> {
  const { mode, variantSlugsToRemove, variantSlugsToKeep, query, canal } = input;
  const { conversationId } = context;

  if (mode === 'remove') {
    if (!variantSlugsToRemove?.length) {
      return { mode, affectedCount: 0, toastMessage: 'Aucun support à retirer.' };
    }
    // variant_slug lives inside support_data JSONB — must use JSONB path filter
    // Quote each slug for PostgREST `in` syntax to handle any special characters safely
    const slugList = variantSlugsToRemove.map(s => `"${s}"`).join(',');
    console.log(`[refine-selection] remove mode: slugs=(${slugList}) conversationId=${conversationId}`);
    const { data, error } = await clients.adminClient
      .from('campaign_supports')
      .update({ is_selected: false })
      .eq('conversation_id', conversationId)
      .filter('support_data->>variant_slug', 'in', `(${slugList})`)
      .eq('is_selected', true)
      .select('id');
    if (error) {
      console.error(`[refine-selection] remove error:`, error);
      throw new Error(`Remove failed: ${error.message}`);
    }
    const count = data?.length ?? 0;
    console.log(`[refine-selection] remove success: ${count} rows updated`);
    return {
      mode,
      affectedCount: count,
      toastMessage: `${count} support${count > 1 ? 's' : ''} retiré${count > 1 ? 's' : ''}`,
    };
  }

  if (mode === 'add') {
    if (!query) throw new Error('query is required for add mode');
    console.log(`[refine-selection] add mode: query="${query}" canal=${canal ?? 'all'} conversationId=${conversationId}`);
    try {
      const result = await executeRagSearch({ query, matchCount: 40 }, clients, context, canal, true);
      const count = result.inserted; // actual new/reactivated rows, not search result count
      console.log(`[refine-selection] add success: inserted=${count} total_found=${result.total}`);
      return {
        mode,
        affectedCount: count,
        toastMessage: `${count} support${count > 1 ? 's' : ''} ajouté${count > 1 ? 's' : ''}`,
      };
    } catch (err) {
      console.error(`[refine-selection] add error:`, err);
      throw err;
    }
  }

  if (mode === 'filter') {
    if (!canal) throw new Error('canal is required for filter mode');
    console.log(`[refine-selection] filter mode: keep canal=${canal} conversationId=${conversationId}`);

    // Step 1: Reactivate ALL supports of the target canal, regardless of current is_selected.
    // This is essential for canal-switching (e.g. filter→Web then filter→Print): the Print
    // rows were deactivated by the previous filter and must be restored before we can apply
    // the new filter, otherwise the working set ends up completely empty.
    const { error: reactivateError } = await clients.adminClient
      .from('campaign_supports')
      .update({ is_selected: true })
      .eq('conversation_id', conversationId)
      .filter('support_data->>canal', 'eq', canal);
    if (reactivateError) {
      console.error(`[refine-selection] filter reactivate error:`, reactivateError);
      throw new Error(`Filter reactivate failed: ${reactivateError.message}`);
    }

    // Step 2: Deactivate ALL supports of other canals (unconditional — we own the full state).
    const { data, error } = await clients.adminClient
      .from('campaign_supports')
      .update({ is_selected: false })
      .eq('conversation_id', conversationId)
      .filter('support_data->>canal', 'neq', canal)
      .select('id');
    if (error) {
      console.error(`[refine-selection] filter error:`, error);
      throw new Error(`Filter failed: ${error.message}`);
    }
    const count = data?.length ?? 0;
    return {
      mode,
      affectedCount: count,
      toastMessage: `Filtré sur ${canal}`,
    };
  }

  if (mode === 'keep') {
    if (!variantSlugsToKeep?.length) {
      return { mode, affectedCount: 0, toastMessage: 'Aucun support spécifié à garder.' };
    }
    const slugList = variantSlugsToKeep.map(s => `"${s}"`).join(',');
    console.log(`[refine-selection] keep mode: keeping=(${slugList}) conversationId=${conversationId}`);
    const { data, error } = await clients.adminClient
      .from('campaign_supports')
      .update({ is_selected: false })
      .eq('conversation_id', conversationId)
      .eq('is_selected', true)
      .not('support_data->>variant_slug', 'in', `(${slugList})`)
      .select('id');
    if (error) {
      console.error(`[refine-selection] keep error:`, error);
      throw new Error(`Keep failed: ${error.message}`);
    }
    const count = data?.length ?? 0;
    console.log(`[refine-selection] keep success: ${count} rows removed, kept ${variantSlugsToKeep.length} slugs`);
    return {
      mode,
      affectedCount: count,
      toastMessage: `${count} support${count > 1 ? 's' : ''} retiré${count > 1 ? 's' : ''}, sélection réduite.`,
    };
  }

  throw new Error(`Unknown mode: ${mode}`);
}
