import { defineElement, registerImplicitPlugin } from '@tessera/elements';
import { TesseraCallButton } from './button.js';
import { TesseraCallElement } from './call.js';
import { TesseraVideoTile } from './tile.js';

export { TesseraCallButton } from './button.js';
export { TesseraCallElement } from './call.js';
export { TesseraVideoTile } from './tile.js';

// Defining the tags and registering the loader is what lets a bare <tessera-call> work on the
// implicit default instance, without any createTessera() call.
defineElement('tessera-video-tile', TesseraVideoTile);
defineElement('tessera-call', TesseraCallElement);
defineElement('tessera-call-button', TesseraCallButton);
registerImplicitPlugin('video', () => import('../plugin.js'));

declare global {
  interface HTMLElementTagNameMap {
    'tessera-video-tile': TesseraVideoTile;
    'tessera-call': TesseraCallElement;
    'tessera-call-button': TesseraCallButton;
  }
}
