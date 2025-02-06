import { PresenceConfig } from '@tessera/presence';
import '@tessera/presence/elements';
import { html } from 'lit';
import type { Section } from '../sections.js';
import { USERS } from '../users.js';

export const presenceSection: Section = {
  id: 'presence',
  label: 'Presence',
  blurb:
    'Open another tab as a different user to see the avatar stack, status dots and live pointers. Switch tabs or stop moving to see the status change.',
  schema: PresenceConfig,
  load: () => import('@tessera/presence'),
  defaults: { scope: 'playground', idleAfterMs: 15_000, maxAvatars: 3 },
  render: ({ user }) => html`
    <div style="display:flex;align-items:center;gap:var(--tessera-space-3);margin-bottom:var(--tessera-space-3)">
      <span>Signed in as <strong>${USERS[user]?.name}</strong></span>
      <tessera-presence scope="playground">
        <span slot="empty" style="color:var(--tessera-color-text-muted);font-size:var(--tessera-font-size-sm)">Nobody else is here yet</span>
      </tessera-presence>
    </div>
    <div style="position:relative;height:18rem;border:1px dashed var(--tessera-color-border);border-radius:var(--tessera-radius-md);background:var(--tessera-color-surface);display:grid;place-items:center;color:var(--tessera-color-text-muted)">
      Move your pointer in this box
      <tessera-cursors scope="playground"></tessera-cursors>
    </div>
  `,
};
