# Page cost after moving to zod/mini (session 0.2)

Measured on 2026-10-04 with `pnpm budget`, which now builds pages the way a production app does (`process.env.NODE_ENV` replaced with `"production"`), against `tessera` with core, protocol and storage on zod/mini. Baseline: [baseline-2026-10.md](baseline-2026-10.md). Decision: [ADR 5](../decisions/0005-zod-mini.md).

| Page | Initial gzip before | Initial gzip after | New budget (initial / total) |
| --- | ---: | ---: | ---: |
| `chat-page` | 68.6 KB | **44.3 KB** | 45.7 / 78.9 KB |
| `video-page` | 60.9 KB | **36.7 KB** | 37.8 / 64.7 KB |
| `comments-page` | 59.8 KB | **35.5 KB** | 36.6 / 60.3 KB |
| `presence-page` | 57.6 KB | **33.3 KB** | 34.4 / 56.2 KB |

zod was about 28 KB gzip on every page. It's now about 3 KB from core plus what the kit's own schemas use; those schemas load with the elements, so the zod/mini code they need (objects, defaults, enums, string and number checks) is part of the first load. Moving the option schemas behind the lazily loaded plugin is a possible next step.
