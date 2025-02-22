import type { ReadonlyStore, TesseraContext, Unsubscribe } from '@tessera/core';
import type { ChatConfigValue } from './config.js';

/** Shows the unread count in the page title and plays a short sound for new messages. */
export function installNotifications(
  ctx: TesseraContext,
  { titleBadge, sound }: ChatConfigValue['notifications'],
  totalUnread: ReadonlyStore<number>,
): Unsubscribe {
  if (typeof document === 'undefined') return () => {};
  const offs: Unsubscribe[] = [];

  if (titleBadge) {
    const render = (total: number): void => {
      // Take over the title only while there is something to show, so apps can change it freely.
      const current = document.title.replace(/^\(\d+\)\s/, '');
      if (total === 0) {
        if (document.title !== current) document.title = current;
        return;
      }
      document.title = `(${total}) ${current}`;
    };
    offs.push(totalUnread.subscribe(render));
    offs.push(() => {
      document.title = document.title.replace(/^\(\d+\)\s/, '');
    });
  }

  if (sound) {
    let audio: AudioContext | undefined;
    offs.push(
      ctx.bus.on('chat:message-received', () => {
        const Ctor = globalThis.AudioContext;
        if (!Ctor) return;
        try {
          audio ??= new Ctor();
          const osc = audio.createOscillator();
          const gain = audio.createGain();
          osc.frequency.value = 660;
          gain.gain.setValueAtTime(0.05, audio.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.18);
          osc.connect(gain).connect(audio.destination);
          osc.start();
          osc.stop(audio.currentTime + 0.2);
        } catch (error) {
          ctx.logger.debug('could not play the notification sound', error);
        }
      }),
    );
    offs.push(() => void audio?.close().catch(() => undefined));
  }

  return () => {
    for (const off of offs) off();
  };
}
