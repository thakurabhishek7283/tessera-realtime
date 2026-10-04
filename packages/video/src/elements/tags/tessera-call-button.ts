// <tessera-call-button> and the elements it renders: `@tessera-kit/video/elements/tessera-call-button`.
import '../setup.js';
import './tessera-call.js';
import { defineElement } from '@tessera-kit/elements';
import { TesseraCallButton } from '../button.js';

defineElement('tessera-call-button', TesseraCallButton);

export { TesseraCallButton };
