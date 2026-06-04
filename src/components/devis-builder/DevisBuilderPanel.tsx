import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { UIMessage } from 'ai';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { FileSpreadsheet } from 'lucide-react';
import { useDeliverableStates } from '@/components/chat/hooks/useDeliverableStates';
import { useWorkingSet, useRemoveSupport, useRejectedSupports, useReAddSupport, useDealOverridesMutation } from '@/components/chat/hooks/useWorkingSet';
import type { CampaignSupport } from '@/components/chat/hooks/useWorkingSet';
import {
  initializeLineItem,
  recalculateFromQuantity,
  recalculateFromTarifBrutDirect,
  recalculateFromImpressions,
  recalculateFromCpmRate,
  recalculateFromRemise,
  recalculateFromQtyWithLockedNet,
  recalculateFromRemiseWithLockedNet,
  recalculateFromNetWithLockedQty,
  recalculateFromNetWithLockedRemise,
  computeGlobalSummary,
  toOverrides,
} from '@/lib/devisCalculations';
import type { DevisLineItem, Canal, LockedField } from '@/lib/devisCalculations';
import { DevisSummaryCard } from './DevisSummaryCard';
import { ChannelAccordion } from './ChannelAccordion';
import { RemovedSupportsSection } from './RemovedSupportsSection';

interface DevisBuilderPanelProps {
  conversationId: string | null;
  onSendMessage?: (text: string) => void;
  messages?: UIMessage[];
}

