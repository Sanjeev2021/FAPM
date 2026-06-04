import { useTranslation } from 'react-i18next';
import { CornerDownLeftIcon } from 'lucide-react';
import type { ChatStatus } from 'ai';
import type { PromptInputMessage } from '@/components/ai-elements/prompt-input';
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from '@/components/ai-elements/prompt-input';
import { RecentDeliverables } from './RecentDeliverables';

interface ChatWelcomeViewProps {
  onSubmit: (message: PromptInputMessage) => void;
  onSelectConversation: (id: string) => void;
  status: ChatStatus;
  onStop: () => void;
  greeting: string;
  firstName: string;
  orgName: string;
}

export function ChatWelcomeView({
  onSubmit,
  onSelectConversation,
  status,
  onStop,
  greeting,
  firstName,
  orgName,
}: ChatWelcomeViewProps) {
  const { t } = useTranslation();
  const isIdle = status === 'idle' || status === 'error';

  // Highlight orgName (preferred) or firstName in gradient
  const highlightWord = orgName || firstName;
  const greetingContent = (() => {
    if (!highlightWord) return greeting;
    const idx = greeting.indexOf(highlightWord);
    if (idx === -1) return greeting;
    const before = greeting.slice(0, idx);
    const after = greeting.slice(idx + highlightWord.length);
    return (
      <>
        {before}
        <span className="font-semibold bg-gradient-to-r from-[#7C8CF8] via-[#A78BFA] to-[#F59AC0] bg-clip-text text-transparent">
          {highlightWord}
        </span>
        {after}
      </>
    );
  })();

  return (
    <div className="flex flex-col items-center flex-1 h-full px-4 py-12 overflow-y-auto bg-gray-50 dark:bg-background">
      <div className="w-full max-w-3xl flex flex-col items-center">
        {/* Greeting */}
        <h1 className="text-3xl md:text-4xl font-light leading-tight tracking-tight text-left w-full mb-3 text-gray-900 dark:text-gray-100">
          {greetingContent}
        </h1>

        {/* Chat input — gradient border + white bg */}
        <div className="w-full mb-8 mt-4">
          <div className="rounded-2xl bg-gradient-to-r from-[#7C8CF8] via-[#C084FC] to-[#F59AC0] p-[1.5px] shadow-card">
            <div className="rounded-2xl bg-white">
              <PromptInput onSubmit={onSubmit}>
                <PromptInputTextarea placeholder={t('chat.welcome.helperText')} className="bg-transparent" />
                <PromptInputFooter className="justify-end">
                  <PromptInputSubmit
                    status={status}
                    onStop={onStop}
                    variant="default"
                    className={isIdle ? '!bg-black !text-white hover:!bg-gray-900 !rounded-full !border-0 !shadow-none' : undefined}
                  >
                    {isIdle ? (
                      <>
                        <span className="w-2 h-2 bg-emerald-400 rounded-full" />
                        <CornerDownLeftIcon className="size-4" />
                      </>
                    ) : undefined}
                  </PromptInputSubmit>
                </PromptInputFooter>
              </PromptInput>
            </div>
          </div>
        </div>

        {/* Recent deliverables */}
        <RecentDeliverables onSelectConversation={onSelectConversation} />
      </div>
    </div>
  );
}
