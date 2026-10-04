import * as z from 'zod/mini';

/** Options of the `comments` feature. `{ enabled: true }` alone is valid. */
export const CommentsConfig = z.object({
  enabled: z.boolean(),
  rich: z
    ._default(z.boolean(), true)
    .check(
      z.describe(
        'Compose with the `editor` service when it is registered; a plain textarea otherwise.',
      ),
    ),
  replies: z._default(z.boolean(), true).check(z.describe('Allow one level of replies.')),
  reactions: z
    ._default(z.array(z.string().check(z.minLength(1), z.maxLength(16))).check(z.maxLength(12)), [
      '👍',
      '❤️',
      '🎉',
      '😄',
      '😮',
    ])
    .check(z.describe('Emoji people can react with. An empty list turns reactions off.')),
  sort: z
    ._default(z.enum(['oldest', 'newest']), 'oldest')
    .check(z.describe('Order of top-level comments. Replies are always oldest first.')),
  resolve: z
    ._default(z.boolean(), false)
    .check(z.describe('Show a "resolve thread" control, for review workflows.')),
  ratings: z
    ._default(z.boolean(), false)
    .check(
      z.describe(
        'Add an optional 1–5 star rating to top-level comments and show the average and distribution.',
      ),
    ),
  mentions: z
    ._default(z.boolean(), false)
    .check(z.describe('Offer `@` mentions of the thread’s participants in the rich editor.')),
  live: z
    ._default(z.boolean(), true)
    .check(
      z.describe(
        'Show other people’s changes as they happen (storage changes and transport notifications).',
      ),
    ),
});

export type CommentsConfigValue = z.infer<typeof CommentsConfig>;

/** A thread document holds at most this many comments; beyond that, split it by target. */
export const MAX_COMMENTS = 500;
