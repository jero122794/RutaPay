-- Business license window (UTC): startsAt/endsAt.

ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "licenseStartsAt" TIMESTAMP(3);
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "licenseEndsAt" TIMESTAMP(3);

