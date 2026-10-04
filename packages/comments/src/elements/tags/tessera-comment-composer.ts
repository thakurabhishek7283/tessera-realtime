// <tessera-comment-composer> and the elements it renders: `@tessera-kit/comments/elements/tessera-comment-composer`.
import '../setup.js';
import './tessera-star-rating.js';
import { defineElement } from '@tessera-kit/elements';
import { TesseraCommentComposer } from '../composer.js';

defineElement('tessera-comment-composer', TesseraCommentComposer);

export { TesseraCommentComposer };
