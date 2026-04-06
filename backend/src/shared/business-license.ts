// backend/src/shared/business-license.ts
import { prisma } from "./prisma.js";

export interface BusinessLicenseStatus {
  hasLicense: boolean;
  isExpired: boolean;
  endsAt: Date | null;
  daysRemaining: number | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const getBusinessLicenseStatus = async (businessId: string): Promise<BusinessLicenseStatus> => {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { licenseEndsAt: true }
  });

  if (!business || !business.licenseEndsAt) {
    return {
      hasLicense: false,
      isExpired: false,
      endsAt: null,
      daysRemaining: null
    };
  }

  const endsAt = business.licenseEndsAt;
  const now = new Date();
  const diff = endsAt.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diff / MS_PER_DAY);
  const isExpired = diff < 0;

  return {
    hasLicense: true,
    isExpired,
    endsAt,
    daysRemaining
  };
};

export const assertBusinessLicenseActiveForOperationalRoles = async (
  businessId: string,
  roles: string[]
): Promise<void> => {
  const isOperational = roles.includes("ADMIN") || roles.includes("ROUTE_MANAGER");
  if (!isOperational) {
    return;
  }

  const status = await getBusinessLicenseStatus(businessId);
  if (status.hasLicense && status.isExpired) {
    const err = new Error("La licencia de tu negocio está vencida. Contacta al administrador de la plataforma.") as Error & {
      statusCode?: number;
      name?: string;
    };
    err.statusCode = 403;
    err.name = "Forbidden";
    throw err;
  }
};

