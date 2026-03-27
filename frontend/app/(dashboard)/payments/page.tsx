// frontend/app/(dashboard)/payments/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import TablePagination from "../../../components/ui/TablePagination";
import { useAuthStore, type UserRole } from "../../../store/authStore";
import { getEffectiveRoles } from "../../../lib/effective-roles";
import { DEFAULT_PAGE_SIZE, type PageSize } from "../../../lib/page-size";
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

interface PaymentItem {
  id: string;
  loanId: string;
  clientId: string;
  clientName: string;
  scheduleId: string | null;
  amount: number;
  method: "CASH" | "TRANSFER";
  status: "ACTIVE" | "REVERSED";
  notes: string | null;
  reversedAt: string | null;
  reversedById: string | null;
  reversalReason: string | null;
  createdAt: string;
}

interface PaymentListResponse {
  data: PaymentItem[];
  total: number;
  page: number;
  limit: number;
}

interface LoanSearchOption {
  loanId: string;
  sequence: number;
  clientName: string;
  label: string;
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
  method: "CASH" | "TRANSFER";
  notes?: string;
}

const paymentFormSchema = z.object({
  amount: z.number().int().positive(),
  method: z.enum(["CASH", "TRANSFER"]),
  notes: z.string().max(300).optional()
});

const PaymentsPage = (): JSX.Element => {
  const [clientReady, setClientReady] = useState(false);
  useEffect(() => {
    setClientReady(true);
  }, []);

  const user = useAuthStore((state) => state.user);
  // Avoid hydration mismatch: server has no localStorage/JWT merge; first paint must match server.
  const roles = useMemo((): UserRole[] => {
    if (!clientReady) {
      return [];
    }
    return getEffectiveRoles(user);
  }, [clientReady, user?.roles, user?.id]);
  const hasRole = (r: UserRole): boolean => roles.includes(r);
  const rolesCacheKey = useMemo(() => [...roles].sort().join(","), [roles]);
  const queryClient = useQueryClient();

  const canRegister =
    hasRole("ROUTE_MANAGER") || hasRole("ADMIN") || hasRole("SUPER_ADMIN");
  const isClientView = hasRole("CLIENT") && !canRegister;

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
  const [loanSearchTerm, setLoanSearchTerm] = useState<string>("");

  const availableLoansForPayment = useMemo(() => {
    const loans = loansQuery.data?.data ?? [];
    return loans.filter((loan) => loan.status !== "COMPLETED");
  }, [loansQuery.data]);

  const effectiveLoanId = useMemo((): string => {
    const selectedIsAvailable = availableLoansForPayment.some((l) => l.id === selectedLoanId);
    if (selectedLoanId && selectedIsAvailable) return selectedLoanId;
    return availableLoansForPayment[0]?.id ?? "";
  }, [availableLoansForPayment, selectedLoanId]);

  const loanSearchOptions = useMemo<LoanSearchOption[]>(() => {
    return availableLoansForPayment.map((loan, index) => {
      const sequence = index + 1;
      const clientName = clientNameById[loan.clientId] ?? "Cliente";
      return {
        loanId: loan.id,
        sequence,
        clientName,
        label: `${sequence} • ${clientName}`
      };
    });
  }, [availableLoansForPayment, clientNameById]);

  const selectedLoanOption = useMemo(() => {
    return loanSearchOptions.find((opt) => opt.loanId === effectiveLoanId) ?? null;
  }, [loanSearchOptions, effectiveLoanId]);

  useEffect(() => {
    if (selectedLoanOption) {
      setLoanSearchTerm(selectedLoanOption.label);
    } else if (loanSearchOptions.length === 0) {
      setLoanSearchTerm("");
    }
  }, [selectedLoanOption, loanSearchOptions.length]);

  const filteredLoanOptions = useMemo(() => {
    const term = loanSearchTerm.trim().toLowerCase();
    if (!term) return loanSearchOptions;
    return loanSearchOptions.filter((opt) => {
      return (
        opt.label.toLowerCase().includes(term) ||
        String(opt.sequence).includes(term) ||
        opt.clientName.toLowerCase().includes(term)
      );
    });
  }, [loanSearchTerm, loanSearchOptions]);

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

  const [paymentsPage, setPaymentsPage] = useState(1);
  const [paymentsLimit, setPaymentsLimit] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [clientPayPage, setClientPayPage] = useState(1);
  const [clientPayLimit, setClientPayLimit] = useState<PageSize>(DEFAULT_PAGE_SIZE);

  const paymentsQuery = useQuery({
    queryKey: ["payments-list", rolesCacheKey, paymentsPage, paymentsLimit],
    queryFn: async (): Promise<PaymentListResponse> => {
      const response = await api.get<PaymentListResponse>("/payments", {
        params: { page: paymentsPage, limit: paymentsLimit }
      });
      return response.data;
    },
    enabled: canRegister
  });

  const clientPaymentsQuery = useQuery({
    queryKey: ["payments-by-loan", effectiveLoanId, clientPayPage, clientPayLimit],
    queryFn: async (): Promise<PaymentListResponse> => {
      const response = await api.get<PaymentListResponse>(`/payments/loan/${effectiveLoanId}`, {
        params: { page: clientPayPage, limit: clientPayLimit }
      });
      return response.data;
    },
    enabled: isClientView && Boolean(effectiveLoanId)
  });

  useEffect(() => {
    const d = paymentsQuery.data;
    if (!d) return;
    if (d.page !== paymentsPage) setPaymentsPage(d.page);
  }, [paymentsQuery.data, paymentsPage]);

  useEffect(() => {
    const d = clientPaymentsQuery.data;
    if (!d) return;
    if (d.page !== clientPayPage) setClientPayPage(d.page);
  }, [clientPaymentsQuery.data, clientPayPage]);

  useEffect(() => {
    setClientPayPage(1);
  }, [effectiveLoanId]);

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      amount: 0,
      method: "CASH",
      notes: ""
    },
    mode: "onChange"
  });

  const paymentIdempotencyKeyRef = useRef<string | null>(null);

  const { mutateAsync, isPending } = useMutation({
    mutationFn: async (values: PaymentFormValues): Promise<void> => {
      if (!effectiveLoanId) {
        throw new Error("Selecciona un préstamo.");
      }
      if (!scheduleForSelection) {
        throw new Error("Selecciona una cuota pendiente o parcial.");
      }

      if (typeof crypto === "undefined" || !crypto.randomUUID) {
        throw new Error("Tu navegador no admite operaciones seguras de pago. Actualiza el navegador.");
      }
      const idemKey = paymentIdempotencyKeyRef.current ?? crypto.randomUUID();
      paymentIdempotencyKeyRef.current = idemKey;

      await api.post(
        "/payments",
        {
          loanId: effectiveLoanId,
          scheduleId: scheduleForSelection.id,
          amount: values.amount,
          method: values.method,
          notes: values.notes ? values.notes : undefined
        },
        { headers: { "X-Idempotency-Key": idemKey } }
      );
    },
    onSuccess: async () => {
      paymentIdempotencyKeyRef.current = null;
      form.reset({ amount: 0, method: "CASH", notes: "" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["payments-list"] }),
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

  const canReverse = hasRole("SUPER_ADMIN") || hasRole("ADMIN");

  const paymentRowCanReverse = (p: PaymentItem): boolean => {
    if (p.status === "REVERSED") {
      return false;
    }
    if (!p.scheduleId) {
      return false;
    }
    return true;
  };

  const reversePaymentMutation = useMutation({
    mutationFn: async (paymentId: string): Promise<void> => {
      await api.post(`/payments/${paymentId}/reverse`, {});
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["payments-list"] }),
        queryClient.invalidateQueries({ queryKey: ["payments-by-loan", effectiveLoanId] }),
        queryClient.invalidateQueries({ queryKey: ["payment-schedule", effectiveLoanId] }),
        queryClient.invalidateQueries({ queryKey: ["payments-loans"] }),
        queryClient.invalidateQueries({ queryKey: ["loans-list"] }),
        queryClient.invalidateQueries({ queryKey: ["loan-detail", effectiveLoanId] })
      ]);
    }
  });

  const showRegister = canRegister;

  return (
    <section className="min-w-0 space-y-4">
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

      {isClientView ? (
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
                  {index + 1} • {formatCOP(loan.totalAmount)} ({loan.status})
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
            <div className="mt-4">
              <div className="rutapay-table-wrap">
              {clientPaymentsQuery.data.total === 0 ? (
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
              {clientPaymentsQuery.data.total > 0 ? (
                <TablePagination
                  page={clientPayPage}
                  limit={clientPayLimit}
                  total={clientPaymentsQuery.data.total}
                  onPageChange={setClientPayPage}
                  onLimitChange={(next) => {
                    setClientPayLimit(next);
                    setClientPayPage(1);
                  }}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {showRegister ? (
        <div className="flex w-full min-w-0 flex-col gap-4">
          <div className="w-full rounded-xl border border-border bg-surface p-6">
              <h2 className="text-lg font-semibold">Registrar pago</h2>

              <div className="mt-4 space-y-2">
                <label className="text-sm text-textSecondary">Préstamo</label>
                <input
                  type="search"
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
                  placeholder="Buscar por secuencial o nombre del cliente"
                  value={loanSearchTerm}
                  onChange={(e) => {
                    setLoanSearchTerm(e.target.value);
                  }}
                />
                {availableLoansForPayment.length > 0 ? (
                  <div className="max-h-56 overflow-y-auto rounded-md border border-border bg-bg">
                    {filteredLoanOptions.length === 0 ? (
                      <p className="px-3 py-2 text-sm text-textSecondary">Sin resultados para la búsqueda.</p>
                    ) : (
                      filteredLoanOptions.map((opt) => {
                        const isActive = opt.loanId === effectiveLoanId;
                        return (
                          <button
                            key={opt.loanId}
                            type="button"
                            onClick={() => {
                              setSelectedLoanId(opt.loanId);
                              setLoanSearchTerm(opt.label);
                            }}
                            className={[
                              "flex w-full items-center justify-between border-b border-border px-3 py-2 text-left text-sm last:border-b-0",
                              isActive ? "bg-primary/10 text-primary" : "text-textPrimary hover:bg-surface"
                            ].join(" ")}
                          >
                            <span>{opt.label}</span>
                            <span className="text-xs text-textSecondary">
                              {formatCOP(
                                availableLoansForPayment.find((loan) => loan.id === opt.loanId)?.totalAmount ?? 0
                              )}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                ) : null}
                {selectedLoanOption ? (
                  <p className="text-xs text-textSecondary">Seleccionado: {selectedLoanOption.label}</p>
                ) : null}
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
                        {formatCOP(item.pendingAmount)}
                      </option>
                    ))}
                  </select>
                  {scheduleForSelection ? (
                    <div className="space-y-1">
                      <p className="text-xs text-textSecondary">Estado: {scheduleForSelection.status}</p>
                      <p className="text-xs text-warning">
                        Mora actual: {formatCOP(scheduleForSelection.latePenalty)} • Total cuota:{" "}
                        {formatCOP(scheduleForSelection.totalDue)}
                      </p>
                    </div>
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
                  <label className="mb-1 block text-sm text-textSecondary">Método de pago</label>
                  <select
                    className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
                    {...form.register("method")}
                  >
                    <option value="CASH">Efectivo</option>
                    <option value="TRANSFER">Transferencia</option>
                  </select>
                  <p className="mt-1 text-xs text-danger">{form.formState.errors.method?.message}</p>
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
                {availableSchedules.length > 0 &&
                effectiveLoanId &&
                scheduleForSelection &&
                !form.formState.isValid ? (
                  <p className="text-xs text-textSecondary">
                    Indica un monto recibido válido (entero mayor que 0) para activar esta acción.
                  </p>
                ) : null}
              </form>
          </div>

          <div className="w-full min-w-0 rounded-xl border border-border bg-surface p-6">
              <h2 className="text-lg font-semibold">Historial de pagos</h2>
              {canReverse ? (
                <p className="mt-2 text-xs text-textSecondary">
                  Los pagos en estado Activo muestran el botón{" "}
                  <span className="font-medium text-textPrimary">Reversar</span> en la última columna.
                  En pantallas estrechas, desplázate horizontalmente sobre la tabla para verla.
                </p>
              ) : null}
              {paymentsQuery.isLoading ? (
                <p className="mt-4 text-sm text-textSecondary">Cargando pagos...</p>
              ) : null}
              {paymentsQuery.isError ? (
                <p className="mt-4 text-sm text-danger">{getErrorMessage(paymentsQuery.error)}</p>
              ) : null}

              {paymentsQuery.data ? (
                <div className="mt-4 w-full min-w-0">
                  <div className="rutapay-table-wrap w-full min-w-0 max-w-full">
                  {paymentsQuery.data.total === 0 ? (
                    <p className="text-sm text-textSecondary">Aún no hay pagos registrados.</p>
                  ) : (
                    <table className="rutapay-table">
                      <thead>
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                            Fecha
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                            Cliente
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                            Valor
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                            Método
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                            Estado
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                            Nota
                          </th>
                          <th className="sticky right-0 z-[1] min-w-[7rem] border-l border-border bg-surface px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-textSecondary shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.45)]">
                            Acciones
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {paymentsQuery.data.data.map((p) => (
                          <tr key={p.id} className="border-t border-border">
                            <td className="px-3 py-3 text-sm text-textSecondary">
                              {formatBogotaDateFromString(p.createdAt)}
                            </td>
                            <td className="px-3 py-3 text-sm text-textSecondary">{p.clientName}</td>
                            <td className="px-3 py-3 text-sm text-textPrimary">
                              {formatCOP(p.amount)}
                            </td>
                            <td className="px-3 py-3 text-sm text-textSecondary">
                              {p.method === "CASH" ? "Efectivo" : "Transferencia"}
                            </td>
                            <td className="px-3 py-3 text-sm text-textSecondary">
                              {p.status === "REVERSED" ? "Anulado" : "Activo"}
                            </td>
                            <td className="px-3 py-3 text-sm text-textSecondary">{p.notes ?? "-"}</td>
                            <td className="sticky right-0 z-[1] min-w-[7rem] border-l border-border bg-surface px-3 py-3 text-right shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.45)]">
                              {canReverse && paymentRowCanReverse(p) ? (
                                <button
                                  type="button"
                                  className="rounded-md border border-danger px-3 py-1 text-sm text-danger hover:bg-danger/10"
                                  onClick={async () => {
                                    const confirmed = window.confirm("¿Deseas anular/reversar este pago?");
                                    if (!confirmed) return;
                                    await reversePaymentMutation.mutateAsync(p.id);
                                  }}
                                >
                                  Reversar
                                </button>
                              ) : (
                                <span className="text-xs text-textSecondary">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  </div>
                  {paymentsQuery.data.total > 0 ? (
                    <TablePagination
                      page={paymentsPage}
                      limit={paymentsLimit}
                      total={paymentsQuery.data.total}
                      onPageChange={setPaymentsPage}
                      onLimitChange={(next) => {
                        setPaymentsLimit(next);
                        setPaymentsPage(1);
                      }}
                    />
                  ) : null}
                </div>
              ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default PaymentsPage;
