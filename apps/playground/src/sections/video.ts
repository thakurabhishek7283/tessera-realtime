import { VideoConfig } from '@tessera/video';
import '@tessera/video/elements';
import { html } from 'lit';
import type { Section } from '../sections.js';
import { USERS } from '../users.js';

export const videoSection: Section = {
  id: 'video',
  label: 'Video',
  blurb:
    'Peer-to-peer video calls (WebRTC mesh). Open another tab as a different user, join the same call and allow the camera. Try the grid and spotlight layouts, pinning, screen sharing and the device menu. With the local transport the tabs signal through BroadcastChannel, so no server is involved.',
  schema: VideoConfig,
  load: () => import('@tessera/video'),
  defaults: { prejoin: true },
  render: ({ user }) => html`
    <p style="margin:0 0 var(--tessera-space-3)">Signed in as <strong>${USERS[user]?.name}</strong>. Everybody who opens call <code>playground</code> is in the same call.</p>
    <p style="margin:0 0 var(--tessera-space-3)"><tessera-call-button call-id="playground-dialog">Open the call in a dialog</tessera-call-button></p>
    <tessera-call call-id="playground" style="--tessera-call-height: 30rem"></tessera-call>
  `,
};
