-- Manual interest per installment (PaymentSchedule).

ALTER TABLE "PaymentSchedule" ADD COLUMN IF NOT EXISTS "interestApplied" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PaymentSchedule" ADD COLUMN IF NOT EXISTS "interestAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "PaymentSchedule" ADD COLUMN IF NOT EXISTS "interestAppliedAt" TIMESTAMP(3);
ALTER TABLE "PaymentSchedule" ADD COLUMN IF NOT EXISTS "interestAppliedById" TEXT;

DO $$ BEGIN
  ALTER TABLE "PaymentSchedule" ADD CONSTRAINT "PaymentSchedule_interestAppliedById_fkey"
    FOREIGN KEY ("interestAppliedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

