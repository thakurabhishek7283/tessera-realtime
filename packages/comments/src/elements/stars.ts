import { baseStyles, focusRing, TesseraElement } from '@tessera-kit/elements';
import { type CSSResultGroup, css, html, nothing, type PropertyDeclarations } from 'lit';
import { version } from '../version.js';

const STAR = 'M12 3.6l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9 6.8 19.7l1-5.8L3.5 9.8l5.9-.8z';

/**
 * Five stars, either to show a rating (`readonly`) or to choose one. As an input it is a radio
 * group: arrow keys move and choose, and pressing the chosen star again clears the rating.
 *
 * @fires rating-change - `{ rating }` (`undefined` when cleared)
 * @csspart star
 */
export class TesseraStarRating extends TesseraElement {
  static override tesseraVersion: string = version;

  static override properties: PropertyDeclarations = {
    value: { type: Number },
    readonly: { type: Boolean, reflect: true },
    label: {},
    size: {},
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    focusRing,
    css`
      :host {
        display: inline-flex;
        --_star: var(--tessera-comments-star, var(--tessera-color-warning));
      }
      .stars {
        display: inline-flex;
        gap: 2px;
      }
      svg {
        width: var(--tessera-star-size, 1.1rem);
        height: var(--tessera-star-size, 1.1rem);
        fill: none;
        stroke: var(--_star);
        stroke-width: 1.8;
        stroke-linejoin: round;
      }
      svg[data-on] {
        fill: var(--_star);
      }
      button {
        display: inline-flex;
        padding: 2px;
        background: none;
        border: 0;
        border-radius: var(--tessera-radius-sm);
        cursor: pointer;
      }
      button:hover svg {
        fill: var(--_star);
        fill-opacity: 0.4;
      }
    `,
  ];

  protected readonly featureId: string | null = null;

  /** 1–5, or 0 / `undefined` for no rating. */
  value: number | undefined;
  readonly = false;
  /** Accessible name of the input. */
  label: string | undefined;

  #set(next: number | undefined): void {
    this.value = next;
    this.emit('rating-change', { rating: next });
  }

  #onKey = (event: KeyboardEvent): void => {
    const current = this.value ?? 0;
    let next: number | undefined;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = Math.min(5, current + 1);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown')
      next = Math.max(1, current - 1);
    else if (event.key === 'Home') next = 1;
    else if (event.key === 'End') next = 5;
    else if (event.key === 'Escape' || event.key === 'Backspace') next = undefined;
    else return;
    event.preventDefault();
    this.#set(next);
    void this.updateComplete.then(() =>
      this.renderRoot.querySelector<HTMLElement>('button[tabindex="0"]')?.focus(),
    );
  };

  protected override render(): unknown {
    const value = this.value ?? 0;
    const star = (on: boolean) =>
      html`<svg viewBox="0 0 24 24" aria-hidden="true" ?data-on=${on}><path d=${STAR}></path></svg>`;
    if (this.readonly) {
      return html`<span class="stars" role="img" aria-label=${this.label ?? this.t('comments.rating.value', { rating: value })}>
        ${[1, 2, 3, 4, 5].map((n) => star(n <= value))}
      </span>`;
    }
    return html`<span class="stars" role="radiogroup" aria-label=${this.label ?? this.t('comments.rating.label')} @keydown=${this.#onKey}>
      ${[1, 2, 3, 4, 5].map(
        (n) => html`<button
          part="star"
          type="button"
          role="radio"
          aria-checked=${n === value ? 'true' : 'false'}
          aria-label=${this.t('comments.rating.star', { count: n })}
          tabindex=${n === (value || 1) ? '0' : '-1'}
          @click=${() => this.#set(n === value ? undefined : n)}
        >${star(n <= value)}</button>`,
      )}
      ${value === 0 ? nothing : html`<span class="visually" hidden>${this.t('comments.rating.value', { rating: value })}</span>`}
    </span>`;
  }
}
