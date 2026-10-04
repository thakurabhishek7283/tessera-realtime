import { createStore } from '@tessera-kit/core';
import { useFeature, useStore } from '@tessera-kit/react';
import { wrapElement } from '@tessera-internal/react-wrap';
import { useEffect, useState } from 'react';
import type { TesseraChatElement } from '../elements/chat.js';
import type { TesseraInboxElement } from '../elements/inbox.js';
import type { TesseraChatLauncher } from '../elements/launcher.js';
import type { ChatApi, ConversationController, ConversationState, Message } from '../types.js';

// Importing the elements module defines the tags. It touches `customElements`, so it only runs
// in the browser; on the server the wrappers render empty tags that upgrade after hydration.
if (typeof window !== 'undefined') void import('../elements/index.js');

export interface ChatProps {
  /** Id of the conversation. Defaults to the first configured one. */
  conversation?: string | undefined;
  heading?: string | undefined;
  readonly?: boolean | undefined;
  onMessageSend?: ((event: CustomEvent<{ message: Message }>) => void) | undefined;
  onMessageReceive?: ((event: CustomEvent<{ message: Message }>) => void) | undefined;
  onConversationOpen?: ((event: CustomEvent<{ id: string }>) => void) | undefined;
  onUnreadChange?: ((event: CustomEvent<{ count: number }>) => void) | undefined;
}

/** `<tessera-chat>` for React. */
export const Chat = wrapElement<TesseraChatElement, ChatProps>({
  tag: 'tessera-chat',
  properties: [],
  attributes: { conversation: 'conversation', heading: 'heading', readonly: 'readonly' },
  events: {
    onMessageSend: 'message-send',
    onMessageReceive: 'message-receive',
    onConversationOpen: 'conversation-open',
    onUnreadChange: 'unread-change',
  },
});

export interface InboxProps {
  conversation?: string | undefined;
  onConversationSelect?: ((event: CustomEvent<{ id: string }>) => void) | undefined;
}

/** `<tessera-inbox>` for React. */
export const Inbox = wrapElement<TesseraInboxElement, InboxProps>({
  tag: 'tessera-inbox',
  properties: [],
  attributes: { conversation: 'conversation' },
  events: { onConversationSelect: 'conversation-select' },
});

export interface ChatLauncherProps {
  position?: 'bottom-right' | 'bottom-left' | undefined;
  open?: boolean | undefined;
  conversation?: string | undefined;
  onLauncherToggle?: ((event: CustomEvent<{ open: boolean }>) => void) | undefined;
}

/** `<tessera-chat-launcher>` for React. */
export const ChatLauncher = wrapElement<TesseraChatLauncher, ChatLauncherProps>({
  tag: 'tessera-chat-launcher',
  properties: [],
  attributes: { position: 'position', open: 'open', conversation: 'conversation' },
  events: { onLauncherToggle: 'launcher-toggle' },
});

const idle = createStore<ConversationState>({
  messages: [],
  hasMore: false,
  loading: true,
  typing: [],
  readBy: {},
  unread: 0,
  firstUnreadId: undefined,
  error: undefined,
});

/** The chat API once the feature is enabled, or `undefined`. */
export function useChatApi(): ChatApi | undefined {
  return useFeature('chat');
}

/** Total unread messages across conversations; 0 while the feature is off. */
export function useTotalUnread(): number {
  const api = useChatApi();
  return useStore(api?.totalUnread ?? createStore(0));
}

export interface UseConversation {
  /** `undefined` until the conversation has loaded. */
  controller: ConversationController | undefined;
  state: ConversationState | undefined;
  error: Error | undefined;
}

/**
 * Opens a conversation and keeps React in sync with it. It is closed when `id` changes or the
 * component unmounts.
 *
 * @example
 * const { controller, state } = useConversation('general');
 * state?.messages.map((m) => <p key={m.id}>{m.authorName}</p>);
 */
export function useConversation(id: string): UseConversation {
  const api = useChatApi();
  const [controller, setController] = useState<ConversationController>();
  const [error, setError] = useState<Error>();

  useEffect(() => {
    if (!api) return;
    let cancelled = false;
    let opened: ConversationController | undefined;
    api
      .openConversation(id)
      .then((c) => {
        opened = c;
        if (cancelled) c.close();
        else {
          setError(undefined);
          setController(c);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e);
      });
    return () => {
      cancelled = true;
      opened?.close();
      setController(undefined);
    };
  }, [api, id]);

  const state = useStore(controller?.state ?? idle);
  return { controller, state: controller ? state : undefined, error };
}

export type { TesseraChatElement, TesseraChatLauncher, TesseraInboxElement };
