import { baseStyles, focusRing, TesseraElement, toast } from '@tessera-kit/elements';
import { type CSSResultGroup, css, html, nothing, type PropertyDeclarations } from 'lit';
import { previewText } from '../messages.js';
import type { ChatApi, Conversation } from '../types.js';
import { version } from '../version.js';
import { conversationTitle } from './titles.js';

/**
 * `<tessera-inbox>`: the list of conversations with unread badges next to the selected
 * conversation. On narrow containers it shows the list or the conversation, one at a time.
 *
 * @fires conversation-select - `{ id }` when a conversation is chosen
 * @csspart list @csspart item @csspart detail
 */
export class TesseraInboxElement extends TesseraElement {
  static override tesseraVersion: string = version;

  static override properties: PropertyDeclarations = {
    conversation: { attribute: 'conversation' },
    view: { state: true },
    userId: { state: true },
    busy: { state: true },
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    focusRing,
    css`
      :host {
        display: block;
        container-type: inline-size;
        height: var(--tessera-chat-height, 32rem);
        background: var(--tessera-color-bg);
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-lg);
        overflow: hidden;
      }
      .root {
        display: grid;
        grid-template-columns: 17rem minmax(0, 1fr);
        height: 100%;
      }
      nav {
        display: flex;
        flex-direction: column;
        min-height: 0;
        border-inline-end: 1px solid var(--tessera-color-border);
        background: var(--tessera-color-surface);
      }
      ul {
        flex: 1;
        margin: 0;
        padding: var(--tessera-space-1);
        list-style: none;
        overflow-y: auto;
      }
      .item {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        gap: 0 var(--tessera-space-2);
        align-items: center;
        width: 100%;
        padding: var(--tessera-space-2);
        font: inherit;
        text-align: start;
        color: var(--tessera-color-text);
        background: transparent;
        border: 0;
        border-radius: var(--tessera-radius-md);
        cursor: pointer;
      }
      .item:hover,
      .item[aria-current='true'] {
        background: var(--tessera-color-surface-2);
      }
      .item tessera-avatar {
        grid-row: span 2;
      }
      .title {
        font-weight: 700;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .when {
        font-size: var(--tessera-font-size-xs);
        color: var(--tessera-color-text-muted);
      }
      .preview {
        grid-column: 2 / span 2;
        font-size: var(--tessera-font-size-sm);
        color: var(--tessera-color-text-muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .item[data-unread] .preview {
        color: var(--tessera-color-text);
        font-weight: 600;
      }
      .direct {
        display: flex;
        gap: var(--tessera-space-1);
        padding: var(--tessera-space-2);
        border-block-start: 1px solid var(--tessera-color-border);
      }
      .direct input {
        flex: 1;
        min-width: 0;
        min-height: 32px;
        font: inherit;
        font-size: var(--tessera-font-size-sm);
        color: var(--tessera-color-text);
        background: var(--tessera-color-bg);
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-md);
        padding: 0 var(--tessera-space-2);
      }
      .detail {
        display: flex;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
      }
      .detail tessera-chat {
        flex: 1;
        --tessera-chat-height: 100%;
        border: 0;
        border-radius: 0;
      }
      .back {
        display: none;
        padding: var(--tessera-space-1) var(--tessera-space-2);
        border-block-end: 1px solid var(--tessera-color-border);
      }
      .empty {
        display: grid;
        place-items: center;
        height: 100%;
        padding: var(--tessera-space-6);
        text-align: center;
        color: var(--tessera-color-text-muted);
      }
      @container (max-width: 36rem) {
        .root {
          grid-template-columns: minmax(0, 1fr);
        }
        .root[data-view='detail'] nav,
        .root[data-view='list'] .detail {
          display: none;
        }
        .back {
          display: block;
        }
      }
    `,
  ];

  protected readonly featureId: string | null = 'chat';

  /** The selected conversation id. Settable, and updated when the user picks one. */
  conversation: string | undefined;
  view: 'list' | 'detail' = 'list';
  userId = '';
  busy = false;

  get #api(): ChatApi | undefined {
    return this.ctx.services.get('chat');
  }

  #select(id: string): void {
    this.conversation = id;
    this.view = 'detail';
    this.emit('conversation-select', { id });
  }

  async #openDirect(event: Event): Promise<void> {
    event.preventDefault();
    const id = this.userId.trim();
    const api = this.#api;
    if (!api || !id || this.busy) return;
    this.busy = true;
    try {
      const controller = await api.openDirect(id);
      const opened = controller.id;
      controller.close();
      this.userId = '';
      this.#select(opened);
    } catch (error) {
      toast(this.ctx, {
        kind: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.busy = false;
    }
  }

  #preview(c: Conversation, selfId: string | undefined): string {
    const last = c.lastMessage;
    if (!last) return this.t('chat.inbox.noPreview');
    if (last.deletedAt) return this.t('chat.deleted');
    const text = previewText(last) || (last.attachments[0]?.name ?? '');
    return last.authorId === selfId ? `${this.t('chat.you')}: ${text}` : text;
  }

  protected override renderFeature(): unknown {
    const api = this.#api;
    if (!api) return nothing;
    const list = this.observe(api.conversations);
    const self = this.ctx.auth.getUser()?.id;
    const selected = this.conversation ?? (this.view === 'detail' ? list[0]?.id : undefined);
    return html`<div class="root" data-view=${this.view}>
      <nav aria-label=${this.t('chat.inbox.label')}>
        ${
          list.length === 0
            ? html`<p class="empty">${this.t('chat.inbox.empty')}</p>`
            : html`<ul part="list">
                ${list.map((c) => {
                  const title = conversationTitle(c, self, api, this.t('chat.direct'));
                  return html`<li>
                    <button class="item" part="item" type="button" ?data-unread=${c.unread > 0} aria-current=${c.id === selected ? 'true' : 'false'} @click=${() => this.#select(c.id)}>
                      <tessera-avatar size="sm" name=${title}></tessera-avatar>
                      <span class="title">${title}</span>
                      <span class="when">${c.lastMessage ? this.ctx.i18n.formatRelative(c.lastMessage.createdAt, this.ctx.clock.now()) : ''}</span>
                      <span class="preview">${this.#preview(c, self)}</span>
                      ${c.unread > 0 ? html`<tessera-badge count=${c.unread} aria-label=${this.t('chat.unread', { count: c.unread })}></tessera-badge>` : nothing}
                    </button>
                  </li>`;
                })}
              </ul>`
        }
        ${
          api.config.directMessages
            ? html`<form class="direct" @submit=${(e: Event) => void this.#openDirect(e)}>
                <input aria-label=${this.t('chat.inbox.userId')} placeholder=${this.t('chat.inbox.newDirect')} .value=${this.userId} @input=${(e: Event) => (this.userId = (e.target as HTMLInputElement).value)} />
                <tessera-button size="sm" type="submit" ?loading=${this.busy}>${this.t('chat.inbox.open')}</tessera-button>
              </form>`
            : nothing
        }
      </nav>
      <div class="detail" part="detail">
        <div class="back"><tessera-button size="sm" variant="ghost" @click=${() => (this.view = 'list')}>← ${this.t('chat.inbox.back')}</tessera-button></div>
        ${
          selected
            ? html`<tessera-chat conversation=${selected}></tessera-chat>`
            : html`<p class="empty">${this.t('chat.inbox.select')}</p>`
        }
      </div>
    </div>`;
  }
}
