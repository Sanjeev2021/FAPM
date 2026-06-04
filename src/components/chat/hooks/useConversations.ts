import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface ConversationRow {
  id: string;
  title: string;
  status: 'draft' | 'quoted' | 'sent';
  metadata: {
    agence?: string;
    annonceur?: string;
    campagne?: string;
    contact_nom?: string;
    contact_email?: string;
    contact?: string;
  } | null;
  created_at: string;
  updated_at: string;
}

export function useConversations() {
  return useQuery({
    queryKey: ['conversations'],
    queryFn: async (): Promise<ConversationRow[]> => {
      const { data, error } = await supabase
        .from('leo_conversations')
        .select('id, title, status, metadata, created_at, updated_at')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ConversationRow[];
    },
  });
}

export function useRenameConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const { error } = await supabase
        .from('leo_conversations')
        .update({ title })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Child tables (leo_messages, campaign_supports, export_jobs) have ON DELETE CASCADE
      const { error } = await supabase
        .from('leo_conversations')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}
