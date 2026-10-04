// Plain HTML: <script type="module" src="…/@tessera-kit/chat/autoload"></script> registers every tag of
// the kit, and each one downloads the first time an element with that tag appears.
import { lazyDefine } from '@tessera-kit/elements';

lazyDefine('tessera-chat-message', () => import('./elements/tags/tessera-chat-message.js'));
lazyDefine('tessera-message-list', () => import('./elements/tags/tessera-message-list.js'));
lazyDefine('tessera-chat-composer', () => import('./elements/tags/tessera-chat-composer.js'));
lazyDefine('tessera-chat', () => import('./elements/tags/tessera-chat.js'));
lazyDefine('tessera-inbox', () => import('./elements/tags/tessera-inbox.js'));
lazyDefine('tessera-chat-launcher', () => import('./elements/tags/tessera-chat-launcher.js'));
lazyDefine('tessera-emoji-picker', () => import('./elements/tags/tessera-emoji-picker.js'));
