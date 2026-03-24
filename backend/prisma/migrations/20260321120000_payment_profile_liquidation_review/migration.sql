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

ALTER TABLE "User" ADD COLUMN "address" TEXT;
ALTER TABLE "User" ADD COLUMN "description" TEXT;
ALTER TABLE "User" ADD COLUMN "documentId" TEXT;

CREATE UNIQUE INDEX "User_documentId_key" ON "User"("documentId");

ALTER TABLE "Payment" ADD COLUMN "method" "PaymentMethod" NOT NULL DEFAULT 'CASH';
ALTER TABLE "Payment" ADD COLUMN "status" "PaymentStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Payment" ADD COLUMN "reversedAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN "reversedById" TEXT;
ALTER TABLE "Payment" ADD COLUMN "reversalReason" TEXT;

CREATE TABLE "LiquidationReview" (
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

CREATE UNIQUE INDEX "LiquidationReview_managerId_businessDate_key" ON "LiquidationReview"("managerId", "businessDate");

ALTER TABLE "LiquidationReview" ADD CONSTRAINT "LiquidationReview_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LiquidationReview" ADD CONSTRAINT "LiquidationReview_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
