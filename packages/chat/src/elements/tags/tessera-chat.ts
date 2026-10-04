// <tessera-chat> and the elements it renders: `@tessera-kit/chat/elements/tessera-chat`.
import '../setup.js';
import './tessera-message-list.js';
import './tessera-chat-composer.js';
import { defineElement } from '@tessera-kit/elements';
import { TesseraChatElement } from '../chat.js';

defineElement('tessera-chat', TesseraChatElement);

export { TesseraChatElement };
