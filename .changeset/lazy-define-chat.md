---
"@tessera-kit/chat": minor
---

A page with one `<tessera-chat>` loads 3.3 KB gzip less: the `elements` entry no longer downloads the inbox and launcher chunks when it loads. They download the first time `<tessera-inbox>` or `<tessera-chat-launcher>` appears, and the launcher loads the inbox when its panel first opens (focus still moves into the panel once it has loaded).

Also new, as in the other kits: an `autoload` entry that only registers the tags (162 B gzip), per-element entries (`@tessera-kit/chat/elements/<tag>`), and `static tesseraVersion` on every element class. Requires a `@tessera-kit/elements` with `lazyDefine`.
