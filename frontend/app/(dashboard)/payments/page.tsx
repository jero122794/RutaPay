// frontend/app/(dashboard)/payments/page.tsx
"use client";

import { useMemo, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuthStore, type UserRole } from "../../../store/authStore";
import api from "../../../lib/api";
import { formatCOP } from "../../../lib/formatters";
import { formatBogotaDateFromString } from "../../../lib/bogota";
import { useMutation } from "@tanstack/react-query";

interface ListResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

interface LoanItem {
  id: string;
  status: "ACTIVE" | "COMPLETED" | "DEFAULTED" | "RESTRUCTURED";
  clientId: string;
  totalAmount: number;
}

interface ClientItem {
  id: string;
  name: string;
}

interface ScheduleItem {
  id: string;
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

interface PaymentItem {
  id: string;
  loanId: string;
  scheduleId: string | null;
  amount: number;
  notes: string | null;
  createdAt: string;
}

interface PaymentListResponse {
  data: PaymentItem[];
  total: number;
  page: number;
  limit: number;
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
      return (
        <span className="rounded-full bg-success/10 px-2 py-1 text-xs text-success">Pagada</span>
      );
    case "PARTIAL":
      return (
        <span className="rounded-full bg-warning/10 px-2 py-1 text-xs text-warning">
          Parcial
        </span>
      );
    case "OVERDUE":
      return (
        <span className="rounded-full bg-danger/10 px-2 py-1 text-xs text-danger">
          Vencida
        </span>
      );
    case "PENDING":
    default:
      return (
        <span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
          Pendiente
        </span>
      );
  }
};

interface PaymentFormValues {
  amount: number;
  notes?: string;
}

const paymentFormSchema = z.object({
  amount: z.number().int().positive(),
  notes: z.string().max(300).optional()
});

