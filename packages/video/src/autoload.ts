// Plain HTML: <script type="module" src="…/@tessera-kit/video/autoload"></script> registers every tag of
// the kit, and each one downloads the first time an element with that tag appears.
import { lazyDefine } from '@tessera-kit/elements';

lazyDefine('tessera-video-tile', () => import('./elements/tags/tessera-video-tile.js'));
lazyDefine('tessera-call', () => import('./elements/tags/tessera-call.js'));
lazyDefine('tessera-call-button', () => import('./elements/tags/tessera-call-button.js'));
