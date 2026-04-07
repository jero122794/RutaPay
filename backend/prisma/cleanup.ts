// backend/prisma/cleanup.ts
import { PrismaClient, type RoleName } from "@prisma/client";

const prisma = new PrismaClient();

const KEEP_BUSINESS_ID = "seed-business-demo";
const KEEP_ROLE_NAMES: RoleName[] = ["SUPER_ADMIN", "ROUTE_MANAGER"];

const run = async (): Promise<void> => {
  const keepRoles = await prisma.role.findMany({
    where: { name: { in: KEEP_ROLE_NAMES } },
    select: { id: true, name: true }
  });
  const keepRoleIds = keepRoles.map((r) => r.id);

  const keepUserRoleRows = await prisma.userRole.findMany({
    where: { roleId: { in: keepRoleIds } },
    select: { userId: true }
  });
  const keepUserIds = Array.from(new Set(keepUserRoleRows.map((r) => r.userId)));

  await prisma.$transaction(async (tx) => {
    // Financial / operational data first
    await tx.payment.deleteMany({
      where: {
        OR: [
          { loan: { clientId: { notIn: keepUserIds } } },
          { loan: { managerId: { notIn: keepUserIds } } },
          { registeredById: { notIn: keepUserIds } }
        ]
      }
    });
    await tx.paymentSchedule.deleteMany({
      where: {
        loan: {
          OR: [{ clientId: { notIn: keepUserIds } }, { managerId: { notIn: keepUserIds } }]
        }
      }
    });
    await tx.loan.deleteMany({
      where: {
        OR: [{ clientId: { notIn: keepUserIds } }, { managerId: { notIn: keepUserIds } }]
      }
    });
    await tx.managerBalanceLog.deleteMany({});
    await tx.liquidationReview.deleteMany({});

    // Route graph
    await tx.routeClient.deleteMany({});
    await tx.route.deleteMany({
      where: { managerId: { notIn: keepUserIds } }
    });
    // If there are routes owned by kept managers, user asked to wipe credits/operations; remove them too.
    await tx.route.deleteMany({
      where: { managerId: { in: keepUserIds } }
    });

    // Auth/session & push
    await tx.pushSubscription.deleteMany({
      where: { userId: { notIn: keepUserIds } }
    });
    await tx.refreshToken.deleteMany({
      where: { userId: { notIn: keepUserIds } }
    });

    // Audit logs (keep is not requested; remove all)
    await tx.auditLog.deleteMany({});

    // Users & role mapping (keep SUPER_ADMIN + ROUTE_MANAGER users)
    await tx.userRole.deleteMany({
      where: { userId: { notIn: keepUserIds } }
    });
    await tx.user.deleteMany({
      where: { id: { notIn: keepUserIds } }
    });

    // Businesses (keep the main business record)
    await tx.business.deleteMany({
      where: { id: { not: KEEP_BUSINESS_ID } }
    });
  });

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        keptUsers: keepUserIds.length,
        keptUserIds: keepUserIds,
        keptBusinessId: KEEP_BUSINESS_ID,
        keptRoles: keepRoles.map((r) => r.name)
      },
      null,
      2
    )
  );
};

run()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

