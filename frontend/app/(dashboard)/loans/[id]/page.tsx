// frontend/app/(dashboard)/loans/[id]/page.tsx
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import api from "../../../../lib/api";
import { getEffectiveRoles, pickPrimaryRole } from "../../../../lib/effective-roles";
import { formatCOP } from "../../../../lib/formatters";
import { formatBogotaDateFromString } from "../../../../lib/bogota";
import { useEffect, useMemo, useState } from "react";
import { useAuthStore, type UserRole } from "../../../../store/authStore";
import TablePagination from "../../../../components/ui/TablePagination";
import { DEFAULT_PAGE_SIZE, type PageSize } from "../../../../lib/page-size";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

type LoanFrequency = "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY";

interface LoanDetail {
  id: string;
  principal: number;
  interestRate: number;
  installmentCount: number;
  installmentAmount: number;
  totalAmount: number;
  totalInterest: number;
  frequency: LoanFrequency;
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
  latePenalty: number;
  totalDue: number;
  pendingAmount: number;
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

const frequencyLabel = (f: LoanFrequency): string => {
  switch (f) {
    case "DAILY":
      return "Diaria";
    case "WEEKLY":
      return "Semanal";
    case "BIWEEKLY":
      return "Quincenal";
    case "MONTHLY":
      return "Mensual";
    default:
      return f;
  }
};

const loanTermsSchema = z.object({
  interestRatePercent: z.coerce.number().int().min(1).max(500),
  frequency: z.enum(["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY"]),
  installmentCount: z.coerce.number().int().min(1).max(240)
});

type LoanTermsFormValues = z.infer<typeof loanTermsSchema>;

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
  const router = useRouter();
  const loanId = params.id;
  const user = useAuthStore((state) => state.user);
  const role: UserRole = pickPrimaryRole(getEffectiveRoles(user));
  const clientDisplayNameForClientRole = role === "CLIENT" ? user?.name ?? "-" : "-";
  const queryClient = useQueryClient();

