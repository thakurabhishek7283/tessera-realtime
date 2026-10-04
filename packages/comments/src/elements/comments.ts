import {
  baseStyles,
  focusRing,
  TesseraElement,
  toast,
  visuallyHidden,
} from '@tessera-kit/elements';
import { type CSSResultGroup, css, html, nothing, type PropertyDeclarations } from 'lit';
import type { Comment, CommentNode, CommentsApi, ThreadController } from '../types.js';
import { linkify, plainText } from '../ui-util.js';
import type { ComposerSubmit } from './composer.js';
import { richAvailable, watchEditor } from './editor-bridge.js';

/**
 * `<tessera-comments target="listing-42">`: the discussion of one thing: a composer, comments
 * with replies and reactions, edit and delete for the author, and optionally star ratings with an
 * average and distribution, and a resolve toggle.
 *
 * @fires comment-add - `{ comment }`
 * @fires comment-edit - `{ id, body }`
 * @fires comment-delete - `{ id }`
 * @fires thread-resolve - `{ resolved }`
 * @csspart header @csspart summary @csspart composer @csspart comment @csspart replies @csspart actions
 * @slot empty - shown when there are no comments
 */
export class TesseraCommentsElement extends TesseraElement {
  static override properties: PropertyDeclarations = {
    target: { attribute: 'target' },
    readonly: { type: Boolean, reflect: true },
    controller: { state: true },
    failure: { state: true },
    replyingTo: { state: true },
    editing: { state: true },
    deleting: { state: true },
    reacting: { state: true },
    announcement: { state: true },
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    focusRing,
    visuallyHidden,
    css`
      :host {
        display: block;
        color: var(--tessera-color-text);
        /* Paint our own background so the tokens of the active theme always match what is behind the text. */
        background: var(--tessera-color-bg);
      }
      header {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        gap: var(--tessera-space-4);
        margin-block-end: var(--tessera-space-3);
      }
      h2 {
        flex: 1;
        margin: 0;
        font-size: var(--tessera-font-size-lg);
      }
      .summary {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: var(--tessera-space-1) var(--tessera-space-3);
        align-items: center;
        min-width: 14rem;
      }
      .average {
        grid-row: span 5;
        text-align: center;
        font-size: var(--tessera-font-size-xl);
        font-weight: 700;
        line-height: 1.1;
      }
      .average small {
        display: block;
        font-size: var(--tessera-font-size-xs);
        font-weight: 400;
        color: var(--tessera-color-text-muted);
      }
      .bar {
        display: flex;
        align-items: center;
        gap: var(--tessera-space-2);
        font-size: var(--tessera-font-size-xs);
        color: var(--tessera-color-text-muted);
      }
      .bar .track {
        flex: 1;
        height: 6px;
        min-width: 6rem;
        background: var(--tessera-color-surface-2);
        border-radius: var(--tessera-radius-full);
        overflow: hidden;
      }
      .bar .fill {
        display: block;
        height: 100%;
        background: var(--tessera-comments-star, var(--tessera-color-warning));
      }
      .banner {
        margin: 0 0 var(--tessera-space-3);
        padding: var(--tessera-space-2) var(--tessera-space-3);
        font-size: var(--tessera-font-size-sm);
        background: var(--tessera-color-surface-2);
        border-inline-start: 3px solid var(--tessera-color-success);
        border-radius: var(--tessera-radius-sm);
      }
      ol {
        margin: var(--tessera-space-4) 0 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: var(--tessera-space-4);
      }
      ol ol {
        margin-block-start: var(--tessera-space-3);
        margin-inline-start: var(--tessera-space-6);
        gap: var(--tessera-space-3);
        padding-inline-start: var(--tessera-space-3);
        border-inline-start: 2px solid var(--tessera-color-border);
      }
      article {
        display: flex;
        gap: var(--tessera-space-3);
      }
      .main {
        flex: 1;
        min-width: 0;
      }
      .meta {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: var(--tessera-space-2);
        font-size: var(--tessera-font-size-sm);
        color: var(--tessera-color-text-muted);
      }
      .author {
        font-weight: 700;
        color: var(--tessera-color-text);
      }
      .body {
        margin: var(--tessera-space-1) 0;
        overflow-wrap: anywhere;
        white-space: pre-wrap;
      }
      .body.deleted {
        color: var(--tessera-color-text-muted);
        font-style: italic;
      }
      .body a {
        color: var(--tessera-color-primary);
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--tessera-space-1);
      }
      .chip,
      .link {
        font: inherit;
        font-size: var(--tessera-font-size-xs);
        color: var(--tessera-color-text);
        cursor: pointer;
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        min-height: 24px;
        padding: 0 var(--tessera-space-2);
        background: var(--tessera-color-bg);
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-full);
      }
      .chip[aria-pressed='true'] {
        border-color: var(--tessera-color-primary);
        background: var(--tessera-color-surface);
        font-weight: 700;
      }
      .link {
        padding: 2px var(--tessera-space-2);
        color: var(--tessera-color-text-muted);
        background: none;
        border: 0;
        border-radius: var(--tessera-radius-sm);
        text-decoration: underline;
      }
      .link:hover {
        color: var(--tessera-color-text);
      }
      .picker {
        display: inline-flex;
        gap: 2px;
      }
      .picker button {
        font-size: 1.1rem;
        width: 30px;
        height: 30px;
        background: none;
        border: 0;
        border-radius: var(--tessera-radius-sm);
        cursor: pointer;
      }
      .picker button:hover {
        background: var(--tessera-color-surface-2);
      }
      .state {
        padding: var(--tessera-space-6);
        text-align: center;
        color: var(--tessera-color-text-muted);
      }
      .state[role='alert'] {
        color: var(--tessera-color-danger);
      }
      tessera-comment-composer {
        margin-block-start: var(--tessera-space-2);
      }
    `,
  ];

