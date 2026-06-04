import type { UIMessage } from "ai";
import { isToolUIPart, getToolName } from "ai";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import type { ImperativePanelHandle } from "react-resizable-panels";

import { useChatSession } from "@/hooks/useChatSession";
import { useWorkingSet } from "@/components/chat/hooks/useWorkingSet";
import { useConversationMessages } from "@/components/chat/hooks/useConversationMessages";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
  useScrollContext,
} from "@/components/ai-elements/conversation";
import { ChatWelcomeView } from "@/components/chat/ChatWelcomeView";
import { useGreeting } from "@/components/chat/hooks/useGreeting";
import {
  Message,
  MessageContent,
  MessageResponse,
  MessageActions,
  MessageAction,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputProvider,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { ARTIFACT_REGISTRY } from "@/components/chat/artifact-registry";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { ConversationSidebar } from "@/components/chat/ConversationSidebar";
import { SiteHeader } from "@/components/chat/site-header";
import { WorkingPanel } from "@/components/chat/WorkingPanel";
import { useConversations } from "@/components/chat/hooks/useConversations";
import { CopyIcon, RefreshCwIcon } from "lucide-react";

// Takes the Conversation scrollRef so scroll is always contained to that element.
// scrollIntoView() can bubble to document.body on some browsers — scrollTo() on the
// explicit container ref is the only safe cross-browser approach.
function useScrollLastMessageToTop(
  messages: unknown[],
  scrollContainerRef: React.RefObject<HTMLDivElement | null>
) {
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(messages.length);

  useEffect(() => {
    const lengthChanged = messages.length !== prevLengthRef.current;
    prevLengthRef.current = messages.length;
    if (!lengthChanged) return;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const container = scrollContainerRef.current;
        const el = lastMessageRef.current;
        if (!container || !el) return;
        // Compute offset relative to the scroll container, then scroll to it
        const containerTop = container.getBoundingClientRect().top;
        const elTop = el.getBoundingClientRect().top;
        const target = container.scrollTop + (elTop - containerTop);
        container.scrollTo({ top: target, behavior: "smooth" });
      });
    });
  }, [messages.length, scrollContainerRef]);

  return lastMessageRef;
}

