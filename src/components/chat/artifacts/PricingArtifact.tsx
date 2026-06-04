import { useEffect } from 'react';
import { toast } from 'sonner';
import { PercentIcon } from 'lucide-react';

interface PricingResult {
  affectedCount: number;
  toastMessage: string;
}

export function PricingArtifact({ result }: { result: unknown }) {
  const data = result as PricingResult;

  useEffect(() => {
    if (data?.toastMessage) {
      toast.success(data.toastMessage);
    }
  // Empty deps intentional: fire toast once on mount only, not on every re-render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data) return null;

  return (
    <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
      <PercentIcon className="w-4 h-4 shrink-0" />
      <span>{data.toastMessage}</span>
    </div>
  );
}
