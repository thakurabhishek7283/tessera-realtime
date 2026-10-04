import * as z from 'zod/mini';

/** Options of the `presence` feature. `{ enabled: true }` alone is valid. */
export const PresenceConfig = z.object({
  enabled: z.boolean(),
  scope: z
    ._default(z.string().check(z.regex(/^[A-Za-z0-9_.:-]{1,120}$/)), 'app')
    .check(z.describe('Scope joined by elements that do not name one: a page or document id.')),
  idleAfterMs: z
    ._default(z.int().check(z.gte(1000)), 60_000)
    .check(z.describe('Time without pointer or keyboard input before the status becomes `idle`.')),
  showSelf: z
    ._default(z.boolean(), false)
    .check(z.describe('Include the current user in the list of people.')),
  maxAvatars: z
    ._default(z.int().check(z.gte(1), z.lte(20)), 5)
    .check(z.describe('Avatars shown before the rest collapse into a "+N" button.')),
});

export type PresenceConfigValue = z.infer<typeof PresenceConfig>;
