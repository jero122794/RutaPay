// backend/src/shared/late-penalty.ts
import { bogotaCalendarDaysBetween, bogotaYmdFromUtcDate } from "./bogota-day.js";

export type LoanFrequencyForMora = "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY";

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

const parseYmdParts = (ymd: string): { y: number; m: number; d: number } => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) {
    throw new Error("Invalid Bogotá YMD.");
  }
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
};

const formatYmd = (y: number, mo: number, d: number): string => {
  const ys = String(y).padStart(4, "0");
  const ms = String(mo).padStart(2, "0");
  const ds = String(d).padStart(2, "0");
  return `${ys}-${ms}-${ds}`;
};

const daysInCalendarMonth = (y: number, month1to12: number): number => {
  return new Date(Date.UTC(y, month1to12, 0)).getUTCDate();
};

/** Next calendar month in Bogotá date keys; clamps day (e.g. Jan 31 → Feb 28/29). */
export const addOneBogotaCalendarMonthYmd = (ymd: string): string => {
  const { y, m, d } = parseYmdParts(ymd);
  let nm = m + 1;
  let ny = y;
  if (nm > 12) {
    nm = 1;
    ny += 1;
  }
  const dim = daysInCalendarMonth(ny, nm);
  const dd = Math.min(d, dim);
  return formatYmd(ny, nm, dd);
};

/**
 * For MONTHLY loans: each time the payment date passes a monthly anniversary of the
 * installment due date (Bogotá calendar), one "period" of mora accrues.
 * Example: due Mar 2, pay Apr 8 → payment is after Mar 2 and after Apr 2 → 2 periods.
 */
export const countMonthlyMoraPeriodsBogota = (dueDateUtc: Date, paymentDateUtc: Date): number => {
  const dueYmd = bogotaYmdFromUtcDate(dueDateUtc);
  const payYmd = bogotaYmdFromUtcDate(paymentDateUtc);
  if (payYmd <= dueYmd) {
    return 0;
  }
  let count = 0;
  let anchorYmd = dueYmd;
  while (payYmd > anchorYmd) {
    anchorYmd = addOneBogotaCalendarMonthYmd(anchorYmd);
    count += 1;
  }
  return count;
};

/**
 * Extra mora (COP) when paying after the due date (Bogotá calendar).
 *
 * MONTHLY: mora = (interest share per installment) × (full monthly periods late).
 * Each period matches one contractual "month" of interest at creation time.
 *
 * Other frequencies: legacy tiers by calendar days late (3 / 15 day thresholds).
 */
export const computeLatePenaltyCOP = (
  dueDateUtc: Date,
  paymentDateUtc: Date,
  interestInstallmentShareCOP: number,
  frequency: LoanFrequencyForMora
): number => {
  if (frequency === "MONTHLY") {
    const periods = countMonthlyMoraPeriodsBogota(dueDateUtc, paymentDateUtc);
    return Math.round(interestInstallmentShareCOP * periods);
  }

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
  nextInstallmentDueDateUtc: Date | null,
  frequency: LoanFrequencyForMora
): number => {
  if (nextInstallmentDueDateUtc) {
    const daysFromPaymentToNextDue = bogotaCalendarDaysBetween(paymentDateUtc, nextInstallmentDueDateUtc);
    if (daysFromPaymentToNextDue >= 0) {
      return 0;
    }
  }
  return computeLatePenaltyCOP(dueDateUtc, paymentDateUtc, interestInstallmentShareCOP, frequency);
};
