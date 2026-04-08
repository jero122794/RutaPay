// frontend/app/(dashboard)/loans/[id]/page.tsx
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import api from "../../../../lib/api";
import { getEffectiveRoles, pickPrimaryRole } from "../../../../lib/effective-roles";
import { formatCOP } from "../../../../lib/formatters";
import {
  formatBogotaDateFromString,
  getBogotaTodayKey,
  parseApiDateString,
  toBogotaDayKey,
  toBogotaDayKeyFromDate
} from "../../../../lib/bogota";
import { useAuthStore, type UserRole } from "../../../../store/authStore";
import TablePagination from "../../../../components/ui/TablePagination";
import { DEFAULT_PAGE_SIZE, type PageSize } from "../../../../lib/page-size";

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

interface ClientDetail {
  id: string;
  name: string;
  address: string | null;
  routeName: string;
}

interface PaymentHistoryItem {
  id: string;
  amount: number;
  method: "CASH" | "TRANSFER";
  status: "ACTIVE" | "REVERSED";
  notes: string | null;
  createdAt: string;
}

interface PaymentsByLoanResponse {
  data: PaymentHistoryItem[];
  total: number;
  page: number;
  limit: number;
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

const formatBogotaDateTime = (iso: string): string => {
  const d = parseApiDateString(iso);
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(d);
};

const paymentMethodLabel = (m: PaymentHistoryItem["method"]): string => {
  return m === "CASH" ? "Efectivo" : "Transferencia";
};

const loanStatusBadgeClass = (status: LoanDetail["status"]): string => {
  switch (status) {
    case "ACTIVE":
      return "border-primary/20 bg-primary/10 text-primary";
    case "COMPLETED":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-400";
    case "DEFAULTED":
      return "border-error/30 bg-error/10 text-error";
    case "RESTRUCTURED":
      return "border-tertiary/30 bg-tertiary/10 text-tertiary";
    default:
      return "border-outline-variant/20 bg-surface-container-high text-on-surface-variant";
  }
};

const loanStatusLabel = (status: LoanDetail["status"]): string => {
  switch (status) {
    case "ACTIVE":
      return "Préstamo activo";
    case "COMPLETED":
      return "Completado";
    case "DEFAULTED":
      return "En mora";
    case "RESTRUCTURED":
      return "Reestructurado";
    default:
      return status;
  }
};

const ScheduleStatusCell = ({ item }: { item: ScheduleItem }): JSX.Element => {
  switch (item.status) {
    case "PAID":
      return (
        <div className="flex items-center gap-2 text-xs font-bold text-primary">
          <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden>
            check_circle
          </span>
          Pagado
        </div>
      );
    case "OVERDUE":
      return (
        <div className="flex items-center gap-2 text-xs font-bold text-error">
          <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden>
            error
          </span>
          Mora
        </div>
      );
    case "PARTIAL":
      return (
        <div className="flex items-center gap-2 text-xs font-bold text-warning">
          <span className="material-symbols-outlined text-base" aria-hidden>
            pie_chart
          </span>
          Parcial
        </div>
      );
    default:
      return (
        <div className="flex items-center gap-2 text-xs font-bold text-tertiary">
          <span className="material-symbols-outlined text-base" aria-hidden>
            schedule
          </span>
          Pendiente
        </div>
      );
  }
};

const LoanDetailPage = (): JSX.Element => {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const loanId = params.id;
  const user = useAuthStore((state) => state.user);
  const hasAuthHydrated = useAuthStore((state) => state.hasAuthHydrated);
  const role: UserRole = pickPrimaryRole(getEffectiveRoles(user));
  const clientDisplayNameForClientRole = role === "CLIENT" ? user?.name ?? "-" : "-";
  const queryClient = useQueryClient();
  const todayKey = getBogotaTodayKey();

  const canEditLoanTerms = role === "ADMIN" || role === "SUPER_ADMIN";
  const canRegisterPayment = role === "ADMIN" || role === "SUPER_ADMIN" || role === "ROUTE_MANAGER";
  const canSeePaymentHistory = user?.modules?.includes("PAYMENTS") ?? false;

  const loanQuery = useQuery({
    queryKey: ["loan-detail", loanId],
    queryFn: async (): Promise<LoanResponse> => {
      const response = await api.get<LoanResponse>(`/loans/${loanId}`);
      return response.data;
    },
    enabled: hasAuthHydrated && Boolean(user) && Boolean(loanId)
  });

  const clientQuery = useQuery({
    queryKey: ["client-detail-loan", loanQuery.data?.data.clientId ?? ""],
    queryFn: async (): Promise<{ data: ClientDetail }> => {
      const clientId = loanQuery.data?.data.clientId ?? "";
      const response = await api.get<{ data: ClientDetail }>(`/clients/${clientId}`);
      return response.data;
    },
    enabled:
      hasAuthHydrated &&
      Boolean(user) &&
      role !== "CLIENT" &&
      Boolean(loanQuery.data?.data.clientId)
  });

  const scheduleQuery = useQuery({
    queryKey: ["loan-schedule", loanId],
    queryFn: async (): Promise<ScheduleResponse> => {
      const response = await api.get<ScheduleResponse>(`/loans/${loanId}/schedule`);
      return response.data;
    },
    enabled: hasAuthHydrated && Boolean(user) && Boolean(loanId)
  });

  const paymentsHistoryQuery = useQuery({
    queryKey: ["loan-payments-history", loanId],
    queryFn: async (): Promise<PaymentsByLoanResponse> => {
      const response = await api.get<PaymentsByLoanResponse>(`/payments/loan/${loanId}`, {
        params: { page: 1, limit: 10 }
      });
      return response.data;
    },
    enabled: hasAuthHydrated && Boolean(user) && Boolean(loanId) && canSeePaymentHistory
  });

  const totals = useMemo(() => {
    const items = scheduleQuery.data?.data ?? [];
    const paidTotal = items.reduce((acc, item) => acc + item.paidAmount, 0);
    const total = items.reduce((acc, item) => acc + item.totalDue, 0);
    const pendingTotal = Math.max(total - paidTotal, 0);
    const progressPct = total > 0 ? Math.round((paidTotal / total) * 100) : 0;
    const overdueCount = items.filter((s) => s.status === "OVERDUE").length;
    return { paidTotal, total, pendingTotal, progressPct, overdueCount };
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
    return items.every((s) => s.paidAmount === 0 && s.status !== "PAID" && s.status !== "PARTIAL");
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

  const clientName =
    role === "CLIENT" ? clientDisplayNameForClientRole : clientQuery.data?.data?.name ?? (clientQuery.isLoading ? "Cargando…" : "—");
  const clientAddress = role !== "CLIENT" ? clientQuery.data?.data?.address : null;

  const shortLoanRef = loanId ? loanId.slice(0, 8).toUpperCase() : "";

  const scheduleRowClass = (item: ScheduleItem): string => {
    const dueKey = typeof item.dueDate === "string" ? toBogotaDayKey(item.dueDate) : toBogotaDayKeyFromDate(item.dueDate);
    const isFuturePending = item.status === "PENDING" && dueKey > todayKey;
    const base = "group transition-colors";
    if (isFuturePending) return `${base} opacity-40 hover:opacity-70`;
    if (item.status === "OVERDUE") return `${base} bg-error/5 hover:bg-error/10`;
    if (item.status === "PAID") return `${base} hover:bg-primary/5`;
    if (item.status === "PARTIAL") return `${base} hover:bg-warning/5`;
    return `${base} hover:bg-tertiary/5`;
  };

  const interestPortion = (item: ScheduleItem): number => {
    return Math.max(0, item.totalDue - item.amount);
  };

  return (
    <div className="space-y-8 print:space-y-4">
      {loanQuery.isError ? (
        <div className="rounded-[2rem] border border-outline-variant/20 bg-surface-container-low p-6">
          <p className="text-sm text-error">{getErrorMessage(loanQuery.error)}</p>
        </div>
      ) : null}

      {loanQuery.isLoading || scheduleQuery.isLoading ? (
        <div className="rounded-[2rem] border border-outline-variant/20 bg-surface-container-low p-8">
          <p className="text-sm text-on-surface-variant">Cargando detalle del préstamo…</p>
        </div>
      ) : null}

      {loanQuery.data?.data && scheduleQuery.data?.data ? (
        <>
          <div className="mb-8 flex flex-col gap-6 print:mb-4 md:flex-row md:items-end md:justify-between">
            <div>
              <nav className="mb-2 flex items-center gap-2 text-xs text-on-surface-variant">
                <Link href="/loans" className="hover:text-primary">
                  Préstamos
                </Link>
                <span className="material-symbols-outlined text-sm" aria-hidden>
                  chevron_right
                </span>
                <span className="text-primary/90">#{shortLoanRef}</span>
              </nav>
              <h1 className="font-headline text-3xl font-extrabold tracking-tight text-on-surface md:text-4xl">
                Detalle de préstamo
              </h1>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-2 rounded-xl border border-outline-variant/30 px-5 py-2.5 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-high"
              >
                <span className="material-symbols-outlined text-lg" aria-hidden>
                  print
                </span>
                Imprimir estado
              </button>
              {canRegisterPayment ? (
                <Link
                  href="/payments"
                  className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-extrabold text-on-primary shadow-none transition-all hover:shadow-[0_0_20px_rgba(105,246,184,0.3)]"
                >
                  Registrar pago
                </Link>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-12 space-y-6 lg:col-span-4">
              <section className="relative overflow-hidden rounded-[2rem] bg-surface-container-low p-8">
                <div className="absolute right-0 top-0 h-32 w-32 -translate-y-1/2 translate-x-1/2 rounded-full bg-primary/5 blur-2xl transition-colors group-hover:bg-primary/10" />
                <div className="relative mb-8 flex items-start justify-between gap-3">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-primary/10 bg-surface-container-high text-2xl font-black text-primary shadow-xl">
                    {clientName
                      .split(" ")
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((p) => p[0]?.toUpperCase())
                      .join("") || "?"}
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${loanStatusBadgeClass(loanQuery.data.data.status)}`}
                  >
                    {loanStatusLabel(loanQuery.data.data.status)}
                  </span>
                </div>
                <div className="relative mb-6 space-y-1">
                  <h2 className="font-headline text-2xl font-bold text-on-surface">{clientName}</h2>
                  {clientAddress ? (
                    <p className="flex items-start gap-2 text-sm text-on-surface-variant">
                      <span className="material-symbols-outlined mt-0.5 text-base" aria-hidden>
                        location_on
                      </span>
                      <span>{clientAddress}</span>
                    </p>
                  ) : (
                    <p className="flex items-center gap-2 text-sm text-on-surface-variant">
                      <span className="material-symbols-outlined text-base" aria-hidden>
                        route
                      </span>
                      {role !== "CLIENT" && clientQuery.data?.data?.routeName ? clientQuery.data.data.routeName : "—"}
                    </p>
                  )}
                </div>
                <div className="relative grid grid-cols-2 gap-4 border-t border-outline-variant/10 pt-6">
                  <div>
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Riesgo</p>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-12 overflow-hidden rounded-full bg-surface-container-highest">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${totals.overdueCount > 0 ? 40 : 85}%` }}
                        />
                      </div>
                      <span className="text-xs font-bold text-primary">{totals.overdueCount > 0 ? "Alto" : "Bajo"}</span>
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Cuotas</p>
                    <p className="text-sm font-bold text-on-surface">{loanQuery.data.data.installmentCount} total</p>
                  </div>
                </div>
              </section>

              <section className="rounded-[2rem] border border-outline-variant/5 bg-surface-container-low p-8">
                <div className="space-y-8">
                  <div>
                    <p className="mb-1 text-xs font-medium text-on-surface-variant">Total financiado</p>
                    <p className="font-headline text-4xl font-extrabold tracking-tight text-on-surface">
                      {formatCOP(loanQuery.data.data.principal)}
                      <span className="ml-1 font-body text-lg font-normal text-on-surface-variant">COP</span>
                    </p>
                  </div>
                  <div className="relative border-t border-outline-variant/10 pt-6">
                    <div className="mb-3 flex items-end justify-between">
                      <div>
                        <p className="mb-1 text-xs font-medium text-on-surface-variant">Saldo pendiente</p>
                        <p className="font-headline text-3xl font-bold text-primary">{formatCOP(totals.pendingTotal)}</p>
                      </div>
                      <div className="text-right">
                        <p className="mb-1 text-xs font-medium text-on-surface-variant">Progreso</p>
                        <p className="font-headline text-lg font-bold text-on-surface">{totals.progressPct}%</p>
                      </div>
                    </div>
                    <div className="h-3 w-full overflow-hidden rounded-full bg-surface-container-highest p-0.5 shadow-inner">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-primary-container transition-all"
                        style={{ width: `${totals.progressPct}%` }}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-6 pt-4">
                    <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-high p-4">
                      <p className="mb-2 text-[10px] font-bold uppercase text-on-surface-variant">Tasa interés</p>
                      <p className="text-xl font-bold text-tertiary">
                        {Math.round(Number(loanQuery.data.data.interestRate) * 100)}%
                        <span className="ml-1 text-xs font-normal text-on-surface-variant">{frequencyLabel(loanQuery.data.data.frequency).toLowerCase()}</span>
                      </p>
                    </div>
                    <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-high p-4">
                      <p className="mb-2 text-[10px] font-bold uppercase text-on-surface-variant">Cuota base</p>
                      <p className="text-xl font-bold text-on-surface">{formatCOP(loanQuery.data.data.installmentAmount)}</p>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <div className="col-span-12 space-y-6 lg:col-span-8">
              <section className="flex flex-col overflow-hidden rounded-[2rem] border border-outline-variant/5 bg-surface-container-low">
                <div className="flex flex-col gap-4 border-b border-outline-variant/10 bg-surface-container-low/50 px-6 py-6 sm:flex-row sm:items-center sm:justify-between lg:px-8">
                  <div>
                    <h3 className="font-headline text-xl font-bold text-on-surface">Plan de cuotas</h3>
                    <p className="text-xs text-on-surface-variant">
                      {loanQuery.data.data.installmentCount} cuotas • Inicio: {formatBogotaDateFromString(loanQuery.data.data.startDate)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <div className="flex items-center gap-1.5 rounded-full border border-outline-variant/10 bg-surface-container-highest/50 px-3 py-1.5">
                      <span className="h-2 w-2 rounded-full bg-primary" />
                      <span className="text-[10px] font-bold text-on-surface-variant">Pagado</span>
                    </div>
                    <div className="flex items-center gap-1.5 rounded-full border border-outline-variant/10 bg-surface-container-highest/50 px-3 py-1.5">
                      <span className="h-2 w-2 rounded-full bg-tertiary" />
                      <span className="text-[10px] font-bold text-on-surface-variant">Pendiente</span>
                    </div>
                    <div className="flex items-center gap-1.5 rounded-full border border-outline-variant/10 bg-surface-container-highest/50 px-3 py-1.5">
                      <span className="h-2 w-2 rounded-full bg-error" />
                      <span className="text-[10px] font-bold text-on-surface-variant">Mora</span>
                    </div>
                  </div>
                </div>
                <div className="rutapay-table-wrap custom-scrollbar flex-1">
                  <table className="rutapay-table rutapay-table--responsive">
                    <thead>
                      <tr>
                        <th>Cuota</th>
                        <th>Fecha límite</th>
                        <th>Monto</th>
                        <th className="hidden sm:table-cell">Interés / extra</th>
                        <th>Total cuota</th>
                        <th>Estado</th>
                        <th className="text-right" />
                      </tr>
                    </thead>
                    <tbody>
                      {pagedScheduleItems.map((item) => (
                        <tr key={item.installmentNumber} className={scheduleRowClass(item)}>
                          <td data-label="Cuota" className="px-6 py-5 lg:px-8">
                            <span className="text-sm font-bold text-on-surface">#{String(item.installmentNumber).padStart(2, "0")}</span>
                          </td>
                          <td
                            data-label="Fecha límite"
                            className={`px-4 py-5 text-sm ${item.status === "OVERDUE" ? "font-medium text-error" : "text-on-surface-variant"}`}
                          >
                            {formatBogotaDateFromString(item.dueDate)}
                          </td>
                          <td data-label="Monto" className="px-4 py-5 text-sm font-bold text-on-surface">{formatCOP(item.amount)}</td>
                          <td data-label="Interés / extra" className="hidden px-4 py-5 text-sm text-on-surface-variant sm:table-cell">
                            {interestPortion(item) > 0 ? formatCOP(interestPortion(item)) : "—"}
                          </td>
                          <td data-label="Total cuota" className="px-4 py-5 text-sm font-bold text-on-surface">{formatCOP(item.totalDue)}</td>
                          <td data-label="Estado" className="px-4 py-5">
                            <ScheduleStatusCell item={item} />
                          </td>
                          <td data-no-label="true" data-align="end" className="px-6 py-5 text-right lg:px-8">
                            {item.status === "OVERDUE" && canRegisterPayment ? (
                              <Link
                                href="/payments"
                                className="rounded-lg bg-error px-3 py-1.5 text-[10px] font-extrabold text-white opacity-0 transition-opacity group-hover:opacity-100"
                              >
                                Cobrar
                              </Link>
                            ) : (
                              <button
                                type="button"
                                className="rounded-full p-2 opacity-0 transition-opacity hover:bg-surface-container-highest group-hover:opacity-100"
                                aria-label="Detalle cuota"
                              >
                                <span className="material-symbols-outlined text-on-surface-variant" aria-hidden>
                                  visibility
                                </span>
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {scheduleItems.length > 0 ? (
                  <div className="border-t border-outline-variant/10 px-4 py-2">
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
                  </div>
                ) : null}
              </section>

              {canSeePaymentHistory ? (
                <section className="rounded-[2rem] border border-outline-variant/5 bg-surface-container-low p-8">
                  <div className="mb-6 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-primary" aria-hidden>
                        history
                      </span>
                      <h3 className="font-headline text-xl font-bold text-on-surface">Historial de pagos</h3>
                    </div>
                    <Link href="/payments" className="text-sm font-bold text-primary hover:underline">
                      Ver todo
                    </Link>
                  </div>
                  {paymentsHistoryQuery.isLoading ? (
                    <p className="text-sm text-on-surface-variant">Cargando pagos…</p>
                  ) : paymentsHistoryQuery.data?.data && paymentsHistoryQuery.data.data.length > 0 ? (
                    <div className="space-y-3">
                      {paymentsHistoryQuery.data.data
                        .filter((p) => p.status === "ACTIVE")
                        .map((p) => (
                          <div
                            key={p.id}
                            className="flex flex-col gap-3 rounded-2xl border-l-4 border-primary bg-surface-container-high p-4 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="flex items-center gap-4">
                              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                                <span className="material-symbols-outlined text-xl text-primary" aria-hidden>
                                  payments
                                </span>
                              </div>
                              <div>
                                <p className="text-sm font-bold text-on-surface">Pago registrado</p>
                                <p className="text-[10px] font-medium uppercase tracking-wide text-on-surface-variant">
                                  {formatBogotaDateTime(p.createdAt)}
                                </p>
                              </div>
                            </div>
                            <div className="text-left sm:text-right">
                              <p className="font-bold text-primary">+{formatCOP(p.amount)}</p>
                              <p className="text-[10px] text-on-surface-variant">
                                {paymentMethodLabel(p.method)}
                                {p.notes ? ` • ${p.notes}` : ""}
                              </p>
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="text-sm text-on-surface-variant">No hay pagos registrados en este préstamo.</p>
                  )}
                </section>
              ) : null}
            </div>
          </div>

          {canEditLoanTerms ? (
            <div className="rounded-[2rem] border border-outline-variant/20 bg-surface-container-low p-8">
              <h2 className="font-headline text-lg font-bold text-on-surface">Administración del préstamo</h2>
              <p className="mt-1 text-sm text-on-surface-variant">
                Solo administradores: ajusta interés mensual (%), frecuencia y número de cuotas. Se regenera el plan con el mismo capital. No
                disponible si ya hay cobros registrados.
              </p>
              {!canSubmitTermsCorrection ? (
                <p className="mt-3 text-sm text-warning">
                  {loanQuery.data.data.status !== "ACTIVE"
                    ? "Solo préstamos activos se pueden corregir así."
                    : "No se puede corregir ni eliminar: ya hay cuotas cobradas o pagos registrados."}
                </p>
              ) : null}
              <form
                className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 md:items-end xl:grid-cols-4"
                onSubmit={termsForm.handleSubmit(async (values) => {
                  await updateTermsMutation.mutateAsync(values);
                })}
              >
                <div>
                  <label className="mb-1 block text-sm text-on-surface-variant">Interés mensual (%)</label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    step={1}
                    className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-high px-3 py-2 text-on-surface"
                    {...termsForm.register("interestRatePercent", { valueAsNumber: true })}
                  />
                  {termsForm.formState.errors.interestRatePercent ? (
                    <p className="mt-1 text-xs text-error">{termsForm.formState.errors.interestRatePercent.message}</p>
                  ) : null}
                </div>
                <div>
                  <label className="mb-1 block text-sm text-on-surface-variant">Frecuencia</label>
                  <select
                    className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-high px-3 py-2 text-on-surface"
                    {...termsForm.register("frequency")}
                  >
                    <option value="DAILY">Diaria</option>
                    <option value="WEEKLY">Semanal</option>
                    <option value="BIWEEKLY">Quincenal</option>
                    <option value="MONTHLY">Mensual</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm text-on-surface-variant">Número de cuotas</label>
                  <input
                    type="number"
                    min={1}
                    max={240}
                    step={1}
                    className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-high px-3 py-2 text-on-surface"
                    {...termsForm.register("installmentCount", { valueAsNumber: true })}
                  />
                  {termsForm.formState.errors.installmentCount ? (
                    <p className="mt-1 text-xs text-error">{termsForm.formState.errors.installmentCount.message}</p>
                  ) : null}
                </div>
                <button
                  type="submit"
                  disabled={!canSubmitTermsCorrection || !termsForm.formState.isValid || updateTermsMutation.isPending}
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-on-primary disabled:opacity-50"
                >
                  {updateTermsMutation.isPending ? "Guardando…" : "Aplicar corrección"}
                </button>
              </form>
              {updateTermsMutation.isError ? (
                <p className="mt-2 text-sm text-error">{getErrorMessage(updateTermsMutation.error)}</p>
              ) : null}

              <div className="mt-8 border-t border-outline-variant/15 pt-6">
                <h3 className="font-headline text-base font-bold text-on-surface">Eliminar préstamo</h3>
                <p className="mt-1 text-sm text-on-surface-variant">Solo si no hay pagos registrados. Esta acción no se puede deshacer.</p>
                <button
                  type="button"
                  disabled={!canSubmitTermsCorrection || deleteLoanMutation.isPending}
                  onClick={() => {
                    if (window.confirm("¿Eliminar este préstamo de forma permanente? No hay pagos registrados en el sistema.")) {
                      void deleteLoanMutation.mutateAsync();
                    }
                  }}
                  className="mt-4 rounded-xl border border-error bg-transparent px-4 py-2 text-sm font-semibold text-error hover:bg-error/10 disabled:opacity-50"
                >
                  {deleteLoanMutation.isPending ? "Eliminando…" : "Eliminar préstamo"}
                </button>
                {deleteLoanMutation.isError ? (
                  <p className="mt-2 text-sm text-error">{getErrorMessage(deleteLoanMutation.error)}</p>
                ) : null}
              </div>
            </div>
          ) : null}

          {canRegisterPayment ? (
            <Link
              href="/payments"
              className="print:hidden fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-on-primary shadow-2xl transition-all active:scale-95 md:bottom-8 md:right-8 md:h-16 md:w-16"
              aria-label="Registrar pago"
            >
              <span className="material-symbols-outlined text-3xl transition-transform duration-300 hover:rotate-90" aria-hidden>
                add
              </span>
            </Link>
          ) : null}
        </>
      ) : null}
    </div>
  );
};

export default LoanDetailPage;
