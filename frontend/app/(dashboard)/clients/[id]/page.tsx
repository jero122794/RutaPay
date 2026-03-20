// frontend/app/(dashboard)/clients/[id]/page.tsx
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import api from "../../../../lib/api";
import { useAuthStore, type UserRole } from "../../../../store/authStore";
import { useMemo } from "react";

interface ClientDetail {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  routeId: string;
  routeName: string;
  managerId: string;
  managerName: string;
}

interface ClientResponse {
  data: ClientDetail;
}

const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: string } | undefined)?.message;
    return message ?? error.message;
  }
  return "Error desconocido.";
};

const ClientProfilePage = (): JSX.Element => {
  const params = useParams<{ id: string }>();
  const user = useAuthStore((state) => state.user);
  const role: UserRole = user?.roles[0] ?? "CLIENT";

  const clientId = params.id;

  const query = useQuery({
    queryKey: ["client-detail", clientId],
    queryFn: async (): Promise<ClientResponse> => {
      const response = await api.get<ClientResponse>(`/clients/${clientId}`);
      return response.data;
    },
    enabled: Boolean(clientId)
  });

  const badge = useMemo(() => {
    if (!query.data?.data) return null;
    return query.data.data.isActive ? (
      <span className="rounded-full bg-success/10 px-2 py-1 text-xs text-success">Activo</span>
    ) : (
      <span className="rounded-full bg-danger/10 px-2 py-1 text-xs text-danger">Inactivo</span>
    );
  }, [query.data]);

  return (
    <section className="space-y-4">
      <header className="rounded-xl border border-border bg-surface p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-semibold">Perfil del cliente</h1>
            <p className="mt-1 text-sm text-textSecondary">
              {role === "CLIENT" ? "Tu información" : "Detalle administrativo"}
            </p>
          </div>
          <Link href="/clients" className="text-primary hover:underline">
            Volver a clientes
          </Link>
        </div>
      </header>

      {query.isLoading ? (
        <div className="rounded-xl border border-border bg-surface p-6">
          <p className="text-sm text-textSecondary">Cargando perfil...</p>
        </div>
      ) : null}

      {query.isError ? (
        <div className="rounded-xl border border-border bg-surface p-6">
          <p className="text-sm text-danger">{getErrorMessage(query.error)}</p>
        </div>
      ) : null}

      {query.data?.data ? (
        <div className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-surface p-6 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-textSecondary">Nombre</p>
            <p className="text-base font-medium text-textPrimary">{query.data.data.name}</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-textSecondary">Estado</p>
            <div className="flex items-center gap-2">{badge}</div>
          </div>

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-textSecondary">Email</p>
            <p className="text-base font-medium text-textPrimary">{query.data.data.email}</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-textSecondary">Teléfono</p>
            <p className="text-base font-medium text-textPrimary">
              {query.data.data.phone ?? "-"}
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-textSecondary">Ruta</p>
            <p className="text-base font-medium text-textPrimary">{query.data.data.routeName}</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-textSecondary">Manager</p>
            <p className="text-base font-medium text-textPrimary">{query.data.data.managerName}</p>
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default ClientProfilePage;

