# Page cost after define-on-first-use (session 0.3)

Measured on 2026-10-04 with `pnpm budget` against tessera's `perf/lazy-define` branch (production builds). Previous: [after-0.2.md](after-0.2.md).

## The budget now sees eager chunk loads

The page-budget script (copied from tessera) now counts a chunk as initial when a loaded chunk `import()`s it as soon as it runs, not only through static imports. Chat's `elements` entry did that for the inbox and the launcher (`void import('./inbox.js')`), so every chat page downloaded them, but the old report counted them as lazy. The "before" column below is `main`'s kit code measured with the new script and the new tessera, so the two columns compare like with like.

| Page | Initial gzip before | Initial gzip after | Total gzip before | Total gzip after | Budget (initial / total) |
| --- | ---: | ---: | ---: | ---: | ---: |
| `chat-page` | 48.3 KB | **45.0 KB** | 77.3 KB | 77.4 KB | 45.7 / 78.9 KB (unchanged) |
| `comments-page` | 36.2 KB | 36.2 KB | 59.2 KB | 59.1 KB | 36.6 / 60.3 KB (unchanged) |
| `presence-page` | 34.0 KB | 34.1 KB | 55.3 KB | 55.3 KB | 34.4 / 56.2 KB (unchanged) |
| `video-page` | 37.4 KB | 37.5 KB | 63.5 KB | 63.5 KB | 37.8 / 64.7 KB (unchanged) |

A page with one `<tessera-chat>` loads 3.3 KB gzip less: the inbox and launcher chunks now download only when one of those tags appears.

## Why no budget moved

Budgets are the measured size plus 3% and only go down. Session 0.2 recorded chat at 44.3 KB with the old script and the old tessera. Since then, tessera's base page grew by 0.8 KB (`lazyDefine`, which every `TesseraElement` uses, plus the version guards; see tessera's `docs/perf/after-0.3.md`), and every page here includes it. Measured plus 3% is above the current budget for every page (chat: 45.0 KB × 1.03 = 46.4 KB > 45.7 KB), so the budgets stay where they are. None had to go up.

## Own-code size limits (size-limit, gzip)

| Entry | Before | After | Limit |
| --- | ---: | ---: | ---: |
| chat elements (everything they can load) | 26.08 kB | 26.4 kB | 27 kB |
| comments elements | 10.84 kB | 10.89 kB | 13 kB |
| presence elements | 5.39 kB | 5.4 kB | 8 kB |
| video elements | 14.21 kB | 14.21 kB | 18 kB |
| chat autoload | | 162 B | 0.3 kB (new) |
| comments autoload | | 132 B | 0.3 kB (new) |
| presence autoload | | 109 B | 0.3 kB (new) |
| video autoload | | 120 B | 0.3 kB (new) |

The elements entries grow by up to 0.3 kB for the `static tesseraVersion` on each class and the `lazyDefine` registrations. The autoload limit (0.3 kB) leaves out `@tessera-kit/elements` and the tag chunks, which load on first use.

## Requests, checked in a browser

`e2e/lazy-define.spec.ts` loads `chat-only.html` from the playground (a bare `<tessera-chat>`):

- no request for the inbox or launcher chunks
- adding `<tessera-inbox>` afterwards: exactly one script request (the inbox chunk)
- adding `<tessera-chat-launcher>`: the launcher chunk only; the inbox chunk downloads when the panel first opens
- `<tessera-inbox>` upgrades inside an app's own shadow root and inside `<tessera-chat>`'s
