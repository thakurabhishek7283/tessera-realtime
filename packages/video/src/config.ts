import * as z from 'zod/mini';

const IceServer = z.object({
  urls: z.union([z.string(), z.array(z.string())]),
  username: z.optional(z.string()),
  credential: z.optional(z.string()),
});

/** Options of the `video` feature. `{ enabled: true }` alone is valid. */
export const VideoConfig = z.object({
  enabled: z.boolean(),
  maxParticipants: z
    ._default(z.int().check(z.gte(2), z.lte(6)), 4)
    .check(
      z.describe(
        'Largest number of people in one call. Every extra person adds a connection per participant (mesh).',
      ),
    ),
  iceServers: z
    .optional(z.array(IceServer))
    .check(
      z.describe(
        'STUN/TURN servers. Defaults to a public STUN server when neither this nor `iceServersUrl` is set.',
      ),
    ),
  iceServersUrl: z
    .optional(z.string())
    .check(
      z.describe(
        'URL returning `{ iceServers }` (tessera-server: `/v1/ice`), fetched with the user token before joining.',
      ),
    ),
  prejoin: z._default(z.boolean(), true).check(z.describe('Show a device preview before joining.')),
  allow: z._default(
    z.object({
      screenShare: z._default(z.boolean(), true),
      chatPanel: z
        ._default(z.boolean(), true)
        .check(z.describe('Offer a chat panel in the call when the `chat` kit is enabled.')),
      recording: z
        ._default(z.literal(false), false)
        .check(z.describe('Recording is not supported.')),
    }),
    { screenShare: true, chatPanel: true, recording: false },
  ),
  defaults: z._default(
    z.object({
      audio: z._default(z.boolean(), true).check(z.describe('Microphone on when joining.')),
      video: z._default(z.boolean(), true).check(z.describe('Camera on when joining.')),
    }),
    { audio: true, video: true },
  ),
  video: z
    ._default(
      z.object({
        width: z._default(z.int(), 1280),
        height: z._default(z.int(), 720),
        frameRate: z._default(z.number(), 24),
      }),
      { width: 1280, height: 720, frameRate: 24 },
    )
    .check(z.describe('Camera constraints (ideal values).')),
  layout: z
    ._default(z.enum(['grid', 'spotlight']), 'grid')
    .check(z.describe('How tiles are arranged at the start.')),
});

export type VideoConfigValue = z.infer<typeof VideoConfig>;

/** Used when a call has no ICE configuration at all. */
export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
