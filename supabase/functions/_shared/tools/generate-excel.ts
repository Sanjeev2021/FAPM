import { z } from 'npm:zod@3';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const generateExcelInput = z.object({});

export const generateExcelOutput = z.object({
  status: z.enum(['pending', 'metadata_required', 'no_supports']),
  job_id: z.string().optional(),
  type: z.string().optional(),
  missing_fields: z.array(z.string()).optional(),
  toastMessage: z.string(),
});

// Only annonceur is required — agence is optional (direct sales have no intermediary agency)
const REQUIRED_METADATA = ['annonceur'];

export async function executeGenerateExcel(
  _input: z.infer<typeof generateExcelInput>,
  clients: { userClient: SupabaseClient; adminClient: SupabaseClient },
  context: { conversationId: string; orgId: string }
): Promise<z.infer<typeof generateExcelOutput>> {
  const { conversationId } = context;

  // Check selected supports exist
  const { count, error: countError } = await clients.adminClient
    .from('campaign_supports')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .eq('is_selected', true);

  if (countError) throw new Error(`Count failed: ${countError.message}`);
  if (!count || count === 0) {
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

  if (missing.length > 0) {
    return { status: 'metadata_required', missing_fields: missing, toastMessage: 'Métadonnées requises avant export.' };
  }

  // Idempotency: return existing pending/processing job if created within 5 minutes
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: existingJob } = await clients.adminClient
    .from('export_jobs')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('type', 'excel')
    .in('status', ['pending', 'processing'])
    .gte('created_at', fiveMinAgo)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (existingJob) {
    console.log(`[generate-excel] Reusing existing job ${existingJob.id} for conversation ${conversationId}`);
    return { status: 'pending', job_id: existingJob.id, type: 'excel', toastMessage: 'Génération du devis Excel déjà en cours.' };
  }

  // Insert export job
  const { data: job, error: insertError } = await clients.adminClient
    .from('export_jobs')
    .insert({
      conversation_id: conversationId,
      organization_id: orgId,
      type: 'excel',
      status: 'pending',
    })
    .select('id')
    .single();

  if (insertError) throw new Error(`Insert failed: ${insertError.message}`);

  console.log(`[generate-excel] Created export job ${job.id} for conversation ${conversationId}`);
  return { status: 'pending', job_id: job.id, type: 'excel', toastMessage: 'Génération du devis Excel lancée.' };
}