export default function ChatPage() {
  const { t } = useTranslation();
  const { greeting, firstName, orgName } = useGreeting();
  const queryClient = useQueryClient();
  const { conversationId: urlConversationId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();
  const { messages, status, sendMessage, stop, regenerate, conversationId, resetChat, switchConversation } = useChatSession();
  const { totalCount, isLoading: workingSetLoading } = useWorkingSet(conversationId ?? null);
  const workingPanelRef = useRef<ImperativePanelHandle>(null);

  // Restore conversation from URL on mount
  const [pendingConversationId, setPendingConversationId] = useState<string | undefined>(urlConversationId);

  // Sync URL when conversationId changes (new conversation created or sidebar click)
  useEffect(() => {
    if (conversationId && conversationId !== urlConversationId) {
      navigate(`/chat/${conversationId}`, { replace: true });
    } else if (!conversationId && urlConversationId) {
      navigate('/chat', { replace: true });
    }
  }, [conversationId, urlConversationId, navigate]);
  const { data: restoredMessages, isLoading: isRestoring, error: restoreError } = useConversationMessages(pendingConversationId);

  // When restored messages arrive (including empty []), hydrate the chat.
  // React Query cancels stale fetches on key change, so rapid switching is safe.
  useEffect(() => {
    if (pendingConversationId && restoredMessages && !isRestoring) {
      switchConversation(pendingConversationId, restoredMessages);
      setPendingConversationId(undefined);
    }
  }, [pendingConversationId, restoredMessages, isRestoring, switchConversation]);

  // If restore fetch fails, clear pending state so the UI doesn't stay stuck on shimmer
  useEffect(() => {
    if (restoreError && pendingConversationId) {
      console.error("[ChatPage] Failed to restore conversation:", restoreError);
      setPendingConversationId(undefined);
    }
  }, [restoreError, pendingConversationId]);

  // Invalidate conversation list when a new conversation is created
  const prevConversationIdRef = useRef<string | undefined>();
  useEffect(() => {
    if (conversationId && !prevConversationIdRef.current) {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    }
    prevConversationIdRef.current = conversationId;
  }, [conversationId, queryClient]);

  // Auto-collapse working panel when no supports, expand when supports exist
  // Skip while loading to avoid flash-collapse on page refresh
  useEffect(() => {
    if (workingSetLoading) return;
    if (totalCount === 0) {
      workingPanelRef.current?.collapse();
    } else {
      workingPanelRef.current?.expand();
    }
  }, [totalCount, workingSetLoading]);

  // Auto-expand right panel to 80% when ragSearch completes (once per message).
  // Only resize when the viewport is wide enough that 20% chat remains usable (≥ 300px).
  // Below that threshold just expand without forcing 80% — the user can drag the handle.
  const expandedForRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const msg of messages) {
      if (expandedForRef.current.has(msg.id)) continue;
      const hasRagComplete = msg.parts.some(
        (p) => isToolUIPart(p) && getToolName(p) === 'ragSearch' && p.state === 'output-available'
      );
      if (hasRagComplete) {
        expandedForRef.current.add(msg.id);
        const containerWidth = window.innerWidth;
        const chatMinPx = 300; // minimum usable chat width in pixels
        const target = containerWidth > 0 && (containerWidth * 0.20) >= chatMinPx
          ? 80
          : Math.min(70, Math.round((1 - chatMinPx / containerWidth) * 100));
        workingPanelRef.current?.resize(Math.max(35, target));
      }
    }
  }, [messages]);

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      if (!message.text?.trim()) return;
      sendMessage({ text: message.text, files: message.files });
    },
    [sendMessage]
  );

  const handleSuggestionClick = useCallback(
    (text: string) => {
      sendMessage({ text });
    },
    [sendMessage]
  );

  const handleCopy = useCallback((content: string) => {
    navigator.clipboard.writeText(content);
  }, []);

  const { data: conversations } = useConversations();
  const currentConversationTitle = conversations?.find((c) => c.id === conversationId)?.title;

  const hasMessages = messages.length > 0;
  const isStreaming = status === "streaming" || status === "submitted";

  // Extract ghost suggestion from the latest suggestNextSteps tool result
  const ghostSuggestion = useMemo(() => {
    if (isStreaming) return undefined;
    for (let i = messages.length - 1; i >= 0; i--) {
      for (const p of messages[i].parts) {
        if (isToolUIPart(p) && getToolName(p) === 'suggestNextSteps' && p.state === 'output-available') {
          const output = p.output as { suggestions?: string[] } | null;
          return output?.suggestions?.[0];
        }
      }
    }
    return undefined;
  }, [messages, isStreaming]);

  // Refetch conversations when streaming ends (title may have been generated server-side)
  const prevStreamingRef = useRef(isStreaming);
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming) {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming, queryClient]);
  const showRestoreLoading = !!pendingConversationId && isRestoring;

  // Track whether welcome view should still be mounted (delayed unmount for transition)
  const [showWelcome, setShowWelcome] = useState(!hasMessages);
  const welcomeVisible = !hasMessages && !showRestoreLoading;

  useEffect(() => {
    if (welcomeVisible) {
      setShowWelcome(true);
    } else {
      // Delay unmount to let fade-out animation complete
      const timer = setTimeout(() => setShowWelcome(false), 500);
      return () => clearTimeout(timer);
    }
  }, [welcomeVisible]);

  const handleSelectConversation = useCallback(
    (id: string) => {
      if (id === conversationId) return;
      setPendingConversationId(id);
      navigate(`/chat/${id}`, { replace: true });
    },
    [conversationId, navigate]
  );

  const handleNewConversation = useCallback(() => {
    resetChat();
    navigate('/chat', { replace: true });
  }, [resetChat, navigate]);

  return (
    <SidebarProvider>
      <ConversationSidebar
        conversationId={conversationId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
      />
      {/* min-w-0: allows the flex item to shrink below its intrinsic content width.
          Without it, flex-1 respects min-width:auto and can overflow the viewport. */}
      <SidebarInset className="flex flex-col h-svh overflow-hidden min-w-0">
        <SiteHeader conversationTitle={currentConversationTitle} />

        {/* 2-panel layout: chat + working panel.
            overflow-hidden + min-w-0 prevents panels from escaping their container
            when content has large intrinsic widths (e.g. wide builder tables). */}
        <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0 overflow-hidden min-w-0">
          {/* Center: Chat thread + input */}
          <ResizablePanel defaultSize={totalCount > 0 ? 30 : 65} minSize={20}>
            <div className="relative flex flex-col h-full font-light overflow-hidden">
              {/* Welcome view — fades out when messages appear */}
              {showWelcome && (
                <div
                  className={`absolute inset-0 z-10 transition-all duration-500 ease-out ${
                    welcomeVisible
                      ? 'opacity-100 scale-100'
                      : 'opacity-0 scale-95 pointer-events-none'
                  }`}
                >
                  <ChatWelcomeView
                    onSubmit={handleSubmit}
                    onSelectConversation={handleSelectConversation}
                    status={status}
                    onStop={stop}
                    greeting={greeting}
                    firstName={firstName}
                    orgName={orgName}
                  />
                </div>
              )}

              {/* Chat thread — only mounted once messages exist (prevents both layers
                  from being GPU-promoted simultaneously which causes the "dual screen"
                  compositing artifact on certain display configurations). */}
              <div
                className={`flex flex-col h-full transition-all duration-500 ease-out ${
                  hasMessages || showRestoreLoading
                    ? 'opacity-100 translate-y-0'
                    : 'opacity-0 translate-y-4 pointer-events-none'
                }`}
                style={{ visibility: welcomeVisible && !showRestoreLoading ? 'hidden' : undefined }}
              >
                <Conversation className="flex-1">
                  {showRestoreLoading ? (
                    <ConversationContent className="max-w-3xl mx-auto px-4 py-6">
                      <Message from="assistant">
                        <MessageContent>
                          <Shimmer>{t('chat.shimmer.loading')}</Shimmer>
                        </MessageContent>
                      </Message>
                    </ConversationContent>
                  ) : (
                    <ChatMessages
                      messages={messages}
                      isStreaming={isStreaming}
                      onCopy={handleCopy}
                      onRegenerate={regenerate}
                      conversationId={conversationId ?? null}
                      onSendMessage={handleSuggestionClick}
                    />
                  )}
                  <ConversationScrollButton />
                </Conversation>

                <div className="bg-card px-4 py-3">
                  <div className="h-[1px] bg-gradient-to-r from-[#7C8CF8]/30 via-[#C084FC]/30 to-[#F59AC0]/30 -mt-3 mb-3" />
                  <div className="max-w-3xl mx-auto">
                    <div className="rounded-2xl bg-gradient-to-r from-[#7C8CF8] via-[#C084FC] to-[#F59AC0] p-[1.5px] shadow-card">
                      <div className="rounded-2xl bg-white">
                        <PromptInputProvider>
                          <PromptInput onSubmit={handleSubmit}>
                            <PromptInputTextarea placeholder={t('chat.placeholder')} className="bg-transparent" ghostSuggestion={ghostSuggestion} />
                            <PromptInputFooter className="justify-end">
                              <PromptInputSubmit status={status} onStop={stop} />
                            </PromptInputFooter>
                          </PromptInput>
                        </PromptInputProvider>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right: Builder panel (floating card style when supports exist) */}
          <ResizablePanel
            ref={workingPanelRef}
            defaultSize={totalCount > 0 ? 70 : 35}
            minSize={25}
            maxSize={80}
            collapsible
          >
            <WorkingPanel conversationId={conversationId ?? null} onSendMessage={(text) => sendMessage({ text })} messages={messages} />
          </ResizablePanel>
        </ResizablePanelGroup>
      </SidebarInset>
    </SidebarProvider>
  );
}

