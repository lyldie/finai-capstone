// utils/categoryEmoji.ts
// Keep fallback category emojis aligned with the backend defaults. Match
// specific categories before broader keywords so Rent and Utilities do not
// collapse to the same generic bills icon.
export const getCategoryEmoji = (name: string, type?: string): string => {
  const n = name.toLowerCase().trim();

  const words = n.split(/[^a-z0-9]+/).filter(Boolean);
  const has = (...terms: string[]) => terms.some((term) => words.some((word) => word.startsWith(term)));

  if (has('rent', 'housing', 'mortgage')) return '🏠';
  if (has('utilit', 'electric', 'kuryente', 'water', 'tubig', 'internet', 'phone')) return '💡';
  if (has('grocery', 'groceries')) return '🛒';
  if (has('food', 'meal', 'dining', 'restaurant', 'kain')) return '🍽️';
  if (has('transpo', 'commute', 'fare', 'travel', 'bakasyon', 'gala', 'gas', 'fuel')) return '🚌';
  if (has('shop', 'cloth', 'apparel', 'fashion', 'buy', 'bili')) return '🛍️';
  if (has('health', 'med', 'doctor', 'pharmacy')) return '💊';
  if (has('leisure', 'entertainment', 'hobby', 'game')) return '🎮';
  if (has('education', 'school', 'tuition', 'book')) return '📚';
  if (has('pet', 'veterinary')) return '🐾';
  if (has('subscription', 'streaming')) return '📺';
  if (has('bill', 'fee', 'dues')) return '🧾';
  if (has('salary', 'sahod', 'job', 'work')) return '💰';
  if (has('allowance', 'baon')) return '👛';
  if (has('invest', 'bank', 'save', 'ipon')) return '📈';
  if (has('business')) return '💼';
  if (has('transfer')) return '🔁';
  if (has('goal', 'contribution')) return '🎯';
  if (has('other')) return '🗂️';

  // Generic fallback by type, so an unmatched custom category still looks
  // intentional rather than blank.
  if (type === 'income') return '✨';
  return '🧾';
};
