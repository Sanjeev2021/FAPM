import { useEffect } from 'react';
import { toast } from 'sonner';
import {
  CheckCircle,
  Building2,
  Megaphone,
  Target,
  Wallet,
  Calendar,
  Radio,
  ShieldX,
  User,
  Mail,
  Briefcase,
} from 'lucide-react';

interface MetadataResult {
  saved: boolean;
  complete: boolean;
  mode?: 'full' | 'quick';
  existing: Record<string, string>;
  missing: string[];
  updatedFields?: string[];
  toastMessage?: string;
}

const FIELD_CONFIG: Record<string, { label: string; icon: typeof Building2 }> = {
  agence: { label: 'Agence', icon: Building2 },
  annonceur: { label: 'Annonceur', icon: Megaphone },
  campagne: { label: 'Campagne', icon: Briefcase },
  budget: { label: 'Budget', icon: Wallet },
  cible: { label: 'Cible', icon: Target },
  objectif: { label: 'Objectif', icon: Target },
  periode: { label: 'Période', icon: Calendar },
  canaux: { label: 'Canaux', icon: Radio },
  secteurs_exclus: { label: 'Exclusions', icon: ShieldX },
  contact_nom: { label: 'Contact', icon: User },
  contact_email: { label: 'Email', icon: Mail },
};

// Fields to hide from the card (internal / merged)
const HIDDEN_FIELDS = new Set(['contact']);

export function MetadataArtifact({ result }: { result: unknown }) {
  const data = result as MetadataResult;

  useEffect(() => {
    if (data?.saved && data?.toastMessage) {
      toast.success(data.toastMessage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data) return null;
  if (!data.saved) return null;

  const entries = Object.entries(data.existing).filter(
    ([key, value]) => value && !HIDDEN_FIELDS.has(key)
  );

  if (entries.length === 0) return null;

  // Quick mode: compact card
  if (data.mode === 'quick') {
    return (
      <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-3 mt-1">
        <div className="flex items-center gap-1.5 mb-2">
          <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <span className="text-xs font-medium text-gray-600">Métadonnées mises à jour</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {entries.map(([key, value]) => {
            const config = FIELD_CONFIG[key];
            const isNew = data.updatedFields?.includes(key);
            return (
              <span
                key={key}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-light ${
                  isNew
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-white text-gray-600 border border-gray-150'
                }`}
              >
                {config?.label || key}: {value.length > 30 ? value.slice(0, 30) + '…' : value}
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  // Full mode: detailed card
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 mt-2 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
        <span className="text-sm font-medium text-gray-900">Métadonnées campagne</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {entries.map(([key, value]) => {
          const config = FIELD_CONFIG[key];
          const Icon = config?.icon || Briefcase;
          return (
            <div
              key={key}
              className="flex items-start gap-2 p-2 rounded-lg bg-gray-50/80"
            >
              <Icon className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" strokeWidth={1.5} />
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">
                  {config?.label || key}
                </div>
                <div className="text-xs font-light text-gray-700 break-words">
                  {value}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
