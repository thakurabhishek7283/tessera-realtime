import type { TesseraContext } from '@tessera/core';

/** The part of the editor kit's service the chat uses. Kits do not import each other (D4). */
export interface EditorBridge {
  toPlainText(doc: unknown): string;
}

/** The `editor` service, if that kit is enabled on the instance. */
export function editorService(ctx: TesseraContext): EditorBridge | undefined {
  const registry = ctx.services as unknown as { get(id: string): EditorBridge | undefined };
  return registry.get('editor');
}

/** Whether rich messages can be composed and shown: the service and both of its elements exist. */
export function richAvailable(ctx: TesseraContext): boolean {
  return (
    editorService(ctx) !== undefined &&
    typeof customElements !== 'undefined' &&
    !!customElements.get('tessera-editor') &&
    !!customElements.get('tessera-rich-text')
  );
}

/** Whether another kit's service is registered and its element is defined (progressive use). */
export function hasKit(ctx: TesseraContext, service: string, tag: string): boolean {
  const registry = ctx.services as unknown as { get(id: string): unknown };
  return registry.get(service) !== undefined && !!customElements.get(tag);
}

/**
 * Calls `onChange` when the editor service appears or disappears later (the editor kit can be
 * enabled at runtime), so elements that offer rich text can render again.
 */
export function watchEditor(ctx: TesseraContext, onChange: () => void): () => void {
  const registry = ctx.services as unknown as {
    watch(id: string, fn: (impl: unknown) => void): () => void;
  };
  let initial = true;
  return registry.watch('editor', () => {
    // `watch` reports the current state at once; only changes are interesting.
    if (initial) initial = false;
    else onChange();
  });
}
