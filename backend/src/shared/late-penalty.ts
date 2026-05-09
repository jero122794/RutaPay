// backend/src/shared/late-penalty.ts

/**
 * Approximate interest portion of one installment (COP).
 * Used by the manual "apply interest" flow as the suggested amount per installment;
 * the last installment absorbs any rounding remainder.
 */
export const interestSharePerInstallmentCOP = (
  totalInterestCOP: number,
  installmentCount: number
): number => {
  if (installmentCount <= 0) return 0;
  return Math.round(totalInterestCOP / installmentCount);
};
