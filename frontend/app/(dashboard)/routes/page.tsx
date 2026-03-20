// frontend/app/(dashboard)/routes/page.tsx
"use client";

import axios from "axios";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import api from "../../../lib/api";
import { useAuthStore, type UserRole } from "../../../store/authStore";
import { formatCOP } from "../../../lib/formatters";

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
  createdAt: Date;
  updatedAt: Date;
}

interface ApiErrorShape {
  message?: string;
}

const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const msg = (error.response?.data as ApiErrorShape | undefined)?.message;
    return msg ?? error.message;
  }
  return "Error desconocido.";
};

const RoutesPage = (): JSX.Element => {
  const user = useAuthStore((state) => state.user);
  const role: UserRole = user?.roles[0] ?? "CLIENT";
  const canView = role === "ADMIN" || role === "SUPER_ADMIN";
  const canCreate = canView;

  const routesQuery = useQuery({
    queryKey: ["routes-list"],
    queryFn: async (): Promise<ListResponse<RouteItem>> => {
      const response = await api.get<ListResponse<RouteItem>>("/routes");
      return response.data;
    },
    enabled: canView
  });

  if (!canView) {
    return (
      <section className="rounded-xl border border-border bg-surface p-6">
        <h1 className="text-xl font-semibold">Rutas</h1>
        <p className="mt-2 text-sm text-danger">No tienes permisos para ver rutas.</p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <header className="rounded-xl border border-border bg-surface p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-semibold">Rutas</h1>
            <p className="mt-1 text-sm text-textSecondary">Listado y balance por ruta.</p>
          </div>
          {canCreate ? (
            <Link
              href="/routes/new"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-95"
            >
              Crear ruta
            </Link>
          ) : null}
        </div>
      </header>

      {routesQuery.isLoading ? (
        <div className="rounded-xl border border-border bg-surface p-6">
          <p className="text-sm text-textSecondary">Cargando rutas...</p>
        </div>
      ) : null}

      {routesQuery.isError ? (
        <div className="rounded-xl border border-border bg-surface p-6">
          <p className="text-sm text-danger">{getErrorMessage(routesQuery.error)}</p>
        </div>
      ) : null}

      {routesQuery.data ? (
        <div className="rounded-xl border border-border bg-surface p-4">
          {routesQuery.data.data.length === 0 ? (
            <div className="rounded-lg border border-border bg-bg p-6">
              <p className="text-sm text-textSecondary">No hay rutas registradas.</p>
            </div>
          ) : (
            <div className="rutapay-table-wrap">
              <table className="rutapay-table">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                      Ruta
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                      Manager
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-textSecondary">
                      Balance
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-textSecondary">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {routesQuery.data.data.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-3 py-3 text-sm font-medium text-textPrimary">{r.name}</td>
                      <td className="px-3 py-3 text-sm text-textSecondary">{r.managerId}</td>
                      <td className="px-3 py-3 text-right text-sm text-textPrimary">{formatCOP(r.balance)}</td>
                      <td className="px-3 py-3 text-right">
                        <Link
                          href={`/routes/${r.id}`}
                          className="text-sm text-primary hover:underline"
                        >
                          Ver resumen
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
};

export default RoutesPage;
