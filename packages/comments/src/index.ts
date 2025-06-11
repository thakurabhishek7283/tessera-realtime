export { CommentsConfig, type CommentsConfigValue, MAX_COMMENTS } from './config.js';
export { type Op, summarise } from './ops.js';
export { commentsPlugin as default, commentsPlugin } from './plugin.js';
export { type Comment, CommentSchema, type ThreadDoc, ThreadSchema } from './schemas.js';
export { deriveState } from './thread.js';
export type {
  CommentBody,
  CommentNode,
  CommentsApi,
  RatingSummary,
  ThreadController,
  ThreadState,
} from './types.js';
