import type { TesseraContext } from '@tessera/core';

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
