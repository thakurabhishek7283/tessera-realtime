import {
  baseStyles,
  focusRing,
  registerIcons,
  TesseraElement,
  toast,
  visuallyHidden,
} from '@tessera-kit/elements';
import { type CSSResultGroup, css, html, nothing, type PropertyDeclarations } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { computeGrid } from '../grid.js';
import type { CallController, CallState, DeviceKind, Participant, VideoApi } from '../types.js';

// Icons the shared set does not have.
registerIcons({
  'screen-share':
    '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4M12 12V8m0 0l-2.5 2.5M12 8l2.5 2.5"/>',
  'layout-grid':
    '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
  'layout-spotlight':
    '<rect x="4" y="4" width="16" height="11" rx="1.5"/><rect x="4" y="17.5" width="4" height="2.5" rx="0.6"/><rect x="10" y="17.5" width="4" height="2.5" rx="0.6"/><rect x="16" y="17.5" width="4" height="2.5" rx="0.6"/>',
});

const DEVICE_KINDS: DeviceKind[] = ['audioinput', 'videoinput', 'audiooutput'];
const GAP = 8;

/** Conversation ids allow fewer characters than call ids do. */
const chatId = (callId: string): string => `call:${callId.replace(/[^A-Za-z0-9_.:-]/g, '-')}`;

/**
 * `<tessera-call call-id="standup">`: a video call from device preview to leaving. With the
 * `chat` kit enabled it offers a chat panel next to the video.
 *
 * @fires call-join - `{ callId }` when you are in the call
 * @fires call-leave - `{ callId }` when you left or the call ended
 * @fires participant-join - `{ participant }`
 * @fires participant-leave - `{ participant }`
 * @fires call-error - `{ error }` with a `reason` such as `room-full` or `permission-denied`
 * @csspart stage @csspart controls @csspart prejoin
 */
