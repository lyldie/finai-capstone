// Suggest an icon that identifies a payment account at a glance.
export const getAccountEmoji = (name: string): string => {
  const value = name.toLowerCase().trim();

  if (value.includes('gcash') || value.includes('maya') || value.includes('pay') || value.includes('wallet')) return '📱';
  if (value.includes('cash')) return '💵';
  if (value.includes('bank') || value.includes('bpi') || value.includes('bdo') || value.includes('union') || value.includes('metro') || value.includes('sec')) return '🏦';
  if (value.includes('save') || value.includes('ipon') || value.includes('alkansya')) return '🏦';

  return '💳';
};

// Replace the old automatic piggy-bank suggestion on existing account records.
// Other user-selected emoji remain unchanged.
export const getAccountDisplayEmoji = (icon: string | null | undefined, name: string): string => {
  const candidate = (icon || '').trim();
  if (candidate === '🐷') return getAccountEmoji(name);
  return candidate && /[^a-zA-Z0-9_\-]/u.test(candidate) ? candidate : getAccountEmoji(name);
};
