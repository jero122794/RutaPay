// backend/src/shared/late-penalty.ts
import { bogotaCalendarDaysBetween } from "./bogota-day.js";

/**
 * Approximate interest portion of one installment (COP), for mora rules.
 * Uses equal split of total loan interest across installments.
 */
export const interestSharePerInstallmentCOP = (
  totalInterestCOP: number,
  installmentCount: number
): number => {
  if (installmentCount <= 0) return 0;
  return Math.round(totalInterestCOP / installmentCount);
};

/**
 * Extra mora (COP) when paying after the due date (Bogotá calendar days).
 * - On time or up to 3 calendar days late: 0
 * - More than 3 and up to 15 days late: half of the installment interest share
 * - More than 15 days late: full installment interest share
 */
export const computeLatePenaltyCOP = (
  dueDateUtc: Date,
  paymentDateUtc: Date,
  interestInstallmentShareCOP: number
): number => {
  const daysLate = bogotaCalendarDaysBetween(dueDateUtc, paymentDateUtc);
  if (daysLate <= 3) {
    return 0;
  }
  if (daysLate <= 15) {
    return Math.round(interestInstallmentShareCOP * 0.5);
  }
  return interestInstallmentShareCOP;
};

/**
 * Grace rule: if the borrower catches up an overdue installment on or before
 * the next installment's due date (Bogotá calendar day), waive mora (0).
 *
 * This supports the business rule:
 * - Weekly 4-installment loan
 * - Misses installment #1 (becomes overdue)
 * - Pays both #1 + #2 on installment #2 due date
 * => mora for #1 is forgiven.
 */
export const computeLatePenaltyWithCatchUpGraceCOP = (
  dueDateUtc: Date,
  paymentDateUtc: Date,
  interestInstallmentShareCOP: number,
  nextInstallmentDueDateUtc: Date | null
): number => {
  if (nextInstallmentDueDateUtc) {
    const daysFromPaymentToNextDue = bogotaCalendarDaysBetween(paymentDateUtc, nextInstallmentDueDateUtc);
    if (daysFromPaymentToNextDue >= 0) {
      return 0;
    }
  }
  return computeLatePenaltyCOP(dueDateUtc, paymentDateUtc, interestInstallmentShareCOP);
};
