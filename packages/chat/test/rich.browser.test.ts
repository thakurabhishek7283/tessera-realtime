import { cleanup, must } from '@tessera-internal/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { composerOf, messageEls, mountTab, newWorld, until } from './ui.js';

afterEach(cleanup);

/**
 * The editor kit lives in tessera-workspace, so this stands in for it: a service, an editor
 * element that exposes the part of the handle the chat uses, and a read-only renderer.
 */
function installFakeEditor(): void {
  if (!customElements.get('tessera-editor')) {
    customElements.define(
      'tessera-editor',
      class extends HTMLElement {
        doc: unknown = { type: 'doc', content: [{ type: 'paragraph' }] };
        editor = {
          getJSON: () => this.doc,
          setContent: (doc: unknown) => {
            this.doc = doc;
          },
          focus: () => undefined,
        };
        type(text: string): void {
          this.doc = {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
          };
          this.dispatchEvent(
            new CustomEvent('change', { detail: { value: { isEmpty: false, json: this.doc } } }),
          );
        }
      },
    );
  }
  if (!customElements.get('tessera-rich-text')) {
    customElements.define(
      'tessera-rich-text',
      class extends HTMLElement {
        set doc(value: { content?: Array<{ content?: Array<{ text?: string }> }> }) {
          this.textContent = `rich:${value.content?.[0]?.content?.[0]?.text ?? ''}`;
        }
      },
    );
  }
}

describe('rich messages through the editor kit', () => {
  it('composes with the editor when it is available and shows the result with its renderer', async () => {
    installFakeEditor();
    const world = await newWorld('server');
    const { el, tab } = await mountTab(
      world,
      '<tessera-chat conversation="general"></tessera-chat>',
      undefined,
      { composer: { rich: true } as never },
    );
    (
      tab.instance.ctx.services as unknown as { register(id: string, impl: unknown): void }
    ).register('editor', { toPlainText: () => '' });
    const composer = await until(() => composerOf(el));
    const editor = await until(() =>
      composer.shadowRoot?.querySelector<HTMLElement & { type(t: string): void }>('tessera-editor'),
    );
    editor.type('bold move');
    const send = must(composer.shadowRoot?.querySelector<HTMLElement>('tessera-icon-button.send'));
    await until(() => !send.hasAttribute('disabled'));
    send.click();
    await until(() => messageEls(el).length === 1);
    expect(tab.api.conversations.get()[0]?.lastMessage?.body.type).toBe('rich');
    const rendered = await until(() =>
      messageEls(el)[0]?.shadowRoot?.querySelector('tessera-rich-text'),
    );
    expect(rendered.textContent).toBe('rich:bold move');
  });

  it('falls back to a textarea and plain text when the editor kit is absent', async () => {
    const world = await newWorld('server');
    const { el } = await mountTab(
      world,
      '<tessera-chat conversation="general"></tessera-chat>',
      undefined,
      { composer: { rich: true } as never },
    );
    const composer = await until(() => composerOf(el));
    await until(
      () =>
        composer.shadowRoot?.querySelector('textarea') ||
        composer.shadowRoot?.querySelector('tessera-editor'),
    );
    // No `editor` service is registered here, so the plain box is used even though rich is on.
    expect(composer.shadowRoot?.querySelector('textarea')).not.toBeNull();
  });
});
