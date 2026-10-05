// Each tag is defined by its own module (`./tags/<tag>.js`, published as `elements/<tag>`), which
// also defines the elements it renders. Importing this entry defines the kit's elements.
import './tags/tessera-video-tile.js';
import './tags/tessera-call.js';
import './tags/tessera-call-button.js';
import type { TesseraCallButton } from './button.js';
import type { TesseraCallElement } from './call.js';
import type { TesseraVideoTile } from './tile.js';

export { TesseraCallButton } from './button.js';
export { TesseraCallElement } from './call.js';
export { TesseraVideoTile } from './tile.js';

declare global {
  interface HTMLElementTagNameMap {
    'tessera-video-tile': TesseraVideoTile;
    'tessera-call': TesseraCallElement;
    'tessera-call-button': TesseraCallButton;
  }
}
