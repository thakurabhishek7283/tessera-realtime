import { createStore } from '@tessera/core';
import { useFeature, useStore } from '@tessera/react';
import { wrapElement } from '@tessera-internal/react-wrap';
import { useEffect, useState } from 'react';
import type { TesseraCallButton } from '../elements/button.js';
import type { TesseraCallElement } from '../elements/call.js';
import type { CallController, CallError, CallState, Participant, VideoApi } from '../types.js';

// Importing the elements module defines the tags. It touches `customElements`, so it only runs
// in the browser; on the server the wrappers render empty tags that upgrade after hydration.
if (typeof window !== 'undefined') void import('../elements/index.js');

export interface CallProps {
  callId: string;
  autostart?: boolean | undefined;
  onCallJoin?: ((event: CustomEvent<{ callId: string }>) => void) | undefined;
  onCallLeave?: ((event: CustomEvent<{ callId: string }>) => void) | undefined;
  onParticipantJoin?: ((event: CustomEvent<{ participant: Participant }>) => void) | undefined;
  onParticipantLeave?: ((event: CustomEvent<{ participant: Participant }>) => void) | undefined;
  onCallError?: ((event: CustomEvent<{ error: CallError }>) => void) | undefined;
}

/** `<tessera-call>` for React. */
export const Call = wrapElement<TesseraCallElement, CallProps>({
  tag: 'tessera-call',
  properties: [],
  attributes: { callId: 'call-id', autostart: 'autostart' },
  events: {
    onCallJoin: 'call-join',
    onCallLeave: 'call-leave',
    onParticipantJoin: 'participant-join',
    onParticipantLeave: 'participant-leave',
    onCallError: 'call-error',
  },
});

export interface CallButtonProps {
  callId: string;
  onCallOpen?: ((event: CustomEvent<{ callId: string }>) => void) | undefined;
  onCallClose?: ((event: CustomEvent<{ callId: string }>) => void) | undefined;
}

/** `<tessera-call-button>` for React. */
export const CallButton = wrapElement<TesseraCallButton, CallButtonProps>({
  tag: 'tessera-call-button',
  properties: [],
  attributes: { callId: 'call-id' },
  events: { onCallOpen: 'call-open', onCallClose: 'call-close' },
});

const idle = createStore<CallState | undefined>(undefined);

/** The video API once the feature is enabled, or `undefined`. */
export function useVideoApi(): VideoApi | undefined {
  return useFeature('video');
}

export interface UseCall {
  controller: CallController | undefined;
  state: CallState | undefined;
}

/**
 * The controller of a call and its live state. The controller is replaced after a call ends, so
 * the hook always hands out one that can be started.
 *
 * @example
 * const { controller, state } = useCall('standup');
 * state?.phase === 'in-call' && <button onClick={() => controller?.leave()}>Leave</button>;
 */
export function useCall(callId: string): UseCall {
  const api = useVideoApi();
  const [controller, setController] = useState<CallController>();

  useEffect(() => {
    if (!api) return;
    const current = api.call(callId);
    setController(current);
    const stop = current.state.subscribe((state) => {
      // A finished call is forgotten by the API; pick up the fresh controller for the same id.
      if (state.phase === 'ended' || state.phase === 'error') setController(api.call(callId));
    });
    return () => {
      stop();
      setController(undefined);
      void current.leave();
    };
  }, [api, callId]);

  const state = useStore(controller?.state ?? idle);
  return { controller, state };
}

export type { TesseraCallButton, TesseraCallElement };
