# Architecture

This page is for people changing the code. The user-facing view is in the [package READMEs](../packages) and the [playground](https://thakurabhishek7283.github.io/tessera-realtime/). The core packages this repository builds on are described in the [`tessera` architecture notes](https://github.com/thakurabhishek7283/tessera/blob/main/docs/architecture.md).

## Packages

```text
   @tessera-kit/core   @tessera-kit/elements   @tessera-kit/storage   @tessera-kit/transport   @tessera-kit/protocol
        ▲                  ▲                   ▲                   ▲                   ▲
        │                  │                   │                   │                   │
   presence ◀── (service registry, optional) ── chat · video · comments

 private, bundled into the kits:
   @tessera-internal/react-wrap   SSR-safe React wrappers for custom elements
   @tessera-internal/test-utils   fixtures, axe helper, instance mounting (tests only)
```

Kits never import each other. When one kit improves another (the call shows a chat panel, the call button counts people through presence, comments render rich text through the editor) it asks the instance's service registry, and works without the answer. `@tessera-kit/protocol` is only a dependency for the shapes of messages (chat, signalling, ICE).

## One kit, four layers

Each kit has the shape the `tessera` core expects of a plugin.

1. **Schemas and config** (`config.ts`, `schemas.ts`): zod/mini definitions of the stored documents and of the feature options. The config schema is the single source for the README tables (`scripts/gen-config-docs.mjs`) and for the playground's config form.
2. **Headless logic** (`session.ts`, `call.ts`, `thread.ts`, `handle.ts`): state in a store, commands that talk to the transport or storage, and bus events. Nothing here touches the DOM, so the node tests cover nearly all behaviour; WebRTC and media are replaced by simulations that follow the real state machines.
3. **Plugin and API** (`plugin.ts`, `api.ts`): `definePlugin` registers the feature, validates the options, merges the `en` and `de` messages and exposes the API (`openConversation`, `call`, `thread`, `join`).
4. **Elements and React** (`elements/`, `react/`): the public elements extend `TesseraElement`, find the instance and the controller, and render with Lit. React wrappers use `wrapElement` and hooks read the stores with `useSyncExternalStore`.

## Chat: one protocol, two servers

The chat client only ever speaks the `chat.*` request protocol from `@tessera-kit/protocol` (`chat.send`, `chat.history`, `chat.react`, …) plus the room broadcasts. tessera-server answers those requests. With the `local` transport there is no server, so the kit registers an in-tab emulation (`local-server.ts`) that answers the same requests from the storage adapter and broadcasts through the transport. The client code is therefore identical in both modes, and the same engine is used in the tests to stand in for the server.

```text
 composer ─▶ session.send ── optimistic message (status: sending)
                │
                ▼
         room.request('chat.send')  ──▶ server | local emulation ─▶ storage
                │                              │
                │                              └─ broadcast 'chat.message' to the room
                ▼
   response replaces the optimistic copy (matched by client id)
   the broadcast of our own message is deduped the same way
```

Unread counts are the server's count plus the messages that arrived live after the list was fetched; the list is fetched again once every watched room is joined, because a message sent in between would otherwise be counted by neither side.

## Video: signalling and negotiation

```text
 join('call:<id>') ──▶ peers store ──▶ one PeerLink per remote peer
                                             │
        rtc.signal (description | candidate) │  room.send(peerId, 'rtc.signal', …)
                                             ▼
   impolite peer (smaller id) offers first; the polite peer attaches its tracks to the
   transceivers of that offer and answers. Later collisions: polite rolls back.
   Signals are applied one at a time. ICE disconnected > 8 s or failed → restartIce().
```

Media state (`audio`, `video`, `screen`) is room presence, so toggles are instant and never renegotiate. See [ADR 3](decisions/0003-webrtc-mesh-and-one-initial-offerer.md).

## Comments: one document per target

A thread is one storage document, so a write is atomic and a read is one request. Writes go through `apply(op)`: the operation is applied to the local copy, written with the stored version, and on a conflict re-applied to the fresh copy (operations are small pure functions, which is what makes that safe).

## Testing layers

| Layer | Where | What |
| --- | --- | --- |
| Unit | `test/*.test.ts` (node) | stores, operations, negotiation with a simulated `RTCPeerConnection`, the chat server emulation, i18n key parity |
| Component | `test/*.browser.test.ts` (Chromium) | elements, keyboard use, axe in light and dark, real WebRTC between two tabs with Chromium's fake devices |
| End to end | `e2e/` (Playwright) | the built playground with two real pages; optionally against a running tessera-server |
