import { z } from 'zod';

/** Options of the `presence` feature. `{ enabled: true }` alone is valid. */
export const PresenceConfig = z.object({
  enabled: z.boolean(),
  scope: z
    .string()
    .regex(/^[A-Za-z0-9_.:-]{1,120}$/)
    .default('app')
    .describe('Scope joined by elements that do not name one: a page or document id.'),
  idleAfterMs: z
    .number()
    .int()
    .min(1000)
    .default(60_000)
    .describe('Time without pointer or keyboard input before the status becomes `idle`.'),
  showSelf: z.boolean().default(false).describe('Include the current user in the list of people.'),
  maxAvatars: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(5)
    .describe('Avatars shown before the rest collapse into a "+N" button.'),
});

export type PresenceConfigValue = z.infer<typeof PresenceConfig>;
