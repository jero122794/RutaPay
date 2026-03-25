// backend/src/shared/loan-ownership.ts
import type { FastifyError } from "fastify";
import type { Loan } from "@prisma/client";
import { prisma } from "./prisma.js";

export type LoanWithRouteManager = Loan & {
  route: { managerId: string; businessId: string | null };
};

const httpError = (statusCode: number, name: string, message: string): FastifyError => {
  const err = new Error(message) as FastifyError;
  err.statusCode = statusCode;
  err.name = name;
  return err;
};

/**
 * Enforces loan access: SUPER_ADMIN (all), ADMIN (same business as route), ROUTE_MANAGER (only loans on routes they manage),
 * CLIENT (only own loans).
 */
export const assertLoanAccessForActor = async (
  loanId: string,
  actorId: string,
  actorRoles: string[],
  actorBusinessId: string | null
): Promise<LoanWithRouteManager> => {
  const loan = await prisma.loan.findUnique({
    where: { id: loanId },
    include: { route: { select: { managerId: true, businessId: true } } }
  });

  if (!loan) {
    throw httpError(404, "Not Found", "Loan not found.");
  }

  const isSuper = actorRoles.includes("SUPER_ADMIN");
  const isAdmin = actorRoles.includes("ADMIN") && !isSuper;
  const managesRoute =
    actorRoles.includes("ROUTE_MANAGER") && loan.route.managerId === actorId;
  const isBorrower = actorRoles.includes("CLIENT") && loan.clientId === actorId;

  if (isAdmin) {
    if (!actorBusinessId || loan.route.businessId !== actorBusinessId) {
      throw httpError(403, "Forbidden", "No tienes acceso a este recurso.");
    }
  } else if (!isSuper && !managesRoute && !isBorrower) {
    throw httpError(403, "Forbidden", "No tienes acceso a este recurso.");
  }

  return loan;
};

export const loanRowWithoutRoute = (loan: LoanWithRouteManager): Loan => {
  const { route: _route, ...row } = loan;
  return row;
};
