import type { ReadonlyStore, UserInfo } from '@tessera/core';
import type { AttachmentDto, ConversationDto, MessageBodyDto, MessageDto } from '@tessera/protocol';
import type { ChatConfigValue } from './config.js';

export type MessageBody = MessageBodyDto;
export type Attachment = AttachmentDto;

/** `sending` and `failed` only exist on the sender's side, until the server stores the message. */
export type MessageStatus = 'sending' | 'sent' | 'failed';

export interface Message extends MessageDto {
  status?: MessageStatus;
  /** Upload progress (0–1) while attachments are being uploaded. */
  progress?: number;
}

export interface Conversation extends Omit<ConversationDto, 'lastMessage'> {
  lastMessage?: Message;
}

export interface ConversationState {
  /** Oldest first. Includes the sender's own unsent messages. */
  messages: Message[];
  /** More history exists before the oldest loaded message. */
  hasMore: boolean;
  /** True while the first page or an older page is loading. */
  loading: boolean;
  /** People currently typing (never the current user). */
  typing: UserInfo[];
  /** Message id → people whose last read message it is. */
  readBy: Record<string, UserInfo[]>;
  /** Messages from others the current user has not read. */
  unread: number;
  /** The first unread message when the conversation was opened, for a "new messages" divider. */
  firstUnreadId: string | undefined;
  error: string | undefined;
}

export interface SendOptions {
  attachments?: File[];
  replyTo?: string;
}

export interface ConversationController {
  readonly id: string;
  readonly conversation: ReadonlyStore<Conversation>;
  readonly state: ReadonlyStore<ConversationState>;
  /** Resolves once the server stored the message. On failure the message stays in the list as `failed`. */
  send(body: MessageBody, opts?: SendOptions): Promise<Message>;
  /** Sends a `failed` message again. A retry after a lost response is safe: the client id dedupes. */
  retry(clientId: string): Promise<void>;
  loadOlder(): Promise<void>;
  edit(messageId: string, body: MessageBody): Promise<void>;
  remove(messageId: string): Promise<void>;
  /** Toggles the current user's reaction. */
  react(messageId: string, emoji: string): Promise<void>;
  /** Throttled; switches itself off after 4 s. */
  setTyping(isTyping: boolean): void;
  /** Marks messages up to `messageId` (default: the latest) as read. Debounced; only while the page is visible. */
  markRead(messageId?: string): void;
  close(): void;
}

export interface ChatApi {
  readonly config: ChatConfigValue;
  /** Every conversation the user can see, most recently active first. */
  readonly conversations: ReadonlyStore<Conversation[]>;
  readonly totalUnread: ReadonlyStore<number>;
  openConversation(id: string): Promise<ConversationController>;
  /** Opens (creating on first use) the direct conversation with another user. */
  openDirect(userId: string): Promise<ConversationController>;
}

declare module '@tessera/core' {
  interface FeatureApiMap {
    chat: ChatApi;
  }
  interface ServiceMap {
    chat: ChatApi;
  }
  interface TesseraEvents {
    'chat:message-sent': Message;
    'chat:message-received': Message;
    'chat:unread-changed': { total: number };
  }
}
