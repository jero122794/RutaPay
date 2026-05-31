-- Split each installment and each payment into capital vs interest buckets.

-- 1. Allocation enum for payments.
DO $$ BEGIN
  CREATE TYPE "PaymentAllocation" AS ENUM ('CAPITAL', 'INTEREST', 'FULL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. New columns on PaymentSchedule.
ALTER TABLE "PaymentSchedule" ADD COLUMN IF NOT EXISTS "principalPortion" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "PaymentSchedule" ADD COLUMN IF NOT EXISTS "interestPortion" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "PaymentSchedule" ADD COLUMN IF NOT EXISTS "paidCapital" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "PaymentSchedule" ADD COLUMN IF NOT EXISTS "paidInterest" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- 3. New columns on Payment.
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "capitalPaid" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "interestPaid" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "allocation" "PaymentAllocation";

-- 4. Backfill the per-installment capital/interest split for existing loans.
--    Interest portion is the loan interest spread evenly; capital is the remainder of `amount`.
UPDATE "PaymentSchedule" ps
SET "interestPortion" = ROUND(l."totalInterest" / NULLIF(l."installmentCount", 0))
FROM "Loan" l
WHERE ps."loanId" = l."id";

UPDATE "PaymentSchedule"
SET "principalPortion" = GREATEST("amount" - "interestPortion", 0);

-- 5. Backfill paid buckets from the legacy combined paidAmount (interest-first).
UPDATE "PaymentSchedule"
SET "paidInterest" = LEAST("paidAmount", "interestPortion" + "interestAmount"),
    "paidCapital" = "paidAmount" - LEAST("paidAmount", "interestPortion" + "interestAmount");
