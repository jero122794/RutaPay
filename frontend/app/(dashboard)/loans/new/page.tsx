// frontend/app/(dashboard)/loans/new/page.tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { parseISO } from "date-fns";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import api from "../../../../lib/api";
import { useAuthStore, type UserRole } from "../../../../store/authStore";
import { calculateLoan, type LoanFrequency, type LoanInput } from "../../../../lib/loan-calculator";
import { formatCOP } from "../../../../lib/formatters";
import { formatBogotaDate, getBogotaYMD } from "../../../../lib/bogota";

interface ClientItem {
  id: string;
  name: string;
  routeId: string;
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
  interestRate: z.number().positive(),
  installmentCount: z.number().int().positive(),
  frequency: z.enum(["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY"]),
  startDate: z.string().min(1)
});

type CreateLoanFormData = z.infer<typeof createLoanFormSchema>;

const LoansNewPage = (): JSX.Element => {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const role: UserRole = user?.roles[0] ?? "CLIENT";

  const canCreate = role === "ADMIN" || role === "SUPER_ADMIN" || role === "ROUTE_MANAGER";
  const clientsQuery = useQuery({
    queryKey: ["clients-for-loans-create"],
    queryFn: async (): Promise<ListResponse<ClientItem>> => {
      const response = await api.get<ListResponse<ClientItem>>("/clients");
      return response.data;
    },
    enabled: canCreate
  });

  const clients = useMemo<ClientItem[]>(() => {
    return clientsQuery.data?.data ?? [];
  }, [clientsQuery.data]);

  const inferredStartDate = getBogotaYMD();

  const form = useForm<CreateLoanFormData>({
    resolver: zodResolver(createLoanFormSchema),
    defaultValues: {
      clientId: "",
      principal: 0 as number,
      interestRate: 0.2,
      installmentCount: 1,
      frequency: "MONTHLY",
      startDate: inferredStartDate
    },
    mode: "onChange"
  });

  const startDateISO = form.watch("startDate");
  const principal = form.watch("principal");
  const interestRate = form.watch("interestRate");
  const installmentCount = form.watch("installmentCount");
  const frequency = form.watch("frequency");

  const preview = useMemo(() => {
    const startDate = parseISO(startDateISO);

    const input: LoanInput = {
      principal,
      interestRate,
      installmentCount,
      frequency,
      startDate
    };

    if (principal <= 0 || installmentCount <= 0 || interestRate <= 0) {
      return null;
    }
    return calculateLoan(input);
  }, [principal, interestRate, installmentCount, frequency, startDateISO]);

  const onSubmit = async (values: CreateLoanFormData): Promise<void> => {
    if (!canCreate) {
      return;
    }
    const selectedClient = clients.find((c) => c.id === values.clientId);
    if (!selectedClient) {
      form.setError("clientId", { type: "manual", message: "Cliente inválido." });
      return;
    }

    const payload: LoanCreatePayload = {
      routeId: selectedClient.routeId,
      clientId: values.clientId,
      principal: values.principal,
      interestRate: values.interestRate,
      installmentCount: values.installmentCount,
      frequency: values.frequency,
      startDate: values.startDate
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
    <section className="space-y-4">
      <header className="rounded-xl border border-border bg-surface p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-semibold">Crear préstamo</h1>
            <p className="mt-1 text-sm text-textSecondary">Previsualización en tiempo real antes de confirmar.</p>
          </div>
          <Link href="/loans" className="text-primary hover:underline">
            Volver a préstamos
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <form
          className="space-y-4 rounded-xl border border-border bg-surface p-6"
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <div>
            <label htmlFor="clientId" className="mb-1 block text-sm text-textSecondary">
              Cliente
            </label>
            <select
              id="clientId"
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
              {...form.register("clientId")}
            >
              <option value="">Selecciona un cliente</option>
              {clientsQuery.isLoading ? <option value="">Cargando...</option> : null}
              {clientsQuery.isError ? <option value="">Error cargando clientes</option> : null}
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {!clientsQuery.isLoading && !clientsQuery.isError && clients.length === 0 ? (
              <p className="mt-1 text-xs text-warning">
                No hay clientes en tu ruta. Deben estar vinculados a la ruta (módulo Clientes o registro con{" "}
                <code className="text-textSecondary">?routeId=</code>).
              </p>
            ) : null}
            <p className="mt-1 text-xs text-danger">{form.formState.errors.clientId?.message}</p>
          </div>

          <div>
            <label htmlFor="principal" className="mb-1 block text-sm text-textSecondary">
              Principal (COP)
            </label>
            <input
              id="principal"
              type="number"
              step={1}
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
              {...form.register("principal", { valueAsNumber: true })}
            />
            <p className="mt-1 text-xs text-danger">{form.formState.errors.principal?.message}</p>
          </div>

          <div>
            <label htmlFor="interestRate" className="mb-1 block text-sm text-textSecondary">
              Tasa de interés (decimal, ej 0.20)
            </label>
            <input
              id="interestRate"
              type="number"
              step={0.01}
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
              {...form.register("interestRate", { valueAsNumber: true })}
            />
            <p className="mt-1 text-xs text-danger">{form.formState.errors.interestRate?.message}</p>
          </div>

          <div>
            <label htmlFor="installmentCount" className="mb-1 block text-sm text-textSecondary">
              Número de cuotas
            </label>
            <input
              id="installmentCount"
              type="number"
              step={1}
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
              {...form.register("installmentCount", { valueAsNumber: true })}
            />
            <p className="mt-1 text-xs text-danger">{form.formState.errors.installmentCount?.message}</p>
          </div>

          <div>
            <label htmlFor="frequency" className="mb-1 block text-sm text-textSecondary">
              Frecuencia
            </label>
            <select
              id="frequency"
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
              {...form.register("frequency")}
            >
              <option value="DAILY">Diaria</option>
              <option value="WEEKLY">Semanal</option>
              <option value="BIWEEKLY">Quincenal</option>
              <option value="MONTHLY">Mensual</option>
            </select>
            <p className="mt-1 text-xs text-danger">{form.formState.errors.frequency?.message}</p>
          </div>

          <div>
            <label htmlFor="startDate" className="mb-1 block text-sm text-textSecondary">
              Fecha de inicio
            </label>
            <input
              id="startDate"
              type="date"
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
              {...form.register("startDate")}
            />
            <p className="mt-1 text-xs text-danger">{form.formState.errors.startDate?.message}</p>
          </div>

          <button
            type="submit"
            disabled={form.formState.isSubmitting || !form.formState.isValid || clientsQuery.isLoading}
            className="w-full rounded-md bg-primary px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            {form.formState.isSubmitting ? "Creando..." : "Crear préstamo"}
          </button>
        </form>

        <aside className="space-y-4 rounded-xl border border-border bg-surface p-6">
          <h2 className="text-lg font-semibold">Preview plan de pagos</h2>
          {!preview ? (
            <p className="text-sm text-textSecondary">Completa los campos para ver el plan.</p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-textSecondary">
                Total interés: <span className="text-textPrimary">{formatCOP(preview.totalInterest)}</span>
              </p>
              <p className="text-sm text-textSecondary">
                Total a pagar: <span className="text-textPrimary">{formatCOP(preview.totalAmount)}</span>
              </p>
              <p className="text-sm text-textSecondary">
                Valor cuota (aprox.): <span className="text-textPrimary">{formatCOP(preview.installmentAmount)}</span>
              </p>
              <p className="text-sm text-textSecondary">
                Fin del plan: <span className="text-textPrimary">{formatBogotaDate(preview.endDate)}</span>
              </p>
              <div className="rounded-lg border border-border bg-bg p-4">
                <p className="text-sm text-textSecondary">
                  Cuotas a generar: <span className="text-textPrimary">{preview.schedule.length}</span>
                </p>
                <p className="mt-1 text-xs text-textSecondary">
                  El valor de la última cuota corrige redondeo por centavos.
                </p>
              </div>
              <div className="max-h-72 overflow-auto rutapay-table-wrap p-0">
                <table className="rutapay-table">
                  <thead>
                    <tr>
                      <th className="px-2 py-1 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                        #
                      </th>
                      <th className="px-2 py-1 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                        Vence
                      </th>
                      <th className="px-2 py-1 text-right text-xs font-semibold uppercase tracking-wider text-textSecondary">
                        Valor
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.schedule.map((item) => (
                      <tr key={item.installmentNumber} className="border-t border-border">
                        <td className="px-2 py-2 text-sm text-textSecondary">{item.installmentNumber}</td>
                        <td className="px-2 py-2 text-sm text-textSecondary">
                          {formatBogotaDate(item.dueDate)}
                        </td>
                        <td className="px-2 py-2 text-right text-sm text-textPrimary">
                          {formatCOP(item.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
};

export default LoansNewPage;

