// frontend/app/(dashboard)/loans/new/page.tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import api from "../../../../lib/api";
import { getEffectiveRoles, pickPrimaryRole } from "../../../../lib/effective-roles";
import { useAuthStore, type UserRole } from "../../../../store/authStore";
import { calculateLoan, type LoanFrequency, type LoanInput } from "../../../../lib/loan-calculator";
import { formatCOP } from "../../../../lib/formatters";
import { formatBogotaDate, getBogotaYMD, parseBogotaDateOnlyToUTC } from "../../../../lib/bogota";
import TablePagination from "../../../../components/ui/TablePagination";
import { DEFAULT_PAGE_SIZE, type PageSize } from "../../../../lib/page-size";

interface ClientItem {
  id: string;
  name: string;
  routeId: string;
}

interface ClientSearchOption {
  clientId: string;
  clientName: string;
  label: string;
}

interface ListResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

interface LoanCreatePayload {
  routeId: string;
  clientId: string;
  principal: number;
  interestRate: number;
  installmentCount: number;
  frequency: LoanFrequency;
  startDate: string;
  excludeWeekends: boolean;
}

const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: string } | undefined)?.message;
    return message ?? error.message;
  }
  return "Error desconocido.";
};

const createLoanFormSchema = z.object({
  clientId: z.string().cuid(),
  principal: z.number().int().positive(),
  interestRate: z.number().int().positive(),
  installmentCount: z.number().int().positive(),
  frequency: z.enum(["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY"]),
  startDate: z.string().min(1),
  excludeWeekends: z.boolean()
});

type CreateLoanFormData = z.infer<typeof createLoanFormSchema>;

