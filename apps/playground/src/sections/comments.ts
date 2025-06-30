import { CommentsConfig } from '@tessera/comments';
import '@tessera/comments/elements';
import { html } from 'lit';
import type { Section } from '../sections.js';
import { USERS } from '../users.js';

export const commentsSection: Section = {
  id: 'comments',
  label: 'Comments',
  blurb:
    'A discussion attached to any thing in your app. Switch on ratings to use it for reviews, or resolve to use it for review workflows. Open another tab as a different user to see comments, replies and reactions arrive live.',
  schema: CommentsConfig,
  load: () => import('@tessera/comments'),
  defaults: { rich: false, ratings: true, resolve: true },
  render: ({ user }) => html`
    <article style="max-width:46rem;margin-bottom:var(--tessera-space-4)">
      <h3 style="margin:0 0 var(--tessera-space-1)">Lakeside pitch near Hallstatt <tessera-comment-count target="campsite-17" show-zero></tessera-comment-count></h3>
      <p style="margin:0;color:var(--tessera-color-text-muted)">A shady, flat pitch with a view of the water. Signed in as <strong>${USERS[user]?.name}</strong>.</p>
    </article>
    <tessera-comments target="campsite-17" style="max-width:46rem"></tessera-comments>
  `,
};
