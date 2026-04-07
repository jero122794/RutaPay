// frontend/app/(dashboard)/clients/[id]/page.tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { parseISO } from "date-fns";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import api from "../../../../lib/api";
import { getEffectiveRoles, pickPrimaryRole } from "../../../../lib/effective-roles";
import { useAuthStore, type UserRole } from "../../../../store/authStore";
import { formatCOP } from "../../../../lib/formatters";
import { formatBogotaDateFromString } from "../../../../lib/bogota";

const LOANS_WIDE_LIMIT = 2000;

interface ClientDetail {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  description: string | null;
  documentId: string | null;
  isActive: boolean;
  canLoginApp: boolean;
  routeId: string;
  routeName: string;
  managerId: string;
  managerName: string;
}

interface ClientResponse {
  data: ClientDetail;
}

interface LoanItem {
  id: string;
  clientId: string;
  principal: number;
  installmentAmount: number;
  totalAmount: number;
  status: "ACTIVE" | "COMPLETED" | "DEFAULTED" | "RESTRUCTURED";
  frequency: "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY";
  startDate: string;
  createdAt: string;
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

interface PaymentRow {
  id: string;
  amount: number;
  method: "CASH" | "TRANSFER";
  status: "ACTIVE" | "REVERSED";
  notes: string | null;
  createdAt: string;
}

interface PaymentsByLoanResponse {
  data: PaymentRow[];
  total: number;
  page: number;
  limit: number;
}

interface ListResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

const passwordField = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? undefined : v),
  z
    .string()
    .min(8)
    .max(64)
    .regex(/[A-Z]/, "Debe incluir una mayúscula")
    .regex(/[a-z]/, "Debe incluir una minúscula")
    .regex(/[0-9]/, "Debe incluir un número")
    .regex(/[^A-Za-z0-9]/, "Debe incluir un símbolo")
    .optional()
);

const editClientSchema = z.object({
  name: z.string().min(2, "Nombre requerido"),
  email: z.union([z.string().email("Correo inválido"), z.literal("")]).optional(),
  phone: z.union([z.string().min(7, "Teléfono inválido"), z.literal("")]).optional(),
  documentId: z.string().min(5, "Documento requerido"),
  address: z.string().min(5, "Dirección requerida"),
  description: z.string().min(3, "Descripción requerida"),
  isActive: z.boolean(),
  password: passwordField
});

type EditClientFormValues = z.infer<typeof editClientSchema>;

const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: string } | undefined)?.message;
    return message ?? error.message;
  }
  return "Error desconocido.";
};

const initialsFromName = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  const a = parts[0][0] ?? "";
  const b = parts[parts.length - 1][0] ?? "";
  return `${a}${b}`.toUpperCase();
};

