// Plain HTML: <script type="module" src="…/@tessera-kit/comments/autoload"></script> registers every tag of
// the kit, and each one downloads the first time an element with that tag appears.
import { lazyDefine } from '@tessera-kit/elements';

lazyDefine('tessera-star-rating', () => import('./elements/tags/tessera-star-rating.js'));
lazyDefine('tessera-comment-composer', () => import('./elements/tags/tessera-comment-composer.js'));
lazyDefine('tessera-comments', () => import('./elements/tags/tessera-comments.js'));
lazyDefine('tessera-comment-count', () => import('./elements/tags/tessera-comment-count.js'));
