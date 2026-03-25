-- Business tenancy, optional user email, route.businessId, role → module grants.

DO $$ BEGIN
  CREATE TYPE "AppModule" AS ENUM (
    'OVERVIEW',
    'ROUTES',
    'CLIENTS',
    'LOANS',
    'PAYMENTS',
    'TREASURY',
    'USERS',
    'NOTIFICATIONS',
    'BUSINESSES',
    'ROLE_MODULES'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Business" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RoleModuleGrant" (
    "roleName" "RoleName" NOT NULL,
    "module" "AppModule" NOT NULL,

    CONSTRAINT "RoleModuleGrant_pkey" PRIMARY KEY ("roleName","module")
);

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "businessId" TEXT;
ALTER TABLE "Route" ADD COLUMN IF NOT EXISTS "businessId" TEXT;

DO $$ BEGIN
  ALTER TABLE "User" ADD CONSTRAINT "User_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Route" ADD CONSTRAINT "Route_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
