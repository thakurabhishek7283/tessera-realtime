import { createStore } from '@tessera-kit/core';
import { useFeature, useStore } from '@tessera-kit/react';
import { wrapElement } from '@tessera-internal/react-wrap';
import { useEffect, useState } from 'react';
import type { TesseraCommentsElement } from '../elements/comments.js';
import type { TesseraCommentCount } from '../elements/count.js';
import type { Comment, CommentBody, CommentsApi, ThreadController, ThreadState } from '../types.js';

// Importing the elements module defines the tags. It touches `customElements`, so it only runs
// in the browser; on the server the wrappers render empty tags that upgrade after hydration.
if (typeof window !== 'undefined') void import('../elements/index.js');

export interface CommentsProps {
  /** Id of the thing being discussed. */
  target: string;
  readonly?: boolean | undefined;
  onCommentAdd?: ((event: CustomEvent<{ comment: Comment }>) => void) | undefined;
  onCommentEdit?: ((event: CustomEvent<{ id: string; body: CommentBody }>) => void) | undefined;
  onCommentDelete?: ((event: CustomEvent<{ id: string }>) => void) | undefined;
  onThreadResolve?: ((event: CustomEvent<{ resolved: boolean }>) => void) | undefined;
}

/** `<tessera-comments>` for React. */
export const Comments = wrapElement<TesseraCommentsElement, CommentsProps>({
  tag: 'tessera-comments',
  properties: [],
  attributes: { target: 'target', readonly: 'readonly' },
  events: {
    onCommentAdd: 'comment-add',
    onCommentEdit: 'comment-edit',
    onCommentDelete: 'comment-delete',
    onThreadResolve: 'thread-resolve',
  },
});

export interface CommentCountProps {
  target: string;
  showZero?: boolean | undefined;
}

/** `<tessera-comment-count>` for React. */
export const CommentCount = wrapElement<TesseraCommentCount, CommentCountProps>({
  tag: 'tessera-comment-count',
  properties: [],
  attributes: { target: 'target', showZero: 'show-zero' },
  events: {},
});

const idle = createStore<ThreadState | undefined>(undefined);
const zero = createStore(0);

/** The comments API once the feature is enabled, or `undefined`. */
export function useCommentsApi(): CommentsApi | undefined {
  return useFeature('comments');
}

export interface UseThread {
  /** `undefined` until the thread has loaded. */
  controller: ThreadController | undefined;
  state: ThreadState | undefined;
  error: Error | undefined;
}

/**
 * Opens a thread and keeps React in sync with it. It is closed when `targetId` changes or the
 * component unmounts.
 *
 * @example
 * const { controller, state } = useThread('listing-42');
 * state?.comments.map((c) => <p key={c.id}>{c.authorName}</p>);
 */
export function useThread(targetId: string): UseThread {
  const api = useCommentsApi();
  const [controller, setController] = useState<ThreadController>();
  const [error, setError] = useState<Error>();

  useEffect(() => {
    if (!api) return;
    let cancelled = false;
    let opened: ThreadController | undefined;
    api
      .thread(targetId)
      .then((c) => {
        opened = c;
        if (cancelled) c.close();
        else {
          setError(undefined);
          setController(c);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e);
      });
    return () => {
      cancelled = true;
      opened?.close();
      setController(undefined);
    };
  }, [api, targetId]);

  const state = useStore(controller?.state ?? idle);
  return { controller, state: controller ? state : undefined, error };
}

/** The number of comments on a target, kept up to date. 0 while the feature is off. */
export function useCommentCount(targetId: string): number {
  const api = useCommentsApi();
  const [store, setStore] = useState(zero);
  useEffect(() => {
    if (api) setStore(api.count(targetId) as typeof zero);
    return () => setStore(zero);
  }, [api, targetId]);
  return useStore(store);
}

export type { TesseraCommentCount, TesseraCommentsElement };
