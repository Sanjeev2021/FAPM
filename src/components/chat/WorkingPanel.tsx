import type { UIMessage } from 'ai';
import { DevisBuilderPanel } from '@/components/devis-builder/DevisBuilderPanel';

interface WorkingPanelProps {
  conversationId: string | null;
  onSendMessage?: (text: string) => void;
  messages?: UIMessage[];
}

export function WorkingPanel({ conversationId, onSendMessage, messages = [] }: WorkingPanelProps) {
  return (
    <div className="flex flex-col h-full bg-card border-l">
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 min-h-0">
        <DevisBuilderPanel conversationId={conversationId} onSendMessage={onSendMessage} messages={messages} />
      </div>
    </div>
  );
}
