// backend/scripts/wipe-test-data.ts
/**
 * Removes test data from the database (destructive).
 *
 * Default scope:
 * - Businesses whose name starts with "PlatformTest " (platform-load-test.ts dataset)
 *
 * Optional:
 * - WIPE_INCLUDE_DEMO_SEED=1 — also removes Prisma seed demo tenant (id: seed-business-demo, "Negocio Demo")
 *
 * Safety:
 * - Set WIPE_TEST_DATA_CONFIRM=RUUT_DELETE_TEST_DATA to execute deletes.
 * - WIPE_TEST_DATA_DRY_RUN=1 — print counts only, no deletes (no confirm required).
 */
import { config } from "dotenv";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PLATFORM_BUSINESS_PREFIX = "PlatformTest ";
const SEED_DEMO_BUSINESS_ID = "seed-business-demo";
const CONFIRM_VALUE = "RUUT_DELETE_TEST_DATA";

async function wipeBusinessTenants(prismaClient: PrismaClient, businessIds: string[]): Promise<void> {
  if (businessIds.length === 0) {
    return;
  }

  const routes = await prismaClient.route.findMany({
    where: { businessId: { in: businessIds } },
    select: { id: true }
  });
  const routeIds = routes.map((r) => r.id);

  const tenantUsers = await prismaClient.user.findMany({
    where: { businessId: { in: businessIds } },
    select: { id: true }
  });
  const tenantUserIds = tenantUsers.map((u) => u.id);

  const loans =
    routeIds.length > 0
      ? await prismaClient.loan.findMany({
          where: { routeId: { in: routeIds } },
          select: { id: true }
        })
      : [];
  const loanIds = loans.map((l) => l.id);

  if (loanIds.length > 0) {
    await prismaClient.payment.deleteMany({ where: { loanId: { in: loanIds } } });
    await prismaClient.paymentSchedule.deleteMany({ where: { loanId: { in: loanIds } } });
    await prismaClient.loan.deleteMany({ where: { id: { in: loanIds } } });
  }

  if (routeIds.length > 0) {
    await prismaClient.routeClient.deleteMany({ where: { routeId: { in: routeIds } } });
    await prismaClient.managerBalanceLog.deleteMany({ where: { routeId: { in: routeIds } } });
    await prismaClient.route.deleteMany({ where: { id: { in: routeIds } } });
  }

  if (tenantUserIds.length > 0) {
    await prismaClient.liquidationReview.deleteMany({
      where: {
        OR: [{ managerId: { in: tenantUserIds } }, { reviewedById: { in: tenantUserIds } }]
      }
    });
    await prismaClient.pushSubscription.deleteMany({ where: { userId: { in: tenantUserIds } } });
    await prismaClient.refreshToken.deleteMany({ where: { userId: { in: tenantUserIds } } });
    await prismaClient.userRole.deleteMany({ where: { userId: { in: tenantUserIds } } });
    await prismaClient.user.deleteMany({ where: { id: { in: tenantUserIds } } });
  }

  await prismaClient.business.deleteMany({ where: { id: { in: businessIds } } });
}

async function main(): Promise<void> {
  const dryRun =
    process.env.WIPE_TEST_DATA_DRY_RUN === "1" || process.env.WIPE_TEST_DATA_DRY_RUN === "true";
  const includeDemo =
    process.env.WIPE_INCLUDE_DEMO_SEED === "1" || process.env.WIPE_INCLUDE_DEMO_SEED === "true";
  const confirmed = process.env.WIPE_TEST_DATA_CONFIRM === CONFIRM_VALUE;

  const platformBusinesses = await prisma.business.findMany({
    where: { name: { startsWith: PLATFORM_BUSINESS_PREFIX } },
    select: { id: true, name: true }
  });

  const demoBusiness = includeDemo
    ? await prisma.business.findUnique({
        where: { id: SEED_DEMO_BUSINESS_ID },
        select: { id: true, name: true }
      })
    : null;

  const targetIds = new Set<string>();
  const labels: string[] = [];
  for (const b of platformBusinesses) {
    targetIds.add(b.id);
    labels.push(`PlatformTest: "${b.name}" (${b.id})`);
  }
  if (demoBusiness) {
    targetIds.add(demoBusiness.id);
    labels.push(`Demo seed: "${demoBusiness.name}" (${demoBusiness.id})`);
  } else if (includeDemo) {
    console.log("WIPE_INCLUDE_DEMO_SEED=1 but seed-business-demo was not found (already removed).");
  }

  const businessIds = [...targetIds];

  console.log("=== Ruut wipe test data ===");
  console.log(
    JSON.stringify({
      dryRun,
      includeDemoSeed: includeDemo,
      confirmed,
      businessCount: businessIds.length
    })
  );
  if (labels.length > 0) {
    console.log("Targets:");
    for (const line of labels) {
      console.log(`  - ${line}`);
    }
  } else {
    console.log("No matching test businesses found.");
    return;
  }

  if (dryRun) {
    const routes = await prisma.route.count({ where: { businessId: { in: businessIds } } });
    const users = await prisma.user.count({ where: { businessId: { in: businessIds } } });
    const routeRows = await prisma.route.findMany({
      where: { businessId: { in: businessIds } },
      select: { id: true }
    });
    const routeIds = routeRows.map((r) => r.id);
    const loans =
      routeIds.length > 0
        ? await prisma.loan.count({ where: { routeId: { in: routeIds } } })
        : 0;
    console.log("[DRY RUN] Would delete approximately:", { routes, users, loans });
    return;
  }

  if (!confirmed) {
    console.error(
      `Refusing to delete: set WIPE_TEST_DATA_CONFIRM=${CONFIRM_VALUE} (or use WIPE_TEST_DATA_DRY_RUN=1).`
    );
    process.exitCode = 1;
    return;
  }

  await wipeBusinessTenants(prisma, businessIds);
  console.log(`Done. Removed ${businessIds.length} business tenant(s) and related data.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
