// frontend/app/(dashboard)/routes/[id]/page.tsx
"use client";

import axios from "axios";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import api from "../../../../lib/api";
import { getEffectiveRoles, pickPrimaryRole } from "../../../../lib/effective-roles";
import { useAuthStore, type UserRole } from "../../../../store/authStore";
import { formatCOP } from "../../../../lib/formatters";
import { formatBogotaDateFromString } from "../../../../lib/bogota";
import TablePagination from "../../../../components/ui/TablePagination";
import { DEFAULT_PAGE_SIZE, type PageSize } from "../../../../lib/page-size";

interface RouteDetailResponse {
  data: {
    id: string;
    name: string;
    managerId: string;
    balance: number;
    createdAt: string | Date;
    updatedAt: string | Date;
  };
}

interface RouteSummaryResponse {
  data: {
    route: {
      id: string;
      name: string;
      managerId: string;
      managerName: string;
      balance: number;
      createdAt: string | Date;
      updatedAt: string | Date;
    };
    clientsCount: number;
    activeLoans: number;
    portfolioTotal: number;
    principalLoaned: number;
    projectedInterest: number;
    availableToLend: number;
    overdueInstallments: number;
    payments: {
      id: string;
      clientName: string;
      installmentAmount: number;
      status: "PAID" | "PARTIAL" | "OVERDUE" | "PENDING" | "REGISTERED";
      createdAt: string | Date;
    }[];
  };
}

const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const msg = (error.response?.data as { message?: string } | undefined)?.message;
    return msg ?? error.message;
  }
  return "Error desconocido.";
};

const paymentStatusLabel: Record<
  "PAID" | "PARTIAL" | "OVERDUE" | "PENDING" | "REGISTERED",
  string
> = {
  PAID: "Pagada",
  PARTIAL: "Parcial",
  OVERDUE: "Vencida",
  PENDING: "Pendiente",
  REGISTERED: "Registrado"
};

