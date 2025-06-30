# @tessera/comments

Comment threads for any web app: attach a discussion to a listing, a card, an annotation, anything with an id. Replies, reactions, edit and delete, optional star ratings with an average and distribution, a resolve toggle and live updates, as a headless API, web components and React bindings. Part of [tessera-realtime](../../README.md).

It needs a storage adapter and nothing else. A transport is optional: with one, other people's comments appear as they are written; without one, changes made in other tabs still arrive through the storage adapter's change events where it has them.

## Quick start

### Any framework (Web Components)

```html
<script type="module">
  import '@tessera/comments/elements';
</script>

<h2>Lakeside pitch <tessera-comment-count target="campsite-17"></tessera-comment-count></h2>
<tessera-comments target="campsite-17"></tessera-comments>
```

A bare tag works without any setup: it switches the feature on in an implicit instance that uses IndexedDB. To control the instance, put the elements inside a `<tessera-root>` or set their `tessera` property.

### With `createTessera`

```ts
import { createTessera } from '@tessera/core';
import { createStorage } from '@tessera/storage';
import { createTransport } from '@tessera/transport';

const tessera = createTessera(
  {
    appId: 'my-app',
    storage: { type: 'rest', baseUrl: 'https://api.example.com' },
    transport: { type: 'websocket', url: 'wss://api.example.com/v1/ws' },
    features: { comments: { enabled: true, ratings: true } }, // ratings: reviews
  },
  {
    plugins: { comments: () => import('@tessera/comments') },
    adapters: { storage: createStorage, transport: createTransport },
  },
);
await tessera.ready;

const thread = await tessera.feature('comments')?.thread('campsite-17');
await thread?.add({ type: 'text', text: 'Lovely spot' }, { rating: 5 });
thread?.state.subscribe(({ comments, summary }) => console.log(comments.length, summary?.average));
```

### React

```tsx
import { CommentCount, Comments, useThread } from '@tessera/comments/react';

function Listing({ id }: { id: string }) {
  const { state } = useThread(id);
  return (
    <>
      <h2>Reviews <CommentCount target={id} /></h2>
      <Comments target={id} onCommentAdd={(e) => console.log(e.detail.comment)} />
      <p>{state?.summary ? `${state.summary.average.toFixed(1)} stars` : 'Not rated yet'}</p>
    </>
  );
}
```

### With other Tessera kits

Kits never import each other; they meet through the service registry. Enable the `editor` kit (and import `@tessera/editor/elements`) and comments are written and shown as rich text (`rich`, on by default; plain text otherwise); add `mentions` to offer `@` mentions of the people in the thread.

## Configuration

<!-- config:start -->

| Option | Type | Default | Description |
|---|---|---|---|
| `rich` | `boolean` | `true` | Compose with the `editor` service when it is registered; a plain textarea otherwise. |
| `replies` | `boolean` | `true` | Allow one level of replies. |
| `reactions` | `string[]` | `["👍","❤️","🎉","😄","😮"]` | Emoji people can react with. An empty list turns reactions off. |
| `sort` | `"oldest" \| "newest"` | `"oldest"` | Order of top-level comments. Replies are always oldest first. |
| `resolve` | `boolean` | `false` | Show a "resolve thread" control, for review workflows. |
| `ratings` | `boolean` | `false` | Add an optional 1–5 star rating to top-level comments and show the average and distribution. |
| `mentions` | `boolean` | `false` | Offer `@` mentions of the thread’s participants in the rich editor. |
| `live` | `boolean` | `true` | Show other people’s changes as they happen (storage changes and transport notifications). |

<!-- config:end -->

## API

`tessera.feature('comments')` returns a `CommentsApi`:

| Member | Description |
| --- | --- |
| `config` | The validated options. |
| `thread(targetId)` | Loads the thread of `targetId` and keeps it in sync. Resolves to a `ThreadController`. |
| `count(targetId)` | A store with the number of comments. The thread is only kept open while something subscribes. |

A `ThreadController`:

| Member | Description |
| --- | --- |
| `state` | Store of `{ comments, count, resolved, loading, error, summary }`. `comments` are top-level comments in the configured order, each with its `replies` (oldest first). `summary` is `{ average, count, histogram }` when ratings are on and used. |
| `add(body, { parentId?, rating? })` | Adds a comment or a reply. `body` is `{ type: 'text', text }` or `{ type: 'rich', doc }`. One level of replies; ratings only on top-level comments. |
| `edit(id, body)` | Only the author. |
| `remove(id)` | The author or a user with the `moderator` role. A comment that has replies stays as a tombstone; one without is dropped. |
| `react(id, emoji)` | Toggles the current user's reaction; the emoji must be one of the configured ones. |
| `setResolved(resolved)` | Needs `resolve: true`. |
| `close()` | Releases the thread. |

Bus events on the instance: `comments:added`, `comments:conflict`.

### How writes work

A thread is one storage document (`comments.threads`, one per target, at most 500 comments). A change is applied to the local copy at once and written with the version that was read. If somebody wrote first, the change is re-applied to the fresh copy (up to three times), so two people adding comments or reactions at the same moment both keep theirs. A write that fails puts the previous state back. Other people's changes arrive through the storage adapter's change events and, when a transport is present, `comments.changed` notifications on the room `comments:<targetId>`.

## Elements

| Tag | Purpose |
| --- | --- |
| `<tessera-comments target="…">` | The whole discussion: header with count and rating summary, composer, comments with replies, reactions, edit and delete, resolve toggle. Attribute `readonly` hides the composer and the actions. |
| `<tessera-comment-count target="…">` | A small badge with the number of comments, for lists. Hidden at zero unless `show-zero` is set. |
| `<tessera-star-rating>` | The star control used inside: `value`, `readonly`. As an input it is a radio group with arrow-key support, and pressing the chosen star clears it. |

| Event | Detail | Cancelable |
| --- | --- | --- |
| `comment-add` | `{ comment }` | no |
| `comment-edit` | `{ id, body }` | no |
| `comment-delete` | `{ id }` | no |
| `thread-resolve` | `{ resolved }` | no |
| `rating-change` (stars) | `{ rating }` | no |

Parts: `header`, `summary`, `composer`, `comment`, `replies`, `actions`, `badge`, `star`, `box`, `submit`. Slot: `empty`. Set `--tessera-comments-star` to change the star colour.

## Accessibility

Ratings are announced as "Rated 4 out of 5"; the summary reads out the average and the number of ratings, and each bar of the distribution has a text alternative. New comments from other people are announced through a polite live region. Deleting asks first in a modal dialog with focus return.

## Limits

- Permissions are enforced by the client: the author can edit and the author or a moderator can remove. The storage adapter (or the server behind it) decides who may write the thread document at all.
- A thread document holds at most 500 comments.
- Replies are one level deep.

## Messages

Every string is a key in `ctx.i18n` (`comments.*`); English and German ship with the package. Override any key through `config.messages`.
