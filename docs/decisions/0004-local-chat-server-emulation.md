# 4. With no server, the chat kit answers its own requests

Status: accepted

## Context

Chat is more than message passing: it has history, edits, reactions, read markers and unread counts, and tessera-server already implements them behind the `chat.*` requests of `@tessera-kit/protocol`. The live demo has to work on static hosting, where there is no server, and the kit should not grow a second code path for "no backend".

## Decision

The client speaks the `chat.*` protocol and nothing else. When the transport has no server history (`capabilities.serverHistory` is false) and can host handlers (the `local` transport), the kit registers `createLocalChatServer` on it: the same requests answered from the storage adapter, with broadcasts through the transport. Tabs of one browser profile share conversations through IndexedDB and hear each other through `BroadcastChannel`. The same engine backs the server mode in unit tests.

## Consequences

- One client implementation, two interchangeable servers; protocol drift would show up in both modes at once.
- The local mode reads a whole conversation for a history request and keeps read markers per browser profile. It is meant for demos and small apps, which the README says.
- The protocol has no push for "a conversation was created with you". The local emulation announces it on the kit's control room, other transports are caught by a refresh when the tab becomes visible, after a reconnect and once a minute. A server push would be a small protocol addition.
