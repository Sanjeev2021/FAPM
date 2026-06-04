import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, AlertCircle, CheckCircle2, Download } from 'lucide-react';
import { useExportJob } from '@/components/chat/hooks/useExportJob';
import { supabase } from '@/lib/supabase';

interface ExportResult {
  status: 'pending' | 'metadata_required' | 'no_supports';
  job_id?: string;
  type?: string;
  missing_fields?: string[];
  toastMessage: string;
}

export function ExportArtifact({ result }: { result: unknown }) {
  const data = result as ExportResult;

  useEffect(() => {
    if (data?.status === 'pending' && data?.toastMessage) {
      toast.success(data.toastMessage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data) return null;

  if (data.status === 'metadata_required') {
    return (
      <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
        <AlertCircle className="w-4 h-4 shrink-0" />
        <span>Métadonnées requises avant export.</span>
      </div>
    );
  }

  if (data.status === 'no_supports') {
    return (
      <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
        <AlertCircle className="w-4 h-4 shrink-0" />
        <span>Aucun support sélectionné.</span>
      </div>
    );
  }

  if (data.status === 'pending' && data.job_id) {
    return <ExportJobCard jobId={data.job_id} type={data.type ?? 'excel'} />;
  }

  return null;
}

function ExportJobCard({ jobId, type }: { jobId: string; type: string }) {
  const { data: job, isError } = useExportJob(jobId);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const typeLabel = type === 'excel' ? 'Excel' : type === 'ppt' ? 'PowerPoint' : type;

  // Show failed UI if job has been stuck in pending/processing for >10 min
  const isStuck =
    job &&
    (job.status === 'pending' || job.status === 'processing') &&
    new Date().getTime() - new Date(job.created_at).getTime() > 10 * 60 * 1000;

  const handleDownload = async () => {
    if (!job) return;
    setDownloadLoading(true);
    try {
      if (job.storage_path) {
        const { data, error } = await supabase.storage
          .from('devis-files')
          .createSignedUrl(job.storage_path, 3600);
        if (!error && data?.signedUrl) {
          window.open(data.signedUrl, '_blank');
          return;
        }
      }
      if (job.file_url) window.open(job.file_url, '_blank');
    } finally {
      setDownloadLoading(false);
    }
  };

  // Query failed (e.g. session expired) — don't spin forever
  if (isError) {
    return (
      <div className="flex items-center gap-3 mt-2 p-3 rounded-md border border-destructive/30 bg-destructive/5">
        <AlertCircle className="w-5 h-5 text-destructive" />
        <span className="text-sm">
          Impossible de charger le statut.{' '}
          <button type="button" onClick={() => window.location.reload()} className="underline">
            Recharger la page
          </button>
        </span>
      </div>
    );
  }

  if (!job || ((job.status === 'pending' || job.status === 'processing') && !isStuck)) {
    return (
      <div className="flex items-center gap-3 mt-2 p-3 rounded-md border bg-muted/30">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
        <span className="text-sm">Génération du devis {typeLabel} en cours…</span>
      </div>
    );
  }

  if (job.status === 'completed') {
    return (
      <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
        <span>{typeLabel === 'Excel' ? 'Devis Excel généré ✓' : `Présentation ${typeLabel} générée ✓`}</span>
        {(job.file_url || job.storage_path) && (
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloadLoading}
            className="inline-flex items-center gap-1 text-primary hover:underline ml-1"
          >
            {downloadLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            Télécharger
          </button>
        )}
      </div>
    );
  }

  // failed OR isStuck
  return (
    <div className="flex items-center gap-3 mt-2 p-3 rounded-md border border-destructive/30 bg-destructive/5">
      <AlertCircle className="w-5 h-5 text-destructive" />
      <span className="text-sm">La génération du {typeLabel} a échoué. Réessayez ou contactez le support.</span>
    </div>
  );
}
