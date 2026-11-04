export const ACCOUNT_CARD_PALETTE = [
  { key: 'ocean', start: '#286A79', end: '#4195A4' },
  { key: 'violet', start: '#5B4A8A', end: '#806AB5' },
  { key: 'terracotta', start: '#9A5938', end: '#C47B50' },
  { key: 'rose', start: '#8A4961', end: '#BB6F87' },
  { key: 'forest', start: '#526F41', end: '#78985D' },
  { key: 'gold', start: '#725A35', end: '#A7894D' },
  { key: 'blue', start: '#2463C7', end: '#4C8DF2' },
  { key: 'green', start: '#286650', end: '#4A9B7B' },
] as const;

export const getAccountCardColors = (key?: string | null): [string, string] | null => {
  const match = ACCOUNT_CARD_PALETTE.find((item) => item.key === key);
  return match ? [match.start, match.end] : null;
};
