// frontend/app/(dashboard)/treasury/page.tsx
"use client";

import axios from "axios";
import { useMemo, useState } from "react";
import api from "../../../lib/api";
import { useAuthStore, type UserRole } from "../../../store/authStore";
import { formatCOP } from "../../../lib/formatters";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";

interface ListResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

interface RouteItem {
  id: string;
  name: string;
  managerId: string;
  balance: number;
}

interface RouteBalanceResponse {
  routeId: string;
  routeName: string;
  managerId: string;
  currentBalance: number;
  totalCredits: number;
  totalDebits: number;
}

interface LiquidationResponse {
  managerId: string;
  routeId: string;
  routeName: string;
  assignedBalance: number;
  currentBalance: number;
  recoveredPayments: number;
  activePortfolio: number;
  amountToReturn: number;
}

interface UserItem {
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

const creditSchema = z.object({
  routeId: z.string().min(1),
  amount: z.number().int().positive(),
  reference: z.string().max(200).optional().or(z.literal(""))
});

type CreditFormValues = z.infer<typeof creditSchema>;

const TreasuryPage = (): JSX.Element => {
  const user = useAuthStore((state) => state.user);
  const role: UserRole = user?.roles[0] ?? "CLIENT";
  const queryClient = useQueryClient();

  const isAdminView = role === "ADMIN" || role === "SUPER_ADMIN";
  const isRouteManagerView = role === "ROUTE_MANAGER";

  const routesQuery = useQuery({
    queryKey: ["routes-treasury"],
    queryFn: async (): Promise<ListResponse<RouteItem>> => {
      const response = await api.get<ListResponse<RouteItem>>("/routes");
      return response.data;
    },
    enabled: isAdminView
  });

  const clientsForInferenceQuery = useQuery({
    queryKey: ["clients-infer-routeId"],
    queryFn: async (): Promise<ListResponse<{ id: string; routeId: string }>> => {
      const response = await api.get<ListResponse<{ id: string; routeId: string }>>("/clients");
      return response.data;
    },
    enabled: isRouteManagerView
  });

  const inferredRouteId = clientsForInferenceQuery.data?.data?.[0]?.routeId ?? "";

  const routeBalanceQuery = useQuery({
    queryKey: ["route-balance", inferredRouteId],
    queryFn: async (): Promise<{ data: RouteBalanceResponse }> => {
      const response = await api.get<{ data: RouteBalanceResponse }>(`/treasury/balance/${inferredRouteId}`);
      return response.data;
    },
    enabled: isRouteManagerView && Boolean(inferredRouteId)
  });

  const managerIds = useMemo((): string[] => {
    if (!routesQuery.data) return [];
    const ids = routesQuery.data.data.map((r) => r.managerId);
    return Array.from(new Set(ids));
  }, [routesQuery.data]);

  const usersQuery = useQuery({
    queryKey: ["users-for-treasury-manager-select"],
    queryFn: async (): Promise<ListResponse<UserItem>> => {
      const response = await api.get<ListResponse<UserItem>>("/users");
      return response.data;
    },
    enabled: isAdminView
  });

  const managerNameById = useMemo((): Record<string, string> => {
    const users = usersQuery.data?.data ?? [];
    const map: Record<string, string> = {};
    users.forEach((u) => {
      map[u.id] = u.name;
    });
    return map;
  }, [usersQuery.data]);

  const [selectedManagerId, setSelectedManagerId] = useState<string>("");

  const liquidationQuery = useQuery({
    queryKey: ["liquidation", selectedManagerId],
    queryFn: async (): Promise<{ data: LiquidationResponse }> => {
      const response = await api.get<{ data: LiquidationResponse }>(`/treasury/liquidation/${selectedManagerId}`);
      return response.data;
    },
    enabled: isAdminView && Boolean(selectedManagerId)
  });

  const creditForm = useForm<CreditFormValues>({
    resolver: zodResolver(creditSchema),
    defaultValues: {
      routeId: "",
      amount: 0,
      reference: ""
    },
    mode: "onChange"
  });

  const availableCreditRoutes = routesQuery.data?.data ?? [];

  const setDefaultRouteIdOnce = (): void => {
    if (creditForm.getValues("routeId")) return;
    const first = availableCreditRoutes[0];
    if (first) creditForm.setValue("routeId", first.id, { shouldDirty: false, shouldValidate: true });
  };

  if (isAdminView) {
    setDefaultRouteIdOnce();
  }

  const creditMutation = useMutation({
    mutationFn: async (values: CreditFormValues): Promise<{ data: { routeId: string; updatedBalance: number; creditedAmount: number } }> => {
      const reference = values.reference && values.reference.trim().length > 0 ? values.reference : undefined;
      const response = await api.post("/treasury/credit", {
        routeId: values.routeId,
        amount: values.amount,
        reference
      });
      return response.data as { data: { routeId: string; updatedBalance: number; creditedAmount: number } };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["routes-treasury"] });
      if (inferredRouteId) {
        await queryClient.invalidateQueries({ queryKey: ["route-balance", inferredRouteId] });
      }
    }
  });

  return (
    <section className="space-y-4">
      <header className="rounded-xl border border-border bg-surface p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-semibold">Tesorería</h1>
            <p className="mt-1 text-sm text-textSecondary">Saldo de ruta, crédito y liquidación.</p>
          </div>
          <p className="text-sm text-textSecondary">
            Rol: <span className="text-textPrimary">{role}</span>
          </p>
        </div>
      </header>

      {isRouteManagerView ? (
        <div className="space-y-4 rounded-xl border border-border bg-surface p-6">
          <h2 className="text-lg font-semibold">Saldo disponible</h2>

          {clientsForInferenceQuery.isLoading || routeBalanceQuery.isLoading ? (
            <p className="text-sm text-textSecondary">Cargando tu saldo...</p>
          ) : null}

          {clientsForInferenceQuery.isError ? (
            <p className="text-sm text-danger">{getErrorMessage(clientsForInferenceQuery.error)}</p>
          ) : null}

          {routeBalanceQuery.isError ? (
            <p className="text-sm text-danger">{getErrorMessage(routeBalanceQuery.error)}</p>
          ) : null}

          {routeBalanceQuery.data?.data ? (
            <div className="space-y-3">
              <p className="text-sm text-textSecondary">Ruta</p>
              <p className="text-base font-semibold">{routeBalanceQuery.data.data.routeName}</p>
              <p className="text-sm text-textSecondary">Saldo actual</p>
              <p className="text-2xl font-semibold">{formatCOP(routeBalanceQuery.data.data.currentBalance)}</p>
              <p className="text-sm text-textSecondary">
                Créditos: {formatCOP(routeBalanceQuery.data.data.totalCredits)} • Débitos:{" "}
                {formatCOP(routeBalanceQuery.data.data.totalDebits)}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {isAdminView ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="rounded-xl border border-border bg-surface p-6 xl:col-span-2">
              <h2 className="text-lg font-semibold">Saldo por ruta</h2>
              {routesQuery.isLoading ? <p className="mt-2 text-sm text-textSecondary">Cargando rutas...</p> : null}
              {routesQuery.isError ? (
                <p className="mt-2 text-sm text-danger">{getErrorMessage(routesQuery.error)}</p>
              ) : null}
              {routesQuery.data ? (
                <div className="mt-4 rutapay-table-wrap">
                  {routesQuery.data.data.length === 0 ? (
                    <p className="text-sm text-textSecondary">No hay rutas registradas.</p>
                  ) : (
                    <table className="rutapay-table">
                      <thead>
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                            Ruta
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                            Encargado
                          </th>
                          <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-textSecondary">
                            Balance
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {routesQuery.data.data.map((r) => (
                          <tr key={r.id} className="border-t border-border">
                            <td className="px-3 py-3 text-sm">
                              <span className="font-medium">{r.name}</span>
                            </td>
                            <td className="px-3 py-3 text-sm text-textSecondary">{r.managerId}</td>
                            <td className="px-3 py-3 text-right text-sm text-textPrimary">
                              {formatCOP(r.balance)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-border bg-surface p-6">
              <h2 className="text-lg font-semibold">Crédito a ruta</h2>
              <form
                className="mt-4 space-y-3"
                onSubmit={creditForm.handleSubmit(async (values) => {
                  await creditMutation.mutateAsync(values);
                })}
              >
                <div>
                  <label className="mb-1 block text-sm text-textSecondary">Ruta</label>
                  <select
                    className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
                    value={creditForm.watch("routeId")}
                    onChange={(e) => creditForm.setValue("routeId", e.target.value, { shouldValidate: true })}
                  >
                    {availableCreditRoutes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  {creditForm.formState.errors.routeId ? (
                    <p className="mt-1 text-xs text-danger">{creditForm.formState.errors.routeId.message}</p>
                  ) : null}
                </div>

                <div>
                  <label className="mb-1 block text-sm text-textSecondary">Monto (COP)</label>
                  <input
                    type="number"
                    step={1}
                    className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
                    {...creditForm.register("amount", { valueAsNumber: true })}
                  />
                  {creditForm.formState.errors.amount ? (
                    <p className="mt-1 text-xs text-danger">{creditForm.formState.errors.amount.message}</p>
                  ) : null}
                </div>

                <div>
                  <label className="mb-1 block text-sm text-textSecondary">Referencia (opcional)</label>
                  <input
                    type="text"
                    className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
                    {...creditForm.register("reference")}
                  />
                  {creditForm.formState.errors.reference ? (
                    <p className="mt-1 text-xs text-danger">{creditForm.formState.errors.reference.message}</p>
                  ) : null}
                </div>

                <button
                  type="submit"
                  disabled={creditMutation.isPending || !creditForm.formState.isValid || availableCreditRoutes.length === 0}
                  className="w-full rounded-md bg-primary px-4 py-2 font-medium text-white disabled:opacity-50"
                >
                  {creditMutation.isPending ? "Procesando..." : "Aplicar crédito"}
                </button>
              </form>

              {creditMutation.isError ? (
                <p className="mt-3 text-sm text-danger">{getErrorMessage(creditMutation.error)}</p>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface p-6">
            <h2 className="text-lg font-semibold">Liquidación por encargado</h2>
            <div className="mt-4 space-y-2 md:flex md:items-center md:justify-between">
              <div className="md:w-2/3">
                <label className="mb-1 block text-sm text-textSecondary">Encargado</label>
                <select
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
                  value={selectedManagerId}
                  onChange={(e) => setSelectedManagerId(e.target.value)}
                >
                  <option value="">Selecciona un encargado</option>
                  {managerIds.map((id) => (
                    <option key={id} value={id}>
                      {managerNameById[id] ?? id}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:w-1/3 md:flex md:justify-end">
                <p className="mt-5 text-xs text-textSecondary">Se calcula usando cartera y pagos registrados.</p>
              </div>
            </div>

            {selectedManagerId ? (
              liquidationQuery.isLoading ? (
                <p className="mt-4 text-sm text-textSecondary">Calculando liquidación...</p>
              ) : liquidationQuery.isError ? (
                <p className="mt-4 text-sm text-danger">{getErrorMessage(liquidationQuery.error)}</p>
              ) : liquidationQuery.data?.data ? (
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="rounded-xl border border-border bg-bg p-4">
                    <p className="text-xs uppercase tracking-wider text-textSecondary">Balance asignado</p>
                    <p className="mt-2 text-lg font-semibold">{formatCOP(liquidationQuery.data.data.assignedBalance)}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-bg p-4">
                    <p className="text-xs uppercase tracking-wider text-textSecondary">Saldo actual</p>
                    <p className="mt-2 text-lg font-semibold">{formatCOP(liquidationQuery.data.data.currentBalance)}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-bg p-4">
                    <p className="text-xs uppercase tracking-wider text-textSecondary">A devolver</p>
                    <p className="mt-2 text-lg font-semibold text-success">{formatCOP(liquidationQuery.data.data.amountToReturn)}</p>
                  </div>
                </div>
              ) : null
            ) : (
              <p className="mt-4 text-sm text-textSecondary">Selecciona un encargado para ver la liquidación.</p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default TreasuryPage;
