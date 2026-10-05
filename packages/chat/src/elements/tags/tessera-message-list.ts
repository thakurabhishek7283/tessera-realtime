// <tessera-message-list> and the elements it renders: `@tessera-kit/chat/elements/tessera-message-list`.
import '../setup.js';
import './tessera-chat-message.js';
import { defineElement } from '@tessera-kit/elements';
import { TesseraMessageList } from '../message-list.js';

defineElement('tessera-message-list', TesseraMessageList);

export { TesseraMessageList };
