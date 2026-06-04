import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";
import { useState, useMemo, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const ORCHESTRATOR_URL = `${SUPABASE_URL}/functions/v1/chat-orchestrator`;

export function useChatSession() {
  const { session } = useAuth();
  const [conversationId, setConversationId] = useState<string | undefined>();
  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;

  const customFetch: typeof globalThis.fetch = useCallback(
    async (input, init) => {
      let response = await globalThis.fetch(input, init);

      // Retry once on 401 with a force-refreshed token (handles cold-start auth races)
      if (response.status === 401) {
        const { data } = await supabase.auth.refreshSession();
        if (data.session?.access_token) {
          const headers = new Headers(init?.headers as HeadersInit);
          headers.set("Authorization", `Bearer ${data.session.access_token}`);
          response = await globalThis.fetch(input, { ...init, headers });
        }
      }

      const convId = response.headers.get("X-Conversation-Id");
      if (convId && !conversationIdRef.current) {
        setConversationId(convId);
      }
      return response;
    },
    []
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: ORCHESTRATOR_URL,
        headers: () => {
          const h: Record<string, string> = {
            apikey: SUPABASE_ANON_KEY,
          };
          if (session?.access_token) {
            h.Authorization = `Bearer ${session.access_token}`;
          }
          return h;
        },
        body: () => ({ conversationId: conversationIdRef.current }),
        fetch: customFetch,
      }),
    [session?.access_token, customFetch]
  );

  const chat = useChat({
    transport,
    onError: (error) => {
      console.error("[useChatSession] Error:", error);
    },
  });

  const { setMessages } = chat;

  const resetChat = useCallback(() => {
    setConversationId(undefined);
    setMessages([]);
  }, [setMessages]);

  const switchConversation = useCallback(
    (id: string, restoredMessages?: UIMessage[]) => {
      setConversationId(id);
      setMessages(restoredMessages ?? []);
    },
    [setMessages]
  );

  return {
    ...chat,
    input: chat.input ?? "",
    conversationId,
    setConversationId,
    resetChat,
    switchConversation,
  };
}
