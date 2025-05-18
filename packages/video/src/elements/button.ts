import { baseStyles, focusRing, TesseraElement } from '@tessera/elements';
import { type CSSResultGroup, css, html, nothing, type PropertyDeclarations } from 'lit';

/** The part of the presence kit the button uses to count people in a call. */
interface PresenceLike {
  join(scope: string): Promise<{
    peers: { get(): Array<{ location?: string }>; subscribe(fn: () => void): () => void };
    leave(): Promise<void>;
  }>;
}

/**
 * `<tessera-call-button call-id="standup">`: a button that opens the call in a dialog. With the
 * `presence` kit enabled it shows how many people are in the call right now.
 *
 * @fires call-open - when the dialog opens
 * @fires call-close - when the dialog closes (and with it the call)
 * @csspart button @csspart dialog
 * @slot - the button's label
 */
export class TesseraCallButton extends TesseraElement {
  static override properties: PropertyDeclarations = {
    callId: { attribute: 'call-id' },
    open: { type: Boolean, reflect: true },
    count: { state: true },
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    focusRing,
    css`
      :host {
        display: inline-flex;
      }
      tessera-dialog::part(dialog) {
        width: min(64rem, calc(100vw - 2rem));
      }
      tessera-dialog::part(body) {
        padding: 0;
      }
      tessera-call {
        --tessera-call-height: min(40rem, calc(100vh - 8rem));
      }
    `,
  ];

  protected readonly featureId: string | null = 'video';

  callId: string | undefined;
  open = false;
  count = 0;

  #watch: { stop(): void } | undefined;
  #scope: string | undefined;

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#watch?.stop();
    this.#watch = undefined;
    this.#scope = undefined;
  }

  protected override updated(changed: Map<PropertyKey, unknown>): void {
    super.updated(changed);
    const scope = this.enabled && this.callId ? `call:${this.callId}` : undefined;
    if (scope === this.#scope) return;
    this.#watch?.stop();
    this.#watch = undefined;
    this.#scope = scope;
    this.count = 0;
    if (scope) void this.#follow(scope);
  }

  async #follow(scope: string): Promise<void> {
    const registry = this.ctx.services as unknown as { get(id: string): PresenceLike | undefined };
    const kit = registry.get('presence');
    if (!kit) return;
    try {
      const handle = await kit.join(scope);
      if (this.#scope !== scope) {
        void handle.leave();
        return;
      }
      const update = (): void => {
        this.count = handle.peers.get().filter((p) => p.location === 'in-call').length;
      };
      update();
      const off = handle.peers.subscribe(update);
      this.#watch = {
        stop() {
          off();
          void handle.leave();
        },
      };
    } catch (error) {
      this.ctx.logger.debug('could not count the people in the call', error);
    }
  }

  #toggle(next: boolean): void {
    if (next === this.open) return;
    this.open = next;
    this.emit(next ? 'call-open' : 'call-close', { callId: this.callId });
  }

  protected override renderFeature(): unknown {
    return html`
      <tessera-button part="button" variant="primary" @click=${() => this.#toggle(true)}>
        <tessera-icon name="video"></tessera-icon>
        <slot>${this.t('video.button.open')}</slot>
        ${this.count > 0 ? html`<tessera-badge count=${this.count} aria-label=${this.t('video.button.count', { count: this.count })}></tessera-badge>` : nothing}
      </tessera-button>
      ${
        this.open
          ? html`<tessera-dialog part="dialog" open heading=${this.t('video.call')} @dialog-close=${() => this.#toggle(false)}>
              <tessera-call call-id=${this.callId ?? ''} autostart></tessera-call>
            </tessera-dialog>`
          : nothing
      }
    `;
  }
}
