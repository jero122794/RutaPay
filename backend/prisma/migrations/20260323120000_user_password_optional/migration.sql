-- Allow clients created without portal credentials until email/password are set on edit.
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;
