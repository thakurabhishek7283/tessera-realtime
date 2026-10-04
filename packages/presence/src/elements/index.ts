// Each tag is defined by its own module (`./tags/<tag>.js`, published as `elements/<tag>`), which
// also defines the elements it renders. Importing this entry defines the kit's elements.
import './tags/tessera-presence.js';
import './tags/tessera-cursors.js';
import type { TesseraCursorsElement } from './cursors.js';
import type { TesseraPresenceElement } from './presence.js';

export { TesseraCursorsElement } from './cursors.js';
export { TesseraPresenceElement } from './presence.js';

declare global {
  interface HTMLElementTagNameMap {
    'tessera-presence': TesseraPresenceElement;
    'tessera-cursors': TesseraCursorsElement;
  }
}
