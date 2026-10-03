// utils/accountEmoji.ts

// Smart helper to auto-assign a relevant emoji based on the account name.
// Falls back to a generic card emoji if no keywords match.
export const getAccountEmoji = (name: string): string => {
  const n = name.toLowerCase().trim();

  // E-wallets
  if (n.includes('gcash') || n.includes('maya') || n.includes('pay') || n.includes('wallet')) return '📱';
  
  // Physical Cash
  if (n.includes('cash') && !n.includes('gcash')) return '💵';
  
  // Traditional Banks
  if (n.includes('bank') || n.includes('bpi') || n.includes('bdo') || n.includes('union') || n.includes('metro') || n.includes('sec')) return '🏦';
  
  // Savings / Stash
  if (n.includes('save') || n.includes('savings') || n.includes('ipon') || n.includes('alkansya')) return '🐷';

  // Default fallback for debit/credit cards or unknown accounts
  return '💳';
};