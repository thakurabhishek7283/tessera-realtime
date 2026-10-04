// Plain HTML: <script type="module" src="…/@tessera-kit/presence/autoload"></script> registers every tag of
// the kit, and each one downloads the first time an element with that tag appears.
import { lazyDefine } from '@tessera-kit/elements';

lazyDefine('tessera-presence', () => import('./elements/tags/tessera-presence.js'));
lazyDefine('tessera-cursors', () => import('./elements/tags/tessera-cursors.js'));
