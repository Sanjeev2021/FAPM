import { useEffect } from 'react';
import { toast } from 'sonner';
import { Trash2Icon, PlusIcon, FilterIcon, AlertCircleIcon } from 'lucide-react';

interface RefineResult {
  mode: 'remove' | 'add' | 'filter' | 'keep';
  affectedCount: number;
  toastMessage: string;
}

const NO_SUPPORTS_PREFIXES = ['no_print_supports', 'no_web_supports', 'no_nl_supports'];

export function RefineConfirmation({ result }: { result: unknown }) {
  const data = result as RefineResult;
  const isNoSupports = NO_SUPPORTS_PREFIXES.some(p => data?.toastMessage?.startsWith(p));

  useEffect(() => {
    if (!data?.toastMessage) return;
    if (isNoSupports) {
      toast.warning('Aucun support de ce canal dans la sélection');
    } else {
      toast.success(data.toastMessage);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data) return null;

  if (isNoSupports) {
    return (
      <div className="flex items-center gap-2 mt-2 text-sm text-amber-600">
        <AlertCircleIcon className="w-4 h-4 shrink-0" />
        <span>Aucun support de ce canal dans la sélection</span>
      </div>
    );
  }

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
