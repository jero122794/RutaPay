// frontend/app/(dashboard)/loans/[id]/page.tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import Link from "next/link";
import { useParams } from "next/navigation";
import api from "../../../../lib/api";
import { formatCOP } from "../../../../lib/formatters";
import { formatBogotaDateFromString } from "../../../../lib/bogota";
import { useMemo } from "react";
import { useAuthStore, type UserRole } from "../../../../store/authStore";

interface LoanDetail {
  id: string;
  principal: number;
  interestRate: number;
  installmentCount: number;
  installmentAmount: number;
  totalAmount: number;
  totalInterest: number;
  status: "ACTIVE" | "COMPLETED" | "DEFAULTED" | "RESTRUCTURED";
  startDate: string;
  endDate: string;
  routeId: string;
  clientId: string;
  managerId: string;
}

interface ClientName {
  id: string;
  name: string;
}

interface ListResponse<T> {
  data: T;
}

interface ScheduleItem {
  installmentNumber: number;
  dueDate: string;
  amount: number;
  paidAmount: number;
  status: "PENDING" | "PAID" | "OVERDUE" | "PARTIAL";
  paidAt: string | null;
}

interface ScheduleResponse {
  data: ScheduleItem[];
}

interface LoanResponse {
  data: LoanDetail;
}

const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: string } | undefined)?.message;
    return message ?? error.message;
  }
  return "Error desconocido.";
};

const scheduleStatusBadge = (status: ScheduleItem["status"]): JSX.Element => {
  switch (status) {
    case "PAID":
      return <span className="rounded-full bg-success/10 px-2 py-1 text-xs text-success">Pagada</span>;
    case "PARTIAL":
      return <span className="rounded-full bg-warning/10 px-2 py-1 text-xs text-warning">Parcial</span>;
    case "OVERDUE":
      return <span className="rounded-full bg-danger/10 px-2 py-1 text-xs text-danger">Vencida</span>;
    case "PENDING":
    default:
      return <span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">Pendiente</span>;
  }
};

const LoanDetailPage = (): JSX.Element => {
  const params = useParams<{ id: string }>();
  const loanId = params.id;
  const user = useAuthStore((state) => state.user);
  const role: UserRole = user?.roles[0] ?? "CLIENT";
  const clientDisplayNameForClientRole = role === "CLIENT" ? user?.name ?? "-" : "-";

  const loanQuery = useQuery({
    queryKey: ["loan-detail", loanId],
    queryFn: async (): Promise<LoanResponse> => {
      const response = await api.get<LoanResponse>(`/loans/${loanId}`);
      return response.data;
    },
    enabled: Boolean(loanId)
  });

  const clientQuery = useQuery({
    queryKey: ["client-name", loanQuery.data?.data.clientId ?? ""],
    queryFn: async (): Promise<{ data: ClientName }> => {
      const clientId = loanQuery.data?.data.clientId ?? "";
      const response = await api.get<{ data: ClientName }>(`/clients/${clientId}`);
      return response.data;
    },
    enabled: role !== "CLIENT" && Boolean(loanQuery.data?.data.clientId)
  });

  const scheduleQuery = useQuery({
    queryKey: ["loan-schedule", loanId],
    queryFn: async (): Promise<ScheduleResponse> => {
      const response = await api.get<ScheduleResponse>(`/loans/${loanId}/schedule`);
      return response.data;
    },
    enabled: Boolean(loanId)
  });

  const totals = useMemo(() => {
    const items = scheduleQuery.data?.data ?? [];
    const paidTotal = items.reduce((acc, item) => acc + item.paidAmount, 0);
    const total = items.reduce((acc, item) => acc + item.amount, 0);
    return { paidTotal, total };
  }, [scheduleQuery.data]);

  return (
    <section className="space-y-4">
      <header className="rounded-xl border border-border bg-surface p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-semibold">Plan de pagos</h1>
            <p className="mt-1 text-sm text-textSecondary">Cuotas y estado de recaudo.</p>
          </div>
          <Link href="/loans" className="text-primary hover:underline">
            Volver a préstamos
          </Link>
        </div>
      </header>

      {loanQuery.isError ? (
        <div className="rounded-xl border border-border bg-surface p-6">
          <p className="text-sm text-danger">{getErrorMessage(loanQuery.error)}</p>
        </div>
      ) : null}

      {loanQuery.isLoading || scheduleQuery.isLoading ? (
        <div className="rounded-xl border border-border bg-surface p-6">
          <p className="text-sm text-textSecondary">Cargando plan...</p>
        </div>
      ) : null}

      {loanQuery.data?.data && scheduleQuery.data?.data ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-bg p-6">
            <p className="text-xs uppercase tracking-wider text-textSecondary">Cliente</p>
            <p className="mt-2 text-base font-semibold text-textPrimary">
              {role === "CLIENT"
                ? clientDisplayNameForClientRole
                : clientQuery.data?.data?.name ?? (clientQuery.isLoading ? "Cargando..." : "-")}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-surface p-6 md:grid-cols-3">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-textSecondary">Estado</p>
              <p className="text-sm text-textPrimary">{loanQuery.data.data.status}</p>
            </div>
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-textSecondary">Pagado</p>
              <p className="text-sm font-semibold">{formatCOP(totals.paidTotal)}</p>
            </div>
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-textSecondary">Total</p>
              <p className="text-sm font-semibold">{formatCOP(totals.total)}</p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="rutapay-table-wrap">
              <table className="rutapay-table">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                      #
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                      Vence
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                      Valor
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                      Pagado
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                      Estado
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {scheduleQuery.data.data.map((item) => (
                    <tr key={item.installmentNumber} className="border-t border-border">
                      <td className="px-3 py-3 text-sm text-textSecondary">{item.installmentNumber}</td>
                      <td className="px-3 py-3 text-sm text-textSecondary">
                        {formatBogotaDateFromString(item.dueDate)}
                      </td>
                      <td className="px-3 py-3 text-sm text-textPrimary">{formatCOP(item.amount)}</td>
                      <td className="px-3 py-3 text-sm text-textPrimary">{formatCOP(item.paidAmount)}</td>
                      <td className="px-3 py-3">{scheduleStatusBadge(item.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-bg p-6">
            <p className="text-xs uppercase tracking-wider text-textSecondary">Inicio/Fin</p>
            <p className="mt-2 text-sm text-textSecondary">
              Inicio: {formatBogotaDateFromString(loanQuery.data.data.startDate)} | Fin:{" "}
              {formatBogotaDateFromString(loanQuery.data.data.endDate)}
            </p>
            <p className="mt-1 text-xs text-textSecondary">
              Cuotas: {loanQuery.data.data.installmentCount} • Valor cuota: {formatCOP(loanQuery.data.data.installmentAmount)}
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default LoanDetailPage;

