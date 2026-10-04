import { defineElement, registerImplicitPlugin } from '@tessera-kit/elements';
import { TesseraChatElement } from './chat.js';
import { TesseraChatComposer } from './composer.js';
import { TesseraChatMessage } from './message.js';
import { TesseraMessageList } from './message-list.js';

export { TesseraChatElement } from './chat.js';
export { type ComposerOptions, type ComposerSubmit, TesseraChatComposer } from './composer.js';
export type { TesseraEmojiPicker } from './emoji-picker.js';
export type { TesseraInboxElement } from './inbox.js';
export type { TesseraChatLauncher } from './launcher.js';
export {
  type MessageAction,
  type MessageActionDetail,
  type MessageFeatures,
  TesseraChatMessage,
} from './message.js';
export { TesseraMessageList } from './message-list.js';

// Defining the tags and registering the loader is what lets a bare <tessera-chat> work on the
// implicit default instance, without any createTessera() call.
defineElement('tessera-chat-message', TesseraChatMessage);
defineElement('tessera-message-list', TesseraMessageList);
defineElement('tessera-chat-composer', TesseraChatComposer);
defineElement('tessera-chat', TesseraChatElement);
// The inbox and the launcher are separate chunks: pages that only show one conversation never
// download them. Tags written in markup upgrade as soon as the chunk has loaded.
void import('./inbox.js').then((m) => defineElement('tessera-inbox', m.TesseraInboxElement));
void import('./launcher.js').then((m) =>
  defineElement('tessera-chat-launcher', m.TesseraChatLauncher),
);
registerImplicitPlugin('chat', () => import('../plugin.js'));

declare global {
  interface HTMLElementTagNameMap {
    'tessera-chat': TesseraChatElement;
    'tessera-chat-composer': TesseraChatComposer;
    'tessera-chat-message': TesseraChatMessage;
    'tessera-message-list': TesseraMessageList;
    'tessera-emoji-picker': import('./emoji-picker.js').TesseraEmojiPicker;
    'tessera-inbox': import('./inbox.js').TesseraInboxElement;
    'tessera-chat-launcher': import('./launcher.js').TesseraChatLauncher;
  }
}
