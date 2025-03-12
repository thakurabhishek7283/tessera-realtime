import { baseStyles, focusRing, TesseraElement } from '@tessera/elements';
import { type CSSResultGroup, css, html, type PropertyDeclarations } from 'lit';
import { EMOJI_GROUPS } from '../emoji.js';

const COLUMNS = 8;

/**
 * A small emoji grid with a tab per group. Arrow keys move through the grid.
 *
 * @fires emoji-select - `{ emoji }`
 * @csspart grid @csspart tab
 */
export class TesseraEmojiPicker extends TesseraElement {
  static override properties: PropertyDeclarations = {
    group: { state: true },
    cursor: { state: true },
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    focusRing,
    css`
      :host {
        display: block;
        width: 17rem;
      }
      .tabs {
        display: flex;
        gap: 2px;
        padding-block-end: var(--tessera-space-1);
        border-block-end: 1px solid var(--tessera-color-border);
      }
      .tab,
      .cell {
        font: inherit;
        background: none;
        border: 0;
        border-radius: var(--tessera-radius-sm);
        cursor: pointer;
      }
      .tab {
        flex: 1;
        height: 30px;
        font-size: 1.1rem;
        opacity: 0.7;
      }
      .tab[aria-selected='true'] {
        opacity: 1;
        background: var(--tessera-color-surface-2);
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(${COLUMNS}, 1fr);
        gap: 2px;
        padding-block-start: var(--tessera-space-1);
      }
      .cell {
        height: 30px;
        font-size: 1.25rem;
      }
      .cell:hover {
        background: var(--tessera-color-surface-2);
      }
    `,
  ];

  protected readonly featureId: string | null = null;

  group = 0;
  cursor = 0;

  focusGrid(): void {
    this.renderRoot.querySelector<HTMLElement>('.cell[tabindex="0"]')?.focus();
  }

  #move(event: KeyboardEvent, count: number): void {
    const step: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: COLUMNS,
      ArrowUp: -COLUMNS,
    };
    let next = this.cursor;
    if (event.key in step) next += step[event.key] as number;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = count - 1;
    else return;
    event.preventDefault();
    this.cursor = Math.min(count - 1, Math.max(0, next));
    void this.updateComplete.then(() => this.focusGrid());
  }

  protected override render(): unknown {
    const current = EMOJI_GROUPS[this.group] ?? EMOJI_GROUPS[0];
    if (!current) return null;
    return html`
      <div class="tabs" role="tablist" aria-label=${this.t('chat.emoji.picker')}>
        ${EMOJI_GROUPS.map(
          (g, i) => html`<button
            class="tab"
            part="tab"
            type="button"
            role="tab"
            aria-selected=${i === this.group ? 'true' : 'false'}
            aria-label=${this.t(`chat.emoji.group.${g.id}`)}
            title=${this.t(`chat.emoji.group.${g.id}`)}
            @click=${() => {
              this.group = i;
              this.cursor = 0;
            }}
          >${g.icon}</button>`,
        )}
      </div>
      <div class="grid" part="grid" role="group" aria-label=${this.t(`chat.emoji.group.${current.id}`)} @keydown=${(e: KeyboardEvent) => this.#move(e, current.emojis.length)}>
        ${current.emojis.map(
          (emoji, i) => html`<button
            class="cell"
            type="button"
            tabindex=${i === this.cursor ? '0' : '-1'}
            @click=${() => this.emit('emoji-select', { emoji })}
          >${emoji}</button>`,
        )}
      </div>
    `;
  }
}
