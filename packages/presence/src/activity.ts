import type { PresenceStatus } from './types.js';

export interface ActivityTracker {
  /** Current status as seen by the tracker. */
  status(): PresenceStatus;
  stop(): void;
}

export interface ActivityOptions {
  idleAfterMs: number;
  now(): number;
  onChange(status: PresenceStatus): void;
  /** Where input events are heard. Defaults to `window`; inert without a DOM. */
  target?: EventTarget | undefined;
  /** Reports whether the page is hidden. Defaults to `document.hidden`. */
  hidden?: (() => boolean) | undefined;
  /** Source of `visibilitychange`. Defaults to `document`. */
  visibility?: EventTarget | undefined;
}

const INPUT_EVENTS = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

/**
 * Turns input events and page visibility into a status: `away` while the tab is hidden, `idle`
 * after `idleAfterMs` without input, otherwise `active`. It only keeps one timer alive and does
 * no work per event beyond storing a timestamp.
 */
export function trackActivity(opts: ActivityOptions): ActivityTracker {
  const target = opts.target ?? (typeof window === 'undefined' ? undefined : window);
  const visibility = opts.visibility ?? (typeof document === 'undefined' ? undefined : document);
  const hidden = opts.hidden ?? (() => (typeof document === 'undefined' ? false : document.hidden));

  let status: PresenceStatus = hidden() ? 'away' : 'active';
  let lastInput = opts.now();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const set = (next: PresenceStatus): void => {
    if (next === status) return;
    status = next;
    opts.onChange(next);
  };

  const schedule = (): void => {
    clearTimeout(timer);
    if (status !== 'active') return;
    const remaining = lastInput + opts.idleAfterMs - opts.now();
    timer = setTimeout(check, Math.max(remaining, 0));
  };

  function check(): void {
    if (status !== 'active') return;
    if (opts.now() - lastInput >= opts.idleAfterMs) set('idle');
    else schedule();
  }

  const onInput = (): void => {
    lastInput = opts.now();
    if (hidden()) return;
    if (status === 'active') return;
    set('active');
    schedule();
  };

  const onVisibility = (): void => {
    if (hidden()) {
      clearTimeout(timer);
      set('away');
    } else {
      lastInput = opts.now();
      set('active');
      schedule();
    }
  };

  for (const type of INPUT_EVENTS) target?.addEventListener(type, onInput, { passive: true });
  visibility?.addEventListener('visibilitychange', onVisibility);
  schedule();

  return {
    status: () => status,
    stop() {
      clearTimeout(timer);
      for (const type of INPUT_EVENTS) target?.removeEventListener(type, onInput);
      visibility?.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