function ChatMessages({
  messages,
  isStreaming,
  onCopy,
  onRegenerate,
  conversationId,
  onSendMessage,
}: {
  messages: UIMessage[];
  isStreaming: boolean;
  onCopy: (content: string) => void;
  onRegenerate: () => void;
  conversationId: string | null;
  onSendMessage: (text: string) => void;
}) {
  const { t } = useTranslation();
  const { scrollRef } = useScrollContext();
  const lastMessageRef = useScrollLastMessageToTop(messages, scrollRef);

  return (
    <ConversationContent className="max-w-3xl mx-auto px-4 py-6">
      {messages.map((message, index) => {
        const isLast = index === messages.length - 1;
        return (
          <div key={message.id} ref={isLast ? lastMessageRef : undefined}>
            <MessageBlock
              message={message}
              isLast={isLast}
              isStreaming={isStreaming}
              onCopy={onCopy}
              onRegenerate={onRegenerate}
              conversationId={conversationId}
              onSendMessage={onSendMessage}
            />
          </div>
        );
      })}

      {isStreaming && messages[messages.length - 1]?.role === "user" && (
        <Message from="assistant">
          <MessageContent>
            <Shimmer>{t('chat.shimmer.thinking')}</Shimmer>
          </MessageContent>
        </Message>
      )}
    </ConversationContent>
  );
}

