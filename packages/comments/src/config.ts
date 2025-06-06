import { z } from 'zod';

/** Options of the `comments` feature. `{ enabled: true }` alone is valid. */
export const CommentsConfig = z.object({
  enabled: z.boolean(),
  rich: z
    .boolean()
    .default(true)
    .describe(
      'Compose with the `editor` service when it is registered; a plain textarea otherwise.',
    ),
  replies: z.boolean().default(true).describe('Allow one level of replies.'),
  reactions: z
    .array(z.string().min(1).max(16))
    .max(12)
    .default(['👍', '❤️', '🎉', '😄', '😮'])
    .describe('Emoji people can react with. An empty list turns reactions off.'),
  sort: z
    .enum(['oldest', 'newest'])
    .default('oldest')
    .describe('Order of top-level comments. Replies are always oldest first.'),
  resolve: z
    .boolean()
    .default(false)
    .describe('Show a "resolve thread" control, for review workflows.'),
  ratings: z
    .boolean()
    .default(false)
    .describe(
      'Add an optional 1–5 star rating to top-level comments and show the average and distribution.',
    ),
  mentions: z
    .boolean()
    .default(false)
    .describe('Offer `@` mentions of the thread’s participants in the rich editor.'),
  live: z
    .boolean()
    .default(true)
    .describe(
      'Show other people’s changes as they happen (storage changes and transport notifications).',
    ),
});

export type CommentsConfigValue = z.infer<typeof CommentsConfig>;

/** A thread document holds at most this many comments; beyond that, split it by target. */
export const MAX_COMMENTS = 500;
