// Each tag is defined by its own module (`./tags/<tag>.js`, published as `elements/<tag>`), which
// also defines the elements it renders. Importing this entry defines the kit's elements.
import './tags/tessera-star-rating.js';
import './tags/tessera-comment-composer.js';
import './tags/tessera-comments.js';
import './tags/tessera-comment-count.js';
import type { TesseraCommentsElement } from './comments.js';
import type { TesseraCommentComposer } from './composer.js';
import type { TesseraCommentCount } from './count.js';
import type { TesseraStarRating } from './stars.js';

export { TesseraCommentsElement } from './comments.js';
export { type ComposerSubmit, TesseraCommentComposer } from './composer.js';
export { TesseraCommentCount } from './count.js';
export { TesseraStarRating } from './stars.js';

declare global {
  interface HTMLElementTagNameMap {
    'tessera-comments': TesseraCommentsElement;
    'tessera-comment-count': TesseraCommentCount;
    'tessera-comment-composer': TesseraCommentComposer;
    'tessera-star-rating': TesseraStarRating;
  }
}
