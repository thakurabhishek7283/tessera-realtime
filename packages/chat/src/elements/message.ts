import type { UserInfo } from '@tessera/core';
import { baseStyles, focusRing, TesseraElement, visuallyHidden } from '@tessera/elements';
import { type CSSResultGroup, css, html, nothing, type PropertyDeclarations } from 'lit';
import { QUICK_REACTIONS } from '../emoji.js';
import { previewText } from '../messages.js';
import type { Attachment, Message } from '../types.js';
import { linkify, timeLabel } from '../ui-util.js';
import { richAvailable } from './editor-bridge.js';

export type MessageAction = 'react' | 'reply' | 'edit' | 'delete' | 'copy' | 'retry' | 'jump';

export interface MessageActionDetail {
  action: MessageAction;
  message: Message;
  emoji?: string;
}

export interface MessageFeatures {
  reactions: boolean;
  replies: boolean;
  edit: boolean;
  delete: boolean;
  linkify: boolean;
  readReceipts: boolean;
  timestamps: 'relative' | 'absolute';
}

const isImage = (a: Attachment): boolean => a.mime.startsWith('image/');
const formatSize = (bytes: number): string =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(0)} kB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/**
 * One message: author, time, body, attachments, reactions, status and the hover toolbar.
 * Used by `<tessera-chat>`; it only reports what the user asked for and changes nothing itself.
 *
 * @fires message-action - `{ action, message, emoji? }`
 * @csspart message @csspart bubble @csspart author @csspart time @csspart body @csspart reactions
 * @csspart attachments @csspart actions
 */
