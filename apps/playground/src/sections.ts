import type { PluginLoader, TesseraInstance } from '@tessera/core';
import type { TemplateResult } from 'lit';
import type { z } from 'zod';

/** One kit in the playground: its plugin, its option schema and what it shows. */
export interface Section {
  id: string;
  label: string;
  /** What the section demonstrates, shown above it. */
  blurb: string;
  schema: z.ZodType;
  load: PluginLoader;
  /** Defaults on top of `{ enabled: true }`, e.g. a predefined conversation list. */
  defaults?: Record<string, unknown>;
  render(ctx: SectionContext): TemplateResult;
}

export interface SectionContext {
  instance: TesseraInstance;
  mode: 'local' | 'server';
  user: string;
}

/** Filled in by each kit's playground module as it lands. */
export const SECTIONS: Section[] = [];