  const canEditLoanTerms = role === "ADMIN" || role === "SUPER_ADMIN";

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
    const total = items.reduce((acc, item) => acc + item.totalDue, 0);
    const pendingTotal = Math.max(total - paidTotal, 0);
    return { paidTotal, total, pendingTotal };
  }, [scheduleQuery.data]);

  const [schedulePage, setSchedulePage] = useState(1);
  const [scheduleLimit, setScheduleLimit] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const scheduleItems = scheduleQuery.data?.data ?? [];
  const pagedScheduleItems = useMemo(() => {
    const start = (schedulePage - 1) * scheduleLimit;
    return scheduleItems.slice(start, start + scheduleLimit);
  }, [scheduleItems, schedulePage, scheduleLimit]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(scheduleItems.length / scheduleLimit));
    if (schedulePage > totalPages) {
      setSchedulePage(totalPages);
    }
  }, [scheduleItems.length, scheduleLimit, schedulePage]);

  const termsForm = useForm<LoanTermsFormValues>({
    resolver: zodResolver(loanTermsSchema),
    defaultValues: { interestRatePercent: 1, frequency: "MONTHLY", installmentCount: 1 },
    mode: "onChange"
  });

  const loanData = loanQuery.data?.data;

  useEffect(() => {
    const l = loanQuery.data?.data;
    if (!l) {
      return;
    }
    const pct = Math.round(Number(l.interestRate) * 100);
    termsForm.reset({
      interestRatePercent: pct > 0 ? pct : 1,
      frequency: l.frequency,
      installmentCount: l.installmentCount
    });
  }, [
    loanQuery.data?.data?.id,
    loanQuery.data?.data?.interestRate,
    loanQuery.data?.data?.frequency,
    loanQuery.data?.data?.installmentCount,
    termsForm.reset
  ]);

  const canSubmitTermsCorrection = useMemo(() => {
    if (!canEditLoanTerms || !loanData || loanData.status !== "ACTIVE") {
      return false;
    }
    const items = scheduleQuery.data?.data ?? [];
    if (items.length === 0) {
      return false;
    }
    return items.every(
      (s) => s.paidAmount === 0 && s.status !== "PAID" && s.status !== "PARTIAL"
    );
  }, [canEditLoanTerms, loanData, scheduleQuery.data?.data]);

  const updateTermsMutation = useMutation({
    mutationFn: async (values: LoanTermsFormValues): Promise<LoanResponse> => {
      const response = await api.patch<LoanResponse>(`/loans/${loanId}/terms`, {
        interestRate: values.interestRatePercent,
        frequency: values.frequency,
        installmentCount: values.installmentCount
      });
      return response.data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["loan-detail", loanId] }),
        queryClient.invalidateQueries({ queryKey: ["loan-schedule", loanId] })
      ]);
    }
  });

  const deleteLoanMutation = useMutation({
    mutationFn: async (): Promise<void> => {
      await api.delete(`/loans/${loanId}`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["loans"] });
      router.push("/loans");
    }
  });

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

          <div className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-surface p-6 sm:grid-cols-2 xl:grid-cols-3">
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
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-textSecondary">Saldo pendiente</p>
              <p className="text-sm font-semibold text-warning">{formatCOP(totals.pendingTotal)}</p>
            </div>
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-textSecondary">Interés (mensual, %)</p>
              <p className="text-sm font-semibold text-textPrimary">
                {Math.round(Number(loanQuery.data.data.interestRate) * 100)}%
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-textSecondary">Tipo de cuota</p>
              <p className="text-sm font-semibold text-textPrimary">
                {frequencyLabel(loanQuery.data.data.frequency)}
              </p>
            </div>
          </div>

          {canEditLoanTerms ? (
            <div className="rounded-xl border border-border bg-surface p-6">
              <h2 className="text-lg font-semibold text-textPrimary">Corregir condiciones</h2>
              <p className="mt-1 text-sm text-textSecondary">
                Solo administradores: ajusta interés mensual (%), frecuencia (diaria a mensual) y número de cuotas. Se
                regenera el plan con el mismo capital. No disponible si ya hay cobros registrados.
              </p>
              {!canSubmitTermsCorrection ? (
                <p className="mt-3 text-sm text-warning">
                  {loanQuery.data.data.status !== "ACTIVE"
                    ? "Solo préstamos activos se pueden corregir así."
                    : "No se puede corregir ni eliminar: ya hay cuotas cobradas o pagos registrados."}
                </p>
              ) : null}
              <form
                className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 md:items-end"
                onSubmit={termsForm.handleSubmit(async (values) => {
                  await updateTermsMutation.mutateAsync(values);
                })}
              >
                <div>
                  <label className="mb-1 block text-sm text-textSecondary">Interés mensual (%)</label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    step={1}
                    className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
                    {...termsForm.register("interestRatePercent", { valueAsNumber: true })}
                  />
                  {termsForm.formState.errors.interestRatePercent ? (
                    <p className="mt-1 text-xs text-danger">
                      {termsForm.formState.errors.interestRatePercent.message}
                    </p>
                  ) : null}
                </div>
                <div>
                  <label className="mb-1 block text-sm text-textSecondary">Frecuencia</label>
                  <select
                    className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
                    {...termsForm.register("frequency")}
                  >
                    <option value="DAILY">Diaria</option>
                    <option value="WEEKLY">Semanal</option>
                    <option value="BIWEEKLY">Quincenal</option>
                    <option value="MONTHLY">Mensual</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm text-textSecondary">Número de cuotas</label>
                  <input
                    type="number"
                    min={1}
                    max={240}
                    step={1}
                    className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
                    {...termsForm.register("installmentCount", { valueAsNumber: true })}
                  />
                  {termsForm.formState.errors.installmentCount ? (
                    <p className="mt-1 text-xs text-danger">
                      {termsForm.formState.errors.installmentCount.message}
                    </p>
                  ) : null}
                </div>
                <button
                  type="submit"
                  disabled={
                    !canSubmitTermsCorrection ||
                    !termsForm.formState.isValid ||
                    updateTermsMutation.isPending
                  }
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {updateTermsMutation.isPending ? "Guardando..." : "Aplicar corrección"}
                </button>
              </form>
              {updateTermsMutation.isError ? (
                <p className="mt-2 text-sm text-danger">{getErrorMessage(updateTermsMutation.error)}</p>
              ) : null}

              <div className="mt-8 border-t border-border pt-6">
                <h3 className="text-base font-semibold text-textPrimary">Eliminar préstamo</h3>
                <p className="mt-1 text-sm text-textSecondary">
                  Solo si no hay pagos registrados. Esta acción no se puede deshacer.
                </p>
                <button
                  type="button"
                  disabled={!canSubmitTermsCorrection || deleteLoanMutation.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        "¿Eliminar este préstamo de forma permanente? No hay pagos registrados en el sistema."
                      )
                    ) {
                      void deleteLoanMutation.mutateAsync();
                    }
                  }}
                  className="mt-4 rounded-md border border-danger bg-transparent px-4 py-2 text-sm font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
                >
                  {deleteLoanMutation.isPending ? "Eliminando..." : "Eliminar préstamo"}
                </button>
                {deleteLoanMutation.isError ? (
                  <p className="mt-2 text-sm text-danger">{getErrorMessage(deleteLoanMutation.error)}</p>
                ) : null}
              </div>
            </div>
          ) : null}

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
                      Mora
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                      Total cuota
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                      Pagado
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                      Pendiente
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                      Estado
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagedScheduleItems.map((item) => (
                    <tr key={item.installmentNumber} className="border-t border-border">
                      <td className="px-3 py-3 text-sm text-textSecondary">{item.installmentNumber}</td>
                      <td className="px-3 py-3 text-sm text-textSecondary">
                        {formatBogotaDateFromString(item.dueDate)}
                      </td>
                      <td className="px-3 py-3 text-sm text-textPrimary">{formatCOP(item.amount)}</td>
                      <td className="px-3 py-3 text-sm text-warning">{formatCOP(item.latePenalty)}</td>
                      <td className="px-3 py-3 text-sm font-semibold text-textPrimary">{formatCOP(item.totalDue)}</td>
                      <td className="px-3 py-3 text-sm text-textPrimary">{formatCOP(item.paidAmount)}</td>
                      <td className="px-3 py-3 text-sm text-warning">{formatCOP(item.pendingAmount)}</td>
                      <td className="px-3 py-3">{scheduleStatusBadge(item.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {scheduleItems.length > 0 ? (
              <TablePagination
                page={schedulePage}
                limit={scheduleLimit}
                total={scheduleItems.length}
                onPageChange={setSchedulePage}
                onLimitChange={(next) => {
                  setScheduleLimit(next);
                  setSchedulePage(1);
                }}
              />
            ) : null}
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

