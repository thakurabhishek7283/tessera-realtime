// <tessera-inbox> and the elements it renders: `@tessera-kit/chat/elements/tessera-inbox`.
import '../setup.js';
import './tessera-chat.js';
import { defineElement } from '@tessera-kit/elements';
import { TesseraInboxElement } from '../inbox.js';

defineElement('tessera-inbox', TesseraInboxElement);

export { TesseraInboxElement };
