import { baseStyles, focusRing, TesseraElement, toast } from '@tessera-kit/elements';
import { type CSSResultGroup, css, html, nothing, type PropertyDeclarations } from 'lit';
import { previewText } from '../messages.js';
import type { ChatApi, Conversation, ConversationController, Message } from '../types.js';
import type { ComposerSubmit, TesseraChatComposer } from './composer.js';
import { hasKit } from './editor-bridge.js';
import type { MessageActionDetail } from './message.js';
import type { TesseraMessageList } from './message-list.js';
import { conversationTitle } from './titles.js';

/**
 * `<tessera-chat conversation="general">`: one conversation, with its header, message list,
 * typing indicator and composer.
 *
 * @fires message-send - `{ message }` once the server stored a message sent from this element
 * @fires message-receive - `{ message }` for each new message from someone else
 * @fires conversation-open - `{ id }` when the conversation has loaded
 * @fires unread-change - `{ count }` when the number of unread messages changes
 * @csspart header @csspart title @csspart typing
 * @slot header-end - extra controls at the end of the header
 * @slot empty - shown when there are no messages
 */
export class TesseraChatElement extends TesseraElement {
  static override properties: PropertyDeclarations = {
    conversation: { attribute: 'conversation' },
    heading: { attribute: 'heading' },
    readonly: { type: Boolean, reflect: true },
    controller: { state: true },
    failure: { state: true },
    replyTo: { state: true },
    editing: { state: true },
    deleting: { state: true },
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    focusRing,
    css`
      :host {
        display: flex;
        flex-direction: column;
        /* A chat needs a bounded height to scroll in; set --tessera-chat-height or size the element. */
        height: var(--tessera-chat-height, 32rem);
        min-height: 12rem;
        background: var(--tessera-color-bg);
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-lg);
        overflow: hidden;
      }
      header {
        display: flex;
        align-items: center;
        gap: var(--tessera-space-3);
        padding: var(--tessera-space-3);
        border-block-end: 1px solid var(--tessera-color-border);
      }
      h2 {
        flex: 1;
        min-width: 0;
        margin: 0;
        font-size: var(--tessera-font-size-md);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      tessera-message-list {
        flex: 1;
      }
      .typing {
        min-height: 1.5em;
        padding: 0 var(--tessera-space-4) var(--tessera-space-1);
        font-size: var(--tessera-font-size-xs);
        color: var(--tessera-color-text-muted);
      }
      .state {
        flex: 1;
        display: grid;
        place-content: center;
        justify-items: center;
        gap: var(--tessera-space-3);
        padding: var(--tessera-space-6);
        text-align: center;
        color: var(--tessera-color-text-muted);
      }
      .state[role='alert'] {
        color: var(--tessera-color-danger);
      }
    `,
  ];

  protected readonly featureId: string | null = 'chat';

  /** Id of the conversation to show. Defaults to the first configured conversation. */
  conversation: string | undefined;
  /** Overrides the title taken from the conversation. */
  heading: string | undefined;
  readonly = false;
  controller: ConversationController | undefined;
  failure = '';
  replyTo: Message | undefined;
  editing: Message | undefined;
  deleting: Message | undefined;

  #opening: string | undefined;
  /** A conversation that failed to open is not retried until "Try again" or another id. */
  #failedFor: string | undefined;
  #offs: Array<() => void> = [];
  #atBottom = true;

