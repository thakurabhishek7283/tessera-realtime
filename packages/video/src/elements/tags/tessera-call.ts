// <tessera-call> and the elements it renders: `@tessera-kit/video/elements/tessera-call`.
import '../setup.js';
import './tessera-video-tile.js';
import { defineElement } from '@tessera-kit/elements';
import { TesseraCallElement } from '../call.js';

defineElement('tessera-call', TesseraCallElement);

export { TesseraCallElement };
