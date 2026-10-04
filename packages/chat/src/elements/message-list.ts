import type { ReadonlyStore, UserInfo } from '@tessera-kit/core';
import { baseStyles, focusRing, TesseraElement, visuallyHidden } from '@tessera-kit/elements';
import { type CSSResultGroup, css, html, nothing, type PropertyDeclarations } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { previewText } from '../messages.js';
import type { ConversationState, Message } from '../types.js';
import { buildRows, computeWindow, dayLabel, offsetOf, type Row } from '../ui-util.js';
import type { MessageActionDetail, MessageFeatures } from './message.js';

/** Above this many rows only the ones near the viewport are rendered. */
export const WINDOW_THRESHOLD = 300;
const ESTIMATED_ROW = 64;
const INITIAL_ROWS = 60;
const OVERSCAN_PX = 800;
const BOTTOM_SLACK_PX = 32;
const LOAD_OLDER_AT_PX = 120;
const ANNOUNCE_EVERY_MS = 2000;

/**
 * The scrolling list of messages: grouping, day separators, a "new messages" divider, sticking
 * to the bottom, loading older messages on scroll and windowing for long conversations.
 *
 * @fires load-older - the list is scrolled to the top and has more history
 * @fires message-action - bubbled from messages: `{ action, message, emoji? }`
 * @fires bottom-change - `{ atBottom }` when the list is scrolled to or away from the end
 * @csspart scroller @csspart day @csspart divider @csspart pill
 * @slot empty - shown when there are no messages
 */
export class TesseraMessageList extends TesseraElement {
  static override properties: PropertyDeclarations = {
    stateStore: { attribute: false },
    selfId: { attribute: false },
    features: { attribute: false },
    direct: { type: Boolean },
    readonly: { type: Boolean },
    newBelow: { state: true },
    now: { state: true },
    range: { state: true },
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    focusRing,
    visuallyHidden,
    css`
      :host {
        position: relative;
        display: flex;
        flex-direction: column;
        min-height: 0;
      }
      .scroller {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        overscroll-behavior: contain;
        padding-block: var(--tessera-space-4) var(--tessera-space-2);
      }
      .day,
      .divider {
        display: flex;
        align-items: center;
        gap: var(--tessera-space-3);
        margin: var(--tessera-space-3) var(--tessera-space-3);
        font-size: var(--tessera-font-size-xs);
        color: var(--tessera-color-text-muted);
        text-transform: capitalize;
      }
      .day::before,
      .day::after,
      .divider::before,
      .divider::after {
        content: '';
        flex: 1;
        border-top: 1px solid var(--tessera-color-border);
      }
      .divider {
        color: var(--tessera-color-danger);
        text-transform: none;
        font-weight: 700;
      }
      .divider::before,
      .divider::after {
        border-color: var(--tessera-color-danger);
      }
      .older {
        display: flex;
        justify-content: center;
        padding: var(--tessera-space-2);
      }
      .pill {
        position: absolute;
        inset-block-end: var(--tessera-space-3);
        inset-inline-start: 50%;
        transform: translateX(-50%);
        z-index: 3;
        padding: var(--tessera-space-1) var(--tessera-space-3);
        font: inherit;
        font-size: var(--tessera-font-size-sm);
        font-weight: 700;
        color: var(--tessera-color-primary-contrast);
        background: var(--tessera-color-primary);
        border: 0;
        border-radius: var(--tessera-radius-full);
        box-shadow: var(--tessera-shadow-md);
        cursor: pointer;
      }
      .empty {
        display: grid;
        place-items: center;
        height: 100%;
        padding: var(--tessera-space-6);
        color: var(--tessera-color-text-muted);
        text-align: center;
      }
    `,
  ];

  protected readonly featureId: string | null = 'chat';

  /** Store of the conversation state; the list re-renders when it changes. */
  stateStore: ReadonlyStore<ConversationState> | undefined;
  selfId = '';
  features: MessageFeatures | undefined;
  /** Direct conversations say "Seen"; rooms say who saw it. */
  direct = false;
  readonly = false;
  newBelow = 0;
  now = Date.now();
  range = { start: 0, end: Number.POSITIVE_INFINITY, before: 0, after: 0 };

