// backend/src/tests/loan-calculator.test.ts
import assert from "node:assert";
import { test } from "node:test";
import { calculateLoan, interestMonths } from "../shared/loan-calculator.js";

const sumSchedule = (amounts: number[]): number => amounts.reduce((a, b) => a + b, 0);

const DAY_MS = 24 * 60 * 60 * 1000;

test("interestMonths is proportional to nominal duration (30 days = 1 month)", () => {
  assert.strictEqual(interestMonths("MONTHLY", 3), 3);
  assert.strictEqual(interestMonths("BIWEEKLY", 5), 2.5);
  assert.strictEqual(interestMonths("DAILY", 30), 1);
  assert.strictEqual(interestMonths("WEEKLY", 24), 5.6);
  // Partial months are not rounded up.
  assert.strictEqual(interestMonths("WEEKLY", 4), (4 * 7) / 30);
});

test("Example 1: MONTHLY 1,000,000 at 20% x3 returns 160% total", () => {
  const result = calculateLoan({
    principal: 1_000_000,
    interestRate: 0.2,
    installmentCount: 3,
    frequency: "MONTHLY",
    startDate: new Date("2025-01-01T00:00:00.000Z")
  });

  assert.strictEqual(result.totalInterest, 600_000);
  assert.strictEqual(result.totalAmount, 1_600_000);
  assert.strictEqual(result.schedule.length, 3);
  assert.strictEqual(sumSchedule(result.schedule.map((s) => s.amount)), result.totalAmount);
});

test("Example 2: BIWEEKLY 1,000,000 at 20% x5 charges 10% per 15-day installment", () => {
  const result = calculateLoan({
    principal: 1_000_000,
    interestRate: 0.2,
    installmentCount: 5,
    frequency: "BIWEEKLY",
    startDate: new Date("2025-01-01T00:00:00.000Z")
  });

  assert.strictEqual(result.totalInterest, 500_000);
  assert.strictEqual(result.totalAmount, 1_500_000);
  // 5 equal installments of 300,000 (200,000 principal + 100,000 interest each).
  assert.deepStrictEqual(
    result.schedule.map((s) => s.amount),
    [300_000, 300_000, 300_000, 300_000, 300_000]
  );
});

test("schedule always sums exactly to totalAmount (last installment absorbs rounding)", () => {
  const result = calculateLoan({
    principal: 1_000_000,
    interestRate: 0.2,
    installmentCount: 7,
    frequency: "WEEKLY",
    startDate: new Date("2025-01-01T00:00:00.000Z")
  });

  assert.strictEqual(sumSchedule(result.schedule.map((s) => s.amount)), result.totalAmount);
  assert.strictEqual(result.installmentAmount, Math.round(result.totalAmount / 7));
});

test("MONTHLY installments are due at the end of each month period (+30, +60, +90)", () => {
  const startDate = new Date("2025-01-01T00:00:00.000Z");
  const result = calculateLoan({
    principal: 900_000,
    interestRate: 0.2,
    installmentCount: 3,
    frequency: "MONTHLY",
    startDate
  });

  const offsets = result.schedule.map((s) => Math.round((s.dueDate.getTime() - startDate.getTime()) / DAY_MS));
  assert.deepStrictEqual(offsets, [30, 60, 90]);
});

test("non-monthly first installment falls on the start date and steps by frequency", () => {
  const startDate = new Date("2025-01-06T00:00:00.000Z"); // Monday
  const result = calculateLoan({
    principal: 500_000,
    interestRate: 0.2,
    installmentCount: 4,
    frequency: "WEEKLY",
    startDate
  });

  const offsets = result.schedule.map((s) => Math.round((s.dueDate.getTime() - startDate.getTime()) / DAY_MS));
  assert.deepStrictEqual(offsets, [0, 7, 14, 21]);
});

test("DAILY excludeWeekends keeps interest unchanged and skips weekends in the schedule", () => {
  const startDate = new Date("2025-01-06T00:00:00.000Z"); // Monday
  const withWeekends = calculateLoan({
    principal: 1_000_000,
    interestRate: 0.2,
    installmentCount: 10,
    frequency: "DAILY",
    startDate
  });
  const noWeekends = calculateLoan({
    principal: 1_000_000,
    interestRate: 0.2,
    installmentCount: 10,
    frequency: "DAILY",
    startDate,
    excludeWeekends: true
  });

  // Excluding weekends only shifts due dates; it must not change what is charged.
  assert.strictEqual(noWeekends.totalInterest, withWeekends.totalInterest);
  assert.strictEqual(noWeekends.totalAmount, withWeekends.totalAmount);

  for (const item of noWeekends.schedule) {
    const day = item.dueDate.getUTCDay();
    assert.ok(day !== 0 && day !== 6, `installment ${item.installmentNumber} fell on a weekend`);
  }
});

test("equivalent calendar durations charge equivalent interest across frequencies", () => {
  const common = { principal: 1_000_000, interestRate: 0.2, startDate: new Date("2025-01-01T00:00:00.000Z") };
  const monthly = calculateLoan({ ...common, installmentCount: 2, frequency: "MONTHLY" });
  const biweekly = calculateLoan({ ...common, installmentCount: 4, frequency: "BIWEEKLY" });

  // 2 months === 4 biweekly periods === same total interest.
  assert.strictEqual(monthly.totalInterest, biweekly.totalInterest);
});
