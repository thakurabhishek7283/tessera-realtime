import { baseStyles, TesseraElement } from '@tessera-kit/elements';
import { type CSSResultGroup, css, html, nothing, type PropertyDeclarations } from 'lit';
import type { CommentsApi } from '../types.js';

/**
 * `<tessera-comment-count target="card-7">`: a small badge with the number of comments, for lists.
 * It keeps itself up to date and is hidden at zero unless `show-zero` is set.
 *
 * @csspart badge
 */
export class TesseraCommentCount extends TesseraElement {
  static override properties: PropertyDeclarations = {
    target: { attribute: 'target' },
    showZero: { type: Boolean, attribute: 'show-zero' },
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    css`
      :host {
        display: inline-flex;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 0 var(--tessera-space-2);
        min-height: 22px;
        font-size: var(--tessera-font-size-xs);
        color: var(--tessera-color-text-muted);
        background: var(--tessera-color-surface-2);
        border-radius: var(--tessera-radius-full);
      }
    `,
  ];

  protected readonly featureId: string | null = 'comments';

  target: string | undefined;
  showZero = false;

  #store: ReturnType<CommentsApi['count']> | undefined;
  #key: string | undefined;

  protected override renderFeature(): unknown {
    const api: CommentsApi | undefined = this.ctx.services.get('comments');
    if (!api || !this.target) return nothing;
    const key = `${this.target}`;
    if (key !== this.#key) {
      this.#key = key;
      this.#store = api.count(this.target);
    }
    const count = this.#store ? this.observe(this.#store) : 0;
    if (count === 0 && !this.showZero) return nothing;
    return html`<span class="badge" part="badge" role="img" aria-label=${this.t('comments.count', { count })}>
      <tessera-icon name="message"></tessera-icon><span aria-hidden="true">${count}</span>
    </span>`;
  }
}