export class TesseraChatMessage extends TesseraElement {
  static override properties: PropertyDeclarations = {
    message: { attribute: false },
    selfId: { attribute: false },
    compact: { type: Boolean, reflect: true },
    features: { attribute: false },
    parent: { attribute: false },
    seenBy: { attribute: false },
    seenLabel: { attribute: false },
    now: { attribute: false },
    readonly: { type: Boolean },
    reacting: { state: true },
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    focusRing,
    visuallyHidden,
    css`
      :host {
        display: block;
        padding-inline: var(--tessera-space-3);
      }
      :host([compact]) .meta {
        display: none;
      }
      article {
        position: relative;
        display: flex;
        gap: var(--tessera-space-2);
        padding-block: 2px;
      }
      article:focus-visible {
        outline: 2px solid var(--tessera-color-focus-ring);
        outline-offset: 2px;
        border-radius: var(--tessera-radius-md);
      }
      .gutter {
        width: 28px;
        flex: none;
        padding-block-start: 2px;
      }
      .col {
        min-width: 0;
        max-width: min(36rem, 100%);
        display: flex;
        flex-direction: column;
        align-items: flex-start;
      }
      :host([own]) article {
        flex-direction: row-reverse;
      }
      :host([own]) .col {
        align-items: flex-end;
      }
      .meta {
        display: flex;
        align-items: baseline;
        gap: var(--tessera-space-2);
        font-size: var(--tessera-font-size-xs);
        color: var(--tessera-color-text-muted);
        padding-inline: var(--tessera-space-1);
      }
      .author {
        font-weight: 700;
        color: var(--tessera-color-text);
      }
      .bubble {
        position: relative;
        max-width: 100%;
        padding: var(--tessera-space-2) var(--tessera-space-3);
        border-radius: var(--tessera-radius-lg);
        background: var(--tessera-color-surface-2);
        color: var(--tessera-color-text);
        overflow-wrap: anywhere;
      }
      :host([own]) .bubble {
        background: var(--tessera-color-primary);
        color: var(--tessera-color-primary-contrast);
      }
      :host([own]) .bubble a {
        color: inherit;
      }
      .bubble[data-deleted] {
        background: transparent;
        border: 1px dashed var(--tessera-color-border);
        color: var(--tessera-color-text-muted);
        font-style: italic;
      }
      .text {
        white-space: pre-wrap;
      }
      .text a {
        color: inherit;
        text-decoration: underline;
      }
      .reply {
        display: block;
        max-width: 100%;
        margin-block-end: var(--tessera-space-1);
        padding: 2px var(--tessera-space-2);
        font: inherit;
        font-size: var(--tessera-font-size-xs);
        text-align: start;
        color: inherit;
        background: rgb(127 127 127 / 0.18);
        border: 0;
        border-inline-start: 3px solid currentColor;
        border-radius: var(--tessera-radius-sm);
        cursor: pointer;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .attachments {
        display: flex;
        flex-wrap: wrap;
        gap: var(--tessera-space-2);
        margin-block-start: var(--tessera-space-2);
      }
      .attachments img {
        display: block;
        max-width: min(18rem, 100%);
        max-height: 14rem;
        border-radius: var(--tessera-radius-md);
        background: var(--tessera-color-surface);
      }
      .file {
        display: inline-flex;
        align-items: center;
        gap: var(--tessera-space-2);
        padding: var(--tessera-space-1) var(--tessera-space-2);
        border-radius: var(--tessera-radius-md);
        background: var(--tessera-color-bg);
        color: var(--tessera-color-text);
        font-size: var(--tessera-font-size-sm);
        text-decoration: none;
        border: 1px solid var(--tessera-color-border);
      }
      .reactions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--tessera-space-1);
        margin-block-start: var(--tessera-space-1);
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        min-height: 24px;
        padding: 0 var(--tessera-space-2);
        font: inherit;
        font-size: var(--tessera-font-size-xs);
        color: var(--tessera-color-text);
        background: var(--tessera-color-bg);
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-full);
        cursor: pointer;
      }
      .chip[aria-pressed='true'] {
        border-color: var(--tessera-color-primary);
        background: var(--tessera-color-surface);
        font-weight: 700;
      }
      .muted {
        color: var(--tessera-color-text-muted);
      }
      .status {
        display: flex;
        align-items: center;
        gap: var(--tessera-space-2);
        margin-block-start: 2px;
        font-size: var(--tessera-font-size-xs);
        color: var(--tessera-color-text-muted);
      }
      .status[data-failed] {
        color: var(--tessera-color-danger);
      }
      .status button {
        font: inherit;
        color: inherit;
        background: none;
        border: 0;
        padding: 0;
        text-decoration: underline;
        cursor: pointer;
      }
      progress {
        width: 5rem;
        height: 6px;
      }
      .seen {
        display: inline-flex;
        align-items: center;
        gap: 2px;
      }
      .actions {
        position: absolute;
        inset-block-start: -14px;
        inset-inline-end: var(--tessera-space-3);
        display: flex;
        align-items: center;
        gap: 2px;
        padding: 2px;
        background: var(--tessera-color-bg);
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-md);
        box-shadow: var(--tessera-shadow-sm);
        opacity: 0;
        pointer-events: none;
        transition: opacity var(--tessera-motion-duration);
        z-index: 2;
      }
      :host([own]) .actions {
        inset-inline-end: auto;
        inset-inline-start: var(--tessera-space-3);
      }
      article:hover .actions,
      article:focus-within .actions,
      .actions[data-open] {
        opacity: 1;
        pointer-events: auto;
      }
      @media (hover: none) {
        .actions {
          opacity: 1;
          pointer-events: auto;
        }
      }
      .quick {
        display: flex;
        gap: 2px;
      }
      .quick button {
        font-size: 1.1rem;
        width: 30px;
        height: 30px;
        background: none;
        border: 0;
        border-radius: var(--tessera-radius-sm);
        cursor: pointer;
      }
      .quick button:hover {
        background: var(--tessera-color-surface-2);
      }
    `,
  ];

  protected readonly featureId: string | null = 'chat';

  message: Message | undefined;
  selfId = '';
  compact = false;
  features: MessageFeatures = {
    reactions: true,
    replies: true,
    edit: true,
    delete: true,
    linkify: true,
    readReceipts: true,
    timestamps: 'relative',
  };
  /** The message this one replies to, if loaded. */
  parent: Message | undefined;
  /** People whose last read message is this one. */
  seenBy: UserInfo[] = [];
  /** Wording of the "seen" label chosen by the list (direct vs room). */
  seenLabel: 'seen' | 'seenBy' = 'seenBy';
  /** Current time, set by the list so relative times refresh together. */
  now = Date.now();
  readonly = false;
  reacting = false;

