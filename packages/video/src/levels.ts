import { rms } from './speaker.js';

export interface LevelMeter {
  /** Current loudness, 0–1. */
  read(): number;
  stop(): void;
}

/** Measures the loudness of a stream's audio. Returns `undefined` when it has no audio track. */
export function createLevelMeter(audio: AudioContext, stream: MediaStream): LevelMeter | undefined {
  if (stream.getAudioTracks().length === 0) return undefined;
  const source = audio.createMediaStreamSource(stream);
  const analyser = audio.createAnalyser();
  analyser.fftSize = 1024;
  // Not connected to the speakers: this only listens.
  source.connect(analyser);
  const buffer = new Float32Array(analyser.fftSize);
  return {
    read() {
      analyser.getFloatTimeDomainData(buffer);
      return rms(buffer);
    },
    stop() {
      source.disconnect();
    },
  };
}
