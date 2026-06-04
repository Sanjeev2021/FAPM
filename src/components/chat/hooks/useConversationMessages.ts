import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { UIMessage } from 'ai';

interface MessageRow {
  id: string;
  role: 'user' | 'assistant';
  parts: UIMessage['parts'];
  created_at: string;
}

export function useConversationMessages(conversationId: string | undefined) {
  return useQuery({
    queryKey: ['messages', conversationId],
    queryFn: async (): Promise<UIMessage[]> => {
      const { data, error } = await supabase
        .from('leo_messages')
        .select('id, role, parts, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row: MessageRow) => ({
        id: row.id,
        role: row.role,
        parts: row.parts,
        createdAt: new Date(row.created_at),
      })) as UIMessage[];
    },
    enabled: !!conversationId,
    staleTime: 30_000,
  });
}
