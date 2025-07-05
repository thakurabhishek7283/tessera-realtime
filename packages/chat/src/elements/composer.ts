import {
  baseStyles,
  defineElement,
  focusRing,
  TesseraElement,
  visuallyHidden,
} from '@tessera/elements';
import { type CSSResultGroup, css, html, nothing, type PropertyDeclarations } from 'lit';
import { previewText } from '../messages.js';
import type { Message, MessageBody } from '../types.js';
import { richAvailable } from './editor-bridge.js';

export interface ComposerSubmit {
  body: MessageBody;
  files: File[];
  replyTo?: string;
  /** Set when an existing message is being edited instead of a new one sent. */
  editing?: string;
}

export interface ComposerOptions {
  rich: boolean;
  maxLength: number;
  attachments: boolean;
  emoji: boolean;
  enterToSend: boolean;
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
 * The message box: auto-growing textarea (or the editor kit's `<tessera-editor>`), emoji picker,
 * attachments by button, paste or drop, and a reply or edit banner.
 *
 * @fires composer-submit - `{ body, files, replyTo?, editing? }`
 * @fires composer-typing - `{ typing }` when the box becomes empty or non-empty
 * @fires composer-cancel - Escape while replying or editing
 * @fires composer-edit-last - Arrow up in an empty box
 * @csspart box @csspart textarea @csspart send @csspart banner
 */
export class TesseraChatComposer extends TesseraElement {
  static override properties: PropertyDeclarations = {
    options: { attribute: false },
    replyTo: { attribute: false },
    editing: { attribute: false },
    disabled: { type: Boolean },
    text: { state: true },
    files: { state: true },
    pickerOpen: { state: true },
    dragging: { state: true },
    error: { state: true },
    richEmpty: { state: true },
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    focusRing,
    visuallyHidden,
    css`
      :host {
        display: block;
        padding: var(--tessera-space-3);
        border-block-start: 1px solid var(--tessera-color-border);
        background: var(--tessera-color-bg);
      }
      :host([dragging]) .box {
        border-color: var(--tessera-color-primary);
        background: var(--tessera-color-surface);
      }
      .banner {
        display: flex;
        align-items: center;
        gap: var(--tessera-space-2);
        margin-block-end: var(--tessera-space-2);
        padding: var(--tessera-space-1) var(--tessera-space-2);
        font-size: var(--tessera-font-size-sm);
        background: var(--tessera-color-surface-2);
        border-inline-start: 3px solid var(--tessera-color-primary);
        border-radius: var(--tessera-radius-sm);
      }
      .banner span {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .box {
        display: flex;
        align-items: flex-end;
        gap: var(--tessera-space-1);
        padding: var(--tessera-space-1);
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-lg);
        background: var(--tessera-color-bg);
      }
      .box:focus-within {
        border-color: var(--tessera-color-focus-ring);
        outline: 1px solid var(--tessera-color-focus-ring);
      }
      textarea {
        flex: 1;
        min-width: 0;
        min-height: 36px;
        max-height: 200px;
        padding: 8px var(--tessera-space-2);
        font: inherit;
        color: var(--tessera-color-text);
        background: transparent;
        border: 0;
        outline: 0;
        resize: none;
      }
      /* The box around it shows the focus ring. */
      textarea:focus-visible {
        outline: 0;
      }
      tessera-editor {
        flex: 1;
        min-width: 0;
      }
      .counter {
        align-self: center;
        font-size: var(--tessera-font-size-xs);
        color: var(--tessera-color-text-muted);
      }
      .counter[data-over] {
        color: var(--tessera-color-danger);
        font-weight: 700;
      }
      .files {
        display: flex;
        flex-wrap: wrap;
        gap: var(--tessera-space-1);
        margin-block-end: var(--tessera-space-2);
      }
      .file {
        display: inline-flex;
        align-items: center;
        gap: var(--tessera-space-1);
        padding: 2px var(--tessera-space-2);
        font-size: var(--tessera-font-size-sm);
        background: var(--tessera-color-surface-2);
        border-radius: var(--tessera-radius-full);
      }
      .error {
        margin: 0 0 var(--tessera-space-2);
        font-size: var(--tessera-font-size-sm);
        color: var(--tessera-color-danger);
      }
      input[type='file'] {
        display: none;
      }
    `,
  ];

  protected readonly featureId: string | null = 'chat';

  options: ComposerOptions = {
    rich: false,
    maxLength: 4000,
    attachments: true,
    emoji: true,
    enterToSend: true,
  };
  replyTo: Message | undefined;
  editing: Message | undefined;
  disabled = false;
  text = '';
  files: File[] = [];
  pickerOpen = false;
  dragging = false;
  error = '';
  richEmpty = true;

  #typing = false;
  #editorValue: unknown;

  get #rich(): boolean {
    return this.options.rich && richAvailable(this.ctx);
  }

  /** Moves focus into the box. */
  override focus(): void {
    if (this.#rich)
      (this.renderRoot.querySelector('tessera-editor') as EditorLike | null)?.editor?.focus('end');
    else this.renderRoot.querySelector<HTMLTextAreaElement>('textarea')?.focus();
  }

  protected override willUpdate(changed: Map<PropertyKey, unknown>): void {
    super.willUpdate(changed);
    if (changed.has('editing') && this.editing) {
      this.text =
        this.editing.body.type === 'text' ? this.editing.body.text : previewText(this.editing);
      this.#editorValue = this.editing.body.type === 'rich' ? this.editing.body.doc : undefined;
      this.files = [];
    }
    if (changed.has('editing') && !this.editing && changed.get('editing')) {
      this.text = '';
      this.#editorValue = undefined;
    }
  }

  protected override updated(changed: Map<PropertyKey, unknown>): void {
    super.updated(changed);
    this.toggleAttribute('dragging', this.dragging);
    const area = this.renderRoot.querySelector<HTMLTextAreaElement>('textarea');
    if (area) {
      area.style.height = 'auto';
      area.style.height = `${Math.min(area.scrollHeight, 200)}px`;
    }
    if (changed.has('editing') || changed.has('replyTo')) {
      if (this.editing || this.replyTo) this.focus();
    }
  }

  #setTyping(typing: boolean): void {
    if (typing === this.#typing) return;
    this.#typing = typing;
    this.emit('composer-typing', { typing });
  }

  #onInput = (event: Event): void => {
    this.text = (event.target as HTMLTextAreaElement).value;
    this.error = '';
    this.#setTyping(this.text.trim().length > 0);
  };

  #onKeydown = (event: KeyboardEvent): void => {
    if (event.isComposing) return;
    if (event.key === 'Enter' && !event.shiftKey && this.options.enterToSend) {
      event.preventDefault();
      this.submit();
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.submit();
    } else if (event.key === 'Escape' && (this.replyTo || this.editing)) {
      event.preventDefault();
      this.#cancel();
    } else if (event.key === 'ArrowUp' && this.text === '' && !this.editing) {
      this.emit('composer-edit-last', undefined);
    }
  };

