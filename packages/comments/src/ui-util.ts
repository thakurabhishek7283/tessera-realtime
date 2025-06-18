export interface TextPart {
  text: string;
  /** Set when the part is a link. */
  href?: string;
}

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+/gi;

/**
 * Splits plain text into text and link parts. Only `http` and `https` URLs become links, and
 * punctuation that ends a sentence is not part of the link. The parts are meant to be rendered as
 * text nodes and anchors, never as HTML.
 */
export function linkify(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    let url = match[0];
    for (;;) {
      const end = url.at(-1) ?? '';
      const closing = end === ')' || end === ']' || end === '}';
      const open = end === ')' ? '(' : end === ']' ? '[' : '{';
      const count = (c: string): number => url.split(c).length - 1;
      if (/[.,;:!?'"]/.test(end) || (closing && count(end) > count(open))) url = url.slice(0, -1);
      else break;
    }
    try {
      new URL(url);
    } catch {
      continue;
    }
    if (start > last) parts.push({ text: text.slice(last, start) });
    parts.push({ text: url, href: url });
    last = start + url.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

/** Plain text of a comment body, for previews and announcements. */
export function plainText(
  body: { type: 'text'; text: string } | { type: 'rich'; doc: unknown },
): string {
  if (body.type === 'text') return body.text;
  const parts: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node !== 'object' || node === null) return;
    const { text, content } = node as { text?: unknown; content?: unknown };
    if (typeof text === 'string') parts.push(text);
    if (Array.isArray(content)) for (const child of content) walk(child);
  };
  walk(body.doc);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}
