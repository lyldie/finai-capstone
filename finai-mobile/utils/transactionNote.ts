/** Convert legacy system-generated transaction notes to the current English copy. */
export const displayTransactionNote = (note?: string | null): string => {
  const value = String(note || '');
  return value.replace(/^Inihulog sa goal\s*:?\s*/i, 'Contribution to goal: ');
};
