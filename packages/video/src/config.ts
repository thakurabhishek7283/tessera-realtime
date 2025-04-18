import { z } from 'zod';

const IceServer = z.object({
  urls: z.union([z.string(), z.array(z.string())]),
  username: z.string().optional(),
  credential: z.string().optional(),
});

/** Options of the `video` feature. `{ enabled: true }` alone is valid. */
export const VideoConfig = z.object({
  enabled: z.boolean(),
  maxParticipants: z
    .number()
    .int()
    .min(2)
    .max(6)
    .default(4)
    .describe(
      'Largest number of people in one call. Every extra person adds a connection per participant (mesh).',
    ),
  iceServers: z
    .array(IceServer)
    .optional()
    .describe(
      'STUN/TURN servers. Defaults to a public STUN server when neither this nor `iceServersUrl` is set.',
    ),
  iceServersUrl: z
    .string()
    .optional()
    .describe(
      'URL returning `{ iceServers }` (tessera-server: `/v1/ice`), fetched with the user token before joining.',
    ),
  prejoin: z.boolean().default(true).describe('Show a device preview before joining.'),
  allow: z
    .object({
      screenShare: z.boolean().default(true),
      chatPanel: z
        .boolean()
        .default(true)
        .describe('Offer a chat panel in the call when the `chat` kit is enabled.'),
      recording: z.literal(false).default(false).describe('Recording is not supported.'),
    })
    .default({ screenShare: true, chatPanel: true, recording: false }),
  defaults: z
    .object({
      audio: z.boolean().default(true).describe('Microphone on when joining.'),
      video: z.boolean().default(true).describe('Camera on when joining.'),
    })
    .default({ audio: true, video: true }),
  video: z
    .object({
      width: z.number().int().default(1280),
      height: z.number().int().default(720),
      frameRate: z.number().default(24),
    })
    .default({ width: 1280, height: 720, frameRate: 24 })
    .describe('Camera constraints (ideal values).'),
  layout: z
    .enum(['grid', 'spotlight'])
    .default('grid')
    .describe('How tiles are arranged at the start.'),
});

export type VideoConfigValue = z.infer<typeof VideoConfig>;

/** Used when a call has no ICE configuration at all. */
export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
