// frontend/app/(dashboard)/routes/new/page.tsx
"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import axios from "axios";
import api from "../../../../lib/api";
import { useAuthStore, type UserRole } from "../../../../store/authStore";

const createRouteSchema = z.object({
  name: z.string().min(2).max(120),
  managerId: z.string().cuid()
});

type CreateRouteFormValues = z.infer<typeof createRouteSchema>;

interface ListResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

interface UserItem {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  roles: string[];
}

interface RouteCreateResponse {
  data: {
    id: string;
    name: string;
    managerId: string;
    balance: number;
  };
  message: string;
}

const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: string } | undefined)?.message;
    return message ?? error.message;
  }
  return "Error desconocido.";
};

const RoutesNewPage = (): JSX.Element => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const role: UserRole = user?.roles[0] ?? "CLIENT";

  const canCreate = role === "ADMIN" || role === "SUPER_ADMIN";

  const usersQuery = useQuery({
    queryKey: ["users-route-managers"],
    queryFn: async (): Promise<ListResponse<UserItem>> => {
      const response = await api.get<ListResponse<UserItem>>("/users");
      return response.data;
    },
    enabled: canCreate
  });

  // Note: no need to filter by assigned routes since we support multiple routes per ROUTE_MANAGER.

  const routeManagers = useMemo(() => {
    const items = usersQuery.data?.data ?? [];
    return items.filter(
      (u) => u.roles.includes("ROUTE_MANAGER") && u.isActive
    );
  }, [usersQuery.data]);

  const form = useForm<CreateRouteFormValues>({
    resolver: zodResolver(createRouteSchema),
    defaultValues: {
      name: "",
      managerId: ""
    },
    mode: "onChange"
  });

  const createMutation = useMutation({
    mutationFn: async (values: CreateRouteFormValues): Promise<RouteCreateResponse> => {
      return api.post<RouteCreateResponse>("/routes", values).then((r) => r.data);
    },
    onSuccess: async (payload) => {
      await queryClient.invalidateQueries({ queryKey: ["routes-list"] });
      router.push(`/routes/${payload.data.id}`);
    }
  });

  if (!canCreate) {
    return (
      <section className="rounded-xl border border-border bg-surface p-6">
        <h1 className="text-xl font-semibold">Crear ruta</h1>
        <p className="mt-2 text-sm text-danger">No tienes permisos para crear rutas.</p>
        <div className="mt-4">
          <Link href="/routes" className="text-primary hover:underline">
            Volver a rutas
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
            <h1 className="text-xl font-semibold">Crear ruta</h1>
            <p className="mt-1 text-sm text-textSecondary">Asocia la ruta a un encargado de ruta (ROUTE_MANAGER).</p>
          </div>
          <Link href="/routes" className="text-primary hover:underline">
            Volver a rutas
          </Link>
        </div>
      </header>

      {usersQuery.isLoading ? (
        <div className="rounded-xl border border-border bg-surface p-6">
          <p className="text-sm text-textSecondary">Cargando encargados...</p>
        </div>
      ) : null}

      {usersQuery.isError ? (
        <div className="rounded-xl border border-border bg-surface p-6">
          <p className="text-sm text-danger">{getErrorMessage(usersQuery.error)}</p>
        </div>
      ) : null}

      {routeManagers.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-6">
          <p className="text-sm text-danger">
            No hay usuarios con rol <span className="font-semibold">ROUTE_MANAGER</span> activos.
          </p>
          <p className="mt-2 text-sm text-textSecondary">
            Pide a un SUPER_ADMIN que asigne ese rol (módulo de Usuarios).
          </p>
        </div>
      ) : null}

      {routeManagers.length > 0 ? (
        <div className="rounded-xl border border-border bg-surface p-6">
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit(async (values) => {
              await createMutation.mutateAsync(values);
            })}
          >
            <div>
              <label htmlFor="name" className="mb-1 block text-sm text-textSecondary">
                Nombre de la ruta
              </label>
              <input
                id="name"
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
                {...form.register("name")}
              />
              <p className="mt-1 text-xs text-danger">{form.formState.errors.name?.message}</p>
            </div>

            <div>
              <label htmlFor="managerId" className="mb-1 block text-sm text-textSecondary">
                Encargado de ruta
              </label>
              <select
                id="managerId"
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
                {...form.register("managerId")}
              >
                <option value="">Selecciona un encargado</option>
                {routeManagers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.email})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-danger">{form.formState.errors.managerId?.message}</p>
            </div>

            {createMutation.isError ? (
              <p className="text-sm text-danger">{getErrorMessage(createMutation.error)}</p>
            ) : null}

            <button
              type="submit"
              disabled={createMutation.isPending || !form.formState.isValid}
              className="w-full rounded-md bg-primary px-4 py-2 font-medium text-white disabled:opacity-50"
            >
              {createMutation.isPending ? "Creando..." : "Crear ruta"}
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
};

export default RoutesNewPage;

