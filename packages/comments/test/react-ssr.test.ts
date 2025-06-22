import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CommentCount, Comments } from '../src/react/index.js';

describe('React bindings on the server', () => {
  it('render empty tags with attributes and never touch the DOM', () => {
    expect(typeof customElements).toBe('undefined');
    const html = renderToString(createElement(Comments, { target: 'listing-1', readonly: true }));
    expect(html).toMatch(/^<tessera-comments/);
    expect(html).toContain('target="listing-1"');
    expect(html).toContain('readonly=""');
    expect(renderToString(createElement(CommentCount, { target: 'c', showZero: true }))).toContain(
      'show-zero=""',
    );
  });
});