const QUERY_INVALIDATION_TOOLS = new Set(["ragSearch", "refineSelection", "calculatePricing", "adjustSupport"]);
const ALWAYS_OPEN_TOOLS = new Set(["collectMetadata", "generateExcel", "generatePpt", "suggestNextSteps", "refineSelection", "calculatePricing", "adjustSupport"]);
const NO_WRAPPER_TOOLS = new Set(["draftEmail"]);

function MessageBlock({
  message,
  isLast,
  isStreaming,
  onCopy,
  onRegenerate,
  conversationId,
  onSendMessage,
}: {
  message: UIMessage;
  isLast: boolean;
  isStreaming: boolean;
  onCopy: (content: string) => void;
  onRegenerate: () => void;
  conversationId: string | null;
  onSendMessage: (text: string) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // Invalidate working set when a relevant tool call completes.
  // Track processed toolCallIds in a ref so the effect fires exactly once per completion,
  // not on every re-render that gives message.parts a new reference during streaming.
  const invalidatedToolCallIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!conversationId) return;
    let didInvalidate = false;
    for (const p of message.parts) {
      if (
        isToolUIPart(p) &&
        p.state === "output-available" &&
        QUERY_INVALIDATION_TOOLS.has(getToolName(p)) &&
        !invalidatedToolCallIds.current.has(p.toolCallId)
      ) {
        invalidatedToolCallIds.current.add(p.toolCallId);
        didInvalidate = true;
      }
    }
    if (didInvalidate) {
      queryClient.invalidateQueries({ queryKey: ["campaign_supports", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["campaign_supports_rejected", conversationId] });
    }
  }, [message.parts, conversationId, queryClient]);

  const textContent = message.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("");

  return (
    <Message from={message.role}>
      {/* Text parts first */}
      {message.parts.map((part, i) => {
        if (part.type === "text" && part.text) {
          return (
            <MessageContent key={i} variant={message.role === "user" ? "user-bubble" : "default"}>
              {message.role === "user" ? (
                <p className="whitespace-pre-wrap leading-relaxed">{part.text}</p>
              ) : (
                <MessageResponse>{part.text}</MessageResponse>
              )}
            </MessageContent>
          );
        }
        return null;
      })}

      {/* Tool parts after */}
      {message.parts.map((part) => {
        if (!isToolUIPart(part)) return null;

        if (part.state === "input-available" || part.state === "input-streaming") {
          const toolName = getToolName(part);
          const shimmerTextMap: Record<string, string> = {
            ragSearch: (part.input as { query?: string })?.query
              ? t('chat.shimmer.ragSearch', { query: (part.input as { query?: string }).query })
              : t('chat.shimmer.ragSearchDefault'),
            refineSelection: t('chat.shimmer.refineSelection'),
            calculatePricing: t('chat.shimmer.calculatePricing'),
            adjustSupport: t('chat.shimmer.adjustSupport'),
            collectMetadata: t('chat.shimmer.collectMetadata'),
            generateExcel: t('chat.shimmer.generateExcel'),
            generatePpt: t('chat.shimmer.generatePpt'),
            draftEmail: t('chat.shimmer.draftEmail'),
          };
          return (
            <MessageContent key={part.toolCallId}>
              <Shimmer>
                {shimmerTextMap[toolName] ?? t('chat.shimmer.default')}
              </Shimmer>
            </MessageContent>
          );
        }

        if (part.state === "output-available") {
          const toolName = getToolName(part);
          const ArtifactComponent = ARTIFACT_REGISTRY[toolName];

          // Inline artifacts: no wrapper at all, renders directly in chat flow
          if (NO_WRAPPER_TOOLS.has(toolName)) {
            return ArtifactComponent ? (
              <ArtifactComponent key={part.toolCallId} result={part.output} onSendMessage={onSendMessage} />
            ) : null;
          }

          // Small artifacts: always open, no collapsible wrapper
          // empty:hidden suppresses the wrapper when artifact returns null (e.g. suggestNextSteps)
          if (ALWAYS_OPEN_TOOLS.has(toolName)) {
            return (
              <div key={part.toolCallId} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm mt-2 empty:hidden">
                {ArtifactComponent ? (
                  <ArtifactComponent result={part.output} onSendMessage={onSendMessage} />
                ) : (
                  <span className="text-sm text-gray-500 italic">Cette fonctionnalité n'est plus disponible</span>
                )}
              </div>
            );
          }

          // Large artifacts (ragSearch etc): collapsible with restyled container.
          // ragSearch defaults to open so card content is immediately visible after
          // conversation load (Collapsible resets to closed on remount otherwise).
          return (
            <Tool key={part.toolCallId} defaultOpen={toolName === 'ragSearch'}>
              <ToolHeader
                type="dynamic-tool"
                toolName={toolName}
                state="output-available"
                title={toolName === "ragSearch" ? t('chat.toolResult') : toolName}
              />
              <ToolContent>
                <ToolOutput
                  output={
                    ArtifactComponent ? (
                      <ArtifactComponent result={part.output} onSendMessage={onSendMessage} />
                    ) : (
                      <span className="text-sm text-gray-500 italic">Cette fonctionnalité n'est plus disponible</span>
                    )
                  }
                  errorText={undefined}
                />
              </ToolContent>
            </Tool>
          );
        }

        return null;
      })}

      {/* Actions on last assistant message when not streaming */}
      {message.role === "assistant" && isLast && !isStreaming && textContent && (
        <MessageActions>
          <MessageAction
            tooltip={t('chat.actions.copy')}
            label={t('chat.actions.copyLabel')}
            onClick={() => onCopy(textContent)}
          >
            <CopyIcon />
          </MessageAction>
          <MessageAction
            tooltip={t('chat.actions.regenerate')}
            label={t('chat.actions.regenerateLabel')}
            onClick={onRegenerate}
          >
            <RefreshCwIcon />
          </MessageAction>
        </MessageActions>
      )}
    </Message>
  );
}
