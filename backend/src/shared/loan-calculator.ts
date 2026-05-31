// backend/src/shared/loan-calculator.ts
export type LoanFrequency = "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY";

export interface LoanInput {
  principal: number;
  interestRate: number;
  installmentCount: number;
  frequency: LoanFrequency;
  startDate: Date;
  excludeWeekends?: boolean;
}

export interface ScheduleItem {
  installmentNumber: number;
  dueDate: Date;
  amount: number;
  status: "PENDING";
}

export interface LoanResult {
  totalInterest: number;
  totalAmount: number;
  installmentAmount: number;
  endDate: Date;
  schedule: ScheduleItem[];
}

/** Nominal days covered by a single installment, per frequency. */
const frequencyDays: Record<LoanFrequency, number> = {
  DAILY: 1,
  WEEKLY: 7,
  BIWEEKLY: 15,
  MONTHLY: 30
};

/** A full month is 30 days for interest accrual purposes. */
const DAYS_PER_MONTH = 30;

/**
 * Elapsed months for interest accrual. The interest rate is a MONTHLY rate that
 * accrues proportionally to the loan's nominal duration, where 30 days = 1 month.
 * Partial months are charged proportionally (e.g. 15 days = half the monthly rate).
 *
 * Examples (rate = 0.20):
 *  - MONTHLY x3   -> 90 days  -> 3 months    -> principal * 0.20 * 3   = 60% interest
 *  - BIWEEKLY x5  -> 75 days  -> 2.5 months  -> principal * 0.20 * 2.5 = 50% interest
 */
export const interestMonths = (frequency: LoanFrequency, installmentCount: number): number => {
  const n = Math.max(1, Math.floor(installmentCount));
  return (n * frequencyDays[frequency]) / DAYS_PER_MONTH;
};

export const calculateLoan = (input: LoanInput): LoanResult => {
  const { principal, interestRate, installmentCount, frequency, startDate, excludeWeekends = false } = input;
  const n = Math.max(1, Math.floor(installmentCount));
  const daysBetween = frequencyDays[frequency];

  const months = interestMonths(frequency, n);
  const totalInterest = Math.round(principal * interestRate * months);
  const totalAmount = principal + totalInterest;
  const installmentAmount = Math.round(totalAmount / n);
  // The last installment absorbs the rounding remainder so the schedule sums exactly.
  const lastInstallment = totalAmount - installmentAmount * (n - 1);

  const schedule: ScheduleItem[] = [];
  const pushInstallment = (installmentNumber: number, dueDate: Date): void => {
    schedule.push({
      installmentNumber,
      dueDate,
      amount: installmentNumber === n ? lastInstallment : installmentAmount,
      status: "PENDING"
    });
  };

  if (frequency === "MONTHLY") {
    // Each installment is due at the end of its month period (+30, +60, +90, ...).
    for (let i = 1; i <= n; i += 1) {
      const dueDate = new Date(startDate);
      dueDate.setUTCDate(dueDate.getUTCDate() + DAYS_PER_MONTH * i);
      pushInstallment(i, dueDate);
    }
  } else if (frequency === "DAILY" && excludeWeekends) {
    const cursorDate = new Date(startDate);
    for (let i = 1; i <= n; i += 1) {
      if (i === 1) {
        while (cursorDate.getUTCDay() === 0 || cursorDate.getUTCDay() === 6) {
          cursorDate.setUTCDate(cursorDate.getUTCDate() + 1);
        }
      } else {
        cursorDate.setUTCDate(cursorDate.getUTCDate() + 1);
        while (cursorDate.getUTCDay() === 0 || cursorDate.getUTCDay() === 6) {
          cursorDate.setUTCDate(cursorDate.getUTCDate() + 1);
        }
      }
      pushInstallment(i, new Date(cursorDate));
    }
  } else {
    for (let i = 1; i <= n; i += 1) {
      const dueDate = new Date(startDate);
      dueDate.setUTCDate(dueDate.getUTCDate() + daysBetween * (i - 1));
      pushInstallment(i, dueDate);
    }
  }

  const lastScheduleItem = schedule.at(-1);
  const endDate = lastScheduleItem ? lastScheduleItem.dueDate : new Date(startDate);

  return {
    totalInterest,
    totalAmount,
    installmentAmount,
    endDate,
    schedule
  };
};
