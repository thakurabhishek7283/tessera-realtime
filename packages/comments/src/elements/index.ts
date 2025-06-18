import { defineElement, registerImplicitPlugin } from '@tessera/elements';
import { TesseraCommentsElement } from './comments.js';
import { TesseraCommentComposer } from './composer.js';
import { TesseraCommentCount } from './count.js';
import { TesseraStarRating } from './stars.js';

export { TesseraCommentsElement } from './comments.js';
export { type ComposerSubmit, TesseraCommentComposer } from './composer.js';
export { TesseraCommentCount } from './count.js';
export { TesseraStarRating } from './stars.js';

// Defining the tags and registering the loader is what lets a bare <tessera-comments> work on the
// implicit default instance, without any createTessera() call.
defineElement('tessera-star-rating', TesseraStarRating);
defineElement('tessera-comment-composer', TesseraCommentComposer);
defineElement('tessera-comments', TesseraCommentsElement);
defineElement('tessera-comment-count', TesseraCommentCount);
registerImplicitPlugin('comments', () => import('../plugin.js'));

declare global {
  interface HTMLElementTagNameMap {
    'tessera-comments': TesseraCommentsElement;
    'tessera-comment-count': TesseraCommentCount;
    'tessera-comment-composer': TesseraCommentComposer;
    'tessera-star-rating': TesseraStarRating;
  }
}
