// <tessera-presence> and the elements it renders: `@tessera-kit/presence/elements/tessera-presence`.
import '../setup.js';
import { defineElement } from '@tessera-kit/elements';
import { TesseraPresenceElement } from '../presence.js';

defineElement('tessera-presence', TesseraPresenceElement);

export { TesseraPresenceElement };
