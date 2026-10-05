# @tessera-kit/chat

## 0.2.0

### Minor Changes

- 589394a: First release: presence, chat, WebRTC video calls and comment threads as web components with React bindings, English and German messages, and light and dark themes.
- 09f369d: A page with one `<tessera-chat>` loads 3.3 KB gzip less: the `elements` entry no longer downloads the inbox and launcher chunks when it loads. They download the first time `<tessera-inbox>` or `<tessera-chat-launcher>` appears, and the launcher loads the inbox when its panel first opens (focus still moves into the panel once it has loaded).
  
  Also new, as in the other kits: an `autoload` entry that only registers the tags (162 B gzip), per-element entries (`@tessera-kit/chat/elements/<tag>`), and `static tesseraVersion` on every element class. Requires a `@tessera-kit/elements` with `lazyDefine`.
- cbdc9ad: Option and document schemas use `zod/mini`, which takes 18–25 KB gzip off every page that renders the kit. Validation is unchanged. Exported schemas are now zod/mini schemas, so use the functional form for classic-only methods (`z.extend(schema, …)` instead of `schema.extend(…)`). Requires `zod@^4.2.0` and a `@tessera-kit/core` whose `configSchema` accepts zod/mini schemas.
