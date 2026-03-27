// frontend/app/(dashboard)/clients/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import TablePagination from "../../../components/ui/TablePagination";
import { DEFAULT_PAGE_SIZE, type PageSize } from "../../../lib/page-size";
import { getEffectiveRoles, pickPrimaryRole } from "../../../lib/effective-roles";
import { useAuthStore, type UserRole } from "../../../store/authStore";
import api from "../../../lib/api";
import axios from "axios";

interface ClientItem {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  routeId: string;
  routeName: string;
  managerId: string;
}

interface ListResponse<T> {
  data: T[];
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

const ClientsPage = (): JSX.Element => {
  const user = useAuthStore((state) => state.user);
  const role: UserRole = pickPrimaryRole(getEffectiveRoles(user));
  const canCreate = role === "ADMIN" || role === "SUPER_ADMIN" || role === "ROUTE_MANAGER";

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<PageSize>(DEFAULT_PAGE_SIZE);

  const clientsQuery = useQuery({
    queryKey: ["clients-list", page, limit],
    queryFn: async (): Promise<ListResponse<ClientItem>> => {
      const response = await api.get<ListResponse<ClientItem>>("/clients", {
        params: { page, limit }
      });
      return response.data;
    },
    enabled: role !== "CLIENT"
  });

  useEffect(() => {
    const d = clientsQuery.data;
    if (!d) return;
    if (d.page !== page) setPage(d.page);
  }, [clientsQuery.data, page]);

  return (
    <section className="space-y-4">
      <header className="rounded-xl border border-border bg-surface p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-semibold">Clientes</h1>
            <p className="mt-1 text-sm text-textSecondary">Lista y perfil de tus clientes.</p>
          </div>
          {canCreate ? (
            <Link
              href="/clients/new"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-95"
            >
              Crear cliente
            </Link>
          ) : null}
        </div>
      </header>

      {role === "CLIENT" ? (
        <div className="rounded-xl border border-border bg-surface p-6">
          <p className="text-sm text-danger">No tienes permisos para ver la lista de clientes.</p>
        </div>
      ) : null}

      {clientsQuery.isLoading ? (
        <div className="rounded-xl border border-border bg-surface p-6">
          <p className="text-sm text-textSecondary">Cargando clientes...</p>
        </div>
      ) : null}

      {clientsQuery.isError ? (
        <div className="rounded-xl border border-border bg-surface p-6">
          <p className="text-sm text-danger">{getErrorMessage(clientsQuery.error)}</p>
        </div>
      ) : null}

      {!clientsQuery.isLoading && !clientsQuery.isError && clientsQuery.data ? (
        <div className="rounded-xl border border-border bg-surface p-4">
          {clientsQuery.data.total === 0 ? (
            <div className="rounded-lg border border-border bg-bg p-6">
              <p className="text-sm text-textSecondary">No hay clientes registrados.</p>
            </div>
          ) : (
            <>
            <div className="rutapay-table-wrap">
              <table className="rutapay-table">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                      Nombre
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                      Email
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                      Ruta
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                      Estado
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-textSecondary">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {clientsQuery.data.data.map((client) => {
                    return (
                      <tr key={client.id} className="border-t border-border">
                        <td className="px-3 py-3 text-sm">{client.name}</td>
                        <td className="px-3 py-3 text-sm text-textSecondary">{client.email}</td>
                        <td className="px-3 py-3 text-sm text-textSecondary">{client.routeName}</td>
                        <td className="px-3 py-3 text-sm">
                          {client.isActive ? (
                            <span className="rounded-full bg-success/10 px-2 py-1 text-xs text-success">Activo</span>
                          ) : (
                            <span className="rounded-full bg-danger/10 px-2 py-1 text-xs text-danger">
                              Inactivo
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <Link
                            href={`/clients/${client.id}`}
                            className="text-sm text-primary hover:underline"
                          >
                            Ver perfil
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <TablePagination
              page={page}
              limit={limit}
              total={clientsQuery.data.total}
              onPageChange={setPage}
              onLimitChange={(next) => {
                setLimit(next);
                setPage(1);
              }}
            />
            </>
          )}
        </div>
      ) : null}
    </section>
  );
};

export default ClientsPage;
