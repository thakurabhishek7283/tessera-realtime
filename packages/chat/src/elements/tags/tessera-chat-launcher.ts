// <tessera-chat-launcher> and the elements it renders: `@tessera-kit/chat/elements/tessera-chat-launcher`.
import '../setup.js';
import { defineElement, lazyDefine } from '@tessera-kit/elements';
import { TesseraChatLauncher } from '../launcher.js';

defineElement('tessera-chat-launcher', TesseraChatLauncher);
// The inbox only renders while the panel is open, so it downloads the first time someone opens it.
lazyDefine('tessera-inbox', () => import('./tessera-inbox.js'));

export { TesseraChatLauncher };
