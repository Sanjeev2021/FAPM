import { useEffect } from 'react';
import { toast } from 'sonner';
import { Trash2Icon, PlusIcon, FilterIcon } from 'lucide-react';

interface RefineResult {
  mode: 'remove' | 'add' | 'filter';
  affectedCount: number;
  toastMessage: string;
}

export function RefineConfirmation({ result }: { result: unknown }) {
  const data = result as RefineResult;

  useEffect(() => {
    if (data?.toastMessage) {
      toast.success(data.toastMessage);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data) return null;

  const Icon =
    data.mode === 'add' ? PlusIcon :
    data.mode === 'filter' ? FilterIcon :
    Trash2Icon;

  return (
    <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
      <Icon className="w-4 h-4 shrink-0" />
      <span>{data.toastMessage}</span>
    </div>
  );
}
