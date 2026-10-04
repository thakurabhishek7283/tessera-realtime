import * as z from 'zod/mini';

/** Conversation ids are used in room names. A leading `_` is reserved for the kit's own rooms. */
const ConversationId = z
  .string()
  .check(
    z.regex(
      /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/,
      'letters, digits and _.:- (not starting with _)',
    ),
  );

/** Options of the `chat` feature. `{ enabled: true }` alone is valid. */
export const ChatConfig = z.object({
  enabled: z.boolean(),
  conversations: z
    ._default(
      z.array(
        z.object({ id: ConversationId, title: z.string().check(z.minLength(1), z.maxLength(80)) }),
      ),
      [{ id: 'general', title: 'General' }],
    )
    .check(
      z.describe(
        'Rooms that exist from the start. Direct conversations are added as they are opened.',
      ),
    ),
  directMessages: z
    ._default(z.boolean(), true)
    .check(z.describe('Allow one-to-one conversations.')),
  composer: z._default(
    z.object({
      rich: z
        ._default(z.boolean(), false)
        .check(
          z.describe(
            'Compose with the `editor` service when it is registered; a plain textarea otherwise.',
          ),
        ),
      maxLength: z
        ._default(z.int().check(z.gte(1), z.lte(4000)), 4000)
        .check(z.describe('Longest message in characters.')),
      attachments: z
        ._default(z.boolean(), true)
        .check(z.describe('Attach files (needs an uploads adapter).')),
      emoji: z._default(z.boolean(), true).check(z.describe('Show the built-in emoji picker.')),
      enterToSend: z
        ._default(z.boolean(), true)
        .check(z.describe('Enter sends, Shift+Enter inserts a new line.')),
    }),
    { rich: false, maxLength: 4000, attachments: true, emoji: true, enterToSend: true },
  ),
  features: z._default(
    z.object({
      reactions: z._default(z.boolean(), true),
      replies: z._default(z.boolean(), true),
      edit: z._default(z.boolean(), true),
      delete: z._default(z.boolean(), true),
      typingIndicators: z._default(z.boolean(), true),
      readReceipts: z._default(z.boolean(), true),
      linkify: z
        ._default(z.boolean(), true)
        .check(z.describe('Turn http(s) links in text into anchors.')),
      timestamps: z
        ._default(z.enum(['relative', 'absolute']), 'relative')
        .check(z.describe('Relative ("2 min ago") or absolute times next to messages.')),
    }),
    {
      reactions: true,
      replies: true,
      edit: true,
      delete: true,
      typingIndicators: true,
      readReceipts: true,
      linkify: true,
      timestamps: 'relative',
    },
  ),
  pageSize: z
    ._default(z.int().check(z.gte(10), z.lte(100)), 30)
    .check(z.describe('Messages loaded per history request.')),
  notifications: z._default(
    z.object({
      sound: z
        ._default(z.boolean(), false)
        .check(z.describe('Play a short sound for messages from others.')),
      titleBadge: z
        ._default(z.boolean(), true)
        .check(z.describe('Show the unread count in the page title.')),
    }),
    { sound: false, titleBadge: true },
  ),
});

export type ChatConfigValue = z.infer<typeof ChatConfig>;
