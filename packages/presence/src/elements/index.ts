import { defineElement, registerImplicitPlugin } from '@tessera-kit/elements';
import { TesseraCursorsElement } from './cursors.js';
import { TesseraPresenceElement } from './presence.js';

export { TesseraCursorsElement } from './cursors.js';
export { TesseraPresenceElement } from './presence.js';

// Defining the tags and registering the loader is what lets a bare <tessera-presence> work on the
// implicit default instance, without any createTessera() call.
defineElement('tessera-presence', TesseraPresenceElement);
defineElement('tessera-cursors', TesseraCursorsElement);
registerImplicitPlugin('presence', () => import('../plugin.js'));

declare global {
  interface HTMLElementTagNameMap {
    'tessera-presence': TesseraPresenceElement;
    'tessera-cursors': TesseraCursorsElement;
  }
}
