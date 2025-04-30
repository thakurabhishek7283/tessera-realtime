import type { Logger } from '@tessera/core';
import type { VideoConfigValue } from './config.js';
import type { CallError, Device, DeviceKind } from './types.js';

export interface MediaDevicesLike {
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  getDisplayMedia?(constraints?: DisplayMediaStreamOptions): Promise<MediaStream>;
  enumerateDevices(): Promise<MediaDeviceInfo[]>;
  addEventListener?(type: 'devicechange', fn: () => void): void;
  removeEventListener?(type: 'devicechange', fn: () => void): void;
}

/** The browser's media devices, or `undefined` outside a secure browser context. */
export function browserMediaDevices(): MediaDevicesLike | undefined {
  return typeof navigator === 'undefined'
    ? undefined
    : (navigator.mediaDevices as MediaDevicesLike | undefined);
}

/** Maps what `getUserMedia` throws to a reason the UI can explain. */
export function describeMediaError(error: unknown): CallError {
  const name = (error as { name?: string } | null)?.name ?? '';
  const message = error instanceof Error ? error.message : String(error);
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return { reason: 'permission-denied', message };
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError') {
    return { reason: 'no-device', message };
  }
  return { reason: 'unknown', message };
}

export interface Acquired {
  stream: MediaStream | undefined;
  error: CallError | undefined;
}

/**
 * Gets the camera and microphone, falling back to what is available: both, then audio only, then
 * video only, then nothing. The error of the first failure is kept so the UI can explain why a
 * device is missing, while the call can still be joined without it.
 */
export async function acquireMedia(
  devices: MediaDevicesLike | undefined,
  want: { audio: boolean; video: boolean },
  video: VideoConfigValue['video'],
  logger: Logger,
  ids: { audio?: string | undefined; video?: string | undefined } = {},
): Promise<Acquired> {
  if (!devices) {
    return {
      stream: undefined,
      error: {
        reason: 'unsupported',
        message: 'Camera and microphone need a secure (https) page.',
      },
    };
  }
  const constraints = (audio: boolean, cam: boolean): MediaStreamConstraints => ({
    audio: audio ? (ids.audio ? { deviceId: { exact: ids.audio } } : true) : false,
    video: cam
      ? {
          width: { ideal: video.width },
          height: { ideal: video.height },
          frameRate: { ideal: video.frameRate },
          ...(ids.video ? { deviceId: { exact: ids.video } } : {}),
        }
      : false,
  });
  const attempts: Array<[boolean, boolean]> = [];
  if (want.audio && want.video) attempts.push([true, true], [true, false], [false, true]);
  else if (want.audio) attempts.push([true, false]);
  else if (want.video) attempts.push([false, true]);

  let first: CallError | undefined;
  for (const [audio, cam] of attempts) {
    try {
      return { stream: await devices.getUserMedia(constraints(audio, cam)), error: first };
    } catch (error) {
      first ??= describeMediaError(error);
      logger.debug('getUserMedia failed', { audio, cam, error });
      // Without permission nothing else will work either.
      if (first.reason === 'permission-denied') break;
    }
  }
  return { stream: undefined, error: first };
}

/** Lists devices by kind, with readable fallback labels (labels are empty before permission). */
export async function listDevices(
  devices: MediaDevicesLike | undefined,
): Promise<Record<DeviceKind, Device[]>> {
  const out: Record<DeviceKind, Device[]> = { audioinput: [], videoinput: [], audiooutput: [] };
  if (!devices) return out;
  const names: Record<DeviceKind, string> = {
    audioinput: 'Microphone',
    videoinput: 'Camera',
    audiooutput: 'Speaker',
  };
  for (const d of await devices.enumerateDevices()) {
    const kind = d.kind as DeviceKind;
    if (!(kind in out) || d.deviceId === '') continue;
    out[kind].push({ id: d.deviceId, label: d.label || `${names[kind]} ${out[kind].length + 1}` });
  }
  return out;
}
