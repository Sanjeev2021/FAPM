import { useEffect } from 'react';
import { toast } from 'sonner';
import { EditIcon } from 'lucide-react';

interface AdjustResult {
  affectedCount: number;
  toastMessage: string;
}

export function AdjustArtifact({ result }: { result: unknown }) {
  const data = result as AdjustResult;

  useEffect(() => {
    if (data?.toastMessage) {
      toast.success(data.toastMessage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps intentional: fire toast once on mount only

  if (!data) return null;

  return (
    <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
      <EditIcon className="w-4 h-4 shrink-0" />
      <span>{data.toastMessage}</span>
    </div>
  );
}
