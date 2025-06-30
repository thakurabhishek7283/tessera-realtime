import type { PluginLoader, TesseraInstance } from '@tessera/core';
import type { TemplateResult } from 'lit';
import type { z } from 'zod';
import { chatSection } from './sections/chat.js';
import { commentsSection } from './sections/comments.js';
import { presenceSection } from './sections/presence.js';
import { videoSection } from './sections/video.js';

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

/** One entry per kit, in tab order. */
export const SECTIONS: Section[] = [presenceSection, chatSection, videoSection, commentsSection];