export class TesseraCallElement extends TesseraElement {
  static override properties: PropertyDeclarations = {
    callId: { attribute: 'call-id' },
    autostart: { type: Boolean },
    controller: { state: true },
    chatOpen: { state: true },
    settingsOpen: { state: true },
    stage: { state: true },
    announcement: { state: true },
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    focusRing,
    visuallyHidden,
    css`
      :host {
        display: flex;
        flex-direction: column;
        height: var(--tessera-call-height, 36rem);
        min-height: 18rem;
        background: #0b1220;
        color: #fff;
        border-radius: var(--tessera-radius-lg);
        overflow: hidden;
        --tessera-color-bg: #0b1220;
        --tessera-color-text: #fff;
      }
      .center {
        flex: 1;
        display: grid;
        place-content: center;
        justify-items: center;
        gap: var(--tessera-space-3);
        padding: var(--tessera-space-6);
        text-align: center;
      }
      .center p {
        max-width: 28rem;
        margin: 0;
        color: #cbd5e1;
      }
      h2 {
        margin: 0;
        font-size: var(--tessera-font-size-xl);
      }
      .prejoin {
        flex: 1;
        display: grid;
        place-content: center;
        gap: var(--tessera-space-3);
        padding: var(--tessera-space-4);
        justify-items: center;
        overflow: auto;
      }
      .prejoin tessera-video-tile {
        width: min(28rem, 100%);
      }
      .row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: center;
        gap: var(--tessera-space-2);
      }
      .pick {
        display: grid;
        gap: 2px;
        font-size: var(--tessera-font-size-xs);
        color: #cbd5e1;
      }
      select {
        max-width: 14rem;
        min-height: 32px;
        font: inherit;
        font-size: var(--tessera-font-size-sm);
        color: #fff;
        background: #1a2540;
        border: 1px solid #7283a0;
        border-radius: var(--tessera-radius-md);
        padding: 0 var(--tessera-space-2);
      }
      .hint {
        color: #fcd34d;
        font-size: var(--tessera-font-size-sm);
        max-width: 28rem;
        text-align: center;
      }
      meter {
        width: 8rem;
        height: 6px;
      }
      .call {
        flex: 1;
        display: flex;
        min-height: 0;
      }
      .main {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .stage {
        flex: 1;
        min-height: 0;
        padding: var(--tessera-space-2);
        overflow: hidden;
      }
      .grid {
        display: grid;
        gap: ${GAP}px;
        justify-content: center;
        align-content: center;
        height: 100%;
      }
      .spot {
        display: flex;
        flex-direction: column;
        gap: ${GAP}px;
        height: 100%;
      }
      .spot .big {
        flex: 1;
        min-height: 0;
        display: grid;
        place-items: center;
      }
      .spot .big tessera-video-tile {
        height: 100%;
        max-width: 100%;
        width: auto;
      }
      .strip {
        display: flex;
        gap: ${GAP}px;
        justify-content: center;
        height: 7rem;
      }
      .strip tessera-video-tile {
        height: 100%;
        width: auto;
      }
      .controls {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--tessera-space-2);
        padding: var(--tessera-space-2) var(--tessera-space-3);
        background: #111a2e;
        border-block-start: 1px solid #1a2540;
        flex-wrap: wrap;
      }
      .controls .count {
        margin-inline-end: auto;
        font-size: var(--tessera-font-size-sm);
        color: #cbd5e1;
      }
      .controls tessera-icon-button {
        --tessera-color-text: #fff;
        background: #1a2540;
        border-radius: var(--tessera-radius-full);
      }
      .controls tessera-icon-button[data-off] {
        background: #7f1d1d;
      }
      .controls tessera-icon-button[data-on] {
        background: var(--tessera-color-primary);
        --tessera-color-text: var(--tessera-color-primary-contrast);
      }
      aside {
        width: 20rem;
        max-width: 45%;
        display: flex;
        flex-direction: column;
        border-inline-start: 1px solid #1a2540;
        --tessera-chat-height: 100%;
        --tessera-color-bg: #fff;
        --tessera-color-text: #0f172a;
      }
      aside[hidden] {
        display: none;
      }
      aside tessera-chat {
        flex: 1;
        border: 0;
        border-radius: 0;
      }
      .settings {
        position: absolute;
        inset-inline-end: var(--tessera-space-3);
        inset-block-end: 4.5rem;
        z-index: 5;
        display: grid;
        gap: var(--tessera-space-2);
        padding: var(--tessera-space-3);
        background: #111a2e;
        border: 1px solid #7283a0;
        border-radius: var(--tessera-radius-md);
        box-shadow: var(--tessera-shadow-lg);
      }
      :host {
        position: relative;
      }
    `,
  ];

  protected readonly featureId: string | null = 'video';

  /** Id of the call. Everybody with the same id is in the same call. */
  callId: string | undefined;
  /** Ask for the camera and show the preview as soon as the element appears. */
  autostart = false;
  controller: CallController | undefined;
  chatOpen = false;
  settingsOpen = false;
  stage = { width: 0, height: 0 };
  announcement = '';

  #offs: Array<() => void> = [];
  #resize: ResizeObserver | undefined;
  #observed: Element | undefined;
  #started = new WeakSet<CallController>();
  #previous: CallState | undefined;

