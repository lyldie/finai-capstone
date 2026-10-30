/** Returns true when the value has non-zero precision smaller than one cent. */
export const hasSubCentPrecision = (value: string): boolean => {
  const fraction = value.trim().replace(/,/g, '').split('.')[1] || '';
  return /[1-9]/.test(fraction.slice(2));
};