  #heights = new Map<string, number>();
  #atBottom = true;
  #anchor: { height: number; top: number } | undefined;
  #lastCount = 0;
  #lastKey: string | undefined;
  #clock: ReturnType<typeof setInterval> | undefined;
  #announced = 0;
  #announceBuffer: Message[] = [];
  #announceTimer: ReturnType<typeof setTimeout> | undefined;
  #live = '';
  #resize: ResizeObserver | undefined;
  #contentResize: ResizeObserver | undefined;
  #observedContent: Element | undefined;
  #anchorTimer: ReturnType<typeof setTimeout> | undefined;
  #loadingOlder = false;

  override connectedCallback(): void {
    super.connectedCallback();
    // Relative times ("2 min ago") refresh together.
    this.#clock = setInterval(() => (this.now = this.ctx.clock.now()), 30_000);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearInterval(this.#clock);
    clearTimeout(this.#announceTimer);
    clearTimeout(this.#anchorTimer);
    this.#resize?.disconnect();
    this.#contentResize?.disconnect();
    this.#resize = undefined;
    this.#contentResize = undefined;
    this.#observedContent = undefined;
  }

  get #scroller(): HTMLElement | null {
    return this.renderRoot.querySelector('.scroller');
  }

  /** Scrolls to the newest message. */
  scrollToEnd(behavior: ScrollBehavior = 'auto'): void {
    const el = this.#scroller;
    if (!el) return;
    // Going to the end is explicit, so a pending "keep my place" adjustment must not undo it.
    this.#anchor = undefined;
    el.scrollTo({ top: el.scrollHeight, behavior });
    this.#setBottom(true);
  }

  /** Scrolls a message into view and focuses it; returns false when it is not in the list. */
  reveal(messageId: string): boolean {
    const state = this.stateStore?.get();
    const index = state?.messages.findIndex((m) => m.id === messageId) ?? -1;
    if (!state || index < 0) return false;
    // A windowed message may not be in the DOM yet: move the window to where it is first.
    const rows = buildRows(state.messages, state.firstUnreadId);
    const rowIndex = rows.findIndex((r) => r.message?.id === messageId);
    const scroller = this.#scroller;
    if (rows.length > WINDOW_THRESHOLD && scroller) {
      const keys = rows.map((r) => r.key);
      const top = offsetOf(keys, this.#heights, ESTIMATED_ROW, rowIndex);
      this.range = computeWindow({
        heights: this.#heights,
        keys,
        estimate: ESTIMATED_ROW,
        scrollTop: top,
        viewport: scroller.clientHeight,
        overscan: OVERSCAN_PX,
      });
      void this.updateComplete.then(() => {
        scroller.scrollTop = top;
        this.#focusMessage(messageId);
      });
      return true;
    }
    void this.updateComplete.then(() => this.#focusMessage(messageId));
    return true;
  }

  /**
   * Messages render their own content a moment after the list does, so the list keeps growing
   * after each update. Follow that growth: stay at the bottom when we were there, and keep the
   * reading position steady while older messages are inserted above.
   */
  #onContentResize = (): void => {
    const el = this.#scroller;
    if (!el) return;
    if (this.#anchor) {
      el.scrollTop = this.#anchor.top + (el.scrollHeight - this.#anchor.height);
      clearTimeout(this.#anchorTimer);
      this.#anchorTimer = setTimeout(() => {
        if (!this.stateStore?.get().loading) {
          this.#anchor = undefined;
          this.#loadingOlder = false;
        }
      }, 150);
    } else if (this.#atBottom) {
      el.scrollTop = el.scrollHeight;
    }
  };

  #focusMessage(messageId: string): void {
    const el = this.renderRoot.querySelector<HTMLElement>(
      `[data-message-id="${CSS.escape(messageId)}"]`,
    );
    el?.scrollIntoView({ block: 'center' });
    el?.shadowRoot?.querySelector<HTMLElement>('article')?.focus({ preventScroll: true });
  }

