import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { FileSpreadsheet, Presentation, Mail, Loader2, AlertCircle, Download, RefreshCw, X, ChevronDown, Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { copyRichText } from '@/lib/copyRichText';
import type { GlobalSummary } from '@/lib/devisCalculations';
import { formatPrice } from '@/lib/devisCalculations';
import type { DeliverableState } from '@/components/chat/hooks/useDeliverableStates';
import { InlineExcelPreview, InlinePptPreview, InlineEmailPreview } from './DeliverableInlinePreview';

type DeliverableType = 'excel' | 'ppt' | 'email';

interface DevisSummaryCardProps {
  summary: GlobalSummary;
  supportCount: number;
  deliverableStates: { excel: DeliverableState; ppt: DeliverableState; email: DeliverableState };
  onGenerate: (type: DeliverableType) => void;
  onRegenerate: (type: DeliverableType) => void;
  onCancel: (type: DeliverableType) => void;
}

const DELIVERABLE_CONFIG = {
  excel: { icon: FileSpreadsheet, color: 'emerald' as const },
  ppt: { icon: Presentation, color: 'orange' as const },
  email: { icon: Mail, color: 'blue' as const },
} as const;

const COLOR_CLASSES = {
  emerald: { border: 'border-l-emerald-500', text: 'text-emerald-700', icon: 'text-emerald-500' },
  orange: { border: 'border-l-orange-500', text: 'text-orange-700', icon: 'text-orange-500' },
  blue: { border: 'border-l-blue-500', text: 'text-blue-700', icon: 'text-blue-500' },
} as const;

function StatusPill() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#7C8CF8]/10 via-[#C084FC]/10 to-[#F59AC0]/10 px-2.5 py-0.5 text-xs text-[#7C8CF8] border border-[#7C8CF8]/20">
      <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-[#7C8CF8] to-[#F59AC0]" />
      Prêt
    </span>
  );
}

export function DevisSummaryCard({ summary, supportCount, deliverableStates, onGenerate, onRegenerate, onCancel }: DevisSummaryCardProps) {
  const { t } = useTranslation();
  const [expandedPreview, setExpandedPreview] = useState<DeliverableType | null>(null);

  const toggle = (type: DeliverableType) =>
    setExpandedPreview((prev) => (prev === type ? null : type));

  return (
    <Card className="p-6 bg-gradient-to-r from-[#7C8CF8]/5 via-[#C084FC]/5 to-[#F59AC0]/5 border-[#7C8CF8]/20">
      <div className="mb-4">
        <h2 className="text-xl font-normal text-gray-900 mb-1">
          Devis Builder
        </h2>
        <p className="text-sm font-light text-gray-600">
          {supportCount} support{supportCount > 1 ? 's' : ''} — remise agence 15% appliquée sur le total
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <SummaryValue label="Total brut éditeur" value={formatPrice(summary.totalBrut)} />
        <SummaryValue label="Remise professionnelle 15%" value={`-${formatPrice(summary.agencyDiscount)}`} muted />
        <SummaryValue label="Total net net PLS" value={formatPrice(summary.netPLS)} highlight />
      </div>

      {/* Deliverable mini-cards */}
      <div className="mt-4 pt-4 border-t border-gray-200 space-y-2">
        {(['excel', 'ppt', 'email'] as const).map((type) => {
          const state = deliverableStates[type];
          const config = DELIVERABLE_CONFIG[type];
          const colors = COLOR_CLASSES[config.color];
          const Icon = config.icon;
          const isCompleted = type === 'email'
            ? state.available && !!state.emailHtml
            : state.available && state.jobStatus === 'completed';

          if (isCompleted) {
            return (
              <Collapsible
                key={type}
                open={expandedPreview === type}
                onOpenChange={() => toggle(type)}
                className={`group rounded-xl border border-gray-100 border-l-4 ${colors.border} bg-white shadow-sm`}
              >
                <CollapsibleTrigger className="flex w-full items-center justify-between gap-4 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${colors.icon}`} strokeWidth={1.5} />
                    <span className={`text-sm font-medium ${colors.text}`}>
                      {t(`chat.deliverables.${type}`)}
                    </span>
                    <StatusPill />
                  </div>
                  <ChevronDown className="size-4 text-muted-foreground shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent className="px-3 pb-3">
                  <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-3">
                    {type === 'excel' && <InlineExcelPreview fileUrl={state.fileUrl} />}
                    {type === 'ppt' && <InlinePptPreview fileUrl={state.fileUrl} />}
                    {type === 'email' && <InlineEmailPreview emailHtml={state.emailHtml} />}
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    {state.fileUrl && type !== 'email' && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                        <a href={state.fileUrl} target="_blank" rel="noopener noreferrer">
                          <Download className="h-3.5 w-3.5 mr-1" />
                          {t('chat.deliverables.download')}
                        </a>
                      </Button>
                    )}
                    {type === 'email' && state.emailHtml && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => copyRichText(state.emailHtml!)}>
                        <Copy className="h-3.5 w-3.5 mr-1" />
                        {t('chat.deliverables.copyEmail')}
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onRegenerate(type)}>
                      <RefreshCw className="h-3.5 w-3.5 mr-1" />
                      {t('chat.deliverables.regenerate')}
                    </Button>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          }

          // Non-completed states: static row (not collapsible)
          return (
            <StaticMiniCard
              key={type}
              type={type}
              state={state}
              label={t(`chat.deliverables.${type}`)}
              icon={Icon}
              colors={colors}
              onGenerate={() => onGenerate(type)}
              onCancel={() => onCancel(type)}
              t={t}
            />
          );
        })}
      </div>
    </Card>
  );
}

function StaticMiniCard({
  type,
  state,
  label,
  icon: Icon,
  colors,
  onGenerate,
  onCancel,
  t,
}: {
  type: DeliverableType;
  state: DeliverableState;
  label: string;
  icon: typeof FileSpreadsheet;
  colors: { border: string; text: string; icon: string };
  onGenerate: () => void;
  onCancel: () => void;
  t: (key: string) => string;
}) {
  const isProcessing = state.available && (state.jobStatus === 'pending' || state.jobStatus === 'processing');
  const isFailed = state.available && state.jobStatus === 'failed';

  return (
    <div className={`flex items-center justify-between rounded-xl border-l-4 ${colors.border} border border-gray-100 bg-white px-3 py-2.5 shadow-sm`}>
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${colors.icon}`} strokeWidth={1.5} />
        <span className={`text-sm font-medium ${colors.text}`}>{label}</span>
      </div>

      <div className="flex items-center gap-1.5">
        {!isProcessing && !isFailed && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onGenerate}>
            {t('chat.deliverables.generate')}
          </Button>
        )}

        {isProcessing && (
          <>
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t('chat.deliverables.processing')}
            </span>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-destructive" onClick={onCancel} title="Annuler">
              <X className="h-3.5 w-3.5" />
            </Button>
          </>
        )}

        {isFailed && (
          <>
            <span className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5" />
              {t('chat.deliverables.failed')}
            </span>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onGenerate}>
              {t('chat.deliverables.retry')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryValue({ label, value, highlight, muted }: {
  label: string;
  value: string;
  highlight?: boolean;
  muted?: boolean;
}) {
  return (
    <div>
      <div className="text-xs font-light text-gray-500 uppercase tracking-wide mb-1">
        {label}
      </div>
      <div className={`text-lg ${
        highlight
          ? 'font-semibold text-gray-900'
          : muted
            ? 'font-light text-gray-500'
            : 'font-normal text-gray-700'
      }`}>
        {value}
      </div>
    </div>
  );
}
