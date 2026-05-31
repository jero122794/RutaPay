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

/**
 * Baked-in interest portion of a specific installment (COP). The interest is spread
 * evenly across installments and the LAST one absorbs the rounding remainder, so the
 * sum of all interest portions equals the loan's totalInterest exactly.
 */
export const installmentInterestPortionCOP = (
  totalInterestCOP: number,
  installmentCount: number,
  installmentNumber: number
): number => {
  if (installmentCount <= 0) return 0;
  const share = interestSharePerInstallmentCOP(totalInterestCOP, installmentCount);
  if (installmentNumber >= installmentCount) {
    return Math.max(totalInterestCOP - share * (installmentCount - 1), 0);
  }
  return share;
};
