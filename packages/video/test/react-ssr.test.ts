import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Call, CallButton } from '../src/react/index.js';

describe('React bindings on the server', () => {
  it('render empty tags with attributes and never touch the DOM', () => {
    expect(typeof customElements).toBe('undefined');
    const call = renderToString(createElement(Call, { callId: 'standup', autostart: true }));
    expect(call).toMatch(/^<tessera-call/);
    expect(call).toContain('call-id="standup"');
    expect(call).toContain('autostart=""');
    expect(renderToString(createElement(CallButton, { callId: 'demo' }))).toContain(
      'call-id="demo"',
    );
  });
});
