# @tessera-kit/chat

Chat for any web app: rooms and direct messages with replies, reactions, edits, typing indicators, read receipts and attachments, as a headless API, web components and React bindings. Part of [tessera-realtime](../../README.md).

It runs in two modes with the same code:

- **Local** (`transport: { type: 'local' }`): tabs of one browser profile chat through `BroadcastChannel` and keep history in the storage adapter (IndexedDB). No backend, ideal for demos and static hosting.
- **Server** (`transport: { type: 'websocket', url }` with [tessera-server](https://github.com/thakurabhishek7283/tessera-server)): history, read markers and unread counts live on the server.

## Quick start

### Any framework (Web Components)

```html
<script type="module">
  import '@tessera-kit/chat/elements';
</script>

<tessera-chat conversation="general" style="--tessera-chat-height: 28rem"></tessera-chat>
```

A bare tag works without any setup: it switches the feature on in an implicit instance that uses the local transport. To control the instance, put the elements inside a `<tessera-root>` or set their `tessera` property.

### With `createTessera`

```ts
import { createTessera } from '@tessera-kit/core';
import { createStorage } from '@tessera-kit/storage';
import { createTransport } from '@tessera-kit/transport';

const tessera = createTessera(
  {
    appId: 'my-app',
    transport: { type: 'local' }, // or { type: 'websocket', url: 'wss://…/v1/ws' }
    storage: { type: 'indexeddb' },
    features: { chat: { enabled: true, conversations: [{ id: 'general', title: 'General' }] } },
  },
  {
    plugins: { chat: () => import('@tessera-kit/chat') },
    adapters: { transport: createTransport, storage: createStorage },
  },
);
await tessera.ready;

const chat = tessera.feature('chat');
const room = await chat?.openConversation('general');
await room?.send({ type: 'text', text: 'Hello!' });
room?.state.subscribe(({ messages }) => console.log(messages.length));
```

### React

```tsx
import { Chat, useConversation, useTotalUnread } from '@tessera-kit/chat/react';

function Support() {
  const unread = useTotalUnread();
  const { state } = useConversation('support');
  return (
    <>
      <Chat conversation="support" onMessageSend={(e) => console.log(e.detail.message)} />
      <span>{unread} unread</span>
      <span>{state?.messages.length ?? 0} messages</span>
    </>
  );
}
```

### With other Tessera kits

Kits never import each other; they meet through the service registry. Enable the `presence` kit and `<tessera-chat>` shows who is in the conversation; enable the `editor` kit (and import `@tessera-kit/editor/elements`) and set `composer.rich` to compose and show rich text.

## Configuration

<!-- config:start -->

| Option | Type | Default | Description |
|---|---|---|---|
| `conversations` | `object[]` | `[{"id":"general","title":"General"}]` | Rooms that exist from the start. Direct conversations are added as they are opened. |
| `directMessages` | `boolean` | `true` | Allow one-to-one conversations. |
| `composer` | `object` | `{"rich":false,"maxLength":4000,"attachments":true,"emoji"…` |  |
| `composer.rich` | `boolean` | `false` | Compose with the `editor` service when it is registered; a plain textarea otherwise. |
| `composer.maxLength` | `integer` | `4000` | Longest message in characters. |
| `composer.attachments` | `boolean` | `true` | Attach files (needs an uploads adapter). |
| `composer.emoji` | `boolean` | `true` | Show the built-in emoji picker. |
| `composer.enterToSend` | `boolean` | `true` | Enter sends, Shift+Enter inserts a new line. |
| `features` | `object` | `{"reactions":true,"replies":true,"edit":true,"delete":tru…` |  |
| `features.reactions` | `boolean` | `true` |  |
| `features.replies` | `boolean` | `true` |  |
| `features.edit` | `boolean` | `true` |  |
| `features.delete` | `boolean` | `true` |  |
| `features.typingIndicators` | `boolean` | `true` |  |
| `features.readReceipts` | `boolean` | `true` |  |
| `features.linkify` | `boolean` | `true` | Turn http(s) links in text into anchors. |
| `features.timestamps` | `"relative" \| "absolute"` | `"relative"` | Relative ("2 min ago") or absolute times next to messages. |
| `pageSize` | `integer` | `30` | Messages loaded per history request. |
| `notifications` | `object` | `{"sound":false,"titleBadge":true}` |  |
| `notifications.sound` | `boolean` | `false` | Play a short sound for messages from others. |
| `notifications.titleBadge` | `boolean` | `true` | Show the unread count in the page title. |

<!-- config:end -->

## API

`tessera.feature('chat')` returns a `ChatApi`:

| Member | Description |
| --- | --- |
| `config` | The validated options. |
| `conversations` | Store of `Conversation[]`, most recently active first. Configured rooms are included before anyone has written to them. |
| `totalUnread` | Store with the number of unread messages in all conversations. |
| `displayName(userId)` | The name a user was last seen with, for titling direct conversations. |
| `openConversation(id)` | Resolves to a `ConversationController` once the newest page of history has loaded. |
| `openDirect(userId)` | Opens (creating on first use) the direct conversation with another user. |

A `ConversationController`:

| Member | Description |
| --- | --- |
| `state` | Store of `{ messages, hasMore, loading, typing, readBy, unread, firstUnreadId, error }`. Messages are oldest first and include the sender's own unsent ones (`status: 'sending' \| 'failed'`). |
| `send(body, { attachments?, replyTo? })` | Shows the message at once, uploads files, sends, and resolves with the stored message. A failed send stays in the list as `failed`. |
| `retry(clientId)` | Sends a failed message again. Safe after a lost response: the server dedupes on the client id. |
| `loadOlder()` | Loads the next page of history. |
| `edit(id, body)` / `remove(id)` | Only the author can edit; the author or a user with the `moderator` role can remove. Removed messages stay as a tombstone. |
| `react(id, emoji)` | Toggles the current user's reaction. |
| `setTyping(on)` | Shares that the user is typing; switches itself off after 4 s. |
| `markRead(id?)` | Marks messages up to `id` (default: the newest) as read. Debounced by 1 s and only counted while the page is visible. |
| `close()` | Releases the controller. |

Bus events on the instance: `chat:message-sent`, `chat:message-received`, `chat:unread-changed`.

## Elements

| Tag | Purpose |
| --- | --- |
| `<tessera-chat conversation="general">` | One conversation: header, message list, typing line and composer. |
| `<tessera-inbox>` | Conversation list with unread badges next to the selected conversation; shows one pane at a time below 36 rem. |
| `<tessera-chat-launcher position="bottom-right">` | Floating button with an unread badge that opens the inbox in a panel. |

`<tessera-chat>` attributes: `conversation` (default: the first configured conversation), `heading` (override the title), `readonly`. Size it with `--tessera-chat-height` (default `32rem`) or give it a height.

| Event | Detail | Cancelable |
| --- | --- | --- |
| `message-send` | `{ message }` once the server stored a message sent from the element | no |
| `message-receive` | `{ message }` for each new message from someone else | no |
| `conversation-open` | `{ id }` | no |
| `unread-change` | `{ count }` | no |
| `conversation-select` (inbox) | `{ id }` | no |
| `launcher-toggle` (launcher) | `{ open }` | no |

Parts: `header`, `title`, `typing`, `scroller`, `day`, `divider`, `pill`, `message`, `bubble`, `author`, `time`, `body`, `reactions`, `attachments`, `actions`, `box`, `textarea`, `send`, `banner`, `list`, `item`, `detail`, `panel`, `button`. Slots on `<tessera-chat>`: `header-end`, `empty`.

Behaviour worth knowing: the list sticks to the bottom while you are there and shows a "↓ N new" pill otherwise; older messages load when you scroll to the top without moving your place; conversations over 300 rows render only what is near the viewport; `↑` in an empty composer edits your last message and `Esc` cancels a reply or edit. Links in text become anchors with `rel="noopener noreferrer nofollow"`; message text is never rendered as HTML.

## Accessibility

The list is a labelled `log` region; new messages from others are announced through a separate polite live region, at most once every two seconds. Every control is a labelled button, the toolbar appears on focus as well as on hover, and the delete confirmation is a modal dialog with focus return.

## Limits

- In local mode a history request reads the whole conversation from storage, so it suits demos and small histories rather than very large ones.
- Read receipts are live: markers are not part of the history response, so "Seen" resets after a reload.
- tessera-server does not push new direct conversations. Other people's new conversations appear within a minute, when the tab becomes visible, or after a reconnect; the local mode announces them at once.
- Unread counts are tracked for the 20 most recent conversations (each costs a joined room).

## Messages

Every string is a key in `ctx.i18n` (`chat.*`); English and German ship with the package. Override any key through `config.messages`.