  #setBottom(atBottom: boolean): void {
    if (atBottom === this.#atBottom) return;
    this.#atBottom = atBottom;
    if (atBottom) this.newBelow = 0;
    this.emit('bottom-change', { atBottom });
  }

  #onScroll = (): void => {
    const el = this.#scroller;
    if (!el) return;
    this.#setBottom(el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_SLACK_PX);
    const rows = this.#rows();
    if (rows.length > WINDOW_THRESHOLD) this.#updateRange(el);
    const state = this.stateStore?.get();
    if (
      el.scrollTop <= LOAD_OLDER_AT_PX &&
      state?.hasMore &&
      !state.loading &&
      !this.#loadingOlder
    ) {
      this.#requestOlder(el);
    }
  };

  #requestOlder(el: HTMLElement): void {
    this.#loadingOlder = true;
    // Remember where we are so the view does not jump when older messages are inserted above.
    this.#anchor = { height: el.scrollHeight, top: el.scrollTop };
    this.emit('load-older', undefined);
  }

  #updateRange(el: HTMLElement): void {
    const rows = this.#rows();
    const next = computeWindow({
      heights: this.#heights,
      keys: rows.map((r) => r.key),
      estimate: ESTIMATED_ROW,
      scrollTop: el.scrollTop,
      viewport: el.clientHeight,
      overscan: OVERSCAN_PX,
    });
    const { start, end } = this.range;
    // Re-render only when the window moved by a visible amount.
    if (
      Math.abs(next.start - start) >= 4 ||
      Math.abs(next.end - end) >= 4 ||
      end === Number.POSITIVE_INFINITY
    ) {
      this.range = next;
    }
  }

  #rows(): Row[] {
    const state = this.stateStore ? this.observe(this.stateStore) : undefined;
    return state ? buildRows(state.messages, state.firstUnreadId) : [];
  }

  protected override willUpdate(changed: Map<PropertyKey, unknown>): void {
    super.willUpdate(changed);
    // A long conversation opens at its end, so start with the newest rows instead of all of them.
    if (this.range.end === Number.POSITIVE_INFINITY) {
      const rows = this.#rows();
      if (rows.length > WINDOW_THRESHOLD) {
        const start = rows.length - INITIAL_ROWS;
        this.range = { start, end: rows.length, before: start * ESTIMATED_ROW, after: 0 };
      }
    }
  }

  protected override updated(changed: Map<PropertyKey, unknown>): void {
    super.updated(changed);
    const el = this.#scroller;
    const state = this.stateStore?.get();
    if (!el || !state) return;

    // Observe row heights once, so windowing can use measured values instead of estimates.
    if (!this.#resize && typeof ResizeObserver !== 'undefined') {
      this.#resize = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const key = (entry.target as HTMLElement).dataset.rowKey;
          if (key)
            this.#heights.set(
              key,
              Math.round(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height),
            );
        }
      });
    }
    const content = this.renderRoot.querySelector('.content');
    if (content && content !== this.#observedContent && typeof ResizeObserver !== 'undefined') {
      this.#contentResize ??= new ResizeObserver(this.#onContentResize);
      this.#contentResize.disconnect();
      this.#contentResize.observe(content);
      this.#observedContent = content;
    }
    if (this.#resize) {
      for (const row of this.renderRoot.querySelectorAll<HTMLElement>('[data-row-key]'))
        this.#resize.observe(row);
    }

    const count = state.messages.length;
    const last = state.messages.at(-1);
    const lastKey = last ? `${last.clientId}:${last.authorId}` : undefined;
    const grewAtEnd = lastKey !== this.#lastKey && count > this.#lastCount;

    if (this.#lastCount === 0 && count > 0) {
      this.scrollToEnd();
      if (state.firstUnreadId) this.reveal(state.firstUnreadId);
    } else if (grewAtEnd) {
      const own = last?.authorId === this.selfId;
      if (this.#atBottom || own) this.scrollToEnd();
      else this.newBelow += count - this.#lastCount;
      if (last && !own && last.status === undefined) this.#announce(last);
    }
    this.#lastCount = count;
    this.#lastKey = lastKey;
  }

  /** Reads new messages from others aloud, but at most one announcement every 2 s. */
  #announce(message: Message): void {
    this.#announceBuffer.push(message);
    if (this.#announceTimer) return;
    const wait = Math.max(0, this.#announced + ANNOUNCE_EVERY_MS - Date.now());
    this.#announceTimer = setTimeout(() => {
      this.#announceTimer = undefined;
      this.#announced = Date.now();
      const batch = this.#announceBuffer.splice(0);
      const first = batch[0];
      this.#live =
        batch.length === 1 && first
          ? this.t('chat.announce', { name: first.authorName, text: previewText(first) })
          : this.t('chat.announce.many', { count: batch.length });
      this.requestUpdate();
    }, wait);
  }

  #onAction = (event: Event): void => {
    const detail = (event as CustomEvent<MessageActionDetail>).detail;
    if (detail.action === 'jump') {
      event.stopPropagation();
      const parent = detail.message.replyTo;
      if (parent && !this.reveal(parent)) this.emit('jump-missing', { messageId: parent });
    }
  };

  protected override renderFeature(): unknown {
    const state = this.stateStore ? this.observe(this.stateStore) : undefined;
    if (!state || !this.features) return nothing;
    const rows = buildRows(state.messages, state.firstUnreadId);
    const windowed = rows.length > WINDOW_THRESHOLD;
    const shown = windowed ? rows.slice(this.range.start, this.range.end) : rows;
    const byId = new Map(state.messages.map((m) => [m.id, m]));
    const locale = this.ctx.i18n.locale;

    return html`
      <div class="visually-hidden" role="status" aria-live="polite" aria-atomic="true">${this.#live}</div>
      <div
        class="scroller"
        part="scroller"
        role="log"
        aria-live="off"
        aria-label=${this.t('chat.log')}
        aria-busy=${state.loading ? 'true' : 'false'}
        @scroll=${this.#onScroll}
        @message-action=${this.#onAction}
      >
        <div class="content">
        ${state.hasMore ? html`<div class="older">${state.loading ? html`<tessera-spinner label=${this.t('chat.loadingOlder')}></tessera-spinner>` : html`<tessera-button size="sm" variant="ghost" @click=${() => this.#requestOlder(this.#scroller as HTMLElement)}>${this.t('chat.loadOlder')}</tessera-button>`}</div>` : nothing}
        ${rows.length === 0 && !state.loading ? html`<div class="empty"><slot name="empty">${this.t('chat.empty')}</slot></div>` : nothing}
        ${windowed ? html`<div aria-hidden="true" style=${`height:${this.range.before}px`}></div>` : nothing}
        ${repeat(
          shown,
          (row) => row.key,
          (row) => {
            if (row.kind === 'day') {
              return html`<div class="day" part="day" data-row-key=${row.key} role="separator">${dayLabel(row.day ?? '', this.now, locale)}</div>`;
            }
            if (row.kind === 'unread') {
              return html`<div class="divider" part="divider" data-row-key=${row.key} role="separator">${this.t('chat.newMessages')}</div>`;
            }
            const m = row.message as Message;
            const seen: UserInfo[] = state.readBy[m.id] ?? [];
            return html`<tessera-chat-message
              data-row-key=${row.key}
              data-message-id=${m.id}
              .message=${m}
              .selfId=${this.selfId}
              .compact=${row.compact ?? false}
              .features=${this.features}
              .parent=${m.replyTo ? byId.get(m.replyTo) : undefined}
              .seenBy=${seen}
              .seenLabel=${this.direct ? 'seen' : 'seenBy'}
              .now=${this.now}
              ?readonly=${this.readonly}
            ></tessera-chat-message>`;
          },
        )}
        ${windowed ? html`<div aria-hidden="true" style=${`height:${this.range.after}px`}></div>` : nothing}
        </div>
      </div>
      ${this.newBelow > 0 ? html`<button class="pill" part="pill" type="button" @click=${() => this.scrollToEnd('smooth')}>${this.t('chat.newBelow', { count: this.newBelow })}</button>` : nothing}
    `;
  }
}
