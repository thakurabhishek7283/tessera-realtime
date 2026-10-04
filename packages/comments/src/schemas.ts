import { MessageBody } from '@tessera-kit/protocol';
import * as z from 'zod/mini';
import { MAX_COMMENTS } from './config.js';

export const CommentSchema = z.object({
  id: z.string().check(z.minLength(1)),
  /** Replies point at a top-level comment; replies to replies are not supported. */
  parentId: z.optional(z.string()),
  authorId: z.string(),
  authorName: z.string(),
  authorAvatarUrl: z.optional(z.string()),
  body: MessageBody,
  rating: z.optional(z.int().check(z.gte(1), z.lte(5))),
  /** emoji → user ids */
  reactions: z.record(z.string(), z.array(z.string())),
  createdAt: z.string(),
  editedAt: z.optional(z.string()),
  deletedAt: z.optional(z.string()),
});

/** One document per target keeps writes atomic and reads to a single request. */
export const ThreadSchema = z.object({
  targetId: z.string(),
  comments: z.array(CommentSchema).check(z.maxLength(MAX_COMMENTS)),
  resolved: z.boolean(),
  updatedAt: z.string(),
});

export type Comment = z.infer<typeof CommentSchema>;
export type ThreadDoc = z.infer<typeof ThreadSchema>;
