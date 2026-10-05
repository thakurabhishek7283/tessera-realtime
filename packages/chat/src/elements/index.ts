// Each tag is defined by its own module (`./tags/<tag>.js`, published as `elements/<tag>`), which
// also defines the elements it renders. Importing this entry defines the kit's elements.
import { lazyDefine } from '@tessera-kit/elements';
import './tags/tessera-chat-message.js';
import './tags/tessera-message-list.js';
import './tags/tessera-chat-composer.js';
import './tags/tessera-chat.js';
import type { TesseraChatElement } from './chat.js';
import type { TesseraChatComposer } from './composer.js';
import type { TesseraChatMessage } from './message.js';
import type { TesseraMessageList } from './message-list.js';

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

// The inbox and the launcher are separate chunks, downloaded the first time one of them appears on
// the page, so pages that only show one conversation never load them.
lazyDefine('tessera-inbox', () => import('./tags/tessera-inbox.js'));
lazyDefine('tessera-chat-launcher', () => import('./tags/tessera-chat-launcher.js'));

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
