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
import { useDebouncedValue } from "../../../lib/useDebouncedValue";

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
  clientName: string;
  totalAmount: number;
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

const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: string } | undefined)?.message;
    return message ?? error.message;
  }
  return "Error desconocido.";
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
  const user = useAuthStore((state) => state.user);
  const hasAuthHydrated = useAuthStore((state) => state.hasAuthHydrated);
  const roles = useMemo((): UserRole[] => {
    if (!hasAuthHydrated) {
      return [];
    }
    return getEffectiveRoles(user);
  }, [hasAuthHydrated, user]);
  const hasRole = (r: UserRole): boolean => roles.includes(r);
  const rolesCacheKey = useMemo(() => [...roles].sort().join(","), [roles]);
  const queryClient = useQueryClient();

  const canRegister =
    hasRole("ROUTE_MANAGER") || hasRole("ADMIN") || hasRole("SUPER_ADMIN");
  const isClientView = hasRole("CLIENT") && !canRegister;

  const [selectedLoanId, setSelectedLoanId] = useState<string>("");
  const [loanSearchTerm, setLoanSearchTerm] = useState<string>("");
  const [isLoanSuggestOpen, setIsLoanSuggestOpen] = useState(false);
  const debouncedTerm = useDebouncedValue(loanSearchTerm, 250).trim();
  const effectiveTerm = debouncedTerm;

  const loansQuery = useQuery({
    queryKey: ["payments-loans-search", effectiveTerm],
    queryFn: async (): Promise<ListResponse<LoanItem>> => {
      const response = await api.get<ListResponse<LoanItem>>("/loans", {
        params: { page: 1, limit: 20, q: effectiveTerm }
      });
      return response.data;
    },
    enabled: hasAuthHydrated && Boolean(user) && canRegister && effectiveTerm.length >= 1
  });

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
    enabled: hasAuthHydrated && Boolean(user) && Boolean(effectiveLoanId) && canRegister
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
    enabled: hasAuthHydrated && Boolean(user) && canRegister
  });

  const clientPaymentsQuery = useQuery({
    queryKey: ["payments-by-loan", effectiveLoanId, clientPayPage, clientPayLimit],
    queryFn: async (): Promise<PaymentListResponse> => {
      const response = await api.get<PaymentListResponse>(`/payments/loan/${effectiveLoanId}`, {
        params: { page: clientPayPage, limit: clientPayLimit }
      });
      return response.data;
    },
    enabled: hasAuthHydrated && Boolean(user) && isClientView && Boolean(effectiveLoanId)
  });

  if (!hasAuthHydrated) {
    return (
      <section className="rounded-xl border border-outline-variant/10 bg-surface-container-low p-6">
        <p className="text-sm text-on-surface-variant">Cargando…</p>
      </section>
    );
  }

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

  const selectedLoan = useMemo((): LoanItem | null => {
    if (!effectiveLoanId) return null;
    return availableLoansForPayment.find((l) => l.id === effectiveLoanId) ?? null;
  }, [availableLoansForPayment, effectiveLoanId]);

  const selectedClientName = selectedLoan?.clientName ?? (selectedLoan ? "Cliente" : "-");

  const scheduleStats = useMemo(() => {
    const items = scheduleQuery.data?.data ?? [];
    const total = items.length;
    const paid = items.filter((i) => i.status === "PAID").length;
    const pct = total > 0 ? Math.round((paid / total) * 100) : 0;
    const totalAmortized = items.reduce((acc, i) => acc + (i.paidAmount ?? 0), 0);
    return { total, paid, pct, totalAmortized };
  }, [scheduleQuery.data]);

  const loanLastPayments = useMemo(() => {
    const items = clientPaymentsQuery.data?.data ?? [];
    return items.slice(0, 2);
  }, [clientPaymentsQuery.data]);

  return (
    <section className="min-w-0">
      <div className="mx-auto max-w-5xl space-y-8 p-4 md:p-8">
        <nav className="flex items-center gap-2 text-xs font-medium text-on-surface-variant">
          <Link href="/overview" className="hover:text-primary">
            Inicio
          </Link>
          <span className="text-on-surface-variant/60">/</span>
          <span className="text-primary">Pagos</span>
        </nav>

        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-on-surface" style={{ fontFamily: "var(--font-headline, Manrope), sans-serif" }}>
              Pagos
            </h1>
            <p className="mt-2 text-lg text-on-surface-variant">Registra cobros y consulta historial.</p>
          </div>
          <Link
            href="/loans"
            className="inline-flex items-center gap-2 font-semibold text-primary hover:underline decoration-2 underline-offset-4"
          >
            <span>Ver préstamos</span>
            <span aria-hidden className="text-lg">→</span>
          </Link>
        </header>

        {loansQuery.isError ? (
          <div className="rounded-xl border border-outline-variant/10 bg-surface-container-low p-6">
            <p className="text-sm text-error">{getErrorMessage(loansQuery.error)}</p>
          </div>
        ) : null}

        {isClientView ? (
          <div className="rounded-xl border border-outline-variant/10 bg-surface-container-low p-6">
            <h2 className="text-lg font-semibold text-on-surface">Tus pagos</h2>
            <p className="mt-1 text-sm text-on-surface-variant">Consulta tu historial por préstamo.</p>

            <div className="mt-4 space-y-2">
              <label className="px-1 text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                Préstamo
              </label>
              <select
                className="w-full appearance-none rounded-xl border-2 border-transparent bg-surface-container-lowest p-4 text-on-surface outline-none focus:border-primary/40"
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
              <p className="mt-4 text-sm text-on-surface-variant">No tienes préstamos activos para pagos.</p>
            ) : null}

            {clientPaymentsQuery.isLoading ? (
              <p className="mt-4 text-sm text-on-surface-variant">Cargando pagos...</p>
            ) : null}

            {clientPaymentsQuery.isError ? (
              <p className="mt-4 text-sm text-error">{getErrorMessage(clientPaymentsQuery.error)}</p>
            ) : null}

            {clientPaymentsQuery.data ? (
              <div className="mt-4">
                <div className="rutapay-table-wrap">
                  {clientPaymentsQuery.data.total === 0 ? (
                    <p className="text-sm text-on-surface-variant">Aún no tienes pagos registrados.</p>
                  ) : (
                    <table className="rutapay-table rutapay-table--responsive">
                      <thead>
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                            Fecha
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                            Valor
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                            Nota
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {clientPaymentsQuery.data.data.map((p) => (
                          <tr key={p.id} className="border-t border-outline-variant/10">
                            <td data-label="Fecha" className="px-3 py-3 text-sm text-on-surface-variant">
                              {formatBogotaDateFromString(p.createdAt)}
                            </td>
                            <td data-label="Valor" className="px-3 py-3 text-sm font-semibold text-primary">
                              {formatCOP(p.amount)}
                            </td>
                            <td data-label="Nota" className="px-3 py-3 text-sm text-on-surface-variant">
                              {p.notes ?? "-"}
                            </td>
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
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            <div className="relative overflow-hidden rounded-xl bg-surface-container-low p-8 shadow-2xl lg:col-span-8">
              <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-full bg-primary opacity-[0.03] blur-3xl -mr-16 -mt-16" />
              <div className="mb-8 flex items-center gap-3">
                <span className="text-primary" aria-hidden>
                  ＋
                </span>
                <h3 className="text-xl font-bold text-on-surface" style={{ fontFamily: "var(--font-headline, Manrope), sans-serif" }}>
                  Registrar pago
                </h3>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="px-1 text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                    Préstamo
                  </label>
                  <input
                    type="search"
                    className="w-full rounded-xl border-2 border-transparent bg-surface-container-lowest p-4 text-on-surface outline-none placeholder:text-outline focus:border-primary/40"
                    placeholder="Escribe el nombre o documento del cliente"
                    value={loanSearchTerm}
                    onChange={(e) => {
                      setLoanSearchTerm(e.target.value);
                      setIsLoanSuggestOpen(true);
                    }}
                    onFocus={() => setIsLoanSuggestOpen(true)}
                    onBlur={() => setIsLoanSuggestOpen(false)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setIsLoanSuggestOpen(false);
                      }
                    }}
                  />
                  {isLoanSuggestOpen && effectiveTerm.length >= 1 ? (
                    <div
                      className="max-h-56 overflow-y-auto rounded-xl border border-outline-variant/10 bg-surface-container-lowest"
                      onMouseDown={(e) => {
                        // Prevent input blur so clicking an option works.
                        e.preventDefault();
                      }}
                    >
                      {loansQuery.isLoading ? (
                        <p className="px-4 py-3 text-sm text-on-surface-variant">Buscando...</p>
                      ) : availableLoansForPayment.length === 0 ? (
                        <p className="px-4 py-3 text-sm text-on-surface-variant">Sin resultados.</p>
                      ) : (
                        availableLoansForPayment.slice(0, 8).map((loan) => {
                          const isActive = loan.id === effectiveLoanId;
                          return (
                            <button
                              key={loan.id}
                              type="button"
                              onClick={() => {
                                setSelectedLoanId(loan.id);
                                setLoanSearchTerm(loan.clientName);
                                setIsLoanSuggestOpen(false);
                              }}
                              className={[
                                "flex w-full items-center justify-between border-b border-outline-variant/10 px-4 py-3 text-left text-sm last:border-b-0",
                                isActive
                                  ? "bg-primary/10 text-primary"
                                  : "text-on-surface hover:bg-surface-container-highest/40"
                              ].join(" ")}
                            >
                              <span className="font-semibold">{loan.clientName}</span>
                              <span className="text-xs text-on-surface-variant">{formatCOP(loan.totalAmount)}</span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  ) : null}
                </div>

                {availableLoansForPayment.length === 0 ? (
                  <p className="text-sm text-on-surface-variant">No hay préstamos activos para registrar pagos.</p>
                ) : null}

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="px-1 text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                      Cuota activa
                    </label>
                    <select
                      className="w-full appearance-none rounded-xl border-2 border-transparent bg-surface-container-lowest p-4 text-on-surface outline-none focus:border-primary/40"
                      value={effectiveInstallmentNumber}
                      onChange={(e) => setSelectedInstallmentNumber(Number(e.target.value))}
                      disabled={availableSchedules.length === 0}
                    >
                      {availableSchedules.map((item) => (
                        <option key={item.installmentNumber} value={item.installmentNumber}>
                          #{item.installmentNumber} • {formatBogotaDateFromString(item.dueDate)} •{" "}
                          {formatCOP(item.pendingAmount)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="px-1 text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                      Método de pago
                    </label>
                    <select
                      className="w-full appearance-none rounded-xl border-2 border-transparent bg-surface-container-lowest p-4 text-on-surface outline-none focus:border-primary/40"
                      {...form.register("method")}
                    >
                      <option value="CASH">Efectivo</option>
                      <option value="TRANSFER">Transferencia</option>
                    </select>
                  </div>
                </div>

                {scheduleQuery.isLoading ? (
                  <p className="text-sm text-on-surface-variant">Cargando cuotas...</p>
                ) : null}
                {scheduleQuery.isError ? (
                  <p className="text-sm text-error">{getErrorMessage(scheduleQuery.error)}</p>
                ) : null}
                {availableSchedules.length === 0 && scheduleQuery.data ? (
                  <p className="text-sm text-on-surface-variant">No hay cuotas pendientes para este préstamo.</p>
                ) : null}

                {scheduleForSelection ? (
                  <div
                    className={[
                      "rounded-xl border-l-4 p-5",
                      scheduleForSelection.status === "OVERDUE"
                        ? "border-error bg-surface-container-highest"
                        : scheduleForSelection.status === "PARTIAL"
                          ? "border-tertiary bg-surface-container-highest"
                          : "border-tertiary bg-surface-container-highest"
                    ].join(" ")}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-tertiary" aria-hidden>
                          i
                        </span>
                        <span className="text-xs font-bold uppercase tracking-wider text-tertiary">
                          Estado: {scheduleForSelection.status}
                        </span>
                      </div>
                      <span className="text-xs font-medium text-on-surface-variant">
                        Vencimiento: {formatBogotaDateFromString(scheduleForSelection.dueDate)}
                      </span>
                    </div>
                    <div className="flex flex-col gap-2 text-sm md:flex-row md:items-center md:gap-6">
                      <p className="text-on-surface-variant">
                        Mora actual:{" "}
                        <span className={scheduleForSelection.latePenalty > 0 ? "font-bold text-error" : "font-bold text-on-surface"}>
                          {formatCOP(scheduleForSelection.latePenalty)}
                        </span>
                      </p>
                      <div className="hidden h-4 w-px bg-outline-variant/30 md:block" />
                      <p className="text-on-surface-variant">
                        Total cuota: <span className="font-bold text-on-surface">{formatCOP(scheduleForSelection.totalDue)}</span>
                      </p>
                    </div>
                  </div>
                ) : null}

                <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
                  <div className="space-y-2">
                    <label className="px-1 text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                      Monto recibido (COP)
                    </label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 text-2xl font-black text-primary">
                        $
                      </span>
                      <input
                        type="number"
                        step={1}
                        className="w-full rounded-xl border-2 border-transparent bg-surface-container-lowest py-6 pl-12 pr-6 text-4xl font-extrabold text-primary outline-none placeholder:text-surface-container-highest focus:border-primary"
                        placeholder="0"
                        {...form.register("amount", { valueAsNumber: true })}
                      />
                    </div>
                    {form.formState.errors.amount?.message ? (
                      <p className="text-xs text-error">{form.formState.errors.amount.message}</p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <label className="px-1 text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                      Notas (opcional)
                    </label>
                    <textarea
                      rows={3}
                      className="w-full resize-none rounded-xl border-2 border-transparent bg-surface-container-lowest p-4 text-on-surface outline-none placeholder:text-outline focus:border-primary/40"
                      placeholder="Añade detalles sobre el recaudo..."
                      {...form.register("notes")}
                    />
                    {form.formState.errors.notes?.message ? (
                      <p className="text-xs text-error">{form.formState.errors.notes.message}</p>
                    ) : null}
                  </div>

                  <div className="space-y-4 pt-2">
                    <button
                      type="submit"
                      disabled={
                        isPending ||
                        !effectiveLoanId ||
                        !scheduleForSelection ||
                        availableSchedules.length === 0 ||
                        !form.formState.isValid
                      }
                      className="w-full rounded-xl bg-gradient-to-r from-primary to-primary-container py-5 text-lg font-black tracking-tight text-on-primary shadow-[0_20px_40px_rgba(105,246,184,0.15)] transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
                    >
                      {isPending ? "Registrando..." : "Registrar pago"}
                    </button>
                    {availableSchedules.length > 0 &&
                    effectiveLoanId &&
                    scheduleForSelection &&
                    !form.formState.isValid ? (
                      <p className="px-8 text-center text-xs font-medium italic leading-relaxed text-on-surface-variant">
                        Indica un monto recibido válido (entero mayor que 0) para activar esta acción.
                      </p>
                    ) : null}
                  </div>
                </form>
              </div>
            </div>

            <aside className="space-y-6 lg:col-span-4">
              <div className="rounded-xl bg-surface-container-highest p-6 shadow-xl">
                <h4 className="mb-6 text-sm font-bold uppercase tracking-widest text-primary">Detalles del cliente</h4>
                <div className="mb-6 flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-primary/30 bg-surface-container-high text-primary">
                    <span className="text-lg font-black" aria-hidden>
                      {selectedClientName.slice(0, 1).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-on-surface">{selectedClientName}</p>
                    <p className="text-xs text-on-surface-variant">
                      Progreso: <span className="font-semibold text-primary">{scheduleStats.pct}%</span>
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-on-surface-variant">Pagos realizados</span>
                    <span className="font-bold text-on-surface">
                      {scheduleStats.paid} / {scheduleStats.total}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-surface">
                    <div
                      className="h-full bg-primary shadow-[0_0_8px_rgba(105,246,184,0.5)]"
                      style={{ width: `${Math.min(100, Math.max(0, scheduleStats.pct))}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between pt-2 text-sm">
                    <span className="text-on-surface-variant">Total amortizado</span>
                    <span className="font-bold tracking-tight text-primary">{formatCOP(scheduleStats.totalAmortized)}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-outline-variant/10 bg-surface-container-low p-6">
                <h4 className="mb-4 text-sm font-bold text-on-surface">Últimos recaudos</h4>
                {clientPaymentsQuery.isFetching ? (
                  <p className="text-sm text-on-surface-variant">Cargando...</p>
                ) : null}
                {loanLastPayments.length === 0 ? (
                  <p className="text-sm text-on-surface-variant">Aún no hay recaudos para este préstamo.</p>
                ) : (
                  <div className="space-y-4">
                    {loanLastPayments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between rounded-lg bg-surface p-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded bg-surface-container-highest text-primary">
                            <span className="text-sm" aria-hidden>
                              ✓
                            </span>
                          </div>
                          <div>
                            <p className="text-xs font-bold text-on-surface">Pago</p>
                            <p className="text-[10px] text-on-surface-variant">{formatBogotaDateFromString(p.createdAt)}</p>
                          </div>
                        </div>
                        <span className="text-xs font-extrabold text-on-surface">{formatCOP(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </aside>
          </div>
        ) : null}

        {showRegister ? (
          <div className="rounded-xl border border-outline-variant/10 bg-surface-container-low p-6">
            <h2 className="text-lg font-semibold text-on-surface">Historial de pagos</h2>
            {canReverse ? (
              <p className="mt-2 text-xs text-on-surface-variant">
                Los pagos en estado <span className="font-semibold text-on-surface">Activo</span> muestran{" "}
                <span className="font-semibold text-on-surface">Reversar</span>. En pantallas estrechas, desplázate
                horizontalmente sobre la tabla.
              </p>
            ) : null}

            {paymentsQuery.isLoading ? <p className="mt-4 text-sm text-on-surface-variant">Cargando pagos...</p> : null}
            {paymentsQuery.isError ? (
              <p className="mt-4 text-sm text-error">{getErrorMessage(paymentsQuery.error)}</p>
            ) : null}

            {paymentsQuery.data ? (
              <div className="mt-4 w-full min-w-0">
                <div className="rutapay-table-wrap w-full min-w-0 max-w-full">
                  {paymentsQuery.data.total === 0 ? (
                    <p className="text-sm text-on-surface-variant">Aún no hay pagos registrados.</p>
                  ) : (
                    <table className="rutapay-table rutapay-table--responsive">
                      <thead>
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                            Fecha
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                            Cliente
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                            Valor
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                            Método
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                            Estado
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                            Nota
                          </th>
                          <th className="sticky right-0 z-[1] min-w-[7rem] border-l border-outline-variant/10 bg-surface-container-low px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-on-surface-variant shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.45)]">
                            Acciones
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {paymentsQuery.data.data.map((p) => (
                          <tr key={p.id} className="border-t border-outline-variant/10">
                            <td data-label="Fecha" className="px-3 py-3 text-sm text-on-surface-variant">
                              {formatBogotaDateFromString(p.createdAt)}
                            </td>
                            <td data-label="Cliente" className="px-3 py-3 text-sm text-on-surface-variant">{p.clientName}</td>
                            <td data-label="Valor" className="px-3 py-3 text-sm font-semibold text-primary">{formatCOP(p.amount)}</td>
                            <td data-label="Método" className="px-3 py-3 text-sm text-on-surface-variant">
                              {p.method === "CASH" ? "Efectivo" : "Transferencia"}
                            </td>
                            <td data-label="Estado" className="px-3 py-3 text-sm text-on-surface-variant">
                              {p.status === "REVERSED" ? "Anulado" : "Activo"}
                            </td>
                            <td data-label="Nota" className="px-3 py-3 text-sm text-on-surface-variant">{p.notes ?? "-"}</td>
                            <td
                              data-no-label="true"
                              data-align="end"
                              className="sticky right-0 z-[1] min-w-[7rem] border-l border-outline-variant/10 bg-surface-container-low px-3 py-3 text-right shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.45)]"
                            >
                              {canReverse && paymentRowCanReverse(p) ? (
                                <button
                                  type="button"
                                  className="rounded-xl border border-error px-3 py-1 text-sm font-semibold text-error hover:bg-error/10"
                                  onClick={async () => {
                                    const confirmed = window.confirm("¿Deseas anular/reversar este pago?");
                                    if (!confirmed) return;
                                    await reversePaymentMutation.mutateAsync(p.id);
                                  }}
                                >
                                  Reversar
                                </button>
                              ) : (
                                <span className="text-xs text-on-surface-variant">-</span>
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
        ) : null}
      </div>
    </section>
  );
};

export default PaymentsPage;