  protected readonly featureId: string | null = 'comments';

  /** Id of the thing being discussed. */
  target: string | undefined;
  readonly = false;
  controller: ThreadController | undefined;
  failure = '';
  replyingTo: string | undefined;
  editing: string | undefined;
  deleting: string | undefined;
  reacting: string | undefined;
  announcement = '';

  #opening: string | undefined;
  #failedFor: string | undefined;
  #offs: Array<() => void> = [];
  #known = new Set<string>();
  #offEditor: (() => void) | undefined;

  get #api(): CommentsApi | undefined {
    return this.ctx.services.get('comments');
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.hasUpdated) this.requestUpdate();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#offEditor?.();
    this.#offEditor = undefined;
    this.#teardown();
  }

  protected override updated(changed: Map<PropertyKey, unknown>): void {
    super.updated(changed);
    const api = this.#api;
    const id = this.target;
    if (this.enabled) this.#offEditor ??= watchEditor(this.ctx, () => this.requestUpdate());
    if (!this.enabled || !api || !id) {
      if (this.controller) this.#teardown();
      return;
    }
    if (id !== this.controller?.targetId && id !== this.#opening && id !== this.#failedFor) {
      void this.#open(api, id);
    }
  }

  async #open(api: CommentsApi, id: string): Promise<void> {
    this.#teardown();
    this.#opening = id;
    this.#failedFor = undefined;
    this.failure = '';
    try {
      const controller = await api.thread(id);
      if (this.#opening !== id || !this.isConnected) {
        controller.close();
        return;
      }
      this.controller = controller;
      this.#known = new Set(
        controller.state.get().comments.flatMap((c) => [c.id, ...c.replies.map((r) => r.id)]),
      );
      this.#offs.push(controller.state.subscribe((state) => this.#onState(state.comments)));
    } catch (error) {
      if (this.#opening === id) {
        this.#failedFor = id;
        this.failure = error instanceof Error ? error.message : String(error);
      }
    } finally {
      if (this.#opening === id) this.#opening = undefined;
    }
  }

  /** Announces comments from others that appear while the thread is open. */
  #onState(comments: CommentNode[]): void {
    this.requestUpdate();
    const self = this.ctx.auth.getUser()?.id;
    for (const c of comments.flatMap((n) => [n, ...n.replies])) {
      if (this.#known.has(c.id)) continue;
      this.#known.add(c.id);
      if (c.authorId !== self && !c.deletedAt) {
        this.announcement = `${c.authorName}: ${plainText(c.body)}`;
      }
    }
  }

  #teardown(): void {
    for (const off of this.#offs.splice(0)) off();
    this.controller?.close();
    this.controller = undefined;
    this.#opening = undefined;
    this.replyingTo = undefined;
    this.editing = undefined;
  }

  #fail(error: unknown): void {
    toast(this.ctx, {
      kind: 'error',
      message: this.t('comments.failed', {
        message: error instanceof Error ? error.message : String(error),
      }),
    });
  }

  #add = (event: Event, parentId?: string): void => {
    const { body, rating } = (event as CustomEvent<ComposerSubmit>).detail;
    this.replyingTo = undefined;
    this.controller
      ?.add(body, {
        ...(parentId ? { parentId } : {}),
        ...(rating !== undefined ? { rating } : {}),
      })
      .then((comment) => this.emit('comment-add', { comment }))
      .catch((e: unknown) => this.#fail(e));
  };

  #saveEdit = (event: Event, id: string): void => {
    const { body } = (event as CustomEvent<ComposerSubmit>).detail;
    this.editing = undefined;
    this.controller
      ?.edit(id, body)
      .then(() => this.emit('comment-edit', { id, body }))
      .catch((e: unknown) => this.#fail(e));
  };

  #react(id: string, emoji: string): void {
    this.reacting = undefined;
    this.controller?.react(id, emoji).catch((e: unknown) => this.#fail(e));
  }

  #confirmDelete = (): void => {
    const id = this.deleting;
    this.deleting = undefined;
    if (!id) return;
    this.controller
      ?.remove(id)
      .then(() => this.emit('comment-delete', { id }))
      .catch((e: unknown) => this.#fail(e));
  };

  #toggleResolved(resolved: boolean): void {
    this.controller
      ?.setResolved(resolved)
      .then(() => this.emit('thread-resolve', { resolved }))
      .catch((e: unknown) => this.#fail(e));
  }

  #mentions():
    | { search(query: string): Promise<Array<{ id: string; label: string }>> }
    | undefined {
    const state = this.controller?.state.get();
    if (!this.#api?.config.mentions || !state) return undefined;
    const people = new Map<string, string>();
    for (const c of state.comments.flatMap((n) => [n, ...n.replies]))
      people.set(c.authorId, c.authorName);
    return {
      search: async (query) =>
        [...people]
          .filter(([, name]) => name.toLowerCase().includes(query.toLowerCase()))
          .map(([id, label]) => ({ id, label })),
    };
  }

  // ---------- pieces ----------

  #time(c: Comment): unknown {
    const label = this.ctx.i18n.formatRelative(c.createdAt, this.ctx.clock.now());
    return html`<time datetime=${c.createdAt} title=${new Date(c.createdAt).toLocaleString(this.ctx.i18n.locale)}>${label}</time>`;
  }

  #body(c: Comment): unknown {
    if (c.deletedAt) return html`<div class="body deleted">${this.t('comments.deleted')}</div>`;
    if (c.body.type === 'rich') {
      return richAvailable(this.ctx)
        ? html`<div class="body"><tessera-rich-text .doc=${c.body.doc}></tessera-rich-text></div>`
        : html`<div class="body">${plainText(c.body)}</div>`;
    }
    return html`<div class="body">${linkify(c.body.text).map((p) => (p.href ? html`<a href=${p.href} target="_blank" rel="noopener noreferrer nofollow">${p.text}</a>` : p.text))}</div>`;
  }

  #reactions(c: Comment, config: CommentsApi['config']): unknown {
    if (config.reactions.length === 0 || c.deletedAt) return nothing;
    const self = this.ctx.auth.getUser()?.id ?? '';
    const used = Object.entries(c.reactions);
    return html`${used.map(([emoji, users]) => html`<button class="chip" type="button" aria-pressed=${users.includes(self) ? 'true' : 'false'} aria-label=${this.t('comments.reaction', { emoji, count: users.length })} ?disabled=${this.readonly} @click=${() => this.#react(c.id, emoji)}><span aria-hidden="true">${emoji}</span><span aria-hidden="true">${users.length}</span></button>`)}
      ${
        this.readonly
          ? nothing
          : this.reacting === c.id
            ? html`<span class="picker" role="group" aria-label=${this.t('comments.react')}>${config.reactions.map((e) => html`<button type="button" aria-label=${e} @click=${() => this.#react(c.id, e)}>${e}</button>`)}</span>`
            : html`<tessera-icon-button size="sm" icon="smile" label=${this.t('comments.react')} @click=${() => (this.reacting = c.id)}></tessera-icon-button>`
      }`;
  }

  #comment(c: Comment, top: boolean, config: CommentsApi['config']): unknown {
    const self = this.ctx.auth.getUser();
    const own = c.authorId === self?.id;
    const moderator = self?.roles?.includes('moderator') ?? false;
    const editingThis = this.editing === c.id;
    return html`<li>
      <article part="comment" id=${`c-${c.id}`}>
        <tessera-avatar size="sm" name=${c.authorName} .src=${c.authorAvatarUrl}></tessera-avatar>
        <div class="main">
          <div class="meta">
            <span class="author">${own ? this.t('comments.you') : c.authorName}</span>
            ${this.#time(c)}
            ${c.editedAt && !c.deletedAt ? html`<span>(${this.t('comments.edited')})</span>` : nothing}
            ${c.rating !== undefined && !c.deletedAt ? html`<tessera-star-rating readonly .value=${c.rating}></tessera-star-rating>` : nothing}
          </div>
          ${
            editingThis
              ? html`<tessera-comment-composer
                  .rich=${config.rich}
                  .initial=${c.body}
                  .mentions=${this.#mentions()}
                  submit-label=${this.t('comments.save')}
                  cancellable
                  @composer-submit=${(e: Event) => this.#saveEdit(e, c.id)}
                  @composer-cancel=${() => (this.editing = undefined)}
                ></tessera-comment-composer>`
              : this.#body(c)
          }
          ${
            editingThis || c.deletedAt
              ? nothing
              : html`<div class="actions" part="actions">
                  ${this.#reactions(c, config)}
                  ${top && config.replies && !this.readonly ? html`<button class="link" type="button" @click=${() => (this.replyingTo = this.replyingTo === c.id ? undefined : c.id)}>${this.t('comments.reply')}</button>` : nothing}
                  ${own && !this.readonly ? html`<button class="link" type="button" @click=${() => (this.editing = c.id)}>${this.t('comments.edit')}</button>` : nothing}
                  ${(own || moderator) && !this.readonly ? html`<button class="link" type="button" @click=${() => (this.deleting = c.id)}>${this.t('comments.delete')}</button>` : nothing}
                </div>`
          }
          ${
            top && this.replyingTo === c.id
              ? html`<tessera-comment-composer
                  .rich=${config.rich}
                  .mentions=${this.#mentions()}
                  placeholder=${this.t('comments.composer.reply')}
                  submit-label=${this.t('comments.submitReply')}
                  cancellable
                  @composer-submit=${(e: Event) => this.#add(e, c.id)}
                  @composer-cancel=${() => (this.replyingTo = undefined)}
                ></tessera-comment-composer>`
              : nothing
          }
        </div>
      </article>
      ${top && (c as CommentNode).replies.length > 0 ? html`<ol part="replies">${(c as CommentNode).replies.map((r) => this.#comment(r, false, config))}</ol>` : nothing}
    </li>`;
  }

  #summary(state: ReturnType<ThreadController['state']['get']>): unknown {
    const s = state.summary;
    if (!s) return nothing;
    const max = Math.max(...s.histogram, 1);
    return html`<div class="summary" part="summary" role="group" aria-label=${this.t('comments.rating.average', { average: s.average.toFixed(1), count: s.count })}>
      <div class="average" aria-hidden="true">${s.average.toFixed(1)}<tessera-star-rating readonly .value=${Math.round(s.average)}></tessera-star-rating><small>${s.count}</small></div>
      ${[5, 4, 3, 2, 1].map((stars) => {
        const count = s.histogram[stars - 1] ?? 0;
        return html`<div class="bar" aria-label=${this.t('comments.rating.bar', { count, stars })} role="img"><span aria-hidden="true">${stars}</span><span class="track" aria-hidden="true"><span class="fill" style=${`width:${(count / max) * 100}%`}></span></span><span aria-hidden="true">${count}</span></div>`;
      })}
    </div>`;
  }

  protected override renderFeature(): unknown {
    const api = this.#api;
    const controller = this.controller;
    if (this.failure) {
      return html`<div class="state" role="alert">
        <p>${this.t('comments.error', { message: this.failure })}</p>
        <tessera-button size="sm" @click=${() => {
          this.#failedFor = undefined;
          this.failure = '';
        }}>${this.t('comments.tryAgain')}</tessera-button>
      </div>`;
    }
    if (!api || !controller) {
      return html`<div class="state"><tessera-spinner label=${this.t('comments.loading')}></tessera-spinner></div>`;
    }
    const state = this.observe(controller.state);
    const { config } = api;
    const count = state.count;
    return html`
      <div class="visually-hidden" role="status" aria-live="polite">${this.announcement}</div>
      <header part="header">
        <h2>${count === 0 ? this.t('comments.title') : this.t('comments.count', { count })}</h2>
        ${this.#summary(state)}
        ${
          config.resolve && !this.readonly
            ? html`<tessera-button size="sm" variant="secondary" @click=${() => this.#toggleResolved(!state.resolved)}>${state.resolved ? this.t('comments.reopen') : this.t('comments.resolve')}</tessera-button>`
            : nothing
        }
      </header>
      ${state.resolved ? html`<p class="banner" role="status">${this.t('comments.resolved')}</p>` : nothing}
      ${
        this.readonly
          ? nothing
          : html`<tessera-comment-composer
              part="composer"
              .rich=${config.rich}
              .ratings=${config.ratings}
              .mentions=${this.#mentions()}
              @composer-submit=${(e: Event) => this.#add(e)}
            ></tessera-comment-composer>`
      }
      ${
        state.comments.length === 0 && !state.loading
          ? html`<div class="state"><slot name="empty">${this.t('comments.empty')}</slot></div>`
          : html`<ol aria-label=${this.t('comments.title')}>${state.comments.map((c) => this.#comment(c, true, config))}</ol>`
      }
      <tessera-dialog .open=${!!this.deleting} heading=${this.t('comments.confirmDelete.title')} @dialog-close=${() => (this.deleting = undefined)}>
        <p>${this.t('comments.confirmDelete.body')}</p>
        <tessera-button slot="footer" variant="ghost" @click=${() => (this.deleting = undefined)}>${this.t('comments.cancel')}</tessera-button>
        <tessera-button slot="footer" variant="danger" @click=${this.#confirmDelete}>${this.t('comments.delete')}</tessera-button>
      </tessera-dialog>
    `;
  }
}