  get #api(): ChatApi | undefined {
    return this.ctx.services.get('chat');
  }

  get #id(): string | undefined {
    return this.conversation || this.#api?.config.conversations[0]?.id;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.hasUpdated) this.requestUpdate();
    document.addEventListener('visibilitychange', this.#maybeRead);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('visibilitychange', this.#maybeRead);
    this.#teardown();
  }

  protected override updated(changed: Map<PropertyKey, unknown>): void {
    super.updated(changed);
    const api = this.#api;
    const id = this.#id;
    if (!this.enabled || !api || !id) {
      if (this.controller) this.#teardown();
      return;
    }
    if (id !== this.controller?.id && id !== this.#opening && id !== this.#failedFor) {
      void this.#open(api, id);
    }
  }

  async #open(api: ChatApi, id: string): Promise<void> {
    this.#teardown();
    this.#opening = id;
    this.#failedFor = undefined;
    this.failure = '';
    try {
      const controller = await api.openConversation(id);
      if (this.#opening !== id || !this.isConnected) {
        controller.close();
        return;
      }
      this.controller = controller;
      let unread = controller.state.get().unread;
      this.#offs.push(
        controller.state.subscribe((state) => {
          this.requestUpdate();
          if (state.unread !== unread) {
            unread = state.unread;
            this.emit('unread-change', { count: unread });
          }
          this.#maybeRead();
        }),
        this.ctx.bus.on('chat:message-received', (message) => {
          if (message.conversationId === id) this.emit('message-receive', { message });
        }),
      );
      this.emit('conversation-open', { id });
      this.#maybeRead();
    } catch (error) {
      if (this.#opening === id) {
        this.#failedFor = id;
        this.failure = error instanceof Error ? error.message : String(error);
      }
    } finally {
      if (this.#opening === id) this.#opening = undefined;
    }
  }

  #teardown(): void {
    for (const off of this.#offs.splice(0)) off();
    this.controller?.close();
    this.controller = undefined;
    this.#opening = undefined;
    this.replyTo = undefined;
    this.editing = undefined;
  }

  #maybeRead = (): void => {
    if (this.#atBottom && document.visibilityState === 'visible') this.controller?.markRead();
  };

  get #list(): TesseraMessageList | null {
    return this.renderRoot.querySelector('tessera-message-list');
  }

  get #composer(): TesseraChatComposer | null {
    return this.renderRoot.querySelector('tessera-chat-composer');
  }

  /** Focuses the message box. */
  override focus(): void {
    this.#composer?.focus();
  }

  #fail(error: unknown, key: 'chat.sendFailed' = 'chat.sendFailed'): void {
    toast(this.ctx, {
      kind: 'error',
      message: this.t(key, { message: error instanceof Error ? error.message : String(error) }),
    });
  }

  #onSubmit = (event: Event): void => {
    const controller = this.controller;
    if (!controller) return;
    const { body, files, replyTo, editing } = (event as CustomEvent<ComposerSubmit>).detail;
    this.replyTo = undefined;
    this.editing = undefined;
    if (editing) {
      controller.edit(editing, body).catch((e: unknown) => this.#fail(e));
      return;
    }
    controller
      .send(body, { attachments: files, ...(replyTo ? { replyTo } : {}) })
      .then((message) => this.emit('message-send', { message }))
      .catch((e: unknown) => this.#fail(e));
    this.#list?.scrollToEnd();
  };

  #onAction = (event: Event): void => {
    const controller = this.controller;
    const { action, message, emoji } = (event as CustomEvent<MessageActionDetail>).detail;
    if (!controller || action === 'jump') return;
    switch (action) {
      case 'react':
        if (emoji) controller.react(message.id, emoji).catch((e: unknown) => this.#fail(e));
        break;
      case 'reply':
        this.editing = undefined;
        this.replyTo = message;
        break;
      case 'edit':
        this.replyTo = undefined;
        this.editing = message;
        break;
      case 'delete':
        this.deleting = message;
        break;
      case 'retry':
        controller.retry(message.clientId).catch((e: unknown) => this.#fail(e));
        break;
      case 'copy':
        void navigator.clipboard
          ?.writeText(previewText(message))
          .then(() => toast(this.ctx, { kind: 'success', message: this.t('chat.copied') }))
          .catch(() => undefined);
        break;
    }
  };

  #editLast = (): void => {
    const self = this.ctx.auth.getUser()?.id;
    const own = this.controller?.state
      .get()
      .messages.findLast((m) => m.authorId === self && !m.deletedAt && m.status !== 'failed');
    if (own) this.editing = own;
  };

  #confirmDelete = (): void => {
    const target = this.deleting;
    this.deleting = undefined;
    if (target) this.controller?.remove(target.id).catch((e: unknown) => this.#fail(e));
  };

  #title(conversation: Conversation | undefined): string {
    if (this.heading) return this.heading;
    if (!conversation) return this.t('chat.title');
    return conversationTitle(
      conversation,
      this.ctx.auth.getUser()?.id,
      this.#api,
      this.t('chat.direct'),
    );
  }

  #typingLabel(names: string[]): string {
    const [a = '', b = '', c = ''] = names;
    if (names.length === 0) return '';
    if (names.length === 1) return this.t('chat.typing.one', { a });
    if (names.length === 2) return this.t('chat.typing.two', { a, b });
    if (names.length === 3) return this.t('chat.typing.three', { a, b, c });
    return this.t('chat.typing.many');
  }

  protected override renderFeature(): unknown {
    const api = this.#api;
    const controller = this.controller;
    if (this.failure) {
      return html`<div class="state" role="alert">
        <span>${this.t('chat.error', { message: this.failure })}</span>
        <tessera-button size="sm" @click=${() => {
          this.#failedFor = undefined;
          this.failure = '';
        }}>${this.t('chat.tryAgain')}</tessera-button>
      </div>`;
    }
    if (!api || !controller) {
      return html`<div class="state"><tessera-spinner label=${this.t('chat.loading')}></tessera-spinner></div>`;
    }
    const state = this.observe(controller.state);
    const conversation = this.observe(controller.conversation);
    const self = this.ctx.auth.getUser();
    const { features, composer } = api.config;
    const typing = features.typingIndicators ? state.typing.map((u) => u.name) : [];
    const presence = hasKit(this.ctx, 'presence', 'tessera-presence');
    return html`
      <header part="header">
        <h2 part="title" id="title">${this.#title(conversation)}</h2>
        ${presence ? html`<tessera-presence scope=${`chat:${controller.id}`} max="4"></tessera-presence>` : nothing}
        <slot name="header-end"></slot>
      </header>
      ${
        state.error && state.messages.length === 0
          ? html`<div class="state" role="alert">
              <span>${this.t('chat.error', { message: state.error })}</span>
              <tessera-button size="sm" @click=${() => {
                this.#teardown();
                this.#failedFor = undefined;
                this.requestUpdate();
              }}>${this.t('chat.tryAgain')}</tessera-button>
            </div>`
          : html`<tessera-message-list
              aria-labelledby="title"
              .stateStore=${controller.state}
              .selfId=${self?.id ?? ''}
              .features=${features}
              ?direct=${conversation.kind === 'direct'}
              ?readonly=${this.readonly}
              @load-older=${() => void controller.loadOlder().catch(() => undefined)}
              @message-action=${this.#onAction}
              @bottom-change=${(e: CustomEvent<{ atBottom: boolean }>) => {
                this.#atBottom = e.detail.atBottom;
                this.#maybeRead();
              }}
            ><slot name="empty" slot="empty"></slot></tessera-message-list>`
      }
      <div class="typing" part="typing" role="status" aria-live="polite">${this.#typingLabel(typing)}</div>
      ${
        this.readonly
          ? nothing
          : html`<tessera-chat-composer
              .options=${composer}
              .replyTo=${this.replyTo}
              .editing=${this.editing}
              @composer-submit=${this.#onSubmit}
              @composer-typing=${(e: CustomEvent<{ typing: boolean }>) => controller.setTyping(e.detail.typing)}
              @composer-cancel=${() => {
                this.replyTo = undefined;
                this.editing = undefined;
              }}
              @composer-edit-last=${this.#editLast}
            ></tessera-chat-composer>`
      }
      <tessera-dialog .open=${!!this.deleting} heading=${this.t('chat.confirmDelete.title')} @dialog-close=${() => (this.deleting = undefined)}>
        <p>${this.t('chat.confirmDelete.body')}</p>
        <tessera-button slot="footer" variant="ghost" @click=${() => (this.deleting = undefined)}>${this.t('chat.cancel')}</tessera-button>
        <tessera-button slot="footer" variant="danger" @click=${this.#confirmDelete}>${this.t('chat.confirmDelete.confirm')}</tessera-button>
      </tessera-dialog>
    `;
  }
}