  get #api(): VideoApi | undefined {
    return this.ctx.services.get('video');
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.hasUpdated) this.requestUpdate();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#resize?.disconnect();
    this.#resize = undefined;
    this.#observed = undefined;
    // Leaving the page must not leave the camera on.
    void this.#release();
  }

  async #release(): Promise<void> {
    for (const off of this.#offs.splice(0)) off();
    const controller = this.controller;
    this.controller = undefined;
    this.#previous = undefined;
    await controller?.leave().catch(() => undefined);
  }

  protected override updated(changed: Map<PropertyKey, unknown>): void {
    super.updated(changed);
    const api = this.#api;
    if (!this.enabled || !api || !this.callId) {
      if (this.controller) void this.#release();
      return;
    }
    if (this.controller?.id !== this.callId) this.#bind(api.call(this.callId));
    const controller = this.controller;
    if (controller && this.autostart && !this.#started.has(controller)) {
      this.#started.add(controller);
      if (controller.state.get().phase === 'idle') void this.#start();
    }
    const stage = this.renderRoot.querySelector('.stage');
    if (stage && stage !== this.#observed) {
      this.#resize ??= new ResizeObserver(([entry]) => {
        const box = entry?.contentRect;
        if (box) this.stage = { width: Math.floor(box.width), height: Math.floor(box.height) };
      });
      this.#resize.disconnect();
      this.#resize.observe(stage);
      this.#observed = stage;
    }
  }

  #bind(controller: CallController): void {
    for (const off of this.#offs.splice(0)) off();
    this.controller = controller;
    this.#previous = controller.state.get();
    this.#offs.push(controller.state.subscribe((state) => this.#onState(state)));
  }

  #onState(state: CallState): void {
    const before = this.#previous;
    this.#previous = state;
    this.requestUpdate();
    const id = this.callId ?? '';
    if (state.phase !== before?.phase) {
      if (state.phase === 'in-call') this.emit('call-join', { callId: id });
      if (state.phase === 'ended') this.emit('call-leave', { callId: id });
      if (state.phase === 'error' && state.error) this.emit('call-error', { error: state.error });
    }
    if (before) {
      const was = new Map(before.participants.map((p) => [p.peerId, p]));
      const now = new Map(state.participants.map((p) => [p.peerId, p]));
      for (const [peerId, p] of now) {
        if (!was.has(peerId)) {
          this.emit('participant-join', { participant: p });
          this.announcement = this.t('video.announce.join', { name: p.user.name });
        }
      }
      for (const [peerId, p] of was) {
        if (!now.has(peerId)) {
          this.emit('participant-leave', { participant: p });
          this.announcement = this.t('video.announce.leave', { name: p.user.name });
        }
      }
    }
  }

  async #start(): Promise<void> {
    const controller = this.controller;
    if (!controller) return;
    try {
      await controller.start();
    } catch (error) {
      // The state already shows the failure.
      this.ctx.logger.debug('could not start the call', error);
    }
  }

  async #join(): Promise<void> {
    try {
      await this.controller?.join();
    } catch (error) {
      this.ctx.logger.debug('could not join the call', error);
    }
  }

  /** After a call has ended or failed, a fresh controller starts over. */
  #again(): void {
    const api = this.#api;
    if (!api || !this.callId) return;
    this.#bind(api.call(this.callId));
    void this.#start();
  }

  #fail(error: unknown): void {
    toast(this.ctx, {
      kind: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }

  #selectDevice(kind: DeviceKind, event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    void this.controller?.selectDevice(kind, id).catch((e: unknown) => this.#fail(e));
  }

  // ---------- pieces ----------

  #self(state: CallState): Participant {
    const user = this.ctx.auth.getUser();
    const { local } = state;
    return {
      peerId: 'self',
      user: user ?? { id: 'self', name: this.t('video.you') },
      stream: local.screen ? local.screenStream : local.stream,
      audio: local.audio,
      video: local.video,
      screen: local.screen,
      speaking: local.speaking,
      quality: 'unknown',
      connection: 'connected',
    };
  }

  #tile(p: Participant, state: CallState, extra = ''): unknown {
    const self = p.peerId === 'self';
    return html`<tessera-video-tile
      style=${extra}
      peer-id=${p.peerId}
      name=${p.user.name}
      .avatar=${p.user.avatarUrl}
      .color=${p.user.color}
      .stream=${p.stream}
      .audio=${p.audio}
      .video=${p.video}
      .screen=${p.screen}
      .speaking=${p.speaking}
      .quality=${p.quality}
      .connection=${p.connection}
      .sinkId=${state.local.selected.audiooutput}
      ?self=${self}
      ?pinned=${state.pinnedPeerId === p.peerId}
      .pinnable=${!self}
      @tile-pin=${(e: CustomEvent<{ peerId: string }>) =>
        this.controller?.pin(state.pinnedPeerId === e.detail.peerId ? undefined : e.detail.peerId)}
    ></tessera-video-tile>`;
  }

  #pickers(state: CallState): unknown {
    return html`${DEVICE_KINDS.map((kind) => {
      const list = state.local.devices[kind];
      if (list.length === 0) return nothing;
      // Output selection only helps where the browser can route audio.
      if (kind === 'audiooutput' && !('setSinkId' in HTMLMediaElement.prototype)) return nothing;
      return html`<label class="pick">${this.t(`video.device.${kind}`)}
        <select @change=${(e: Event) => this.#selectDevice(kind, e)}>
          ${list.map((d) => html`<option value=${d.id} ?selected=${d.id === state.local.selected[kind]}>${d.label}</option>`)}
        </select>
      </label>`;
    })}`;
  }

  #toggles(state: CallState): unknown {
    const { audio, video } = state.local;
    return html`
      <tessera-icon-button icon=${audio ? 'mic' : 'mic-off'} label=${audio ? this.t('video.mic.on') : this.t('video.mic.off')} aria-pressed=${audio ? 'true' : 'false'} ?data-off=${!audio} @click=${() => this.controller?.toggleAudio()}></tessera-icon-button>
      <tessera-icon-button icon=${video ? 'video' : 'video-off'} label=${video ? this.t('video.cam.on') : this.t('video.cam.off')} aria-pressed=${video ? 'true' : 'false'} ?data-off=${!video} @click=${() => this.controller?.toggleVideo()}></tessera-icon-button>
    `;
  }

  #localError(state: CallState): unknown {
    const error = state.local.error;
    if (!error) return nothing;
    return html`<p class="hint" role="status">${this.t(`video.error.${error.reason}`, { message: error.message })}</p>`;
  }

  #renderPrejoin(state: CallState): unknown {
    return html`<div class="prejoin" part="prejoin">
      <h2>${this.t('video.prejoin.title')}</h2>
      ${this.#tile(this.#self(state), state)}
      <div class="row">${this.#toggles(state)}
        ${state.local.stream ? html`<meter max="1" .value=${Math.min(1, state.local.level * 8)} aria-label=${this.t('video.device.audioinput')}></meter>` : nothing}
      </div>
      ${this.#localError(state)}
      <div class="row">${this.#pickers(state)}</div>
      <div class="row">
        <tessera-button variant="primary" @click=${() => void this.#join()}>${this.t('video.joinWith')}</tessera-button>
        <tessera-button variant="ghost" @click=${() => void this.controller?.leave()}>${this.t('video.cancel')}</tessera-button>
      </div>
    </div>`;
  }

  #renderStage(state: CallState): unknown {
    const others = state.participants;
    const self = this.#self(state);
    const all = [...others, self];
    if (state.layout === 'spotlight') {
      const focusId =
        state.pinnedPeerId && all.some((p) => p.peerId === state.pinnedPeerId)
          ? state.pinnedPeerId
          : state.speakerPeerId && all.some((p) => p.peerId === state.speakerPeerId)
            ? state.speakerPeerId
            : (others[0]?.peerId ?? 'self');
      const main = all.find((p) => p.peerId === focusId) ?? self;
      const rest = all.filter((p) => p !== main);
      return html`<div class="spot">
        <div class="big">${this.#tile(main, state)}</div>
        ${
          rest.length > 0
            ? html`<div class="strip">${repeat(
                rest,
                (p) => p.peerId,
                (p) => this.#tile(p, state),
              )}</div>`
            : nothing
        }
      </div>`;
    }
    const layout = computeGrid(all.length, this.stage.width - 16, this.stage.height - 16, GAP);
    return html`<div class="grid" style=${`grid-template-columns:repeat(${layout.columns}, ${layout.tileWidth}px)`}>
      ${repeat(
        all,
        (p) => p.peerId,
        (p) => this.#tile(p, state, `width:${layout.tileWidth}px`),
      )}
    </div>`;
  }

  #renderCall(state: CallState): unknown {
    const api = this.#api;
    const config = api?.config;
    const count = state.participants.length + 1;
    const canShare =
      !!config?.allow.screenShare &&
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices?.getDisplayMedia;
    const chatAvailable =
      !!config?.allow.chatPanel &&
      (this.ctx.services as unknown as { get(id: string): unknown }).get('chat') !== undefined &&
      !!customElements.get('tessera-chat');
    const screen = state.local.screen;
    return html`<div class="call">
      <div class="main">
        <div class="stage" part="stage">${this.#renderStage(state)}</div>
        ${state.participants.length === 0 ? html`<p class="hint" role="status">${this.t('video.alone')}</p>` : nothing}
        ${this.#localError(state)}
        <div class="controls" part="controls" role="toolbar" aria-label=${this.t('video.call')}>
          <span class="count" role="status">${this.t('video.participants', { count })}</span>
          ${this.#toggles(state)}
          ${canShare ? html`<tessera-icon-button icon="screen-share" label=${screen ? this.t('video.screen.stop') : this.t('video.screen.start')} aria-pressed=${screen ? 'true' : 'false'} ?data-on=${screen} @click=${() => (screen ? this.controller?.stopScreenShare() : void this.controller?.startScreenShare().catch((e: unknown) => this.#fail(e)))}></tessera-icon-button>` : nothing}
          <tessera-icon-button icon=${state.layout === 'grid' ? 'layout-spotlight' : 'layout-grid'} label=${state.layout === 'grid' ? this.t('video.layout.spotlight') : this.t('video.layout.grid')} @click=${() => this.controller?.setLayout(state.layout === 'grid' ? 'spotlight' : 'grid')}></tessera-icon-button>
          <tessera-icon-button icon="settings" label=${this.t('video.settings')} aria-expanded=${this.settingsOpen ? 'true' : 'false'} @click=${() => (this.settingsOpen = !this.settingsOpen)}></tessera-icon-button>
          ${chatAvailable ? html`<tessera-icon-button icon="message" label=${this.chatOpen ? this.t('video.chat.hide') : this.t('video.chat.show')} aria-expanded=${this.chatOpen ? 'true' : 'false'} ?data-on=${this.chatOpen} @click=${() => (this.chatOpen = !this.chatOpen)}></tessera-icon-button>` : nothing}
          <tessera-icon-button icon="phone-off" label=${this.t('video.leave')} variant="danger" ?data-off=${true} @click=${() => void this.controller?.leave()}></tessera-icon-button>
        </div>
        ${this.settingsOpen ? html`<div class="settings" role="group" aria-label=${this.t('video.settings')}>${this.#pickers(state)}</div>` : nothing}
      </div>
      ${chatAvailable ? html`<aside ?hidden=${!this.chatOpen} aria-label=${this.t('video.chat.show')}>${this.chatOpen ? html`<tessera-chat conversation=${chatId(this.callId ?? '')}></tessera-chat>` : nothing}</aside>` : nothing}
    </div>`;
  }

  protected override renderFeature(): unknown {
    const controller = this.controller;
    if (!controller)
      return html`<div class="center"><tessera-spinner label=${this.t('video.joining')}></tessera-spinner></div>`;
    const state = this.observe(controller.state);
    const live = html`<div class="visually-hidden" role="status" aria-live="polite">${this.announcement}</div>`;
    switch (state.phase) {
      case 'idle':
        return html`<div class="center">
          <h2>${this.t('video.call')}</h2>
          <tessera-button variant="primary" @click=${() => void this.#start()}>${this.t('video.join')}</tessera-button>
        </div>`;
      case 'prejoin':
        return this.#renderPrejoin(state);
      case 'joining':
        return html`<div class="center"><tessera-spinner label=${this.t('video.joining')}></tessera-spinner><p>${this.t('video.joining')}</p></div>`;
      case 'in-call':
        return html`${live}${this.#renderCall(state)}`;
      case 'error':
        return html`<div class="center" role="alert">
          <p>${this.t(`video.error.${state.error?.reason ?? 'unknown'}`, { message: state.error?.message ?? '' })}</p>
          <tessera-button variant="primary" @click=${() => this.#again()}>${this.t('video.tryAgain')}</tessera-button>
        </div>`;
      default:
        return html`<div class="center" role="status">
          <p>${state.error ? this.t(`video.error.${state.error.reason}`, { message: state.error.message }) : this.t('video.ended')}</p>
          <tessera-button variant="primary" @click=${() => this.#again()}>${this.t('video.rejoin')}</tessera-button>
        </div>`;
    }
  }
}
