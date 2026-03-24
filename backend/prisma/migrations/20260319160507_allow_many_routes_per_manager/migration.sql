-- Allow many routes per manager (drop unique on managerId if present).
DROP INDEX IF EXISTS "Route_managerId_key";
