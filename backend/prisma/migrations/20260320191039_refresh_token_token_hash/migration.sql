-- RefreshToken: raw `token` -> `tokenHash` (SHA-256 in app).
-- AuditLog for security audit trail.
-- Runs after `20260319135855_init` + `20260319160507` (never add a second full `init` or duplicate `User`).

TRUNCATE TABLE "RefreshToken";

DROP INDEX IF EXISTS "RefreshToken_token_key";

ALTER TABLE "RefreshToken" DROP COLUMN "token";

ALTER TABLE "RefreshToken" ADD COLUMN "tokenHash" TEXT NOT NULL;

CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "ip" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
