// <tessera-comments> and the elements it renders: `@tessera-kit/comments/elements/tessera-comments`.
import '../setup.js';
import './tessera-star-rating.js';
import './tessera-comment-composer.js';
import { defineElement } from '@tessera-kit/elements';
import { TesseraCommentsElement } from '../comments.js';

defineElement('tessera-comments', TesseraCommentsElement);

export { TesseraCommentsElement };
