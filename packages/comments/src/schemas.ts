import { MessageBody } from '@tessera/protocol';
import { z } from 'zod';
import { MAX_COMMENTS } from './config.js';

export const CommentSchema = z.object({
  id: z.string().min(1),
  /** Replies point at a top-level comment; replies to replies are not supported. */
  parentId: z.string().optional(),
  authorId: z.string(),
  authorName: z.string(),
  authorAvatarUrl: z.string().optional(),
  body: MessageBody,
  rating: z.number().int().min(1).max(5).optional(),
  /** emoji → user ids */
  reactions: z.record(z.string(), z.array(z.string())),
  createdAt: z.string(),
  editedAt: z.string().optional(),
  deletedAt: z.string().optional(),
});

/** One document per target keeps writes atomic and reads to a single request. */
export const ThreadSchema = z.object({
  targetId: z.string(),
  comments: z.array(CommentSchema).max(MAX_COMMENTS),
  resolved: z.boolean(),
  updatedAt: z.string(),
});

export type Comment = z.infer<typeof CommentSchema>;
export type ThreadDoc = z.infer<typeof ThreadSchema>;
