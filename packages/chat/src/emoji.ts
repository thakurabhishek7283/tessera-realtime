export interface EmojiGroup {
  id: string;
  /** Representative emoji shown on the group's tab. */
  icon: string;
  emojis: string[];
}

const split = (s: string): string[] =>
  [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(s)]
    .map((x) => x.segment)
    .filter((x) => x.trim() !== '');

/** A small curated set, grouped, so the picker needs no emoji data library. */
export const EMOJI_GROUPS: EmojiGroup[] = [
  { id: 'smileys', icon: '😀', emojis: split('😀😃😄😁😆😅😂🙂😉😊😍😘😋😎🤔😐😴😢😭😡😱🤯🥳😇') },
  { id: 'gestures', icon: '👍', emojis: split('👍👎👌✌️🤞👏🙌🙏💪👋🤝✋👀🤷💁🙋🫡🤗🫶🖖🤙👊✊') },
  { id: 'hearts', icon: '❤️', emojis: split('❤️🧡💛💚💙💜🖤🤍💔💕💖💯✨⭐🌟💥🔥🎉🎊🎈🏆🥇✅❌') },
  { id: 'nature', icon: '🌳', emojis: split('🐶🐱🐭🐰🦊🐻🐼🐨🐯🦁🐸🐵🐔🐧🦄🐝🌱🌲🌸🌻🌈☀️🌙⚡') },
  { id: 'food', icon: '🍕', emojis: split('🍎🍌🍇🍓🍉🍑🥑🌽🍕🍔🍟🌮🍣🍩🍪🍰☕🍵🍺🍷🥂🍿🧀🥐') },
  { id: 'activity', icon: '⚽', emojis: split('⚽🏀🏈⚾🎾🏐🎱🏓🎯🎮🎲🎵🎸🎤🎬🎨🚴🏊🧘🏃⛳🎳🥋🛹') },
  { id: 'travel', icon: '🚗', emojis: split('🚗🚕🚌🚀✈️🚁🚲🛴⛵🚂🏠🏢🏖️⛰️🗽🗼🌍🌋🗺️⌚📍🧭⛺🌅') },
  { id: 'objects', icon: '💡', emojis: split('💡📱💻⌨️🖥️📷🎧📚📝✏️📎📌🔑🔒🔔💰🎁📦🧰🔧⚙️🧪📈⏰') },
];

/** Reactions offered on a message before the full picker. */
export const QUICK_REACTIONS: readonly string[] = ['👍', '❤️', '😂', '🎉', '😮', '🙏'];
