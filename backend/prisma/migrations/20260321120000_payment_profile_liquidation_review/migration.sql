-- Align schema with prisma/schema.prisma (User profile, Payment method/status/reversal, LiquidationReview).

DO $$ BEGIN
  CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'TRANSFER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PaymentStatus" AS ENUM ('ACTIVE', 'REVERSED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "LiquidationReviewStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "documentId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "User_documentId_key" ON "User"("documentId");

ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "method" "PaymentMethod" NOT NULL DEFAULT 'CASH';
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "status" "PaymentStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "reversedAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "reversedById" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "reversalReason" TEXT;

CREATE TABLE IF NOT EXISTS "LiquidationReview" (
    "id" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "businessDate" TEXT NOT NULL,
    "status" "LiquidationReviewStatus" NOT NULL,
    "managerNote" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewNote" TEXT,

    CONSTRAINT "LiquidationReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LiquidationReview_managerId_businessDate_key" ON "LiquidationReview"("managerId", "businessDate");

DO $$ BEGIN
  ALTER TABLE "LiquidationReview" ADD CONSTRAINT "LiquidationReview_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "LiquidationReview" ADD CONSTRAINT "LiquidationReview_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
