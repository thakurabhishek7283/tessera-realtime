import type { ReadonlyStore } from '@tessera-kit/core';
import type { CommentsConfigValue } from './config.js';
import type { RatingSummary } from './ops.js';
import type { Comment } from './schemas.js';

export type { Comment, RatingSummary };

export type CommentBody = Comment['body'];

/** A top-level comment with its replies (one level, oldest first). */
export interface CommentNode extends Comment {
  replies: Comment[];
}

export interface ThreadState {
  /** Top-level comments in the configured order. Deleted ones with replies appear as tombstones. */
  comments: CommentNode[];
  /** Everything not deleted, replies included. */
  count: number;
  resolved: boolean;
  loading: boolean;
  error: string | undefined;
  /** Present when ratings are on and at least one comment has one. */
  summary: RatingSummary | undefined;
}

export interface ThreadController {
  readonly targetId: string;
  readonly state: ReadonlyStore<ThreadState>;
  add(body: CommentBody, opts?: { parentId?: string; rating?: number }): Promise<Comment>;
  /** Only the author can edit. */
  edit(id: string, body: CommentBody): Promise<void>;
  /** The author, or a user with the `moderator` role, can remove. */
  remove(id: string): Promise<void>;
  /** Toggles the current user's reaction. */
  react(id: string, emoji: string): Promise<void>;
  setResolved(resolved: boolean): Promise<void>;
  close(): void;
}

export interface CommentsApi {
  readonly config: CommentsConfigValue;
  /** Loads the thread of `targetId` and keeps it in sync. */
  thread(targetId: string): Promise<ThreadController>;
  /** Number of comments on `targetId`, kept up to date while something subscribes to it. */
  count(targetId: string): ReadonlyStore<number>;
}

declare module '@tessera-kit/core' {
  interface FeatureApiMap {
    comments: CommentsApi;
  }
  interface ServiceMap {
    comments: CommentsApi;
  }
  interface TesseraEvents {
    'comments:added': { targetId: string; comment: Comment };
    'comments:conflict': { targetId: string; resolution: 'reapplied' | 'reverted' | 'dropped' };
  }
}
