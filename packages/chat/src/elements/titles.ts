import type { ChatApi, Conversation } from '../types.js';

/** What to call a conversation: its title, or for a direct one the other person's name. */
export function conversationTitle(
  conversation: Conversation,
  selfId: string | undefined,
  api: ChatApi | undefined,
  fallback: string,
): string {
  if (conversation.kind === 'room') return conversation.title ?? conversation.id;
  const otherId = conversation.members?.find((m) => m !== selfId);
  if (!otherId) return fallback;
  return api?.displayName(otherId) ?? otherId;
}
