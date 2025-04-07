import { ChatConfig } from '@tessera/chat';
import '@tessera/chat/elements';
import { html } from 'lit';
import type { Section } from '../sections.js';
import { USERS } from '../users.js';

export const chatSection: Section = {
  id: 'chat',
  label: 'Chat',
  blurb:
    'Rooms and direct messages with reactions, replies, edits, typing and read receipts. Open another tab as a different user (local transport) or point the playground at tessera-server. Message "bob" or "carol" from the box under the list to start a direct conversation.',
  schema: ChatConfig,
  load: () => import('@tessera/chat'),
  defaults: {
    conversations: [
      { id: 'general', title: 'General' },
      { id: 'random', title: 'Random' },
      { id: 'design', title: 'Design' },
    ],
  },
  render: ({ user }) => html`
    <p style="margin:0 0 var(--tessera-space-3)">Signed in as <strong>${USERS[user]?.name}</strong>. The floating button in the corner is <code>&lt;tessera-chat-launcher&gt;</code>.</p>
    <tessera-inbox conversation="general" style="--tessera-chat-height: 36rem"></tessera-inbox>
    <tessera-chat-launcher></tessera-chat-launcher>
  `,
};