export function DevisBuilderPanel({ conversationId, onSendMessage, messages = [] }: DevisBuilderPanelProps) {
  const { t } = useTranslation();
  const { supports, isLoading } = useWorkingSet(conversationId);
  const { removeSupport } = useRemoveSupport(conversationId);
  const { data: rejectedSupports = [] } = useRejectedSupports(conversationId);
  const { reAddSupport } = useReAddSupport(conversationId);
  const { mergeOverrides } = useDealOverridesMutation(conversationId);

  // Local line items state derived from query data
  const [lineItems, setLineItems] = useState<DevisLineItem[]>([]);
  const prevSupportIdsRef = useRef('');

  // Only re-initialize when the set of supports changes (adds/removes),
  // NOT on every refetch (which would clobber in-progress local edits)
  const supportIds = supports.map((s) => s.id).sort().join(',');
  useEffect(() => {
    if (supportIds !== prevSupportIdsRef.current) {
      prevSupportIdsRef.current = supportIds;
      if (supports.length > 0) {
        setLineItems(supports.map(initializeLineItem));
      } else {
        setLineItems([]);
      }
    }
  }, [supportIds, supports]);

  // Lock state: which field is locked per line (default: remise_1)
  const [lockedFields, setLockedFields] = useState<Record<string, LockedField>>({});

  const handleToggleLock = useCallback(
    (itemId: string, field: LockedField) => {
      setLockedFields((prev) => ({ ...prev, [itemId]: field }));
    },
    []
  );

  // Group by channel
  const groupedByChannel = useMemo(() => {
    const groups: Partial<Record<Canal, DevisLineItem[]>> = {};
    for (const item of lineItems) {
      if (!groups[item.canal]) groups[item.canal] = [];
      groups[item.canal]!.push(item);
    }
    return groups;
  }, [lineItems]);

  const summary = useMemo(() => computeGlobalSummary(lineItems), [lineItems]);

  // Edit handler: update local state with lock-aware cascading recalc, then persist
  const handleEditField = useCallback(
    (itemId: string, field: 'quantite' | 'tarif_brut' | 'remise_1' | 'net' | 'visites' | 'cpm_rate', value: number) => {
      let changedItem: DevisLineItem | undefined;
      const locked = lockedFields[itemId] ?? 'remise_1';

      setLineItems((prev) => {
        const updated = prev.map((item) => {
          if (item.id !== itemId) return item;
          switch (field) {
            case 'quantite':
              return locked === 'net'
                ? recalculateFromQtyWithLockedNet(item, value)
                : recalculateFromQuantity(item, value);
            case 'tarif_brut':
              return recalculateFromTarifBrutDirect(item, value);
            case 'visites':
              return recalculateFromImpressions(item, value);
            case 'cpm_rate':
              return recalculateFromCpmRate(item, value);
            case 'remise_1':
              return locked === 'net'
                ? recalculateFromRemiseWithLockedNet(item, value)
                : recalculateFromRemise(item, value);
            case 'net':
              return locked === 'quantite'
                ? recalculateFromNetWithLockedQty(item, value)
                : recalculateFromNetWithLockedRemise(item, value);
            default:
              return item;
          }
        });
        changedItem = updated.find((i) => i.id === itemId);
        return updated;
      });

      // Persist outside the state updater to avoid side effects in setter
      // changedItem is captured synchronously since setLineItems updater runs sync
      if (changedItem) {
        mergeOverrides({
          supportId: itemId,
          overrides: toOverrides(changedItem),
        });
      }
    },
    [mergeOverrides, lockedFields]
  );

  // Remove handler — uses ref to avoid re-creating on every lineItems change
  const lineItemsRef = useRef(lineItems);
  lineItemsRef.current = lineItems;

  const handleRemove = useCallback(
    (supportId: string) => {
      const item = lineItemsRef.current.find((i) => i.id === supportId);
      if (item) {
        toast.success(`${item.support_name} retiré de la sélection`);
      }
      removeSupport(supportId, {
        onError: () => toast.error('Erreur lors du retrait'),
      });
    },
    [removeSupport]
  );

  // Restore handler
  const handleRestore = useCallback(
    (supportId: string) => {
      const support = rejectedSupports.find((s) => s.id === supportId);
      reAddSupport(supportId, {
        onSuccess: () => {
          if (support) toast.success(`${support.support_data.support_name} restauré`);
        },
        onError: () => toast.error('Erreur lors de la restauration'),
      });
    },
    [rejectedSupports, reAddSupport]
  );

  // Deliverable states from message history
  const queryClient = useQueryClient();
  const deliverableStates = useDeliverableStates(messages);

  const promptExcel = t('chat.deliverables.promptExcel');
  const promptPpt = t('chat.deliverables.promptPpt');
  const promptEmail = t('chat.deliverables.promptEmail');

  const handleGenerate = useCallback((type: 'excel' | 'ppt' | 'email') => {
    if (!onSendMessage) {
      toast.info('Demandez à LEO de générer le livrable dans le chat.');
      return;
    }
    const prompts = { excel: promptExcel, ppt: promptPpt, email: promptEmail };
    onSendMessage(prompts[type]);
  }, [onSendMessage, promptExcel, promptPpt, promptEmail]);

  const handleRegenerate = useCallback((type: 'excel' | 'ppt' | 'email') => {
    if (!onSendMessage) {
      toast.info('Demandez à LEO de régénérer le livrable dans le chat.');
      return;
    }
    const prompts = { excel: promptExcel, ppt: promptPpt, email: promptEmail };
    onSendMessage(prompts[type]);
  }, [onSendMessage, promptExcel, promptPpt, promptEmail]);

  const handleCancel = useCallback(async (type: 'excel' | 'ppt' | 'email') => {
    const jobId = type === 'excel' ? deliverableStates.excel.jobId
      : type === 'ppt' ? deliverableStates.ppt.jobId
      : undefined;
    if (!jobId) return;
    const { error } = await supabase
      .from('export_jobs')
      .update({ status: 'failed', error_message: 'Annulé par l\'utilisateur' })
      .eq('id', jobId);
    if (error) {
      toast.error('Erreur lors de l\'annulation');
    } else {
      toast.success('Génération annulée');
      queryClient.invalidateQueries({ queryKey: ['export_job', jobId] });
    }
  }, [deliverableStates.excel.jobId, deliverableStates.ppt.jobId, queryClient]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="h-8 rounded bg-muted animate-pulse"
            style={{ width: `${70 + (i % 3) * 10}%` }}
          />
        ))}
      </div>
    );
  }

  if (lineItems.length === 0 && rejectedSupports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6">
        <FileSpreadsheet className="h-16 w-16 text-gray-300 mb-4" />
        <h3 className="text-lg font-normal text-gray-900 mb-2">
          Aucun support sélectionné
        </h3>
        <p className="text-sm font-light text-gray-600">
          Discutez avec LEO pour rechercher et ajouter des supports à votre devis
        </p>
      </div>
    );
  }

  const channelOrder: Canal[] = ['Print', 'Web', 'NL'];

  return (
    <div className="space-y-4">
      <DevisSummaryCard
        summary={summary}
        supportCount={lineItems.length}
        deliverableStates={deliverableStates}
        onGenerate={handleGenerate}
        onRegenerate={handleRegenerate}
        onCancel={handleCancel}
      />

      {channelOrder.map((ch) => (
        <ChannelAccordion
          key={ch}
          channel={ch}
          items={groupedByChannel[ch] ?? []}
          totalBudget={summary.totalNetAfterRemises}
          onEditField={handleEditField}
          onRemove={handleRemove}
          lockedFields={lockedFields}
          onToggleLock={handleToggleLock}
        />
      ))}

      <RemovedSupportsSection
        rejectedSupports={rejectedSupports}
        onRestore={handleRestore}
      />

    </div>
  );
}