  #cancel(): void {
    this.text = '';
    this.files = [];
    this.#setTyping(false);
    this.emit('composer-cancel', undefined);
  }

  #addFiles(list: Iterable<File>): void {
    if (!this.options.attachments) return;
    const uploads = this.ctx.uploads();
    const next = [...this.files];
    for (const file of list) {
      if (file.size > uploads.maxBytes) {
        this.error = this.t('chat.attachmentRefused', {
          name: file.name,
          message: `${Math.round(uploads.maxBytes / 1024)} kB max`,
        });
        continue;
      }
      next.push(file);
    }
    this.files = next.slice(0, 10);
  }

  #onPaste = (event: ClipboardEvent): void => {
    const files = event.clipboardData?.files;
    if (files && files.length > 0 && this.options.attachments) {
      event.preventDefault();
      this.#addFiles(files);
    }
  };

  #onDrop = (event: DragEvent): void => {
    event.preventDefault();
    this.dragging = false;
    if (event.dataTransfer?.files) this.#addFiles(event.dataTransfer.files);
  };

  #onDragOver = (event: DragEvent): void => {
    if (!this.options.attachments || !event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    this.dragging = true;
  };

  /** Sends what is in the box. Does nothing when it is empty or too long. */
  submit(): void {
    if (this.disabled) return;
    let body: MessageBody;
    if (this.#rich) {
      const doc = this.#editorValue as { content?: unknown[] } | undefined;
      if (this.richEmpty && this.files.length === 0) return;
      const el = this.renderRoot.querySelector('tessera-editor') as EditorLike | null;
      body = { type: 'rich', doc: (el?.editor?.getJSON() ?? doc ?? EMPTY_DOC) as never };
    } else {
      const text = this.text.trim();
      if (text.length === 0 && this.files.length === 0) return;
      if (this.text.length > this.options.maxLength) return;
      body = { type: 'text', text: text.length === 0 ? '📎' : text };
    }
    this.emit<ComposerSubmit>('composer-submit', {
      body,
      files: this.files,
      ...(this.replyTo ? { replyTo: this.replyTo.id } : {}),
      ...(this.editing ? { editing: this.editing.id } : {}),
    });
    this.text = '';
    this.files = [];
    this.error = '';
    this.richEmpty = true;
    this.pickerOpen = false;
    (this.renderRoot.querySelector('tessera-editor') as EditorLike | null)?.editor?.setContent(
      EMPTY_DOC,
    );
    this.#setTyping(false);
  }

  /** The picker (and its emoji list) is only downloaded when someone opens it. */
  async #togglePicker(): Promise<void> {
    if (!this.pickerOpen) {
      const { TesseraEmojiPicker } = await import('./emoji-picker.js');
      defineElement('tessera-emoji-picker', TesseraEmojiPicker);
    }
    this.pickerOpen = !this.pickerOpen;
  }

  #insertEmoji(emoji: string): void {
    const area = this.renderRoot.querySelector<HTMLTextAreaElement>('textarea');
    if (!area) return;
    const start = area.selectionStart;
    const end = area.selectionEnd;
    this.text = this.text.slice(0, start) + emoji + this.text.slice(end);
    this.pickerOpen = false;
    this.#setTyping(true);
    void this.updateComplete.then(() => {
      area.focus();
      area.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  #renderBanner(): unknown {
    const target = this.editing ?? this.replyTo;
    if (!target) return nothing;
    return html`<div class="banner" part="banner">
      <tessera-icon name=${this.editing ? 'edit' : 'reply'}></tessera-icon>
      <span>${this.editing ? this.t('chat.editing') : `${this.t('chat.replyingTo', { name: target.authorName })}: ${previewText(target)}`}</span>
      <tessera-icon-button size="sm" icon="x" label=${this.t('chat.cancel')} @click=${() => this.#cancel()}></tessera-icon-button>
    </div>`;
  }

  protected override renderFeature(): unknown {
    const rich = this.#rich;
    const { maxLength, attachments, emoji } = this.options;
    const label = this.t('chat.composer.label');
    const showCounter = !rich && this.text.length > maxLength * 0.8;
    const canSend = rich
      ? !this.richEmpty || this.files.length > 0
      : (this.text.trim().length > 0 || this.files.length > 0) && this.text.length <= maxLength;
    return html`
      ${this.#renderBanner()}
      ${this.error ? html`<p class="error" role="alert">${this.error}</p>` : nothing}
      ${this.files.length > 0 ? html`<div class="files" role="list">${this.files.map((f, i) => html`<span class="file" role="listitem">${f.name}<tessera-icon-button size="sm" icon="x" label=${this.t('chat.removeAttachment', { name: f.name })} @click=${() => (this.files = this.files.filter((_, j) => j !== i))}></tessera-icon-button></span>`)}</div>` : nothing}
      <div class="box" part="box" @paste=${this.#onPaste} @dragover=${this.#onDragOver} @dragleave=${() => (this.dragging = false)} @drop=${this.#onDrop}>
        ${
          attachments
            ? html`<tessera-icon-button icon="paperclip" label=${this.t('chat.attach')} ?disabled=${this.disabled} @click=${() => this.renderRoot.querySelector<HTMLInputElement>('input[type=file]')?.click()}></tessera-icon-button>
              <input type="file" multiple tabindex="-1" aria-hidden="true" accept=${this.ctx.uploads().accept.join(',')} @change=${(
                e: Event,
              ) => {
                const input = e.target as HTMLInputElement;
                this.#addFiles(input.files ?? []);
                input.value = '';
              }} />`
            : nothing
        }
        ${
          rich
            ? html`<tessera-editor
                toolbar="bold,italic,bullet-list,link"
                label=${label}
                placeholder=${this.t('chat.composer.placeholder')}
                .value=${this.#editorValue}
                @change=${(e: CustomEvent<{ value: { isEmpty: boolean } }>) => {
                  this.richEmpty = e.detail.value.isEmpty;
                  this.#setTyping(!e.detail.value.isEmpty);
                }}
                @keydown=${this.#onKeydown}
              ></tessera-editor>`
            : html`<textarea
                part="textarea"
                rows="1"
                aria-label=${label}
                placeholder=${this.t('chat.composer.placeholder')}
                maxlength=${maxLength + 200}
                .value=${this.text}
                ?disabled=${this.disabled}
                @input=${this.#onInput}
                @keydown=${this.#onKeydown}
                @blur=${() => this.#setTyping(false)}
              ></textarea>`
        }
        ${showCounter ? html`<span class="counter" ?data-over=${this.text.length > maxLength} aria-live="polite">${this.t('chat.counter', { count: this.text.length, max: maxLength })}</span>` : nothing}
        ${
          emoji && !rich
            ? html`<tessera-icon-button id="emoji" icon="smile" label=${this.t('chat.emoji')} aria-haspopup="dialog" aria-expanded=${this.pickerOpen ? 'true' : 'false'} ?disabled=${this.disabled} @click=${() => void this.#togglePicker()}></tessera-icon-button>
              <tessera-popover .open=${this.pickerOpen} .anchor=${this.renderRoot.querySelector('#emoji')} placement="top-end" @popover-close=${() => (this.pickerOpen = false)}>
                <tessera-emoji-picker @emoji-select=${(e: CustomEvent<{ emoji: string }>) => this.#insertEmoji(e.detail.emoji)}></tessera-emoji-picker>
              </tessera-popover>`
            : nothing
        }
        <tessera-icon-button class="send" part="send" variant="primary" icon="send" label=${this.t('chat.send')} ?disabled=${this.disabled || !canSend} @click=${() => this.submit()}></tessera-icon-button>
      </div>
    `;
  }
}
