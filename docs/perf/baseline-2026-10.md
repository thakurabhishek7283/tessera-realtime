# Page cost baseline, October 2026

Measured on 2026-10-04 with `pnpm budget` (rolldown 1.2.12, minified ESM, code splitting on, gzip level 9, brotli quality 11), every dependency included except `react` and `react-dom`. Each page is the `tessera` base page (`createTessera` plus `@tessera-kit/elements/define`) plus one kit's `elements` entry. Budgets in `budgets/pages.json` start at these numbers plus 3% and only go down (see `tessera`'s ADR 6 and the update to [ADR 2](../decisions/0002-bundle-budgets.md)).

| Page | Initial gzip | Initial brotli | Total gzip | Budget (initial / total gzip) |
| --- | ---: | ---: | ---: | ---: |
| `chat-page` | 68.6 KB | 60.5 KB | 94.4 KB | 70.7 / 97.3 KB |
| `video-page` | 60.9 KB | 53.5 KB | 80.8 KB | 62.8 / 83.3 KB |
| `comments-page` | 59.8 KB | 52.6 KB | 76.6 KB | 61.6 / 79.0 KB |
| `presence-page` | 57.6 KB | 50.5 KB | 71.9 KB | 59.4 / 74.1 KB |

## Top contributors (initial load)

| Package | chat | video | comments | presence |
| --- | ---: | ---: | ---: | ---: |
| zod | 28.0 KB | 28.0 KB | 27.9 KB | 28.0 KB |
| @tessera-kit/elements | 17.5 KB | 17.1 KB | 16.7 KB | 17.0 KB |
| the kit itself | 13.0 KB | 5.9 KB | 6.0 KB | 2.6 KB |
| @tessera-kit/core | 3.9 KB | 3.9 KB | 3.8 KB | 3.9 KB |
| Lit (lit-html, reactive-element, lit-element, context) | 6.2 KB | 6.1 KB | 5.2 KB | 6.2 KB |

## What this says

- **zod is the largest package on every page**, 28 KB gzip, 40–49% of the initial load. Session 0.2 of the plan moves the runtime path to `zod/mini`.
- **Chat starts two dynamic imports at module load** (`inbox.js` and `launcher.js` in `src/elements/index.ts`). The report counts them as lazy, but every chat page downloads them right after the entry, whether or not it renders an inbox or a launcher. Session 0.3 removes this.
- **No duplicate packages** on any page. A composed realtime page (chat plus presence) is worth adding once Studio composes kits.
