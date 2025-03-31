import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Chat, ChatLauncher, Inbox } from '../src/react/index.js';

describe('React bindings on the server', () => {
  it('render empty tags with attributes and never touch the DOM', () => {
    expect(typeof customElements).toBe('undefined');
    const html = renderToString(
      createElement(Chat, { conversation: 'general', readonly: true, className: 'c' }),
    );
    expect(html).toMatch(/^<tessera-chat/);
    expect(html).toContain('conversation="general"');
    expect(html).toContain('readonly=""');
    expect(html).toContain('class="c"');
    expect(renderToString(createElement(Inbox, {}))).toMatch(/^<tessera-inbox/);
    expect(renderToString(createElement(ChatLauncher, { position: 'bottom-left' }))).toContain(
      'position="bottom-left"',
    );
  });
});
