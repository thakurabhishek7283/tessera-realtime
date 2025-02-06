# @tessera/presence

Who is here, and how active are they: a headless presence API, an avatar stack, live pointers and React bindings. Part of [tessera-realtime](../../README.md).

It needs a transport (`local`, `websocket` or a custom one) and nothing else: with the `local` transport two tabs of the same browser see each other with no backend.

## Quick start

### Any framework (Web Components)

```html
<script type="module">
  import '@tessera/presence/elements';
</script>

<header>
  <tessera-presence scope="invoice-42"></tessera-presence>
</header>
<main style="position: relative">
  <tessera-cursors scope="invoice-42"></tessera-cursors>
  …
</main>
```

A bare tag works without any setup: it switches the feature on in an implicit instance that uses the local transport. To control the instance, put the elements inside a `<tessera-root>` or set their `tessera` property.

### With `createTessera`

```ts
import { createTessera } from '@tessera/core';
import { createTransport } from '@tessera/transport';

const tessera = createTessera(
  {
    appId: 'my-app',
    transport: { type: 'local' }, // or { type: 'websocket', url: 'wss://…/v1/ws' }
    features: { presence: { enabled: true, idleAfterMs: 30_000 } },
  },
  { plugins: { presence: () => import('@tessera/presence') }, adapters: { transport: createTransport } },
);
await tessera.ready;

const presence = tessera.feature('presence');
const page = await presence?.join('invoice-42');
page?.peers.subscribe((people) => console.log(people.map((p) => p.name)));
page?.set({ location: '/invoices/42' });
```

### React

```tsx
import { Cursors, Presence, usePresence } from '@tessera/presence/react';

function Header() {
  const { peers } = usePresence('invoice-42');
  return (
    <>
      <Presence scope="invoice-42" max={4} />
      <span>{peers.length} others here</span>
    </>
  );
}
```

On the server the wrappers render an empty tag that upgrades after hydration. In Next.js, import them with `dynamic(() => import(...), { ssr: false })` if you want to avoid the empty tag in the HTML.

## Configuration

<!-- config:start -->

| Option | Type | Default | Description |
|---|---|---|---|
| `scope` | `string` | `"app"` | Scope joined by elements that do not name one: a page or document id. |
| `idleAfterMs` | `integer` | `60000` | Time without pointer or keyboard input before the status becomes `idle`. |
| `showSelf` | `boolean` | `false` | Include the current user in the list of people. |
| `maxAvatars` | `integer` | `5` | Avatars shown before the rest collapse into a "+N" button. |

<!-- config:end -->

## API

`tessera.feature('presence')` returns a `PresenceApi`:

| Member | Description |
| --- | --- |
| `config` | The validated options. |
| `join(scope?)` | Joins `presence:<scope>` and resolves to a `PresenceHandle`. Joining a scope twice returns handles that share one room; the room is left when every caller has left. |

A `PresenceHandle`:

| Member | Description |
| --- | --- |
| `peers` | Store of `PresenceUser[]`, one entry per user id, ordered by arrival. A user with several tabs shows the status of the most active one. |
| `cursors` | Store of `PresenceCursor[]`, one entry per other connection that has a pointer in the scope (`x`, `y` are fractions of the shared container). |
| `set({ status?, location?, cursor? })` | Publishes this connection's state. `cursor: null` hides the pointer. |
| `leave()` | Leaves the scope. |

Status is `active`, `idle` (no input for `idleAfterMs`) or `away` (the tab is hidden). It is detected for you; `set({ status })` overrides it until the next change.

## Elements

### `<tessera-presence>`

| Attribute | Description |
| --- | --- |
| `scope` | Scope to join. Defaults to the configured `scope`. |
| `max` | Avatars shown before the rest collapse into a `+N` button. Defaults to `maxAvatars`. |

| Event | Detail | Cancelable |
| --- | --- | --- |
| `presence-change` | `{ peers: PresenceUser[] }` | no |

Parts: `root`, `person`, `dot`, `more`, `list`. Slot: `empty` (shown when nobody else is here).

### `<tessera-cursors>`

Place it inside a `position: relative` container. It listens to the pointer on its parent (or the element matched by `target`) and draws other people's pointers with their names; a pointer that has not moved for 3 s fades out. It is hidden from assistive technology.

| Attribute | Description |
| --- | --- |
| `scope` | Scope to join. Defaults to the configured `scope`. |
| `target` | CSS selector of the element whose pointer is shared. Defaults to the parent. |

Parts: `cursor`, `label`.

## Styling

Elements only use the Tessera design tokens (`--tessera-color-*`, `--tessera-space-*`, …). Colours follow the active theme. Pointer and avatar colours come from `UserInfo.color`.

## Messages

Every string is a key in `ctx.i18n` (`presence.*`); English and German ship with the package. Override any key through `config.messages`.