const frequencyLabel = (f: LoanItem["frequency"]): string => {
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

const methodLabel = (m: PaymentRow["method"]): string => {
  return m === "CASH" ? "EFECTIVO" : "TRANSFERENCIA";
};

const pickPrimaryLoan = (loans: LoanItem[]): LoanItem | null => {
  const active = loans.find((l) => l.status === "ACTIVE");
  if (active) {
    return active;
  }
  const def = loans.find((l) => l.status === "DEFAULTED");
  if (def) {
    return def;
  }
  const re = loans.find((l) => l.status === "RESTRUCTURED");
  if (re) {
    return re;
  }
  const hist = [...loans].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return hist[0] ?? null;
};

const formatBogotaDateTime = (iso: string): string => {
  const d = parseISO(iso);
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(d);
};

const computeHealthScore = (schedule: ScheduleItem[], loanStatus: LoanItem["status"]): number => {
  if (schedule.length === 0) {
    return 7;
  }
  const overdue = schedule.filter((s) => s.status === "OVERDUE").length;
  let score = 10 - overdue * 0.65;
  if (loanStatus === "DEFAULTED") {
    score -= 2;
  }
  if (loanStatus === "RESTRUCTURED") {
    score -= 0.5;
  }
  return Math.round(Math.min(10, Math.max(0, score)) * 10) / 10;
};

const healthLabel = (score: number): string => {
  if (score >= 8.5) {
    return "Excelente";
  }
  if (score >= 6.5) {
    return "Bueno";
  }
  if (score >= 4.5) {
    return "Regular";
  }
  return "Riesgo alto";
};

const ClientProfilePage = (): JSX.Element => {
  const params = useParams<{ id: string }>();
  const user = useAuthStore((state) => state.user);
  const role: UserRole = pickPrimaryRole(getEffectiveRoles(user));
  const queryClient = useQueryClient();
  const canEditClient = role === "SUPER_ADMIN" || role === "ADMIN" || role === "ROUTE_MANAGER";

  const clientId = params.id;

  const query = useQuery({
    queryKey: ["client-detail", clientId],
    queryFn: async (): Promise<ClientResponse> => {
      const response = await api.get<ClientResponse>(`/clients/${clientId}`);
      return response.data;
    },
    enabled: Boolean(clientId)
  });

  const loansQuery = useQuery({
    queryKey: ["loans-wide", 1, LOANS_WIDE_LIMIT],
    queryFn: async (): Promise<ListResponse<LoanItem>> => {
      const response = await api.get<ListResponse<LoanItem>>("/loans", {
        params: { page: 1, limit: LOANS_WIDE_LIMIT }
      });
      return response.data;
    },
    enabled: Boolean(clientId)
  });

  const clientLoans = useMemo(() => {
    return (loansQuery.data?.data ?? []).filter((l) => l.clientId === clientId);
  }, [loansQuery.data, clientId]);

  const primaryLoan = useMemo(() => pickPrimaryLoan(clientLoans), [clientLoans]);

  const needsSchedule = Boolean(
    primaryLoan && primaryLoan.status !== "COMPLETED"
  );

  const scheduleQuery = useQuery({
    queryKey: ["loan-schedule", primaryLoan?.id],
    queryFn: async (): Promise<ScheduleResponse> => {
      const response = await api.get<ScheduleResponse>(`/loans/${primaryLoan?.id}/schedule`);
      return response.data;
    },
    enabled: Boolean(primaryLoan?.id) && needsSchedule
  });

  const paymentsQuery = useQuery({
    queryKey: ["payments-by-loan", primaryLoan?.id, 1, 50],
    queryFn: async (): Promise<PaymentsByLoanResponse> => {
      const response = await api.get<PaymentsByLoanResponse>(`/payments/loan/${primaryLoan?.id}`, {
        params: { page: 1, limit: 50 }
      });
      return response.data;
    },
    enabled: Boolean(primaryLoan?.id)
  });

  const schedule = scheduleQuery.data?.data ?? [];

  const loanMetrics = useMemo(() => {
    if (!primaryLoan) {
      return {
        remaining: 0,
        collectedPct: 0,
        nextDueLabel: "—",
        milestoneMid: 0
      };
    }
    if (primaryLoan.status === "COMPLETED") {
      return {
        remaining: 0,
        collectedPct: 100,
        nextDueLabel: "Préstamo liquidado",
        milestoneMid: Math.round(primaryLoan.totalAmount / 2)
      };
    }
    const pendingSum = schedule.reduce((acc, s) => acc + s.pendingAmount, 0);
    const paidSum = schedule.reduce((acc, s) => acc + s.paidAmount, 0);
    const pct =
      primaryLoan.totalAmount > 0
        ? Math.min(100, Math.round((paidSum / primaryLoan.totalAmount) * 100))
        : 0;
    const next = schedule.find((s) => s.pendingAmount > 0);
    const nextDueLabel = next ? formatBogotaDateFromString(next.dueDate) : "—";
    return {
      remaining: pendingSum,
      collectedPct: pct,
      nextDueLabel,
      milestoneMid: Math.round(primaryLoan.totalAmount / 2)
    };
  }, [primaryLoan, schedule]);

  const healthScore = useMemo(() => {
    if (!primaryLoan) {
      return 7;
    }
    if (primaryLoan.status === "COMPLETED") {
      return 9.5;
    }
    if (!needsSchedule || schedule.length === 0) {
      return computeHealthScore([], primaryLoan.status);
    }
    return computeHealthScore(schedule, primaryLoan.status);
  }, [primaryLoan, schedule, needsSchedule]);

  const firstLoanLabel = useMemo(() => {
    if (clientLoans.length === 0) {
      return "Sin historial";
    }
    const oldest = [...clientLoans].sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1))[0];
    const d = parseISO(oldest.createdAt);
    return new Intl.DateTimeFormat("es-CO", { month: "short", year: "numeric" }).format(d);
  }, [clientLoans]);

  const form = useForm<EditClientFormValues>({
    resolver: zodResolver(editClientSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      documentId: "",
      address: "",
      description: "",
      isActive: true,
      password: ""
    },
    mode: "onChange"
  });

  useEffect(() => {
    if (!query.data?.data) {
      return;
    }
    form.reset({
      name: query.data.data.name,
      email: query.data.data.email ?? "",
      phone: query.data.data.phone ?? "",
      documentId: query.data.data.documentId ?? "",
      address: query.data.data.address ?? "",
      description: query.data.data.description ?? "",
      isActive: query.data.data.isActive,
      password: ""
    });
  }, [form, query.data]);

  const updateMutation = useMutation({
    mutationFn: async (values: EditClientFormValues): Promise<void> => {
      await api.patch(`/clients/${clientId}`, {
        name: values.name,
        email: values.email || undefined,
        phone: values.phone || undefined,
        documentId: values.documentId,
        address: values.address,
        description: values.description,
        isActive: values.isActive,
        ...(values.password?.trim() ? { password: values.password } : {})
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["client-detail", clientId] });
      await queryClient.invalidateQueries({ queryKey: ["clients-list"] });
    }
  });

  const c = query.data?.data;
  const phoneDigits = c?.phone?.replace(/\D/g, "") ?? "";
  const paymentsVisible = (paymentsQuery.data?.data ?? []).filter((p) => p.status === "ACTIVE").slice(0, 8);

  return (
    <section className="pb-8">
      <header className="fixed top-0 z-40 flex w-full max-w-full items-center justify-between border-b border-white/5 bg-[#05080f]/90 px-4 py-3 backdrop-blur-md lg:hidden">
        <div className="flex items-center gap-3">
          <Link
            href="/clients"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-primary transition-colors hover:bg-surface-container-high"
            aria-label="Volver"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </Link>
          <h1 className="font-headline text-lg font-bold text-on-surface">Detalle del cliente</h1>
        </div>
      </header>

      <div className="pt-16 lg:pt-0">
        {query.isLoading ? (
          <div className="rounded-2xl border border-white/5 bg-surface-container p-6">
            <p className="text-sm text-on-surface-variant">Cargando perfil…</p>
          </div>
        ) : null}

        {query.isError ? (
          <div className="rounded-2xl border border-white/5 bg-surface-container p-6">
            <p className="text-sm text-danger">{getErrorMessage(query.error)}</p>
            <Link href="/clients" className="mt-4 inline-block text-primary hover:underline">
              Volver a clientes
            </Link>
          </div>
        ) : null}

        {c ? (
          <div className="mx-auto max-w-7xl space-y-8">
            <nav className="mb-2 hidden items-center gap-2 text-xs font-medium text-on-surface-variant lg:flex">
              <Link href="/clients" className="hover:text-primary">
                CLIENTES
              </Link>
              <span className="material-symbols-outlined text-[10px]">chevron_right</span>
              <span className="uppercase">{c.routeName}</span>
              <span className="material-symbols-outlined text-[10px]">chevron_right</span>
              <span className="text-primary">{c.name.toUpperCase()}</span>
            </nav>

            <div className="hidden items-center justify-between lg:flex">
              <Link
                href="/clients"
                className="text-sm font-medium text-primary hover:underline"
              >
                ← Volver a clientes
              </Link>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="rounded-3xl border border-outline-variant/10 bg-surface-container-low p-6 shadow-xl lg:col-span-8 lg:flex lg:items-start lg:gap-8">
                <div className="relative mx-auto shrink-0 lg:mx-0">
                  <div className="flex h-32 w-32 items-center justify-center rounded-2xl border-4 border-surface-container-high bg-surface-container-highest font-headline text-3xl font-black text-primary shadow-2xl">
                    {initialsFromName(c.name)}
                  </div>
                  <div className="absolute -bottom-2 -right-2 rounded-full bg-primary px-3 py-1 text-[10px] font-black uppercase tracking-widest text-on-primary shadow-lg">
                    {c.isActive ? "ACTIVO" : "INACTIVO"}
                  </div>
                </div>
                <div className="mt-6 flex-1 text-center lg:mt-0 lg:text-left">
                  <h2 className="font-headline text-3xl font-extrabold tracking-tight text-on-surface">{c.name}</h2>
                  <div className="mt-4 flex flex-wrap justify-center gap-3 lg:justify-start">
                    <div className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/10 bg-surface-container-highest px-3 py-1.5">
                      <span className="material-symbols-outlined text-sm text-on-surface-variant">id_card</span>
                      <span className="text-sm font-medium text-on-surface">{c.documentId ?? "—"}</span>
                    </div>
                    <div className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/10 bg-surface-container-highest px-3 py-1.5">
                      <span className="material-symbols-outlined text-sm text-secondary">route</span>
                      <span className="text-sm font-medium text-on-surface">{c.routeName}</span>
                    </div>
                    <div className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-outline-variant/10 bg-surface-container-highest px-3 py-1.5">
                      <span className="material-symbols-outlined text-sm text-on-surface-variant">location_on</span>
                      <span className="truncate text-sm font-medium text-on-surface">{c.address ?? "—"}</span>
                    </div>
                  </div>
                  <div className="mt-6 hidden flex-wrap justify-center gap-3 lg:flex lg:justify-start">
                    {phoneDigits ? (
                      <a
                        href={`tel:${phoneDigits}`}
                        className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/20 bg-surface-container-highest px-5 py-2.5 text-sm font-bold text-on-surface transition-all hover:bg-surface-bright active:scale-95"
                      >
                        <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
                          call
                        </span>
                        LLAMAR
                      </a>
                    ) : (
                      <span className="inline-flex cursor-not-allowed items-center gap-2 rounded-xl border border-outline-variant/10 bg-surface-container-highest/50 px-5 py-2.5 text-sm font-bold text-on-surface-variant">
                        <span className="material-symbols-outlined">call</span>
                        Sin teléfono
                      </span>
                    )}
                    {phoneDigits ? (
                      <a
                        href={`sms:${phoneDigits}`}
                        className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/20 bg-surface-container-highest px-5 py-2.5 text-sm font-bold text-on-surface transition-all hover:bg-surface-bright active:scale-95"
                      >
                        <span className="material-symbols-outlined text-primary">chat_bubble</span>
                        MENSAJE
                      </a>
                    ) : null}
                    {c.address ? (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/20 bg-surface-container-highest px-5 py-2.5 text-sm font-bold text-on-surface transition-all hover:bg-surface-bright active:scale-95"
                      >
                        <span className="material-symbols-outlined text-primary">explore</span>
                        MAPA
                      </a>
                    ) : null}
                    <Link
                      href={`/loans/new?clientId=${encodeURIComponent(c.id)}`}
                      className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-primary to-primary-container px-8 py-3 text-sm font-black text-on-primary shadow-lg shadow-primary/10 transition-all active:scale-95"
                    >
                      <span className="material-symbols-outlined">add_circle</span>
                      NUEVO PRÉSTAMO
                    </Link>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-6 lg:col-span-4">
                <div className="relative overflow-hidden rounded-xl border border-outline-variant/10 bg-gradient-to-br from-surface-container-low to-surface-container-high p-6 shadow-xl">
                  <div className="absolute right-4 top-4 opacity-10">
                    <span className="material-symbols-outlined text-6xl">favorite</span>
                  </div>
                  <p className="mb-4 text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                    Salud financiera
                  </p>
                  <div className="flex items-baseline gap-2">
                    <span className="font-headline text-5xl font-extrabold text-primary">{healthScore}</span>
                    <span className="text-sm font-bold uppercase text-primary-container">{healthLabel(healthScore)}</span>
                  </div>
                  <div className="mt-4 h-1.5 w-full rounded-full bg-surface-container-lowest">
                    <div
                      className="h-full rounded-full bg-primary shadow-[0_0_8px_rgba(105,246,184,0.5)]"
                      style={{ width: `${Math.min(100, healthScore * 10)}%` }}
                    />
                  </div>
                </div>
                <div className="rounded-xl border border-outline-variant/10 bg-surface-container-low p-6 shadow-xl">
                  <p className="mb-4 text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                    Préstamos históricos
                  </p>
                  <div className="flex items-baseline gap-2">
                    <span className="font-headline text-5xl font-extrabold text-on-surface">{clientLoans.length}</span>
                    <span className="text-sm font-bold uppercase text-on-surface-variant">Total</span>
                  </div>
                  <p className="mt-2 text-xs text-on-surface-variant">Primer registro: {firstLoanLabel}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 sm:gap-3 lg:hidden">
              {phoneDigits ? (
                <a
                  href={`tel:${phoneDigits}`}
                  className="flex flex-col items-center justify-center rounded-2xl bg-surface-container-high p-3 shadow-md transition-all active:scale-95 sm:p-4"
                >
                  <span className="material-symbols-outlined mb-1 text-primary">call</span>
                  <span className="text-[10px] font-bold text-on-surface-variant">Llamar</span>
                </a>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-2xl bg-surface-container-high/50 p-3 opacity-60 sm:p-4">
                  <span className="material-symbols-outlined mb-1 text-on-surface-variant">call</span>
                  <span className="text-[10px] font-bold text-on-surface-variant">Llamar</span>
                </div>
              )}
              {phoneDigits ? (
                <a
                  href={`sms:${phoneDigits}`}
                  className="flex flex-col items-center justify-center rounded-2xl bg-surface-container-high p-3 shadow-md transition-all active:scale-95 sm:p-4"
                >
                  <span className="material-symbols-outlined mb-1 text-primary">chat</span>
                  <span className="text-[10px] font-bold text-on-surface-variant">Mensaje</span>
                </a>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-2xl bg-surface-container-high/50 p-3 opacity-60 sm:p-4">
                  <span className="material-symbols-outlined mb-1 text-on-surface-variant">chat</span>
                  <span className="text-[10px] font-bold text-on-surface-variant">Mensaje</span>
                </div>
              )}
              {c.address ? (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-col items-center justify-center rounded-2xl bg-surface-container-high p-3 shadow-md transition-all active:scale-95 sm:p-4"
                >
                  <span className="material-symbols-outlined mb-1 text-primary">map</span>
                  <span className="text-[10px] font-bold text-on-surface-variant">Mapa</span>
                </a>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-2xl bg-surface-container-high/50 p-3 opacity-60 sm:p-4">
                  <span className="material-symbols-outlined mb-1 text-on-surface-variant">map</span>
                  <span className="text-[10px] font-bold text-on-surface-variant">Mapa</span>
                </div>
              )}
              <Link
                href={`/loans/new?clientId=${encodeURIComponent(c.id)}`}
                className="flex flex-col items-center justify-center rounded-2xl bg-primary p-3 text-on-primary shadow-lg shadow-primary/20 transition-all active:scale-95 sm:p-4"
              >
                <span className="material-symbols-outlined mb-1">add_card</span>
                <span className="text-center text-[10px] font-bold leading-tight">Nuevo</span>
              </Link>
            </div>

            <div className="relative overflow-hidden rounded-[2rem] border border-primary/5 bg-surface-container p-6 shadow-2xl lg:rounded-2xl lg:p-8">
              <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-primary/5 blur-[120px]" />
              {!primaryLoan ? (
                <p className="relative z-10 text-sm text-on-surface-variant">
                  Este cliente no tiene préstamos registrados.
                </p>
              ) : (
                <div className="relative z-10 space-y-6">
                  <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
                    <div>
                      <div className="mb-2 flex flex-wrap items-center gap-3">
                        <span className="rounded bg-primary-container/20 px-2 py-0.5 text-xs font-black tracking-tighter text-primary">
                          PRÉSTAMO #{primaryLoan.id.slice(-6).toUpperCase()}
                        </span>
                        <span className="text-xs font-medium text-on-surface-variant">
                          Inicio {formatBogotaDateFromString(primaryLoan.startDate)} · {frequencyLabel(primaryLoan.frequency)}
                        </span>
                      </div>
                      <p className="mb-1 text-sm font-bold uppercase tracking-widest text-on-surface-variant">
                        Saldo pendiente (cuotas)
                      </p>
                      <h3 className="font-headline text-4xl font-extrabold tracking-tighter text-primary md:text-6xl">
                        {scheduleQuery.isLoading && needsSchedule ? (
                          "…"
                        ) : (
                          <>
                            {formatCOP(loanMetrics.remaining)}{" "}
                            <span className="text-2xl font-bold opacity-70">COP</span>
                          </>
                        )}
                      </h3>
                    </div>
                    <div className="md:text-right">
                      <div className="mb-2 flex items-center gap-2 text-tertiary md:justify-end">
                        <span className="material-symbols-outlined text-sm">calendar_month</span>
                        <span className="text-sm font-bold">Próximo pago: {loanMetrics.nextDueLabel}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-on-surface-variant md:justify-end">
                        <span className="text-xs font-medium">Total préstamo:</span>
                        <span className="text-lg font-bold text-on-surface">
                          {formatCOP(primaryLoan.totalAmount)} COP
                        </span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="mb-3 flex justify-between text-sm font-bold">
                      <span className="text-on-surface">Progreso de cobro</span>
                      <span className="font-black text-primary">{loanMetrics.collectedPct}% cobrado</span>
                    </div>
                    <div className="h-4 w-full overflow-hidden rounded-full bg-surface-container-lowest p-1 shadow-inner">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary-container to-primary shadow-[0_0_15px_rgba(105,246,184,0.3)] transition-all duration-1000"
                        style={{ width: `${loanMetrics.collectedPct}%` }}
                      />
                    </div>
                    <div className="mt-3 flex justify-between text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                      <span>{formatCOP(0)}</span>
                      <span>{formatCOP(loanMetrics.milestoneMid)} hito</span>
                      <span>{formatCOP(primaryLoan.totalAmount)} meta</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Link
                      href={`/loans/${primaryLoan.id}`}
                      className="rounded-xl bg-surface-container-highest px-4 py-2 text-sm font-bold text-on-surface hover:bg-surface-bright"
                    >
                      Ver préstamo
                    </Link>
                    {primaryLoan.status === "ACTIVE" ? (
                      <Link
                        href={`/loans/${primaryLoan.id}`}
                        className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-on-primary hover:brightness-110"
                      >
                        Registrar pago
                      </Link>
                    ) : null}
                  </div>
                </div>
              )}
            </div>

            <div className="hidden overflow-hidden rounded-2xl border border-outline-variant/10 bg-surface-container-low shadow-2xl lg:block">
              <div className="flex items-center justify-between border-b border-outline-variant/10 p-6">
                <h3 className="flex items-center gap-2 font-headline text-lg font-bold">
                  <span className="material-symbols-outlined text-primary">history</span>
                  Historial de pagos
                </h3>
                {primaryLoan ? (
                  <Link
                    href={`/loans/${primaryLoan.id}`}
                    className="text-xs font-bold uppercase tracking-widest text-primary hover:underline"
                  >
                    Ver préstamo
                  </Link>
                ) : null}
              </div>
              {!primaryLoan ? (
                <p className="p-6 text-sm text-on-surface-variant">Sin pagos: no hay préstamo asociado.</p>
              ) : paymentsQuery.isLoading ? (
                <p className="p-6 text-sm text-on-surface-variant">Cargando pagos…</p>
              ) : paymentsVisible.length === 0 ? (
                <p className="p-6 text-sm text-on-surface-variant">Aún no hay pagos registrados en este préstamo.</p>
              ) : (
                <div className="rutapay-table-wrap custom-scrollbar">
                  <table className="rutapay-table rutapay-table--responsive">
                    <thead>
                      <tr>
                        <th>Concepto</th>
                        <th>Fecha</th>
                        <th>Método</th>
                        <th className="text-right">Monto</th>
                        <th className="text-center">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentsVisible.map((p, idx) => (
                        <tr key={p.id} className="transition-colors hover:bg-surface-container-highest/30">
                          <td data-label="Concepto" className="px-6 py-5">
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                                <span className="material-symbols-outlined text-sm text-primary">receipt</span>
                              </div>
                              <span className="text-sm font-bold text-on-surface">Pago #{paymentsVisible.length - idx}</span>
                            </div>
                          </td>
                          <td data-label="Fecha" className="px-6 py-5">
                            <p className="text-sm font-medium text-on-surface">{formatBogotaDateTime(p.createdAt)}</p>
                          </td>
                          <td data-label="Método" className="px-6 py-5">
                            <span className="rounded border border-outline-variant/20 px-2 py-0.5 text-[10px] font-black text-on-surface-variant">
                              {methodLabel(p.method)}
                            </span>
                          </td>
                          <td data-label="Monto" className="px-6 py-5 text-right">
                            <span className="text-sm font-extrabold text-primary">+ {formatCOP(p.amount)}</span>
                          </td>
                          <td data-label="Estado" className="px-6 py-5">
                            <div className="flex justify-center">
                              <span
                                className="material-symbols-outlined text-primary"
                                style={{ fontVariationSettings: "'FILL' 1" }}
                              >
                                check_circle
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="space-y-4 lg:hidden">
              <div className="flex items-center justify-between px-2">
                <h3 className="font-headline font-bold text-on-surface">Historial de pagos</h3>
                {primaryLoan ? (
                  <Link href={`/loans/${primaryLoan.id}`} className="text-xs font-bold text-primary hover:underline">
                    Ver todo
                  </Link>
                ) : null}
              </div>
              <div className="space-y-3">
                {!primaryLoan ? (
                  <p className="text-sm text-on-surface-variant">Sin préstamo activo.</p>
                ) : paymentsQuery.isLoading ? (
                  <p className="text-sm text-on-surface-variant">Cargando…</p>
                ) : paymentsVisible.length === 0 ? (
                  <p className="text-sm text-on-surface-variant">Sin pagos aún.</p>
                ) : (
                  paymentsVisible.map((p, idx) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-2xl bg-surface-container-high/60 p-4 backdrop-blur-sm transition-colors hover:bg-surface-container-high"
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                          <span
                            className="material-symbols-outlined text-xl text-primary"
                            style={{ fontVariationSettings: "'FILL' 1" }}
                          >
                            check_circle
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-on-surface">Pago #{paymentsVisible.length - idx}</p>
                          <p className="text-[10px] text-on-surface-variant">{formatBogotaDateTime(p.createdAt)}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-extrabold text-on-surface">+ {formatCOP(p.amount)}</p>
                        <p className="text-[9px] font-bold text-on-surface-variant">COP</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {canEditClient ? (
              <details className="group rounded-2xl border border-outline-variant/10 bg-surface-container-low open:shadow-xl">
                <summary className="cursor-pointer list-none p-6 font-headline text-lg font-semibold text-on-surface marker:content-none [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center justify-between gap-2">
                    Editar datos del cliente
                    <span className="material-symbols-outlined text-on-surface-variant transition-transform group-open:rotate-180">
                      expand_more
                    </span>
                  </span>
                </summary>
                <form
                  className="space-y-4 border-t border-outline-variant/10 p-6 pt-4"
                  onSubmit={form.handleSubmit(async (values) => {
                    await updateMutation.mutateAsync(values);
                  })}
                >
                  {!c.canLoginApp ? (
                    <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                      Este cliente aún no puede iniciar sesión. Agrega una contraseña (y opcionalmente correo) y guarda
                      para habilitar el acceso; puede entrar con documento o correo según lo que registres.
                    </p>
                  ) : null}
                  <div>
                    <label htmlFor="name" className="mb-1 block text-sm text-on-surface-variant">
                      Nombre
                    </label>
                    <input
                      id="name"
                      className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-high px-3 py-2 text-on-surface"
                      {...form.register("name")}
                    />
                    <p className="mt-1 text-xs text-danger">{form.formState.errors.name?.message}</p>
                  </div>
                  <div>
                    <label htmlFor="email" className="mb-1 block text-sm text-on-surface-variant">
                      Correo (opcional)
                    </label>
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-high px-3 py-2 text-on-surface"
                      {...form.register("email")}
                    />
                    <p className="mt-1 text-xs text-danger">{form.formState.errors.email?.message}</p>
                  </div>
                  <div>
                    <label htmlFor="password" className="mb-1 block text-sm text-on-surface-variant">
                      Nueva contraseña (opcional)
                    </label>
                    <p className="mb-1 text-xs text-on-surface-variant">
                      Solo completa este campo si quieres definir o cambiar la contraseña de acceso. Déjalo vacío para
                      no modificarla.
                    </p>
                    <input
                      id="password"
                      type="password"
                      autoComplete="new-password"
                      className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-high px-3 py-2 text-on-surface"
                      {...form.register("password")}
                    />
                    <p className="mt-1 text-xs text-danger">{form.formState.errors.password?.message}</p>
                  </div>
                  <div>
                    <label htmlFor="phone" className="mb-1 block text-sm text-on-surface-variant">
                      Teléfono
                    </label>
                    <input
                      id="phone"
                      className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-high px-3 py-2 text-on-surface"
                      {...form.register("phone")}
                    />
                    <p className="mt-1 text-xs text-danger">{form.formState.errors.phone?.message}</p>
                  </div>
                  <div>
                    <label htmlFor="documentId" className="mb-1 block text-sm text-on-surface-variant">
                      Documento de identidad
                    </label>
                    <input
                      id="documentId"
                      className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-high px-3 py-2 text-on-surface"
                      {...form.register("documentId")}
                    />
                    <p className="mt-1 text-xs text-danger">{form.formState.errors.documentId?.message}</p>
                  </div>
                  <div>
                    <label htmlFor="address" className="mb-1 block text-sm text-on-surface-variant">
                      Dirección
                    </label>
                    <input
                      id="address"
                      className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-high px-3 py-2 text-on-surface"
                      {...form.register("address")}
                    />
                    <p className="mt-1 text-xs text-danger">{form.formState.errors.address?.message}</p>
                  </div>
                  <div>
                    <label htmlFor="description" className="mb-1 block text-sm text-on-surface-variant">
                      Descripción
                    </label>
                    <textarea
                      id="description"
                      rows={3}
                      className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-high px-3 py-2 text-on-surface"
                      {...form.register("description")}
                    />
                    <p className="mt-1 text-xs text-danger">{form.formState.errors.description?.message}</p>
                  </div>
                  <label className="flex items-center justify-between text-sm text-on-surface-variant">
                    Activo
                    <input type="checkbox" {...form.register("isActive")} />
                  </label>
                  <button
                    type="submit"
                    disabled={updateMutation.isPending}
                    className="w-full rounded-xl bg-primary px-4 py-3 font-bold text-on-primary disabled:opacity-50"
                  >
                    {updateMutation.isPending ? "Guardando…" : "Guardar cambios"}
                  </button>
                  {updateMutation.isError ? (
                    <p className="text-sm text-danger">{getErrorMessage(updateMutation.error)}</p>
                  ) : null}
                </form>
              </details>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default ClientProfilePage;
