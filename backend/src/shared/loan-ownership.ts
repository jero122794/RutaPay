// backend/src/shared/loan-ownership.ts
import type { FastifyError } from "fastify";
import type { Loan } from "@prisma/client";
import { prisma } from "./prisma.js";

export type LoanWithRouteManager = Loan & {
  route: { managerId: string };
};

const httpError = (statusCode: number, name: string, message: string): FastifyError => {
  const err = new Error(message) as FastifyError;
  err.statusCode = statusCode;
  err.name = name;
  return err;
};

/**
 * Enforces loan access: ADMIN/SUPER_ADMIN (all), ROUTE_MANAGER (only loans on routes they manage),
 * CLIENT (only own loans). Uses route.managerId as source of truth for route scope (IDOR / A01).
 */
export const assertLoanAccessForActor = async (
  loanId: string,
  actorId: string,
  actorRoles: string[]
): Promise<LoanWithRouteManager> => {
  const loan = await prisma.loan.findUnique({
    where: { id: loanId },
    include: { route: { select: { managerId: true } } }
  });

  if (!loan) {
    throw httpError(404, "Not Found", "Loan not found.");
  }

  const isPrivileged = actorRoles.includes("ADMIN") || actorRoles.includes("SUPER_ADMIN");
  const managesRoute =
    actorRoles.includes("ROUTE_MANAGER") && loan.route.managerId === actorId;
  const isBorrower = actorRoles.includes("CLIENT") && loan.clientId === actorId;

  if (!isPrivileged && !managesRoute && !isBorrower) {
    throw httpError(403, "Forbidden", "No tienes acceso a este recurso.");
  }

  return loan;
};

export const loanRowWithoutRoute = (loan: LoanWithRouteManager): Loan => {
  const { route: _route, ...row } = loan;
  return row;
};
