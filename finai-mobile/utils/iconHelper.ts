// utils/iconHelper.ts
export const getIcon = (name: string): string => {
  const n = name.toLowerCase().trim();

  // 1. Accounts
  if (n.includes('gcash')) return 'phone-portrait-outline';
  if (n.includes('maya')) return 'card-outline';
  if (n.includes('bank') || n.includes('bdo') || n.includes('bpi')) return 'business-outline';
  if (n.includes('cash') || n.includes('wallet')) return 'wallet-outline';

 // --- INCOME ---
  if (n.includes('salary') || n.includes('sahod')) return 'cash-outline';
  if (n.includes('allowance') || n.includes('baon')) return 'wallet-outline';
  if (n.includes('business')) return 'business-outline';
  if (n.includes('investment')) return 'trending-up-outline';

  // --- EXPENSE ---
  if (n.includes('food') || n.includes('kain') || n.includes('meal') || n.includes('grocery')) return 'cart-outline';
  if (n.includes('transpo') || n.includes('gas') || n.includes('pamasahe')) return 'car-outline';
  if (n.includes('bills') || n.includes('kuryente') || n.includes('tubig')) return 'receipt-outline';
  if (n.includes('shopping') || n.includes('bili')) return 'bag-handle-outline';
  if (n.includes('health') || n.includes('med')) return 'medical-outline';
  if (n.includes('expense')) return 'trending-down-outline';

  // 3. Goals/Other
  if (n.includes('savings') || n.includes('ipon') || n.includes('alkansya')) return 'piggy-bank-outline';
  if (n.includes('travel') || n.includes('bakasyon') || n.includes('gala')) return 'airplane-outline';

  // Default fallback (kung walang match)
  return 'flag-outline'; 
};