# 2. Bundle budgets are measured on everything an entry can load

Status: accepted

## Context

The size budgets are checked with `size-limit`, which bundles an entry together with the modules it imports dynamically. The `elements` entry of a kit loads its plugin lazily (`registerImplicitPlugin`), and the chat entry also loads its inbox, launcher and emoji picker lazily, so the number `size-limit` reports is the cost of the kit when all of it is used, not of the first request.

## Decision

Budgets (min + gzip, peers excluded) are set on that total, from what the code costs today plus a small margin:

| Package | Entry and plugin | Elements, everything they can load |
| --- | --- | --- |
| `@tessera/presence` | 6 kB | 8 kB |
| `@tessera/chat` | 11 kB | 27 kB |

The first load of `<tessera-chat>` is smaller than the total: the message list, message, composer and chat element are about 15 kB gzipped, and the plugin, the inbox, the launcher and the emoji picker each arrive in their own chunk when they are needed.

## Consequences

- Chat is above the 20 kB of the original plan. It ships seven elements, English and German messages, the in-browser server emulation that makes it work with no backend, and windowed rendering for long conversations. The lazy chunks keep the first request near the plan.
- A budget failure in CI means a real regression of what users download, not an accounting quirk. Raising a limit needs a note here.
