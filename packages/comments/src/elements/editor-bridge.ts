import type { TesseraContext } from '@tessera-kit/core';

/** The `editor` kit's service and both of its elements are available: rich comments can be used. */
export function richAvailable(ctx: TesseraContext): boolean {
  const registry = ctx.services as unknown as { get(id: string): unknown };
  return (
    registry.get('editor') !== undefined &&
    typeof customElements !== 'undefined' &&
    !!customElements.get('tessera-editor') &&
    !!customElements.get('tessera-rich-text')
  );
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
