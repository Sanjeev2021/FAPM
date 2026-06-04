import { useTranslation } from 'react-i18next';
import { useRecentExports } from './hooks/useRecentExports';
import { DeliverableCard } from './DeliverableCard';

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-gray-100 dark:border-gray-800 p-4 space-y-3 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-2/3" />
          <div className="h-4 bg-gray-50 dark:bg-gray-800/50 rounded-full w-20" />
        </div>
        <div className="h-3 bg-gray-50 dark:bg-gray-800/50 rounded w-12" />
      </div>
      <div className="space-y-2">
        <div className="h-8 bg-gray-50 dark:bg-gray-800/50 rounded-lg" />
        <div className="h-8 bg-gray-50 dark:bg-gray-800/50 rounded-lg" />
      </div>
    </div>
  );
}

export function RecentDeliverables({
  onSelectConversation,
}: {
  onSelectConversation: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { data: conversations, isLoading } = useRecentExports();

  if (isLoading) {
    return (
      <div className="w-full">
        <h2 className="text-2xl md:text-3xl font-light leading-tight tracking-tight text-gray-900 dark:text-gray-100 mb-6">
          {t('chat.deliverables.title')}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  if (!conversations || conversations.length === 0) return null;

  return (
    <div className="w-full">
      <h2 className="text-2xl md:text-3xl font-light leading-tight tracking-tight text-gray-900 dark:text-gray-100 mb-6">
        {t('chat.deliverables.title')}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {conversations.map((conv) => (
          <DeliverableCard
            key={conv.conversation_id}
            conversation={conv}
            onSelectConversation={onSelectConversation}
          />
        ))}
      </div>
    </div>
  );
}
