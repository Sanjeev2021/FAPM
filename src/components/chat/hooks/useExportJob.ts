import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

interface ExportJob {
  id: string;
  conversation_id: string;
  organization_id: string;
  type: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  file_url: string | null;
  storage_path: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export function useExportJob(jobId: string | null) {
  return useQuery({
    queryKey: ['export_job', jobId],
    queryFn: async (): Promise<ExportJob> => {
      const { data, error } = await supabase
        .from('export_jobs')
        .select('*')
        .eq('id', jobId!)
        .single();
      if (error) throw error;
      return data as ExportJob;
    },
    enabled: !!jobId,
    retry: 1,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'pending' || status === 'processing' ? 3000 : false;
    },
  });
}
