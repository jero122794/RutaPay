// frontend/lib/loan-calculator.ts
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

export const monthlyInterestPeriodCount = (frequency: LoanFrequency, installmentCount: number): number => {
  const n = Math.max(1, Math.floor(installmentCount));
  switch (frequency) {
    case "MONTHLY":
      return n;
    case "BIWEEKLY":
      return Math.max(1, Math.ceil(n / 2));
    case "WEEKLY":
      if (n > 4) {
        return Math.max(1, Math.ceil((n * 7) / 30));
      }
      return 1;
    case "DAILY":
      if (n > 30) {
        return Math.max(1, Math.ceil(n / 30));
      }
      return 1;
    default:
      return 1;
  }
};

export const calculateLoan = (input: LoanInput): LoanResult => {
  const { principal, interestRate, installmentCount, frequency, startDate, excludeWeekends = false } = input;
  const interestPeriods = monthlyInterestPeriodCount(frequency, installmentCount);
  const totalInterest = Math.round(principal * interestRate * interestPeriods);
  const totalAmount = principal + totalInterest;
  const installmentAmount = Math.round(totalAmount / installmentCount);
  const lastInstallment = totalAmount - installmentAmount * (installmentCount - 1);

  const schedule: ScheduleItem[] = [];
  const frequencyDays: Record<LoanFrequency, number> = {
    DAILY: 1,
    WEEKLY: 7,
    BIWEEKLY: 15,
    MONTHLY: 30
  };

  const daysBetween = frequencyDays[frequency];
  if (frequency === "DAILY" && excludeWeekends) {
    const cursorDate = new Date(startDate);
    for (let i = 1; i <= installmentCount; i += 1) {
      cursorDate.setDate(cursorDate.getDate() + 1);
      while (cursorDate.getDay() === 0 || cursorDate.getDay() === 6) {
        cursorDate.setDate(cursorDate.getDate() + 1);
      }

      schedule.push({
        installmentNumber: i,
        dueDate: new Date(cursorDate),
        amount: i === installmentCount ? lastInstallment : installmentAmount,
        status: "PENDING"
      });
    }
  } else {
    for (let i = 1; i <= installmentCount; i += 1) {
      const dueDate = new Date(startDate);
      dueDate.setDate(dueDate.getDate() + daysBetween * i);
      schedule.push({
        installmentNumber: i,
        dueDate,
        amount: i === installmentCount ? lastInstallment : installmentAmount,
        status: "PENDING"
      });
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