const PaymentsPage = (): JSX.Element => {
  const user = useAuthStore((state) => state.user);
  const role: UserRole = user?.roles[0] ?? "CLIENT";
  const queryClient = useQueryClient();

  const canRegister = role === "ROUTE_MANAGER" || role === "ADMIN" || role === "SUPER_ADMIN";

  const clientsQuery = useQuery({
    queryKey: ["clients-for-payments-dropdown"],
    queryFn: async (): Promise<ListResponse<ClientItem>> => {
      const response = await api.get<ListResponse<ClientItem>>("/clients");
      return response.data;
    },
    enabled: canRegister
  });

  const clientNameById = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    const items = clientsQuery.data?.data ?? [];
    items.forEach((c) => {
      map[c.id] = c.name;
    });
    return map;
  }, [clientsQuery.data]);

  const loansQuery = useQuery({
    queryKey: ["payments-loans"],
    queryFn: async (): Promise<ListResponse<LoanItem>> => {
      const response = await api.get<ListResponse<LoanItem>>("/loans");
      return response.data;
    }
  });

  const [selectedLoanId, setSelectedLoanId] = useState<string>("");

  const availableLoansForPayment = useMemo(() => {
    const loans = loansQuery.data?.data ?? [];
    return loans.filter((loan) => loan.status !== "COMPLETED");
  }, [loansQuery.data]);

  const effectiveLoanId = useMemo((): string => {
    const selectedIsAvailable = availableLoansForPayment.some((l) => l.id === selectedLoanId);
    if (selectedLoanId && selectedIsAvailable) return selectedLoanId;
    return availableLoansForPayment[0]?.id ?? "";
  }, [availableLoansForPayment, selectedLoanId]);

  const scheduleQuery = useQuery({
    queryKey: ["payment-schedule", effectiveLoanId],
    queryFn: async (): Promise<ScheduleResponse> => {
      const response = await api.get<ScheduleResponse>(`/loans/${effectiveLoanId}/schedule`);
      return response.data;
    },
    enabled: Boolean(effectiveLoanId) && canRegister
  });

  const [selectedInstallmentNumber, setSelectedInstallmentNumber] = useState<number | "">("");

  const availableSchedules = useMemo(() => {
    return (scheduleQuery.data?.data ?? []).filter((item) => item.status !== "PAID");
  }, [scheduleQuery.data]);

  const effectiveInstallmentNumber = useMemo(() => {
    if (selectedInstallmentNumber !== "") return selectedInstallmentNumber;
    return availableSchedules[0]?.installmentNumber ?? "";
  }, [selectedInstallmentNumber, availableSchedules]);

  const scheduleForSelection = useMemo(() => {
    if (!effectiveInstallmentNumber) return null;
    return (scheduleQuery.data?.data ?? []).find((item) => item.installmentNumber === effectiveInstallmentNumber) ?? null;
  }, [effectiveInstallmentNumber, scheduleQuery.data]);

  const paymentsQuery = useQuery({
    queryKey: ["payments-list", role],
    queryFn: async (): Promise<PaymentListResponse> => {
      const response = await api.get<PaymentListResponse>("/payments");
      return response.data;
    },
    enabled: canRegister
  });

  const clientPaymentsQuery = useQuery({
    queryKey: ["payments-by-loan", effectiveLoanId],
    queryFn: async (): Promise<PaymentListResponse> => {
      const response = await api.get<PaymentListResponse>(`/payments/loan/${effectiveLoanId}`);
      return response.data;
    },
    enabled: role === "CLIENT" && Boolean(effectiveLoanId)
  });

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      amount: 0,
      notes: ""
    },
    mode: "onChange"
  });

  const { mutateAsync, isPending } = useMutation({
    mutationFn: async (values: PaymentFormValues): Promise<void> => {
      if (!effectiveLoanId) {
        throw new Error("Selecciona un préstamo.");
      }
      if (!scheduleForSelection) {
        throw new Error("Selecciona una cuota pendiente o parcial.");
      }

      await api.post("/payments", {
        loanId: effectiveLoanId,
        scheduleId: scheduleForSelection.id,
        amount: values.amount,
        notes: values.notes ? values.notes : undefined
      });
    },
    onSuccess: async () => {
      form.reset({ amount: 0, notes: "" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["payments-list", role] }),
        queryClient.invalidateQueries({ queryKey: ["payments-loans"] }),
        queryClient.invalidateQueries({ queryKey: ["payment-schedule", effectiveLoanId] }),
        queryClient.invalidateQueries({ queryKey: ["payments-by-loan", effectiveLoanId] }),
        queryClient.invalidateQueries({ queryKey: ["loans-list"] }),
        queryClient.invalidateQueries({ queryKey: ["loan-detail", effectiveLoanId] })
      ]);
    }
  });

  const onSubmit = async (values: PaymentFormValues): Promise<void> => {
    await mutateAsync(values);
  };

  const showRegister = canRegister;

  return (
    <section className="space-y-4">
      <header className="rounded-xl border border-border bg-surface p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-semibold">Pagos</h1>
            <p className="mt-1 text-sm text-textSecondary">Registra cobros y consulta historial.</p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/loans" className="text-primary hover:underline">
              Ver préstamos
            </Link>
          </div>
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

      {role === "CLIENT" ? (
        <div className="rounded-xl border border-border bg-surface p-6">
          <h2 className="text-lg font-semibold">Tus pagos</h2>

          <div className="mt-4 space-y-2">
            <label className="text-sm text-textSecondary">Préstamo</label>
            <select
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
              value={effectiveLoanId}
              onChange={(e) => setSelectedLoanId(e.target.value)}
            >
              {availableLoansForPayment.map((loan, index) => (
                <option key={loan.id} value={loan.id}>
                  Préstamo #{index + 1} • {formatCOP(loan.totalAmount)} ({loan.status})
                </option>
              ))}
            </select>
          </div>

          {availableLoansForPayment.length === 0 ? (
            <p className="mt-4 text-sm text-textSecondary">No tienes préstamos activos para pagos.</p>
          ) : null}

          {clientPaymentsQuery.isLoading ? (
            <p className="mt-4 text-sm text-textSecondary">Cargando pagos...</p>
          ) : null}

          {clientPaymentsQuery.isError ? (
            <p className="mt-4 text-sm text-danger">{getErrorMessage(clientPaymentsQuery.error)}</p>
          ) : null}

          {clientPaymentsQuery.data ? (
            <div className="mt-4 rutapay-table-wrap">
              {clientPaymentsQuery.data.data.length === 0 ? (
                <p className="text-sm text-textSecondary">Aún no tienes pagos registrados.</p>
              ) : (
                <table className="rutapay-table">
                  <thead>
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                        Fecha
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                        Valor
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                        Nota
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientPaymentsQuery.data.data.map((p) => (
                      <tr key={p.id} className="border-t border-border">
                        <td className="px-3 py-3 text-sm text-textSecondary">
                          {formatBogotaDateFromString(p.createdAt)}
                        </td>
                        <td className="px-3 py-3 text-sm text-textPrimary">
                          {formatCOP(p.amount)}
                        </td>
                        <td className="px-3 py-3 text-sm text-textSecondary">{p.notes ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {showRegister ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="space-y-4 xl:col-span-1">
            <div className="rounded-xl border border-border bg-surface p-6">
              <h2 className="text-lg font-semibold">Registrar pago</h2>

              <div className="mt-4 space-y-2">
                <label className="text-sm text-textSecondary">Préstamo</label>
                <select
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
                  value={effectiveLoanId}
                  onChange={(e) => setSelectedLoanId(e.target.value)}
                >
                  {availableLoansForPayment.map((loan, index) => (
                    <option key={loan.id} value={loan.id}>
                      Préstamo #{index + 1} • {formatCOP(loan.totalAmount)} •{" "}
                      {clientNameById[loan.clientId] ?? loan.clientId} ({loan.status})
                    </option>
                  ))}
                </select>
              </div>

              {availableLoansForPayment.length === 0 ? (
                <p className="mt-4 text-sm text-textSecondary">No hay préstamos activos para registrar pagos.</p>
              ) : null}

              {scheduleQuery.isLoading ? (
                <p className="mt-4 text-sm text-textSecondary">Cargando cuotas...</p>
              ) : null}

              {scheduleQuery.isError ? (
                <p className="mt-4 text-sm text-danger">{getErrorMessage(scheduleQuery.error)}</p>
              ) : null}

              {availableSchedules.length === 0 && scheduleQuery.data ? (
                <p className="mt-4 text-sm text-textSecondary">
                  No hay cuotas pendientes para este préstamo.
                </p>
              ) : null}

              {availableSchedules.length > 0 && scheduleQuery.data ? (
                <div className="mt-4 space-y-2">
                  <label className="text-sm text-textSecondary">Cuota</label>
                  <select
                    className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
                    value={effectiveInstallmentNumber}
                    onChange={(e) => setSelectedInstallmentNumber(Number(e.target.value))}
                  >
                    {availableSchedules.map((item) => (
                      <option key={item.installmentNumber} value={item.installmentNumber}>
                        #{item.installmentNumber} • {formatBogotaDateFromString(item.dueDate)} •{" "}
                        {formatCOP(item.amount - item.paidAmount)}
                      </option>
                    ))}
                  </select>
                  {scheduleForSelection ? (
                    <p className="text-xs text-textSecondary">
                      Estado: {scheduleForSelection.status}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <form className="mt-6 space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
                <div>
                  <label className="mb-1 block text-sm text-textSecondary">Monto recibido (COP)</label>
                  <input
                    type="number"
                    step={1}
                    className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
                    {...form.register("amount", { valueAsNumber: true })}
                  />
                  <p className="mt-1 text-xs text-danger">{form.formState.errors.amount?.message}</p>
                </div>

                <div>
                  <label className="mb-1 block text-sm text-textSecondary">Notas (opcional)</label>
                  <input
                    type="text"
                    className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
                    {...form.register("notes")}
                  />
                  <p className="mt-1 text-xs text-danger">{form.formState.errors.notes?.message}</p>
                </div>

                <button
                  type="submit"
                  disabled={
                    isPending ||
                    !effectiveLoanId ||
                    !scheduleForSelection ||
                    availableSchedules.length === 0 ||
                    !form.formState.isValid
                  }
                  className="w-full rounded-md bg-primary px-4 py-2 font-medium text-white disabled:opacity-50"
                >
                  {isPending ? "Registrando..." : "Registrar pago"}
                </button>
              </form>
            </div>
          </div>

          <div className="space-y-4 xl:col-span-2">
            <div className="rounded-xl border border-border bg-surface p-6">
              <h2 className="text-lg font-semibold">Historial de pagos</h2>
              {paymentsQuery.isLoading ? (
                <p className="mt-4 text-sm text-textSecondary">Cargando pagos...</p>
              ) : null}
              {paymentsQuery.isError ? (
                <p className="mt-4 text-sm text-danger">{getErrorMessage(paymentsQuery.error)}</p>
              ) : null}

              {paymentsQuery.data ? (
                <div className="mt-4 rutapay-table-wrap">
                  {paymentsQuery.data.data.length === 0 ? (
                    <p className="text-sm text-textSecondary">Aún no hay pagos registrados.</p>
                  ) : (
                    <table className="rutapay-table">
                      <thead>
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                            Fecha
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                            Préstamo
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                            Valor
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                            Nota
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {paymentsQuery.data.data.map((p) => (
                          <tr key={p.id} className="border-t border-border">
                            <td className="px-3 py-3 text-sm text-textSecondary">
                              {formatBogotaDateFromString(p.createdAt)}
                            </td>
                            <td className="px-3 py-3 text-sm text-textSecondary">{p.loanId}</td>
                            <td className="px-3 py-3 text-sm text-textPrimary">
                              {formatCOP(p.amount)}
                            </td>
                            <td className="px-3 py-3 text-sm text-textSecondary">{p.notes ?? "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default PaymentsPage;