  protected override willUpdate(changed: Map<PropertyKey, unknown>): void {
    super.willUpdate(changed);
    this.toggleAttribute('own', !!this.message && this.message.authorId === this.selfId);
  }

  #act(action: MessageAction, emoji?: string): void {
    if (!this.message) return;
    this.reacting = false;
    this.emit<MessageActionDetail>('message-action', {
      action,
      message: this.message,
      ...(emoji ? { emoji } : {}),
    });
  }

  #time(m: Message): unknown {
    const absolute = new Date(m.createdAt).toLocaleString(this.ctx.i18n.locale);
    const label =
      this.features.timestamps === 'relative' && this.now - Date.parse(m.createdAt) < 86_400_000
        ? this.ctx.i18n.formatRelative(m.createdAt, this.now)
        : timeLabel(m.createdAt, this.ctx.i18n.locale);
    return html`<time part="time" datetime=${m.createdAt} title=${absolute}>${label}</time>`;
  }

  #renderText(text: string): unknown {
    if (!this.features.linkify) return text;
    return linkify(text).map((p) =>
      p.href
        ? html`<a href=${p.href} target="_blank" rel="noopener noreferrer nofollow">${p.text}</a>`
        : p.text,
    );
  }

  #renderBody(m: Message): unknown {
    if (m.deletedAt) return this.t('chat.deleted');
    if (m.body.type === 'text')
      return html`<span class="text">${this.#renderText(m.body.text)}</span>`;
    // Rich bodies are sanitized by the editor kit's own renderer; without it, show the plain text.
    return richAvailable(this.ctx)
      ? html`<tessera-rich-text .doc=${m.body.doc}></tessera-rich-text>`
      : html`<span class="text">${previewText(m)}</span>`;
  }

  #renderAttachments(m: Message): unknown {
    if (m.attachments.length === 0) return nothing;
    return html`<div class="attachments" part="attachments">
      ${m.attachments.map((a) =>
        isImage(a)
          ? html`<a href=${a.url} target="_blank" rel="noopener noreferrer" aria-label=${this.t('chat.attachment.open', { name: a.name })}><img src=${a.url} alt=${a.name} loading="lazy" width=${a.width ?? nothing} height=${a.height ?? nothing} /></a>`
          : html`<a class="file" href=${a.url} target="_blank" rel="noopener noreferrer" download=${a.name}><tessera-icon name="file"></tessera-icon>${a.name}<span class="muted">${formatSize(a.size)}</span></a>`,
      )}
    </div>`;
  }

  #renderReactions(m: Message): unknown {
    const entries = Object.entries(m.reactions);
    if (!this.features.reactions || entries.length === 0) return nothing;
    return html`<div class="reactions" part="reactions" role="group" aria-label=${this.t('chat.react')}>
      ${entries.map(([emoji, users]) => {
        const mine = users.includes(this.selfId);
        return html`<button
          class="chip"
          type="button"
          aria-pressed=${mine ? 'true' : 'false'}
          aria-label=${this.t('chat.reaction', { emoji, count: users.length, names: users.join(', ') })}
          ?disabled=${this.readonly}
          @click=${() => this.#act('react', emoji)}
        ><span aria-hidden="true">${emoji}</span><span aria-hidden="true">${users.length}</span></button>`;
      })}
    </div>`;
  }

  #renderStatus(m: Message): unknown {
    if (m.status === 'sending') {
      return html`<div class="status" role="status">
        ${this.t('chat.sending')}
        ${m.progress !== undefined ? html`<progress max="1" .value=${m.progress} aria-label=${this.t('chat.sending')}></progress>` : nothing}
      </div>`;
    }
    if (m.status === 'failed') {
      return html`<div class="status" data-failed role="alert">
        ${this.t('chat.failed')}
        <button type="button" @click=${() => this.#act('retry')}>${this.t('chat.retry')}</button>
      </div>`;
    }
    if (this.features.readReceipts && this.seenBy.length > 0) {
      const names = this.seenBy.map((u) => u.name).join(', ');
      return html`<div class="status">
        <span class="seen" title=${names}>
          ${this.seenBy.slice(0, 3).map((u) => html`<tessera-avatar size="sm" style="--_size:14px" name=${u.name} .src=${u.avatarUrl} .color=${u.color}></tessera-avatar>`)}
          ${this.seenLabel === 'seen' ? this.t('chat.seen') : this.t('chat.seenBy', { names })}
        </span>
      </div>`;
    }
    return nothing;
  }

  #renderActions(m: Message): unknown {
    if (this.readonly || m.deletedAt || m.status === 'sending' || m.status === 'failed')
      return nothing;
    const own = m.authorId === this.selfId;
    const moderator = this.ctx.auth.getUser()?.roles?.includes('moderator') ?? false;
    const f = this.features;
    return html`<div class="actions" part="actions" role="toolbar" aria-label=${this.t('chat.actions')} ?data-open=${this.reacting}>
      ${
        this.reacting
          ? html`<div class="quick" role="group" aria-label=${this.t('chat.react')}>
              ${QUICK_REACTIONS.map((e) => html`<button type="button" aria-label=${e} @click=${() => this.#act('react', e)}>${e}</button>`)}
            </div>`
          : nothing
      }
      ${f.reactions ? html`<tessera-icon-button size="sm" icon="smile" label=${this.t('chat.react')} aria-expanded=${this.reacting ? 'true' : 'false'} @click=${() => (this.reacting = !this.reacting)}></tessera-icon-button>` : nothing}
      ${f.replies ? html`<tessera-icon-button size="sm" icon="reply" label=${this.t('chat.reply')} @click=${() => this.#act('reply')}></tessera-icon-button>` : nothing}
      <tessera-icon-button size="sm" icon="copy" label=${this.t('chat.copy')} @click=${() => this.#act('copy')}></tessera-icon-button>
      ${own && f.edit ? html`<tessera-icon-button size="sm" icon="edit" label=${this.t('chat.edit')} @click=${() => this.#act('edit')}></tessera-icon-button>` : nothing}
      ${(own || moderator) && f.delete ? html`<tessera-icon-button size="sm" icon="trash" label=${this.t('chat.delete')} @click=${() => this.#act('delete')}></tessera-icon-button>` : nothing}
    </div>`;
  }

  protected override renderFeature(): unknown {
    const m = this.message;
    if (!m) return nothing;
    const own = m.authorId === this.selfId;
    const parentText = this.parent
      ? `${this.parent.authorName}: ${previewText(this.parent)}`
      : undefined;
    return html`<article
      part="message"
      id=${`m-${m.clientId && m.status ? m.clientId : m.id}`}
      tabindex="-1"
      aria-label=${`${own ? this.t('chat.you') : m.authorName}, ${timeLabel(m.createdAt, this.ctx.i18n.locale)}`}
    >
      <div class="gutter">
        ${own || this.compact ? nothing : html`<tessera-avatar size="sm" name=${m.authorName} .src=${m.authorAvatarUrl}></tessera-avatar>`}
      </div>
      <div class="col">
        <div class="meta">
          ${own ? nothing : html`<span class="author" part="author">${m.authorName}</span>`}
          ${this.#time(m)}
          ${m.editedAt && !m.deletedAt ? html`<span>(${this.t('chat.edited')})</span>` : nothing}
        </div>
        <div class="bubble" part="bubble" ?data-deleted=${!!m.deletedAt}>
          ${
            m.replyTo && !m.deletedAt
              ? html`<button class="reply" type="button" aria-label=${this.t('chat.jumpToReply', { name: this.parent?.authorName ?? '' })} @click=${() => this.#act('jump')}>${parentText ?? '…'}</button>`
              : nothing
          }
          <div part="body">${this.#renderBody(m)}</div>
          ${this.#renderAttachments(m)}
        </div>
        ${this.#renderReactions(m)}
        ${this.#renderStatus(m)}
      </div>
      ${this.#renderActions(m)}
    </article>`;
  }
}
