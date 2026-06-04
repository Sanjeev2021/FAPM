import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileSpreadsheet, Presentation, Mail, FileDown, MessageSquare, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { ConversationDeliverables, Deliverable } from './hooks/useRecentExports';

const TYPE_CONFIG: Record<string, { icon: typeof FileSpreadsheet; color: string; bgColor: string }> = {
  excel: { icon: FileSpreadsheet, color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
  ppt: { icon: Presentation, color: 'text-orange-600', bgColor: 'bg-orange-50' },
  email: { icon: Mail, color: 'text-blue-600', bgColor: 'bg-blue-50' },
};

function formatRelativeDate(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return "à l'instant";
  if (diffMins < 60) return `il y a ${diffMins}min`;
  if (diffHours < 24) return `il y a ${diffHours}h`;
  if (diffDays < 7) return `il y a ${diffDays}j`;
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function DeliverableRow({
  deliverable,
  conversationId,
  onSelectConversation,
}: {
  deliverable: Deliverable;
  conversationId: string;
  onSelectConversation: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const config = TYPE_CONFIG[deliverable.type] ?? TYPE_CONFIG.excel;
  const Icon = config.icon;

  const handleDownload = async () => {
    // For email type, just navigate to the conversation
    if (deliverable.type === 'email') {
      onSelectConversation(conversationId);
      return;
    }

    setLoading(true);
    try {
      // Try to generate a fresh signed URL from storage_path
      if (deliverable.storage_path) {
        const { data, error } = await supabase.storage
          .from('devis-files')
          .createSignedUrl(deliverable.storage_path, 3600);

        if (!error && data?.signedUrl) {
          window.open(data.signedUrl, '_blank');
          setLoading(false);
          return;
        }
      }

      // Fallback to stored file_url (may be expired)
      if (deliverable.file_url) {
        window.open(deliverable.file_url, '_blank');
      } else {
        toast.error(t('chat.deliverables.downloadError'));
      }
    } catch {
      toast.error(t('chat.deliverables.downloadError'));
    } finally {
      setLoading(false);
    }
  };

  const label = deliverable.type === 'excel'
    ? t('chat.deliverables.downloadExcel')
    : deliverable.type === 'ppt'
      ? t('chat.deliverables.downloadPpt')
      : t('chat.deliverables.openConversation');

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={loading}
      className="flex items-center gap-3 w-full px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left group/row"
    >
      <div className={`flex items-center justify-center w-7 h-7 rounded-md ${config.bgColor}`}>
        {loading ? (
          <Loader2 className={`w-3.5 h-3.5 animate-spin ${config.color}`} />
        ) : (
          <Icon className={`w-3.5 h-3.5 ${config.color}`} strokeWidth={1.5} />
        )}
      </div>
      <span className="text-xs font-light text-gray-700 dark:text-gray-300 group-hover/row:text-gray-900 dark:group-hover/row:text-gray-100 transition-colors">
        {label}
      </span>
      {deliverable.type !== 'email' && (
        <FileDown className="w-3 h-3 text-gray-300 ml-auto opacity-0 group-hover/row:opacity-100 transition-opacity" />
      )}
    </button>
  );
}

export function DeliverableCard({
  conversation,
  onSelectConversation,
}: {
  conversation: ConversationDeliverables;
  onSelectConversation: (id: string) => void;
}) {
  const { t } = useTranslation();
  const annonceur = conversation.metadata?.annonceur;
  const latestDate = conversation.deliverables[0]?.created_at ?? conversation.created_at;

  return (
    <div className="group relative bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-gray-800 hover:border-transparent transition-all duration-500 hover:shadow-lg overflow-hidden">
      {/* Gradient border on hover */}
      <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-r from-[#7C8CF8] via-[#C084FC] to-[#F59AC0] p-[1.5px]">
        <div className="h-full w-full bg-white dark:bg-card rounded-2xl" />
      </div>

      <div className="relative z-10 p-4 space-y-3">
        {/* Header: title + annonceur + date */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {conversation.title}
            </h3>
            {annonceur && (
              <span className="inline-block mt-1 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 rounded-full">
                {annonceur}
              </span>
            )}
          </div>
          <span className="text-[10px] font-light text-gray-400 shrink-0 mt-0.5">
            {formatRelativeDate(latestDate)}
          </span>
        </div>

        {/* Deliverable rows */}
        <div className="-mx-1">
          {conversation.deliverables.map((d) => (
            <DeliverableRow
              key={d.id}
              deliverable={d}
              conversationId={conversation.conversation_id}
              onSelectConversation={onSelectConversation}
            />
          ))}
        </div>

        {/* Footer: open conversation link */}
        <button
          type="button"
          onClick={() => onSelectConversation(conversation.conversation_id)}
          className="flex items-center gap-1.5 text-[10px] font-light text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors pt-1"
        >
          <MessageSquare className="w-3 h-3" />
          {t('chat.deliverables.openConversation')}
        </button>
      </div>
    </div>
  );
}
