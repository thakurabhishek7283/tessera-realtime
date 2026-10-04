import { baseStyles, focusRing, TesseraElement } from '@tessera-kit/elements';
import { type CSSResultGroup, css, html, nothing, type PropertyDeclarations } from 'lit';
import type { ChatApi } from '../types.js';
import { version } from '../version.js';

/**
 * `<tessera-chat-launcher>`: a floating button with an unread badge that opens the inbox in a
 * panel, like a support widget.
 *
 * @fires launcher-toggle - `{ open }`
 * @csspart button @csspart panel
 */
export class TesseraChatLauncher extends TesseraElement {
  static override tesseraVersion: string = version;

  static override properties: PropertyDeclarations = {
    position: { reflect: true },
    open: { type: Boolean, reflect: true },
    conversation: { attribute: 'conversation' },
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    focusRing,
    css`
      :host {
        position: fixed;
        inset-block-end: var(--tessera-space-4);
        inset-inline-end: var(--tessera-space-4);
        z-index: var(--tessera-z-popover);
      }
      :host([position='bottom-left']) {
        inset-inline-end: auto;
        inset-inline-start: var(--tessera-space-4);
      }
      .fab {
        position: relative;
        display: grid;
        place-items: center;
        width: 56px;
        height: 56px;
        font-size: 1.5rem;
        color: var(--tessera-color-primary-contrast);
        background: var(--tessera-color-primary);
        border: 0;
        border-radius: var(--tessera-radius-full);
        box-shadow: var(--tessera-shadow-lg);
        cursor: pointer;
      }
      .fab tessera-badge {
        position: absolute;
        inset-block-start: -4px;
        inset-inline-end: -4px;
      }
      .panel {
        position: absolute;
        inset-block-end: 68px;
        inset-inline-end: 0;
        width: min(46rem, calc(100vw - 2 * var(--tessera-space-4)));
        --tessera-chat-height: min(32rem, calc(100vh - 7rem));
        box-shadow: var(--tessera-shadow-lg);
        border-radius: var(--tessera-radius-lg);
      }
      :host([position='bottom-left']) .panel {
        inset-inline-end: auto;
        inset-inline-start: 0;
      }
      .panel[hidden] {
        display: none;
      }
    `,
  ];

  protected readonly featureId: string | null = 'chat';

  position: 'bottom-right' | 'bottom-left' = 'bottom-right';
  open = false;
  /** Conversation selected when the panel opens. */
  conversation: string | undefined;

  get #api(): ChatApi | undefined {
    return this.ctx.services.get('chat');
  }

  #toggle(next = !this.open): void {
    if (next === this.open) return;
    this.open = next;
    this.emit('launcher-toggle', { open: next });
  }

  #onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.open) {
      event.stopPropagation();
      this.#toggle(false);
      this.renderRoot.querySelector<HTMLElement>('.fab')?.focus();
    }
  };

  protected override updated(changed: Map<PropertyKey, unknown>): void {
    super.updated(changed);
    if (changed.has('open') && this.open) {
      // Move focus into the panel so keyboard users do not have to tab through the page again.
      void this.updateComplete.then(async () => {
        const inbox = this.renderRoot.querySelector('tessera-inbox');
        if (!inbox) return;
        // The first time the panel opens, the inbox may still be downloading, and it renders its
        // list once it has found its instance, so give it a few frames.
        await customElements.whenDefined('tessera-inbox');
        for (let frame = 0; frame < 10 && this.open; frame++) {
          await inbox.updateComplete;
          const first = inbox.shadowRoot?.querySelector<HTMLElement>('.item, input');
          if (first) {
            first.focus();
            return;
          }
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
      });
    }
  }

  protected override renderFeature(): unknown {
    const api = this.#api;
    if (!api) return nothing;
    const unread = this.observe(api.totalUnread);
    const label = this.open ? this.t('chat.launcher.close') : this.t('chat.launcher.open');
    return html`<div @keydown=${this.#onKeydown}>
      <div class="panel" part="panel" role="dialog" aria-label=${this.t('chat.title')} ?hidden=${!this.open}>
        ${this.open ? html`<tessera-inbox conversation=${this.conversation ?? ''}></tessera-inbox>` : nothing}
      </div>
      <button class="fab" part="button" type="button" aria-expanded=${this.open ? 'true' : 'false'} aria-label=${unread > 0 ? `${label}, ${this.t('chat.unread', { count: unread })}` : label} @click=${() => this.#toggle()}>
        <tessera-icon name=${this.open ? 'x' : 'message'}></tessera-icon>
        ${unread > 0 && !this.open ? html`<tessera-badge variant="danger" count=${unread}></tessera-badge>` : nothing}
      </button>
    </div>`;
  }
}
