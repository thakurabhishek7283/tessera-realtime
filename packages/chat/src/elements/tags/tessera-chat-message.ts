// <tessera-chat-message> and the elements it renders: `@tessera-kit/chat/elements/tessera-chat-message`.
import '../setup.js';
import { defineElement } from '@tessera-kit/elements';
import { TesseraChatMessage } from '../message.js';

defineElement('tessera-chat-message', TesseraChatMessage);

export { TesseraChatMessage };
