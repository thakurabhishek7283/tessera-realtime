// A page with one bare <tessera-chat> on the implicit default instance. The chat kit's elements
// entry defines the conversation view only; <tessera-inbox> and <tessera-chat-launcher> download
// the first time one appears (e2e/lazy-define.spec.ts checks the requests).
import '@tessera-kit/elements/define';
import '@tessera-kit/chat/elements';
