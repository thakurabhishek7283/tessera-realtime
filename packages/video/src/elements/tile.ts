import { baseStyles, focusRing, TesseraElement } from '@tessera-kit/elements';
import { type CSSResultGroup, css, html, nothing, type PropertyDeclarations } from 'lit';
import type { PeerLinkState, Quality } from '../types.js';
import { version } from '../version.js';

/**
 * One person's video: the stream (or an avatar when the camera is off), their name, what is
 * muted, a speaking ring, a connection quality indicator and a pin button.
 *
 * @fires tile-pin - `{ peerId }` when the pin button is pressed
 * @csspart tile @csspart video @csspart label @csspart quality
 */
export class TesseraVideoTile extends TesseraElement {
  static override tesseraVersion: string = version;

  static override properties: PropertyDeclarations = {
    peerId: { attribute: 'peer-id' },
    name: {},
    avatar: {},
    color: {},
    stream: { attribute: false },
    audio: { type: Boolean },
    video: { type: Boolean },
    screen: { type: Boolean },
    speaking: { type: Boolean, reflect: true },
    quality: {},
    connection: {},
    self: { type: Boolean, reflect: true },
    pinned: { type: Boolean, reflect: true },
    sinkId: { attribute: false },
    pinnable: { type: Boolean },
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    focusRing,
    css`
      :host {
        position: relative;
        display: block;
        aspect-ratio: 16 / 9;
        min-width: 0;
        border-radius: var(--tessera-radius-md);
        overflow: hidden;
        background: #0b1220;
        color: #fff;
        outline: 3px solid transparent;
        outline-offset: -3px;
        transition: outline-color var(--tessera-motion-duration);
      }
      :host([speaking]) {
        outline-color: var(--tessera-color-success);
      }
      video {
        width: 100%;
        height: 100%;
        object-fit: cover;
        background: #0b1220;
      }
      video[data-fit='contain'] {
        object-fit: contain;
      }
      :host([self]) video[data-mirror] {
        transform: scaleX(-1);
      }
      .off {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        background: #111a2e;
      }
      .label {
        position: absolute;
        inset-inline: 0;
        inset-block-end: 0;
        display: flex;
        align-items: center;
        gap: var(--tessera-space-2);
        padding: var(--tessera-space-1) var(--tessera-space-2);
        font-size: var(--tessera-font-size-sm);
        background: linear-gradient(transparent, rgb(0 0 0 / 0.7));
      }
      .name {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 700;
      }
      .muted {
        color: #fca5a5;
      }
      .status {
        position: absolute;
        inset-block-start: var(--tessera-space-2);
        inset-inline-start: var(--tessera-space-2);
        padding: 2px var(--tessera-space-2);
        font-size: var(--tessera-font-size-xs);
        background: rgb(0 0 0 / 0.7);
        border-radius: var(--tessera-radius-full);
      }
      .pin {
        position: absolute;
        inset-block-start: var(--tessera-space-2);
        inset-inline-end: var(--tessera-space-2);
        opacity: 0;
        transition: opacity var(--tessera-motion-duration);
        --tessera-color-text: #fff;
        background: rgb(0 0 0 / 0.55);
        border-radius: var(--tessera-radius-md);
      }
      :host(:hover) .pin,
      .pin:focus-within,
      :host([pinned]) .pin {
        opacity: 1;
      }
      @media (hover: none) {
        .pin {
          opacity: 1;
        }
      }
      .bars {
        display: inline-flex;
        align-items: flex-end;
        gap: 2px;
        height: 14px;
      }
      .bars i {
        width: 3px;
        background: rgb(255 255 255 / 0.35);
        border-radius: 1px;
      }
      .bars i:nth-child(1) {
        height: 5px;
      }
      .bars i:nth-child(2) {
        height: 9px;
      }
      .bars i:nth-child(3) {
        height: 13px;
      }
      .bars[data-quality='good'] i {
        background: #4ade80;
      }
      .bars[data-quality='fair'] i:nth-child(-n + 2) {
        background: #fbbf24;
      }
      .bars[data-quality='poor'] i:nth-child(1) {
        background: #f87171;
      }
    `,
  ];

  protected readonly featureId: string | null = 'video';

  peerId = '';
  name = '';
  avatar: string | undefined;
  color: string | undefined;
  stream: MediaStream | undefined;
  audio = true;
  video = true;
  screen = false;
  speaking = false;
  quality: Quality = 'unknown';
  connection: PeerLinkState = 'connected';
  self = false;
  pinned = false;
  pinnable = true;
  /** Output device for remote audio, where the browser supports `setSinkId`. */
  sinkId: string | undefined;

  protected override updated(changed: Map<PropertyKey, unknown>): void {
    super.updated(changed);
    const el = this.renderRoot.querySelector('video');
    if (!el) return;
    if (el.srcObject !== (this.stream ?? null)) el.srcObject = this.stream ?? null;
    if (this.sinkId !== undefined && !this.self) {
      const sink = el as HTMLVideoElement & { setSinkId?: (id: string) => Promise<void> };
      void sink.setSinkId?.(this.sinkId).catch(() => undefined);
    }
    // The browser may refuse to autoplay audio until the page has been interacted with.
    if (this.stream && el.paused) void el.play().catch(() => undefined);
  }

  protected override renderFeature(): unknown {
    const showVideo = !!this.stream && (this.video || this.screen);
    const status =
      this.connection === 'reconnecting'
        ? this.t('video.connection.reconnecting')
        : this.screen
          ? this.t('video.sharing', { name: this.name })
          : '';
    const label = [
      this.self ? `${this.name} (${this.t('video.you')})` : this.name,
      !this.audio ? this.t('video.muted', { name: this.name }) : '',
      !showVideo ? this.t('video.cameraOff', { name: this.name }) : '',
      this.speaking ? this.t('video.speaking', { name: this.name }) : '',
    ]
      .filter(Boolean)
      .join(', ');
    return html`<div part="tile" role="group" aria-label=${label} style="height:100%">
      <video
        part="video"
        autoplay
        playsinline
        ?muted=${this.self}
        .muted=${this.self}
        ?hidden=${!showVideo}
        ?data-mirror=${this.self && !this.screen}
        data-fit=${this.screen ? 'contain' : 'cover'}
        aria-hidden="true"
      ></video>
      ${showVideo ? nothing : html`<div class="off"><tessera-avatar size="lg" name=${this.name} .src=${this.avatar} .color=${this.color}></tessera-avatar></div>`}
      ${status ? html`<span class="status" role="status">${status}</span>` : nothing}
      ${
        this.pinnable
          ? html`<tessera-icon-button class="pin" size="sm" icon=${this.pinned ? 'x' : 'star'} label=${this.pinned ? this.t('video.unpin', { name: this.name }) : this.t('video.pin', { name: this.name })} aria-pressed=${this.pinned ? 'true' : 'false'} @click=${() => this.emit('tile-pin', { peerId: this.peerId })}></tessera-icon-button>`
          : nothing
      }
      <div class="label" part="label">
        ${this.audio ? nothing : html`<tessera-icon class="muted" name="mic-off" label=${this.t('video.muted', { name: this.name })}></tessera-icon>`}
        <span class="name">${this.self ? `${this.name} (${this.t('video.you')})` : this.name}</span>
        ${this.self ? nothing : html`<span class="bars" part="quality" data-quality=${this.quality} role="img" aria-label=${this.t(`video.quality.${this.quality}`)} title=${this.t(`video.quality.${this.quality}`)}><i></i><i></i><i></i></span>`}
      </div>
    </div>`;
  }
}
