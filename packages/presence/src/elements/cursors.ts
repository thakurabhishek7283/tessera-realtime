import { colorForId } from '@tessera-kit/core';
import { baseStyles, readableTextOn, TesseraElement } from '@tessera-kit/elements';
import { type CSSResultGroup, css, html, type PropertyDeclarations } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { version } from '../version.js';
import { ScopeSession } from './join.js';

/** Pointer updates are sent at most this often. */
const SEND_EVERY_MS = 50;
/** A pointer that has not moved for this long fades out. */
const FADE_AFTER_MS = 3000;

/**
 * `<tessera-cursors>`: other people's pointers over a container. Place it inside a
 * `position: relative` container; it fills that container, listens to the pointer on `target`
 * (default: its parent) and shares positions as fractions of the target's size, so the cursors
 * line up even when people have different window sizes.
 *
 * @csspart cursor @csspart label
 */
export class TesseraCursorsElement extends TesseraElement {
  static override tesseraVersion: string = version;

  static override properties: PropertyDeclarations = {
    scope: { attribute: 'scope' },
    target: { attribute: 'target' },
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    css`
      :host {
        position: absolute;
        inset: 0;
        display: block;
        overflow: hidden;
        pointer-events: none;
        z-index: 1;
      }
      .cursor {
        position: absolute;
        display: flex;
        align-items: flex-start;
        gap: 2px;
        transition:
          left 80ms linear,
          top 80ms linear,
          opacity var(--tessera-motion-duration) ease;
      }
      .cursor[data-faded] {
        opacity: 0;
      }
      svg {
        width: 16px;
        height: 16px;
        flex: none;
        color: var(--_color);
        filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.35));
      }
      .label {
        margin-block-start: 12px;
        padding: 1px var(--tessera-space-2);
        border-radius: var(--tessera-radius-full);
        font-size: var(--tessera-font-size-xs);
        line-height: 1.4;
        white-space: nowrap;
        background: var(--_color);
        color: var(--_text);
      }
    `,
  ];

  protected readonly featureId: string | null = 'presence';

  /** Scope to join. Defaults to the feature's configured `scope`. */
  scope: string | undefined;
  /** CSS selector of the element whose pointer is shared. Defaults to the parent element. */
  target: string | undefined;

  readonly #session = new ScopeSession(() => this.requestUpdate());
  #listening: Element | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #lastSent = 0;
  #pending: { x: number; y: number } | null | undefined;
  #tick: ReturnType<typeof setInterval> | undefined;

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#session.close();
    this.#detach();
    clearInterval(this.#tick);
    this.#tick = undefined;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.hasUpdated) this.requestUpdate();
  }

  #targetElement(): Element | null {
    if (this.target) {
      const root = this.getRootNode() as Document | ShadowRoot;
      return root.querySelector(this.target);
    }
    const parent = this.parentElement;
    if (parent) return parent;
    const root = this.getRootNode();
    return root instanceof ShadowRoot ? root.host : null;
  }

  protected override updated(changed: Map<PropertyKey, unknown>): void {
    super.updated(changed);
    this.#session.sync(this.enabled ? this.ctx : undefined, this.enabled, this.scope);
    const target = this.enabled && this.#session.handle ? this.#targetElement() : null;
    if (target !== (this.#listening ?? null)) {
      this.#detach();
      if (target) this.#attach(target);
    }
    const anyCursor = (this.#session.handle?.cursors.get().length ?? 0) > 0;
    if (anyCursor && this.#tick === undefined) {
      // Fading is time-based, so it needs a heartbeat while someone's pointer is on screen.
      this.#tick = setInterval(() => this.requestUpdate(), 1000);
    } else if (!anyCursor && this.#tick !== undefined) {
      clearInterval(this.#tick);
      this.#tick = undefined;
    }
  }

  #attach(target: Element): void {
    this.#listening = target;
    target.addEventListener('pointermove', this.#onMove as EventListener);
    target.addEventListener('pointerleave', this.#onLeave);
  }

  #detach(): void {
    this.#listening?.removeEventListener('pointermove', this.#onMove as EventListener);
    this.#listening?.removeEventListener('pointerleave', this.#onLeave);
    this.#listening = undefined;
    clearTimeout(this.#timer);
    this.#timer = undefined;
  }

  #onMove = (event: PointerEvent): void => {
    const rect = this.#listening?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    this.#send({
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    });
  };

  #onLeave = (): void => this.#send(null);

  #send(point: { x: number; y: number } | null): void {
    this.#pending = point;
    const wait = this.#lastSent + SEND_EVERY_MS - Date.now();
    if (wait <= 0) this.#flush();
    else this.#timer ??= setTimeout(() => this.#flush(), wait);
  }

  #flush(): void {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    if (this.#pending === undefined) return;
    const point = this.#pending;
    this.#pending = undefined;
    this.#lastSent = Date.now();
    this.#session.handle?.set({ cursor: point });
  }

  protected override renderFeature(): unknown {
    const handle = this.#session.handle;
    const cursors = handle ? this.observe(handle.cursors) : [];
    const now = this.ctx.clock.now();
    return html`${repeat(
      cursors,
      (c) => c.peerId,
      (c) => {
        const color = c.user.color ?? colorForId(c.user.id);
        const text = readableTextOn(color) ?? 'var(--tessera-color-primary-contrast)';
        return html`<div
          class="cursor"
          part="cursor"
          aria-hidden="true"
          ?data-faded=${now - c.updatedAt > FADE_AFTER_MS}
          style="left:${c.x * 100}%;top:${c.y * 100}%;--_color:${color};--_text:${text}"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" stroke="#fff" stroke-width="1" d="M1.5 1.2l12 5.1-5.2 1.7-1.8 5.4z" /></svg>
          <span class="label" part="label">${c.user.name}</span>
        </div>`;
      },
    )}`;
  }
}
