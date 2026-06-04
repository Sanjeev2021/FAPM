import { useEffect } from 'react';
import { toast } from 'sonner';
import { AlertCircle, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { copyRichText } from '@/lib/copyRichText';
import { sanitizeHtml } from '@/lib/sanitizeHtml';

interface CampaignSummary {
  annonceur: string;
  agence: string;
  campagne: string | null;
  total_supports: number;
  supports_by_canal: { Print: number; Web: number; NL: number };
  total_brut: number;
  total_net: number;
  has_excel_export: boolean;
  has_ppt_export: boolean;
}

interface DraftEmailResult {
  status: 'ready' | 'metadata_required' | 'no_supports';
  email_body_html?: string;
  campaign_summary?: CampaignSummary;
  missing_fields?: string[];
  toastMessage: string;
}

export function EmailPreview({ result }: { result: unknown }) {
  const data = result as DraftEmailResult;

  useEffect(() => {
    if (data?.status === 'ready' && data?.toastMessage) {
      toast.success(data.toastMessage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data) return null;

  if (data.status === 'metadata_required') {
    return (
      <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
        <AlertCircle className="w-4 h-4 shrink-0" />
        <span>Métadonnées requises avant de rédiger l'email.</span>
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

  if (data.status === 'ready' && data.campaign_summary) {
    const s = data.campaign_summary;
    const canaux = [
      s.supports_by_canal.Print > 0 && `${s.supports_by_canal.Print} Print`,
      s.supports_by_canal.Web > 0 && `${s.supports_by_canal.Web} Web`,
      s.supports_by_canal.NL > 0 && `${s.supports_by_canal.NL} NL`,
    ].filter(Boolean).join(', ');

    return (
      <div className="mt-2">
        {data.email_body_html ? (
          <>
            <div
              className="text-sm"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.email_body_html) }}
            />
            <div className="flex justify-end mt-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => copyRichText(data.email_body_html!)}
              >
                <Copy className="h-3.5 w-3.5 mr-1" />
                Copier l'email
              </Button>
            </div>
          </>
        ) : (
          <div className="text-xs text-muted-foreground">
            <p>{s.annonceur} — {s.agence}{s.campagne ? ` — ${s.campagne}` : ''}</p>
          </div>
        )}
      </div>
    );
  }

  return null;
}
