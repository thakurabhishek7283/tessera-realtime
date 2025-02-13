import type { UserInfo } from '@tessera/core';

/** Room carrying a conversation's live events (the transport adds the app prefix). */
export const chatRoomName = (conversationId: string): string => `chat:${conversationId}`;

/**
 * Room joined for requests that belong to no conversation (`chat.conversations`,
 * `chat.open-direct`). The leading underscore keeps it clear of real conversation ids.
 */
export const CONTROL_ROOM = 'chat:_inbox';

/** What the kit needs from whatever answers `chat.*` requests: the server or the local emulation. */
export interface RequestContext {
  user: UserInfo;
  /** Delivers `topic` to everyone in the conversation's room, the sender included. */
  broadcast(topic: string, data: unknown): void;
}

export const DELETED_TEXT = 'This message was deleted';
