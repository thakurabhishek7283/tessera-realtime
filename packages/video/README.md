# @tessera/video

Video calls for any web app: WebRTC calls for up to six people with a device preview, mute, device switching, screen sharing, active speaker, connection quality and automatic recovery, as a headless API, web components and React bindings. Part of [tessera-realtime](../../README.md).

Calls are peer-to-peer (a mesh): everybody connects to everybody, and the transport only carries the setup messages. With the `local` transport two tabs of one browser can call each other with no backend; with [tessera-server](https://github.com/thakurabhishek7283/tessera-server) the same code works across the internet.

## Quick start

### Any framework (Web Components)

```html
<script type="module">
  import '@tessera/video/elements';
</script>

<tessera-call call-id="standup" style="--tessera-call-height: 32rem"></tessera-call>

<!-- or a button that opens the call in a dialog -->
<tessera-call-button call-id="standup">Join the stand-up</tessera-call-button>
```

Everybody who uses the same `call-id` is in the same call. A bare tag works without any setup: it switches the feature on in an implicit instance that uses the local transport. To control the instance, put the elements inside a `<tessera-root>` or set their `tessera` property.

### With `createTessera`

```ts
import { createTessera } from '@tessera/core';
import { createTransport } from '@tessera/transport';

const tessera = createTessera(
  {
    appId: 'my-app',
    transport: { type: 'websocket', url: 'wss://api.example.com/v1/ws' },
    features: {
      video: { enabled: true, iceServersUrl: 'https://api.example.com/v1/ice', maxParticipants: 4 },
    },
  },
  { plugins: { video: () => import('@tessera/video') }, adapters: { transport: createTransport } },
);
await tessera.ready;

const call = tessera.feature('video')?.call('standup');
await call?.start(); // asks for the camera and microphone, shows the preview
await call?.join({ audio: true, video: false });
call?.state.subscribe((s) => console.log(s.phase, s.participants.length));
```

### React

```tsx
import { Call, useCall } from '@tessera/video/react';

function Room() {
  const { controller, state } = useCall('standup');
  return (
    <>
      <Call callId="standup" onCallJoin={() => console.log('joined')} />
      {state?.phase === 'in-call' && <button onClick={() => controller?.leave()}>Leave</button>}
    </>
  );
}
```

### With other Tessera kits

Kits never import each other; they meet through the service registry. Enable the `chat` kit and `<tessera-call>` offers a chat panel next to the video (conversation `call:<id>`). Enable the `presence` kit and `<tessera-call-button>` shows how many people are in the call.

## Configuration

<!-- config:start -->

| Option | Type | Default | Description |
|---|---|---|---|
| `maxParticipants` | `integer` | `4` | Largest number of people in one call. Every extra person adds a connection per participant (mesh). |
| `iceServers` | `object[]` | – | STUN/TURN servers. Defaults to a public STUN server when neither this nor `iceServersUrl` is set. |
| `iceServersUrl` | `string` | – | URL returning `{ iceServers }` (tessera-server: `/v1/ice`), fetched with the user token before joining. |
| `prejoin` | `boolean` | `true` | Show a device preview before joining. |
| `allow` | `object` | `{"screenShare":true,"chatPanel":true,"recording":false}` |  |
| `allow.screenShare` | `boolean` | `true` |  |
| `allow.chatPanel` | `boolean` | `true` | Offer a chat panel in the call when the `chat` kit is enabled. |
| `allow.recording` | `false` | `false` | Recording is not supported. |
| `defaults` | `object` | `{"audio":true,"video":true}` |  |
| `defaults.audio` | `boolean` | `true` | Microphone on when joining. |
| `defaults.video` | `boolean` | `true` | Camera on when joining. |
| `video` | `object` | `{"width":1280,"height":720,"frameRate":24}` | Camera constraints (ideal values). |
| `video.width` | `integer` | `1280` |  |
| `video.height` | `integer` | `720` |  |
| `video.frameRate` | `number` | `24` |  |
| `layout` | `"grid" \| "spotlight"` | `"grid"` | How tiles are arranged at the start. |

<!-- config:end -->

## API

`tessera.feature('video')` returns a `VideoApi` with `call(callId)`. The same id returns the same controller until that call has ended, after which a fresh one is handed out.

A `CallController`:

| Member | Description |
| --- | --- |
| `state` | Store of `{ phase, error, participants, local, layout, pinnedPeerId, speakerPeerId }`. |
| `start()` | Idle → `prejoin`: asks for the camera and microphone and fills `local.stream` and `local.devices`. Without `prejoin` it joins at once. |
| `join({ audio?, video? })` | Joins the call. Works without any device (receive only). |
| `leave()` | Leaves, stops the camera and microphone and ends the call for this tab. |
| `toggleAudio()` / `toggleVideo()` | Instant (`track.enabled`); a device that was blocked earlier is asked for again. |
| `startScreenShare()` / `stopScreenShare()` | Replaces the camera for everybody and returns to it. |
| `selectDevice(kind, id)` | Switches the microphone, camera or (where supported) speaker. |
| `setLayout('grid' \| 'spotlight')` / `pin(peerId?)` | Pinning someone switches to the spotlight layout. |

Phases: `idle → prejoin → joining → in-call → ended`, or `error` with `error.reason` (`room-full`, `permission-denied`, `no-device`, `unsupported`, `connection-lost`, `unknown`). `permission-denied` and `no-device` are reported in `local.error` while the call can still be joined. A call whose signalling connection stays down for 30 s ends with `connection-lost`; shorter outages are survived.

Each `Participant` has `peerId`, `user`, `stream`, `audio`, `video`, `screen`, `speaking`, `quality` (`good`, `fair`, `poor`, `unknown`) and `connection` (`new`, `connecting`, `connected`, `reconnecting`, `closed`).

Bus events on the instance: `video:joined`, `video:left`.

## Elements

| Tag | Purpose |
| --- | --- |
| `<tessera-call call-id>` | The whole call UI: preview, grid or spotlight, controls bar, device menu and (with the chat kit) a chat panel. Add `autostart` to ask for the camera as soon as it appears. |
| `<tessera-call-button call-id>` | Opens `<tessera-call>` in a dialog. Closing the dialog leaves the call. |
| `<tessera-video-tile>` | One person's video with name, mute and speaking indicators, a quality meter and a pin button. |

| Event | Detail | Cancelable |
| --- | --- | --- |
| `call-join` | `{ callId }` | no |
| `call-leave` | `{ callId }` | no |
| `participant-join` / `participant-leave` | `{ participant }` | no |
| `call-error` | `{ error }` | no |
| `call-open` / `call-close` (button) | `{ callId }` | no |
| `tile-pin` (tile) | `{ peerId }` | no |

Parts: `stage`, `controls`, `prejoin` (call), `tile`, `video`, `label`, `quality` (tile), `button`, `dialog` (button). Size the call with `--tessera-call-height` (default `36rem`).

## How it works

- **Signalling.** Peers join the room `call:<id>` and exchange `rtc.signal` messages (descriptions and ICE candidates) directly. Media state (`audio`, `video`, `screen`) travels as room presence.
- **Negotiation.** The "perfect negotiation" pattern: one side (the one with the smaller peer id) makes the first offer, and if two offers ever cross, for example after an ICE restart, the polite side rolls back. Signals are applied one at a time.
- **Recovery.** ICE `disconnected` for more than 8 s or `failed` triggers an ICE restart on the same connection; after five failed restarts the link is given up and the person is shown as gone.
- **Tracks.** Both directions exist for audio and video from the start, so turning the camera on, switching devices and sharing the screen are `replaceTrack` calls without renegotiation.
- **Active speaker.** Each stream's loudness is sampled every 200 ms; the loudest person who has been above the threshold for 600 ms is the speaker, and a speaker is kept until someone is clearly louder.
- **Quality.** Every 2 s the round-trip time and packet loss of each connection are mapped to good, fair or poor.

## Limits

- It is a mesh: every extra person adds an upload and a download to everyone, so the default is 4 and the maximum 6. For larger calls an SFU is the right tool; `maxParticipants` and the controller API stay the same, and the connection layer is the only part that would change.
- Behind strict firewalls a call needs a TURN server. tessera-server hands out time-limited TURN credentials at `/v1/ice` when it is configured with one; otherwise only a public STUN server is used.
- Recording is not supported.
- Speaker (output) selection needs `setSinkId`, which not every browser has.

## Messages

Every string is a key in `ctx.i18n` (`video.*`); English and German ship with the package. Override any key through `config.messages`.