const LoansNewPageInner = (): JSX.Element => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const hasAuthHydrated = useAuthStore((state) => state.hasAuthHydrated);
  const role: UserRole = pickPrimaryRole(getEffectiveRoles(user));

  const canCreate = role === "ADMIN" || role === "SUPER_ADMIN" || role === "ROUTE_MANAGER";
  const clientsQuery = useQuery({
    queryKey: ["clients-for-loans-create"],
    queryFn: async (): Promise<ListResponse<ClientItem>> => {
      const response = await api.get<ListResponse<ClientItem>>("/clients");
      return response.data;
    },
    enabled: hasAuthHydrated && Boolean(user) && canCreate
  });

  const clients = useMemo<ClientItem[]>(() => {
    return clientsQuery.data?.data ?? [];
  }, [clientsQuery.data]);

  const clientIdFromUrl = searchParams.get("clientId");

  const inferredStartDate = getBogotaYMD();

  const [clientSearchTerm, setClientSearchTerm] = useState<string>("");

  const form = useForm<CreateLoanFormData>({
    resolver: zodResolver(createLoanFormSchema),
    defaultValues: {
      clientId: "",
      principal: 0 as number,
      interestRate: 20,
      installmentCount: 1,
      frequency: "MONTHLY",
      startDate: inferredStartDate,
      excludeWeekends: false
    },
    mode: "onChange"
  });

  useEffect(() => {
    if (!clientIdFromUrl || clients.length === 0) {
      return;
    }
    const exists = clients.some((row) => row.id === clientIdFromUrl);
    if (exists) {
      form.setValue("clientId", clientIdFromUrl, { shouldValidate: true });
    }
  }, [clientIdFromUrl, clients, form]);

  useEffect(() => {
    if (!clientIdFromUrl || clients.length === 0) {
      return;
    }
    const selected = clients.find((row) => row.id === clientIdFromUrl);
    if (selected) {
      setClientSearchTerm(selected.name);
    }
  }, [clientIdFromUrl, clients]);

  const startDateISO = form.watch("startDate");
  const principal = form.watch("principal");
  const interestRate = form.watch("interestRate");
  const installmentCount = form.watch("installmentCount");
  const frequency = form.watch("frequency");
  const excludeWeekends = form.watch("excludeWeekends");
  const clientId = form.watch("clientId");

  const selectedClient = useMemo((): ClientItem | null => {
    if (!clientId) return null;
    return clients.find((c) => c.id === clientId) ?? null;
  }, [clientId, clients]);

  const clientSearchOptions = useMemo<ClientSearchOption[]>(() => {
    return clients.map((client) => {
      return {
        clientId: client.id,
        clientName: client.name,
        label: `${client.name} • ${client.id}`
      };
    });
  }, [clients]);

  const selectedClientOption = useMemo((): ClientSearchOption | null => {
    if (!clientId) return null;
    return clientSearchOptions.find((opt) => opt.clientId === clientId) ?? null;
  }, [clientId, clientSearchOptions]);

  useEffect(() => {
    if (selectedClientOption) {
      setClientSearchTerm(selectedClientOption.clientName);
    } else if (clientSearchOptions.length === 0) {
      setClientSearchTerm("");
    }
  }, [selectedClientOption, clientSearchOptions.length]);

  const filteredClientOptions = useMemo(() => {
    const term = clientSearchTerm.trim().toLowerCase();
    if (!term) return clientSearchOptions;
    return clientSearchOptions.filter((opt) => {
      return (
        opt.label.toLowerCase().includes(term) ||
        opt.clientName.toLowerCase().includes(term) ||
        opt.clientId.toLowerCase().includes(term)
      );
    });
  }, [clientSearchOptions, clientSearchTerm]);

  const preview = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDateISO)) {
      return null;
    }
    const startDate = parseBogotaDateOnlyToUTC(startDateISO);

    const input: LoanInput = {
      principal,
      interestRate: interestRate / 100,
      installmentCount,
      frequency,
      startDate,
      excludeWeekends
    };

    if (principal <= 0 || installmentCount <= 0 || interestRate <= 0) {
      return null;
    }
    return calculateLoan(input);
  }, [principal, interestRate, installmentCount, frequency, startDateISO, excludeWeekends]);

  const [previewPage, setPreviewPage] = useState(1);
  const [previewLimit, setPreviewLimit] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const previewSchedule = preview?.schedule ?? [];
  const pagedPreviewSchedule = useMemo(() => {
    const start = (previewPage - 1) * previewLimit;
    return previewSchedule.slice(start, start + previewLimit);
  }, [previewSchedule, previewPage, previewLimit]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(previewSchedule.length / previewLimit));
    if (previewPage > totalPages) {
      setPreviewPage(totalPages);
    }
  }, [previewSchedule.length, previewLimit, previewPage]);

  const onSubmit = async (values: CreateLoanFormData): Promise<void> => {
    if (!canCreate) {
      return;
    }
    const selected = clients.find((c) => c.id === values.clientId);
    if (!selected) {
      form.setError("clientId", { type: "manual", message: "Cliente inválido." });
      return;
    }

    const payload: LoanCreatePayload = {
      routeId: selected.routeId,
      clientId: values.clientId,
      principal: values.principal,
      interestRate: values.interestRate,
      installmentCount: values.installmentCount,
      frequency: values.frequency,
      startDate: values.startDate,
      excludeWeekends: values.excludeWeekends
    };

    try {
      const response = await api.post("/loans", payload);
      const created = response.data.data as { id: string };
      router.push(`/loans/${created.id}`);
    } catch (error) {
      const message = getErrorMessage(error);
      form.setError("clientId", { type: "manual", message });
    }
  };

  if (!canCreate) {
    return (
      <section className="rounded-xl border border-border bg-surface p-6">
        <p className="text-sm text-danger">No tienes permisos para crear préstamos.</p>
        <div className="mt-4">
          <Link href="/loans" className="text-primary hover:underline">
            Volver a préstamos
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="min-w-0">
      <div className="mx-auto w-full max-w-6xl space-y-8 p-4 md:p-8">
        <nav className="flex items-center gap-2 text-sm font-medium">
          <span className="text-on-surface-variant">Préstamos</span>
          <span className="text-on-surface-variant/60">/</span>
          <span className="font-bold text-primary">Crear nuevo</span>
        </nav>

        <div className="grid grid-cols-12 gap-8">
          <div className="col-span-12 lg:col-span-7">
            <div className="rounded-2xl border border-outline-variant/15 bg-surface-container-low/40 p-8 shadow-xl backdrop-blur-xl">
              <div className="mb-8 flex items-center justify-between">
                <h1 className="text-2xl font-bold tracking-tight text-on-surface" style={{ fontFamily: "var(--font-display, Manrope), sans-serif" }}>
                  Configuración de Préstamo
                </h1>
                <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                  Nuevo registro
                </span>
              </div>

              <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
                <div className="space-y-2">
                  <label
                    htmlFor="clientSearch"
                    className="ml-1 text-xs font-bold uppercase tracking-widest text-on-surface-variant"
                  >
                    Cliente
                  </label>
                  <input type="hidden" {...form.register("clientId")} />

                  <input
                    id="clientSearch"
                    type="search"
                    className="w-full rounded-xl border-2 border-transparent bg-surface-container-lowest p-4 text-on-surface outline-none placeholder:text-outline focus:border-primary/40"
                    placeholder="Buscar por nombre o documento"
                    value={clientSearchTerm}
                    onChange={(e) => setClientSearchTerm(e.target.value)}
                    autoComplete="off"
                  />

                  {clients.length > 0 ? (
                    <div className="max-h-56 overflow-y-auto rounded-xl border border-outline-variant/10 bg-surface-container-lowest">
                      {filteredClientOptions.length === 0 ? (
                        <p className="px-4 py-3 text-sm text-on-surface-variant">Sin resultados para la búsqueda.</p>
                      ) : (
                        filteredClientOptions.map((opt) => {
                          const isActive = opt.clientId === clientId;
                          return (
                            <button
                              key={opt.clientId}
                              type="button"
                              onClick={() => {
                                form.setValue("clientId", opt.clientId, { shouldValidate: true });
                                setClientSearchTerm(opt.clientName);
                              }}
                              className={[
                                "flex w-full items-center justify-between border-b border-outline-variant/10 px-4 py-3 text-left text-sm last:border-b-0",
                                isActive
                                  ? "bg-primary/10 text-primary"
                                  : "text-on-surface hover:bg-surface-container-highest/40"
                              ].join(" ")}
                            >
                              <span className="font-semibold">{opt.clientName}</span>
                              <span className="text-xs text-on-surface-variant">{opt.clientId}</span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  ) : null}

                  {selectedClientOption ? (
                    <p className="text-xs text-on-surface-variant">Seleccionado: {selectedClientOption.label}</p>
                  ) : null}

                  {!clientsQuery.isLoading && !clientsQuery.isError && clients.length === 0 ? (
                    <p className="mt-1 text-xs text-warning">
                      No hay clientes en tu ruta. Deben estar vinculados a la ruta (módulo Clientes o registro con{" "}
                      <code className="text-on-surface-variant">?routeId=</code>).
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-error">{form.formState.errors.clientId?.message}</p>
                </div>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <label
                      htmlFor="principal"
                      className="ml-1 text-xs font-bold uppercase tracking-widest text-on-surface-variant"
                    >
                      Monto principal (COP)
                    </label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-black text-on-surface-variant/60">
                        $
                      </span>
                      <input
                        id="principal"
                        type="number"
                        step={1}
                        className="h-14 w-full rounded-xl border border-outline-variant/15 bg-surface-container-lowest pl-8 pr-4 text-lg font-bold text-on-surface outline-none transition-all focus:ring-2 focus:ring-primary/20"
                        {...form.register("principal", { valueAsNumber: true })}
                      />
                    </div>
                    <p className="mt-1 text-xs text-error">{form.formState.errors.principal?.message}</p>
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="interestRate"
                      className="ml-1 text-xs font-bold uppercase tracking-widest text-on-surface-variant"
                    >
                      Tasa de interés (%)
                    </label>
                    <div className="relative">
                      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant/60">
                        %
                      </span>
                      <input
                        id="interestRate"
                        type="number"
                        step={1}
                        className="h-14 w-full rounded-xl border border-outline-variant/15 bg-surface-container-lowest px-4 text-lg font-bold text-on-surface outline-none transition-all focus:ring-2 focus:ring-primary/20"
                        {...form.register("interestRate", { valueAsNumber: true })}
                      />
                    </div>
                    <p className="mt-1 text-xs text-error">{form.formState.errors.interestRate?.message}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <label
                      htmlFor="installmentCount"
                      className="ml-1 text-xs font-bold uppercase tracking-widest text-on-surface-variant"
                    >
                      Número de cuotas
                    </label>
                    <input
                      id="installmentCount"
                      type="number"
                      step={1}
                      className="h-14 w-full rounded-xl border border-outline-variant/15 bg-surface-container-lowest px-4 text-on-surface outline-none transition-all focus:ring-2 focus:ring-primary/20"
                      {...form.register("installmentCount", { valueAsNumber: true })}
                    />
                    <p className="mt-1 text-xs text-error">{form.formState.errors.installmentCount?.message}</p>
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="frequency"
                      className="ml-1 text-xs font-bold uppercase tracking-widest text-on-surface-variant"
                    >
                      Frecuencia
                    </label>
                    <select
                      id="frequency"
                      className="h-14 w-full appearance-none rounded-xl border border-outline-variant/15 bg-surface-container-lowest px-4 text-on-surface outline-none transition-all focus:ring-2 focus:ring-primary/20"
                      {...form.register("frequency")}
                    >
                      <option value="DAILY">Diario</option>
                      <option value="WEEKLY">Semanal</option>
                      <option value="BIWEEKLY">Quincenal</option>
                      <option value="MONTHLY">Mensual</option>
                    </select>
                    <p className="mt-1 text-xs text-error">{form.formState.errors.frequency?.message}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="startDate"
                    className="ml-1 text-xs font-bold uppercase tracking-widest text-on-surface-variant"
                  >
                    Fecha de inicio
                  </label>
                  <div className="relative">
                    <span
                      aria-hidden
                      className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant"
                    >
                      📅
                    </span>
                    <input
                      id="startDate"
                      type="date"
                      className="h-14 w-full rounded-xl border border-outline-variant/15 bg-surface-container-lowest px-4 text-on-surface outline-none transition-all focus:ring-2 focus:ring-primary/20"
                      {...form.register("startDate")}
                    />
                  </div>
                  <p className="mt-1 text-xs text-error">{form.formState.errors.startDate?.message}</p>
                </div>

                {frequency === "DAILY" ? (
                  <label className="flex items-center justify-between gap-3 rounded-xl border border-outline-variant/15 bg-surface-container-lowest px-4 py-4 text-sm text-on-surface-variant">
                    Excluir sábados y domingos (solo lunes a viernes)
                    <input type="checkbox" {...form.register("excludeWeekends")} />
                  </label>
                ) : null}

                <div className="pt-6">
                  <button
                    type="submit"
                    disabled={form.formState.isSubmitting || !form.formState.isValid || clientsQuery.isLoading}
                    className="flex w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-primary to-primary-container py-4 text-lg font-extrabold text-on-primary shadow-[0_12px_32px_rgba(105,246,184,0.2)] transition-all hover:shadow-[0_12px_48px_rgba(105,246,184,0.3)] active:scale-[0.98] disabled:opacity-50"
                    style={{ fontFamily: "var(--font-display, Manrope), sans-serif" }}
                  >
                    <span aria-hidden>＋</span>
                    {form.formState.isSubmitting ? "Creando..." : "Crear préstamo"}
                  </button>
                  <p className="mt-4 text-center text-[10px] font-medium uppercase tracking-[0.2em] text-on-surface-variant/60">
                    Al confirmar, se generará automáticamente el cronograma de pagos
                  </p>
                </div>
              </form>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-5">
            <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-outline-variant/15 bg-surface-container-low/40 shadow-xl backdrop-blur-xl">
              <div className="border-b border-outline-variant/10 bg-surface-container-highest/30 p-6">
                <div className="flex items-center gap-3">
                  <span className="text-primary" aria-hidden>
                    👁
                  </span>
                  <h2 className="text-lg font-bold text-on-surface" style={{ fontFamily: "var(--font-display, Manrope), sans-serif" }}>
                    Preview plan de pagos
                  </h2>
                </div>
                {selectedClient ? (
                  <p className="mt-2 text-xs text-on-surface-variant">
                    Cliente: <span className="font-semibold text-on-surface">{selectedClient.name}</span>
                  </p>
                ) : null}
              </div>

              <div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto p-6">
                {!preview ? (
                  <div className="flex h-64 flex-col items-center justify-center text-center">
                    <p className="max-w-[260px] text-sm text-on-surface-variant">
                      Completa los campos para ver el plan de amortización.
                    </p>
                  </div>
                ) : (
                  <>
                    {pagedPreviewSchedule.map((item) => (
                      <div
                        key={item.installmentNumber}
                        className="flex items-center justify-between rounded-xl bg-surface-container-high/40 p-4 transition-colors hover:bg-surface-container-high/60"
                      >
                        <div className="flex items-center gap-4">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-outline-variant/10 bg-surface-container-low text-xs font-bold text-on-surface-variant">
                            {String(item.installmentNumber).padStart(2, "0")}
                          </div>
                          <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-on-surface">
                              Cuota #{item.installmentNumber}
                            </p>
                            <p className="text-[10px] text-on-surface-variant">
                              {formatBogotaDate(item.dueDate)}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-primary">{formatCOP(item.amount)}</p>
                          <p className="text-[10px] italic text-on-surface-variant/60">Capital + Interés</p>
                        </div>
                      </div>
                    ))}

                    {previewSchedule.length > 0 ? (
                      <TablePagination
                        page={previewPage}
                        limit={previewLimit}
                        total={previewSchedule.length}
                        onPageChange={setPreviewPage}
                        onLimitChange={(next) => {
                          setPreviewLimit(next);
                          setPreviewPage(1);
                        }}
                      />
                    ) : null}
                  </>
                )}
              </div>

              <div className="mt-auto border-t border-outline-variant/10 bg-surface-container-highest/50 p-6">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-on-surface-variant">Resumen del plan</span>
                  <span className="text-xs font-bold text-primary">COP</span>
                </div>

                {!preview ? (
                  <p className="text-sm text-on-surface-variant">—</p>
                ) : (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-on-surface-variant">Total intereses:</span>
                      <span className="font-bold text-on-surface">{formatCOP(preview.totalInterest)}</span>
                    </div>
                    <div className="flex justify-between border-t border-outline-variant/10 pt-2 text-lg">
                      <span className="font-bold text-on-surface">Gran total:</span>
                      <span className="font-black text-primary">{formatCOP(preview.totalAmount)}</span>
                    </div>
                    <p className="pt-1 text-[10px] text-on-surface-variant/70">
                      La última cuota ajusta el redondeo.
                      <span className="ml-2">Fin: {formatBogotaDate(preview.endDate)}</span>
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end">
          <Link href="/loans" className="text-sm font-semibold text-primary hover:underline">
            Volver a préstamos
          </Link>
        </div>
      </div>
    </section>
  );
};

const LoansNewPage = (): JSX.Element => {
  return (
    <Suspense
      fallback={
        <section className="rounded-xl border border-border bg-surface p-6">
          <p className="text-sm text-textSecondary">Cargando…</p>
        </section>
      }
    >
      <LoansNewPageInner />
    </Suspense>
  );
};

export default LoansNewPage;

