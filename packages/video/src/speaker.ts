export interface SpeakerOptions {
  /** RMS level (0–1) above which someone counts as talking. */
  threshold?: number;
  /** How long someone must keep talking before they become the active speaker. */
  holdMs?: number;
}

export interface SpeakerDetector {
  /** Feeds the latest levels by peer id; returns the active speaker, if any. */
  update(levels: Readonly<Record<string, number>>, now: number): string | undefined;
  /** Whether `id` is above the threshold right now (for the speaking ring). */
  isSpeaking(id: string): boolean;
  reset(): void;
}

/**
 * Picks the active speaker: among everyone who has been above the threshold for at least
 * `holdMs`, the loudest. The current speaker is kept until someone else is clearly louder or they
 * fall silent, so the highlight does not flicker between two people who talk over each other.
 */
export function createSpeakerDetector(options: SpeakerOptions = {}): SpeakerDetector {
  const threshold = options.threshold ?? 0.02;
  const holdMs = options.holdMs ?? 600;
  const since = new Map<string, number>();
  let loud = new Set<string>();
  let current: string | undefined;

  return {
    update(levels, now) {
      loud = new Set();
      for (const [id, level] of Object.entries(levels)) {
        if (level >= threshold) {
          loud.add(id);
          if (!since.has(id)) since.set(id, now);
        } else since.delete(id);
      }
      for (const id of [...since.keys()]) if (!(id in levels)) since.delete(id);

      const candidates = [...loud].filter((id) => now - (since.get(id) ?? now) >= holdMs);
      if (candidates.length === 0) {
        current = undefined;
        return current;
      }
      const loudest = candidates.reduce((a, b) => ((levels[b] ?? 0) > (levels[a] ?? 0) ? b : a));
      if (current && candidates.includes(current)) {
        // Keep the current speaker unless somebody is clearly louder.
        if ((levels[loudest] ?? 0) < (levels[current] ?? 0) * 1.5) return current;
      }
      current = loudest;
      return current;
    },
    isSpeaking: (id) => loud.has(id),
    reset() {
      since.clear();
      loud = new Set();
      current = undefined;
    },
  };
}

/** Root-mean-square of a block of audio samples (−1…1). */
export function rms(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i] as number;
    sum += v * v;
  }
  return Math.sqrt(sum / samples.length);
}
