// utils/categoryEmoji.ts
// Emoji mapping for category cards -- more visually distinct at a glance than
// outline icons, and needs no icon-library styling to look modern. Mirrors
// get_default_icon()'s keyword logic in categories.py, so a category auto-
// assigned "fast-food-outline" server-side still lands on the food emoji here.
export const getCategoryEmoji = (name: string, type?: string): string => {
  const n = name.toLowerCase().trim();

  if (n.includes('food') || n.includes('grocery') || n.includes('meal') || n.includes('eat') || n.includes('kain')) return '🍔';
  if (n.includes('transpo') || n.includes('gas') || n.includes('fare') || n.includes('travel') || n.includes('bakasyon') || n.includes('gala')) return '🚌';
  if (n.includes('bill') || n.includes('rent') || n.includes('electric') || n.includes('water') || n.includes('kuryente') || n.includes('tubig')) return '💡';
  if (n.includes('shop') || n.includes('cloth') || n.includes('buy') || n.includes('bili')) return '🛍️';
  if (n.includes('health') || n.includes('med') || n.includes('doctor')) return '💊';
  if (n.includes('salary') || n.includes('sahod') || n.includes('job') || n.includes('work')) return '💰';
  if (n.includes('allowance') || n.includes('baon')) return '👛';
  if (n.includes('invest') || n.includes('bank') || n.includes('save') || n.includes('ipon')) return '📈';
  if (n.includes('business')) return '💼';
  if (n.includes('transfer')) return '🔁';
  if (n.includes('goal') || n.includes('contribution')) return '🎯';
  if (n.includes('other')) return '🗂️';

  // Generic fallback by type, so an unmatched custom category still looks
  // intentional rather than blank.
  if (type === 'income') return '✨';
  return '🧾';
};