import { baseStyles, focusRing, TesseraElement, visuallyHidden } from '@tessera/elements';
import { type CSSResultGroup, css, html, nothing, type PropertyDeclarations } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import type { PresenceUser } from '../types.js';
import { ScopeSession } from './join.js';

/**
 * `<tessera-presence>`: an avatar stack of the people in a scope, with a status dot on each and a
 * "+N" button that lists everyone.
 *
 * @fires presence-change - `{ peers }` whenever the list of people changes
 * @csspart root @csspart person @csspart dot @csspart more @csspart list
 * @slot empty - shown when nobody else is here
 */
export class TesseraPresenceElement extends TesseraElement {
  static override properties: PropertyDeclarations = {
    scope: { attribute: 'scope' },
    max: { type: Number },
    listOpen: { state: true },
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    focusRing,
    visuallyHidden,
    css`
      :host {
        display: inline-flex;
        align-items: center;
        --tessera-avatar-ring: var(--tessera-color-bg);
      }
      .root {
        display: inline-flex;
        align-items: center;
      }
      ul {
        display: inline-flex;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .stack li {
        position: relative;
        display: inline-flex;
      }
      .stack li + li,
      .stack li + .more {
        margin-inline-start: -8px;
      }
      .dot {
        position: absolute;
        inset-inline-end: -1px;
        inset-block-end: -1px;
        width: 10px;
        height: 10px;
        border-radius: var(--tessera-radius-full);
        box-sizing: border-box;
        border: 2px solid var(--tessera-color-bg);
        background: var(--tessera-color-success);
      }
      .dot[data-status='idle'] {
        background: var(--tessera-color-warning);
      }
      .dot[data-status='away'] {
        background: var(--tessera-color-bg);
        box-shadow: 0 0 0 1px var(--tessera-color-text-muted);
      }
      .more {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 32px;
        height: 32px;
        padding: 0 var(--tessera-space-2);
        font: inherit;
        font-size: var(--tessera-font-size-xs);
        font-weight: 700;
        color: var(--tessera-color-text);
        background: var(--tessera-color-surface-2);
        border: 0;
        border-radius: var(--tessera-radius-full);
        box-shadow: 0 0 0 2px var(--tessera-color-bg);
        cursor: pointer;
      }
      .list {
        display: flex;
        flex-direction: column;
        gap: var(--tessera-space-2);
        min-width: 12rem;
        padding: var(--tessera-space-1);
      }
      .list li {
        display: flex;
        align-items: center;
        gap: var(--tessera-space-2);
      }
      .list .status {
        margin-inline-start: auto;
        color: var(--tessera-color-text-muted);
        font-size: var(--tessera-font-size-sm);
      }
      .list .location {
        display: block;
        color: var(--tessera-color-text-muted);
        font-size: var(--tessera-font-size-xs);
      }
    `,
  ];

  protected readonly featureId: string | null = 'presence';

  /** Scope to join. Defaults to the feature's configured `scope`. */
  scope: string | undefined;
  /** Avatars shown before the rest collapse. Defaults to the feature's `maxAvatars`. */
  max: number | undefined;
  listOpen = false;

  readonly #session = new ScopeSession(
    () => this.requestUpdate(),
    (peers) => this.emit('presence-change', { peers }),
  );

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#session.close();
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.hasUpdated) this.requestUpdate();
  }

  protected override updated(changed: Map<PropertyKey, unknown>): void {
    super.updated(changed);
    this.#session.sync(this.enabled ? this.ctx : undefined, this.enabled, this.scope);
  }

  #statusLabel(status: PresenceUser['status']): string {
    return this.t(`presence.status.${status}`);
  }

  protected override renderFeature(): unknown {
    const handle = this.#session.handle;
    const people = handle ? this.observe(handle.peers) : [];
    if (people.length === 0) return html`<slot name="empty"></slot>`;

    const maxAvatars = this.max ?? this.ctx.services.get('presence')?.config.maxAvatars ?? 5;
    const shown = people.slice(0, maxAvatars);
    const extra = people.length - shown.length;
    return html`<div class="root" part="root" role="group" aria-label=${this.t('presence.label')}>
      <ul class="stack">
        ${repeat(
          shown,
          (u) => u.id,
          (u) => html`<li part="person" title=${`${u.name} (${this.#statusLabel(u.status)})`}>
            <tessera-avatar size="sm" name=${u.name} .src=${u.avatarUrl} .color=${u.color}></tessera-avatar>
            <span class="dot" part="dot" data-status=${u.status} aria-hidden="true"></span>
            <span class="visually-hidden">${this.t('presence.person', { name: u.name, status: this.#statusLabel(u.status) })}</span>
          </li>`,
        )}
      </ul>
      ${
        extra > 0
          ? html`<button
              id="more"
              class="more"
              part="more"
              type="button"
              aria-haspopup="dialog"
              aria-expanded=${this.listOpen ? 'true' : 'false'}
              aria-label=${this.t('presence.more', { count: extra })}
              @click=${() => (this.listOpen = !this.listOpen)}
            >+${extra}</button>`
          : nothing
      }
    </div>
    ${
      extra > 0
        ? html`<tessera-popover
            .open=${this.listOpen}
            .anchor=${this.renderRoot.querySelector('#more')}
            panel-role="dialog"
            @popover-close=${() => (this.listOpen = false)}
          >
            <ul class="list" part="list" aria-label=${this.t('presence.label')}>
              ${people.map(
                (u) => html`<li>
                  <tessera-avatar size="sm" name=${u.name} .src=${u.avatarUrl} .color=${u.color}></tessera-avatar>
                  <span>${u.name}${u.location ? html`<span class="location">${u.location}</span>` : nothing}</span>
                  <span class="status">${this.#statusLabel(u.status)}</span>
                </li>`,
              )}
            </ul>
          </tessera-popover>`
        : nothing
    }`;
  }
}
