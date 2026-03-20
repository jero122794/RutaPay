// frontend/app/(dashboard)/loans/page.tsx
"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import axios from "axios";
import Link from "next/link";
import api from "../../../lib/api";
import { useAuthStore, type UserRole } from "../../../store/authStore";
import { formatBogotaDateFromString } from "../../../lib/bogota";
import { formatCOP } from "../../../lib/formatters";
import { useMemo } from "react";

interface LoanItem {
  id: string;
  routeId: string;
  clientId: string;
  managerId: string;
  principal: number;
  interestRate: number;
  installmentCount: number;
  installmentAmount: number;
  totalAmount: number;
  totalInterest: number;
  status: "ACTIVE" | "COMPLETED" | "DEFAULTED" | "RESTRUCTURED";
  startDate: string;
  endDate: string;
}

interface ListResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

interface ClientName {
  id: string;
  name: string;
}

const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: string } | undefined)?.message;
    return message ?? error.message;
  }
  return "Error desconocido.";
};

const statusBadge = (status: LoanItem["status"]): JSX.Element => {
  switch (status) {
    case "ACTIVE":
      return <span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">Activo</span>;
    case "COMPLETED":
      return <span className="rounded-full bg-success/10 px-2 py-1 text-xs text-success">Completado</span>;
    case "DEFAULTED":
      return <span className="rounded-full bg-danger/10 px-2 py-1 text-xs text-danger">En mora</span>;
    case "RESTRUCTURED":
      return <span className="rounded-full bg-warning/10 px-2 py-1 text-xs text-warning">Reestructurado</span>;
    default:
      return <span className="rounded-full bg-border/10 px-2 py-1 text-xs text-textSecondary">-</span>;
  }
};

const LoansPage = (): JSX.Element => {
  const user = useAuthStore((state) => state.user);
  const role: UserRole = user?.roles[0] ?? "CLIENT";
  const clientDisplayNameForClientRole = role === "CLIENT" ? user?.name ?? "-" : "-";

  const loansQuery = useQuery({
    queryKey: ["loans-list"],
    queryFn: async (): Promise<ListResponse<LoanItem>> => {
      const response = await api.get<ListResponse<LoanItem>>("/loans");
      return response.data;
    }
  });

  const canCreate = role === "ADMIN" || role === "SUPER_ADMIN" || role === "ROUTE_MANAGER";

  const clientIds = useMemo<string[]>(() => {
    const ids = loansQuery.data?.data.map((l) => l.clientId) ?? [];
    return Array.from(new Set(ids));
  }, [loansQuery.data]);

  const canFetchClientNames = role !== "CLIENT" && clientIds.length > 0;

  const clientNameQueries = useQueries({
    queries: clientIds.map((clientId) => ({
      queryKey: ["client-name", clientId],
      queryFn: async (): Promise<ClientName> => {
        const response = await api.get<{ data: ClientName }>(`/clients/${clientId}`);
        return response.data.data;
      },
      enabled: canFetchClientNames
    }))
  });

  const clientNameById = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    clientIds.forEach((id, index) => {
      const data = clientNameQueries[index]?.data;
      if (data?.name) map[id] = data.name;
    });
    return map;
  }, [clientIds, clientNameQueries]);

  return (
    <section className="space-y-4">
      <header className="rounded-xl border border-border bg-surface p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-semibold">Préstamos</h1>
            <p className="mt-1 text-sm text-textSecondary">Lista y plan de pagos.</p>
          </div>
          {canCreate ? (
            <Link href="/loans/new" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-95">
              Crear préstamo
            </Link>
          ) : null}
        </div>
      </header>

      {loansQuery.isLoading ? (
        <div className="rounded-xl border border-border bg-surface p-6">
          <p className="text-sm text-textSecondary">Cargando préstamos...</p>
        </div>
      ) : null}

      {loansQuery.isError ? (
        <div className="rounded-xl border border-border bg-surface p-6">
          <p className="text-sm text-danger">{getErrorMessage(loansQuery.error)}</p>
        </div>
      ) : null}

      {loansQuery.data?.data ? (
        <div className="rounded-xl border border-border bg-surface p-4">
          {loansQuery.data.data.length === 0 ? (
            <div className="rounded-lg border border-border bg-bg p-6">
              <p className="text-sm text-textSecondary">No hay préstamos registrados.</p>
            </div>
          ) : (
            <div className="rutapay-table-wrap">
              <table className="rutapay-table">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                      Estado
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                      Cliente
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                      Total
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                      Inicio
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                      Fin
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-textSecondary">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loansQuery.data.data.map((loan) => (
                    <tr key={loan.id} className="border-t border-border">
                      <td className="px-3 py-3">{statusBadge(loan.status)}</td>
                      <td className="px-3 py-3 text-sm text-textSecondary">
                        {role === "CLIENT"
                          ? clientDisplayNameForClientRole
                          : clientNameById[loan.clientId] ?? (canFetchClientNames ? "Cargando..." : "-")}
                      </td>
                      <td className="px-3 py-3 text-sm text-textPrimary">{formatCOP(loan.totalAmount)}</td>
                      <td className="px-3 py-3 text-sm text-textSecondary">
                        {formatBogotaDateFromString(loan.startDate)}
                      </td>
                      <td className="px-3 py-3 text-sm text-textSecondary">
                        {formatBogotaDateFromString(loan.endDate)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Link href={`/loans/${loan.id}`} className="text-sm text-primary hover:underline">
                          Ver plan
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
};

export default LoansPage;
