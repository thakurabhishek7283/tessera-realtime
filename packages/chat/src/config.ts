import { z } from 'zod';

/** Conversation ids are used in room names. A leading `_` is reserved for the kit's own rooms. */
const ConversationId = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/, 'letters, digits and _.:- (not starting with _)');

/** Options of the `chat` feature. `{ enabled: true }` alone is valid. */
export const ChatConfig = z.object({
  enabled: z.boolean(),
  conversations: z
    .array(z.object({ id: ConversationId, title: z.string().min(1).max(80) }))
    .default([{ id: 'general', title: 'General' }])
    .describe(
      'Rooms that exist from the start. Direct conversations are added as they are opened.',
    ),
  directMessages: z.boolean().default(true).describe('Allow one-to-one conversations.'),
  composer: z
    .object({
      rich: z
        .boolean()
        .default(false)
        .describe(
          'Compose with the `editor` service when it is registered; a plain textarea otherwise.',
        ),
      maxLength: z
        .number()
        .int()
        .min(1)
        .max(4000)
        .default(4000)
        .describe('Longest message in characters.'),
      attachments: z.boolean().default(true).describe('Attach files (needs an uploads adapter).'),
      emoji: z.boolean().default(true).describe('Show the built-in emoji picker.'),
      enterToSend: z
        .boolean()
        .default(true)
        .describe('Enter sends, Shift+Enter inserts a new line.'),
    })
    .default({ rich: false, maxLength: 4000, attachments: true, emoji: true, enterToSend: true }),
  features: z
    .object({
      reactions: z.boolean().default(true),
      replies: z.boolean().default(true),
      edit: z.boolean().default(true),
      delete: z.boolean().default(true),
      typingIndicators: z.boolean().default(true),
      readReceipts: z.boolean().default(true),
      linkify: z.boolean().default(true).describe('Turn http(s) links in text into anchors.'),
      timestamps: z
        .enum(['relative', 'absolute'])
        .default('relative')
        .describe('Relative ("2 min ago") or absolute times next to messages.'),
    })
    .default({
      reactions: true,
      replies: true,
      edit: true,
      delete: true,
      typingIndicators: true,
      readReceipts: true,
      linkify: true,
      timestamps: 'relative',
    }),
  pageSize: z
    .number()
    .int()
    .min(10)
    .max(100)
    .default(30)
    .describe('Messages loaded per history request.'),
  notifications: z
    .object({
      sound: z.boolean().default(false).describe('Play a short sound for messages from others.'),
      titleBadge: z.boolean().default(true).describe('Show the unread count in the page title.'),
    })
    .default({ sound: false, titleBadge: true }),
});

export type ChatConfigValue = z.infer<typeof ChatConfig>;
