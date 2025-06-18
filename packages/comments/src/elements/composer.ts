import { baseStyles, focusRing, TesseraElement } from '@tessera/elements';
import { type CSSResultGroup, css, html, nothing, type PropertyDeclarations } from 'lit';
import type { CommentBody } from '../types.js';
import { plainText } from '../ui-util.js';
import { richAvailable } from './editor-bridge.js';

export interface ComposerSubmit {
  body: CommentBody;
  rating?: number;
}

interface EditorLike extends HTMLElement {
  editor?: {
    getJSON(): unknown;
    setContent(content: unknown): void;
    focus(position?: 'start' | 'end'): void;
  };
}

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

/**
 * The box for writing or editing a comment: a textarea, or the editor kit's `<tessera-editor>`
 * when rich comments are on, plus an optional star rating.
 *
 * @fires composer-submit - `{ body, rating? }`
 * @fires composer-cancel - Escape or the cancel button
 * @csspart box @csspart submit
 */
export class TesseraCommentComposer extends TesseraElement {
  static override properties: PropertyDeclarations = {
    rich: { type: Boolean },
    ratings: { type: Boolean },
    placeholder: {},
    submitLabel: { attribute: 'submit-label' },
    initial: { attribute: false },
    cancellable: { type: Boolean },
    mentions: { attribute: false },
    text: { state: true },
    rating: { state: true },
    richEmpty: { state: true },
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    focusRing,
    css`
      :host {
        display: block;
      }
      .form {
        display: grid;
        gap: var(--tessera-space-2);
      }
      textarea {
        width: 100%;
        min-height: 4.5rem;
        padding: var(--tessera-space-2) var(--tessera-space-3);
        font: inherit;
        color: var(--tessera-color-text);
        background: var(--tessera-color-bg);
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-md);
        resize: vertical;
      }
      textarea:focus-visible {
        outline: 2px solid var(--tessera-color-focus-ring);
        outline-offset: 1px;
      }
      .row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--tessera-space-2);
      }
      .row .spacer {
        flex: 1;
      }
    `,
  ];

  protected readonly featureId: string | null = 'comments';

  rich = false;
  ratings = false;
  placeholder: string | undefined;
  submitLabel: string | undefined;
  /** Existing body to edit. */
  initial: CommentBody | undefined;
  cancellable = false;
  mentions: { search(query: string): Promise<Array<{ id: string; label: string }>> } | undefined;
  text = '';
  rating: number | undefined;
  richEmpty = true;

  get #useRich(): boolean {
    return this.rich && richAvailable(this.ctx);
  }

  override focus(): void {
    if (this.#useRich)
      (this.renderRoot.querySelector('tessera-editor') as EditorLike | null)?.editor?.focus('end');
    else this.renderRoot.querySelector<HTMLTextAreaElement>('textarea')?.focus();
  }

  protected override willUpdate(changed: Map<PropertyKey, unknown>): void {
    super.willUpdate(changed);
    if (changed.has('initial') && this.initial) {
      this.text = this.initial.type === 'text' ? this.initial.text : plainText(this.initial);
      this.richEmpty = false;
    }
  }

  /** Sends what is in the box. Does nothing when it is empty. */
  submit(): void {
    let body: CommentBody;
    if (this.#useRich) {
      if (this.richEmpty) return;
      const el = this.renderRoot.querySelector('tessera-editor') as EditorLike | null;
      body = { type: 'rich', doc: (el?.editor?.getJSON() ?? EMPTY_DOC) as never };
    } else {
      const text = this.text.trim();
      if (!text) return;
      body = { type: 'text', text };
    }
    this.emit<ComposerSubmit>('composer-submit', {
      body,
      ...(this.rating !== undefined ? { rating: this.rating } : {}),
    });
    this.text = '';
    this.rating = undefined;
    this.richEmpty = true;
    (this.renderRoot.querySelector('tessera-editor') as EditorLike | null)?.editor?.setContent(
      EMPTY_DOC,
    );
  }

  #onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.submit();
    } else if (event.key === 'Escape' && this.cancellable) {
      event.preventDefault();
      this.emit('composer-cancel', undefined);
    }
  };

  protected override renderFeature(): unknown {
    const rich = this.#useRich;
    const placeholder = this.placeholder ?? this.t('comments.composer.placeholder');
    const empty = rich ? this.richEmpty : this.text.trim().length === 0;
    return html`<div class="form" part="box">
      ${
        rich
          ? html`<tessera-editor
              toolbar="bold,italic,bullet-list,link"
              label=${this.t('comments.composer.label')}
              placeholder=${placeholder}
              .value=${this.initial?.type === 'rich' ? this.initial.doc : undefined}
              .mentions=${this.mentions}
              @change=${(e: CustomEvent<{ value: { isEmpty: boolean } }>) => (this.richEmpty = e.detail.value.isEmpty)}
              @keydown=${this.#onKey}
            ></tessera-editor>`
          : html`<textarea
              aria-label=${this.t('comments.composer.label')}
              placeholder=${placeholder}
              .value=${this.text}
              @input=${(e: Event) => (this.text = (e.target as HTMLTextAreaElement).value)}
              @keydown=${this.#onKey}
            ></textarea>`
      }
      <div class="row">
        ${this.ratings ? html`<tessera-star-rating .value=${this.rating} @rating-change=${(e: CustomEvent<{ rating?: number }>) => (this.rating = e.detail.rating)}></tessera-star-rating>` : nothing}
        <span class="spacer"></span>
        ${this.cancellable ? html`<tessera-button size="sm" variant="ghost" @click=${() => this.emit('composer-cancel', undefined)}>${this.t('comments.cancel')}</tessera-button>` : nothing}
        <tessera-button part="submit" size="sm" variant="primary" ?disabled=${empty} @click=${() => this.submit()}>${this.submitLabel ?? this.t('comments.submit')}</tessera-button>
      </div>
    </div>`;
  }
}
