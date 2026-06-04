import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface Deliverable {
  id: string;
  type: 'excel' | 'ppt' | 'email';
  storage_path: string | null;
  file_url: string | null;
  created_at: string;
}

export interface ConversationDeliverables {
  conversation_id: string;
  title: string;
  metadata: { annonceur?: string; campagne?: string } | null;
  created_at: string;
  status: string;
  deliverables: Deliverable[];
}

export function useRecentExports() {
  return useQuery({
    queryKey: ['recent_export_conversations'],
    queryFn: async (): Promise<ConversationDeliverables[]> => {
      const { data, error } = await supabase
        .from('leo_conversations')
        .select('id, title, created_at, metadata, status, export_jobs(id, type, status, storage_path, file_url, created_at)')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      type RawRow = {
        id: string;
        title: string | null;
        created_at: string;
        metadata: Record<string, unknown> | null;
        status: string;
        export_jobs: {
          id: string;
          type: string;
          status: string;
          storage_path: string | null;
          file_url: string | null;
          created_at: string;
        }[] | null;
      };

      return (data as RawRow[] ?? [])
        .filter((conv) => {
          const jobs = conv.export_jobs;
          return jobs && jobs.length > 0 && jobs.some((j) => j.status === 'completed');
        })
        .slice(0, 5)
        .map((conv) => ({
          conversation_id: conv.id,
          title: conv.title || 'Sans titre',
          metadata: conv.metadata as ConversationDeliverables['metadata'],
          created_at: conv.created_at,
          status: conv.status,
          deliverables: (conv.export_jobs ?? [])
            .filter((j) => j.status === 'completed')
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .map((j) => ({
              id: j.id,
              type: j.type as Deliverable['type'],
              storage_path: j.storage_path,
              file_url: j.file_url,
              created_at: j.created_at,
            })),
        }));
    },
    staleTime: 30_000,
  });
}