const RouteDetailPage = (): JSX.Element => {
  const params = useParams<{ id: string }>();
  const routeId = params.id;
  const user = useAuthStore((state) => state.user);
  const role: UserRole = pickPrimaryRole(getEffectiveRoles(user));
  const canView = role === "ADMIN" || role === "SUPER_ADMIN" || role === "ROUTE_MANAGER";

  const routeQuery = useQuery({
    queryKey: ["route-detail", routeId],
    queryFn: async (): Promise<RouteDetailResponse> => {
      const response = await api.get<RouteDetailResponse>(`/routes/${routeId}`);
      return response.data;
    },
    enabled: canView && Boolean(routeId)
  });

  const summaryQuery = useQuery({
    queryKey: ["route-summary", routeId],
    queryFn: async (): Promise<RouteSummaryResponse> => {
      const response = await api.get<RouteSummaryResponse>(`/routes/${routeId}/summary`);
      return response.data;
    },
    enabled: canView && Boolean(routeId)
  });

  const [paymentsPage, setPaymentsPage] = useState(1);
  const [paymentsLimit, setPaymentsLimit] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const routePayments = summaryQuery.data?.data.payments ?? [];
  const pagedRoutePayments = useMemo(() => {
    const start = (paymentsPage - 1) * paymentsLimit;
    return routePayments.slice(start, start + paymentsLimit);
  }, [routePayments, paymentsPage, paymentsLimit]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(routePayments.length / paymentsLimit));
    if (paymentsPage > totalPages) {
      setPaymentsPage(totalPages);
    }
  }, [routePayments.length, paymentsLimit, paymentsPage]);

  if (!canView) {
    return (
      <section className="rounded-xl border border-border bg-surface p-6">
        <h1 className="text-xl font-semibold">Rutas</h1>
        <p className="mt-2 text-sm text-danger">No tienes permisos para ver el resumen de rutas.</p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <header className="rounded-xl border border-border bg-surface p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-semibold">Resumen de ruta</h1>
            <p className="mt-1 text-sm text-textSecondary">Clientes, préstamos y mora.</p>
          </div>
          <Link href="/routes" className="text-primary hover:underline">
            Volver a rutas
          </Link>
        </div>
      </header>

      {routeQuery.isError ? (
        <div className="rounded-xl border border-border bg-surface p-6">
          <p className="text-sm text-danger">{getErrorMessage(routeQuery.error)}</p>
        </div>
      ) : null}

      {summaryQuery.isError ? (
        <div className="rounded-xl border border-border bg-surface p-6">
          <p className="text-sm text-danger">{getErrorMessage(summaryQuery.error)}</p>
        </div>
      ) : null}

      {routeQuery.isLoading || summaryQuery.isLoading ? (
        <div className="rounded-xl border border-border bg-surface p-6">
          <p className="text-sm text-textSecondary">Cargando resumen...</p>
        </div>
      ) : null}

      {routeQuery.data?.data && summaryQuery.data?.data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
            <div className="rounded-xl border border-border bg-bg p-4 xl:col-span-2">
              <p className="text-xs uppercase tracking-wider text-textSecondary">Ruta</p>
              <p className="mt-2 text-base font-semibold">{summaryQuery.data.data.route.name}</p>
              <p className="mt-1 text-sm text-textSecondary">
                Manager: {summaryQuery.data.data.route.managerName}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-bg p-4">
              <p className="text-xs uppercase tracking-wider text-textSecondary">Clientes</p>
              <p className="mt-2 text-2xl font-semibold">{summaryQuery.data.data.clientsCount}</p>
            </div>
            <div className="rounded-xl border border-border bg-bg p-4">
              <p className="text-xs uppercase tracking-wider text-textSecondary">Préstamos activos</p>
              <p className="mt-2 text-2xl font-semibold">{summaryQuery.data.data.activeLoans}</p>
            </div>
            <div className="rounded-xl border border-border bg-bg p-4">
              <p className="text-xs uppercase tracking-wider text-textSecondary">Mora (cuotas vencidas)</p>
              <p className="mt-2 text-2xl font-semibold">{summaryQuery.data.data.overdueInstallments}</p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface p-6">
            <h2 className="text-lg font-semibold">Cartera</h2>
            <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-border bg-bg p-4">
                <p className="text-xs uppercase tracking-wider text-textSecondary">Cartera activa (total)</p>
                <p className="mt-2 text-xl font-semibold">{formatCOP(summaryQuery.data.data.portfolioTotal)}</p>
              </div>
              <div className="rounded-lg border border-border bg-bg p-4">
                <p className="text-xs uppercase tracking-wider text-textSecondary">Balance de ruta</p>
                <p className="mt-2 text-xl font-semibold">{formatCOP(routeQuery.data.data.balance)}</p>
              </div>
              <div className="rounded-lg border border-border bg-bg p-4">
                <p className="text-xs uppercase tracking-wider text-textSecondary">Capital prestado (activo)</p>
                <p className="mt-2 text-xl font-semibold">{formatCOP(summaryQuery.data.data.principalLoaned)}</p>
              </div>
              <div className="rounded-lg border border-border bg-bg p-4">
                <p className="text-xs uppercase tracking-wider text-textSecondary">Interés proyectado (activo)</p>
                <p className="mt-2 text-xl font-semibold">{formatCOP(summaryQuery.data.data.projectedInterest)}</p>
              </div>
              <div className="rounded-lg border border-border bg-bg p-4 md:col-span-2 xl:col-span-4">
                <p className="text-xs uppercase tracking-wider text-textSecondary">
                  Disponible para prestar (balance - capital activo)
                </p>
                <p className="mt-2 text-2xl font-semibold text-primary">
                  {formatCOP(summaryQuery.data.data.availableToLend)}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface p-6">
            <h2 className="text-lg font-semibold">Pagos de la ruta</h2>
            <div className="mt-3 rutapay-table-wrap">
              {summaryQuery.data.data.payments.length === 0 ? (
                <div className="rounded-lg border border-border bg-bg p-4">
                  <p className="text-sm text-textSecondary">No hay pagos registrados en esta ruta.</p>
                </div>
              ) : (
                <table className="rutapay-table">
                  <thead>
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                        Cliente
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-textSecondary">
                        Valor cuota
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                        Estado
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                        Fecha
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRoutePayments.map((payment) => (
                      <tr key={payment.id} className="border-t border-border">
                        <td className="px-3 py-3 text-sm text-textPrimary">{payment.clientName}</td>
                        <td className="px-3 py-3 text-right text-sm text-textPrimary">
                          {formatCOP(payment.installmentAmount)}
                        </td>
                        <td className="px-3 py-3 text-sm text-textSecondary">
                          {paymentStatusLabel[payment.status]}
                        </td>
                        <td className="px-3 py-3 text-sm text-textSecondary">
                          {formatBogotaDateFromString(String(payment.createdAt))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {routePayments.length > 0 ? (
              <TablePagination
                page={paymentsPage}
                limit={paymentsLimit}
                total={routePayments.length}
                onPageChange={setPaymentsPage}
                onLimitChange={(next) => {
                  setPaymentsLimit(next);
                  setPaymentsPage(1);
                }}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default RouteDetailPage;

