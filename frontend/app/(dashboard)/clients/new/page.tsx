// frontend/app/(dashboard)/clients/new/page.tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import api from "../../../../lib/api";
import { useAuthStore, type UserRole } from "../../../../store/authStore";

interface RouteItem {
  id: string;
  name: string;
}

interface ClientItem {
  id: string;
  routeId: string;
}

interface RouteDetailResponse {
  data: {
    id: string;
    name: string;
  };
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

const createClientSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().min(7).max(20).optional().or(z.literal("").transform(() => undefined)),
  password: z
    .string()
    .min(8)
    .max(64)
    .regex(/[A-Z]/, "Debe incluir una mayúscula")
    .regex(/[a-z]/, "Debe incluir una minúscula")
    .regex(/[0-9]/, "Debe incluir un número")
    .regex(/[^A-Za-z0-9]/, "Debe incluir un símbolo"),
  routeId: z.string().cuid().optional()
});

type CreateClientFormData = z.infer<typeof createClientSchema>;

const ClientsNewPage = (): JSX.Element => {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const role: UserRole = user?.roles[0] ?? "CLIENT";

  const canCreate = role === "ADMIN" || role === "SUPER_ADMIN" || role === "ROUTE_MANAGER";
  const isAdminView = role === "ADMIN" || role === "SUPER_ADMIN";

  const routesQuery = useQuery({
    queryKey: ["routes-list"],
    queryFn: async (): Promise<ListResponse<RouteItem>> => {
      const response = await api.get<ListResponse<RouteItem>>("/routes");
      return response.data;
    },
    enabled: isAdminView
  });

  const clientsForInferenceQuery = useQuery({
    queryKey: ["clients-inference-routeId"],
    queryFn: async (): Promise<ListResponse<ClientItem>> => {
      const response = await api.get<ListResponse<ClientItem>>("/clients");
      return response.data;
    },
    enabled: role === "ROUTE_MANAGER"
  });

  const inferredRouteId = clientsForInferenceQuery.data?.data[0]?.routeId ?? "";

  const routeDetailQuery = useQuery({
    queryKey: ["route-detail-for-client-create", inferredRouteId],
    queryFn: async (): Promise<RouteDetailResponse> => {
      const response = await api.get<RouteDetailResponse>(`/routes/${inferredRouteId}`);
      return response.data;
    },
    enabled: !isAdminView && Boolean(inferredRouteId)
  });

  const form = useForm<CreateClientFormData>({
    resolver: zodResolver(createClientSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      password: "",
      routeId: isAdminView ? "" : inferredRouteId || ""
    },
    mode: "onChange"
  });

  useEffect(() => {
    if (role === "ROUTE_MANAGER" && inferredRouteId) {
      form.setValue("routeId", inferredRouteId, { shouldValidate: true, shouldDirty: true });
    }
  }, [form, inferredRouteId, role]);

  const onSubmit = async (values: CreateClientFormData): Promise<void> => {
    if (!canCreate) {
      return;
    }

    const routeId = values.routeId ?? inferredRouteId;
    if (!routeId) {
      form.setError("routeId", { type: "manual", message: "No pudimos inferir tu ruta. Selecciona una ruta." });
      return;
    }

    try {
      const response = await api.post("/clients", {
        name: values.name,
        email: values.email,
        phone: values.phone ? values.phone : undefined,
        password: values.password,
        routeId
      });

      const created = response.data.data as { id: string };
      router.push(`/clients/${created.id}`);
    } catch (error) {
      const message = getErrorMessage(error);
      form.setError("email", { type: "manual", message });
    }
  };

  if (!canCreate) {
    return (
      <section className="rounded-xl border border-border bg-surface p-6">
        <p className="text-sm text-danger">No tienes permisos para crear clientes.</p>
        <div className="mt-4">
          <Link href="/clients" className="text-primary hover:underline">
            Volver
          </Link>
        </div>
      </section>
    );
  }

  const routes = routesQuery.data?.data ?? [];

  return (
    <section className="space-y-4">
      <header className="rounded-xl border border-border bg-surface p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-semibold">Crear cliente</h1>
            <p className="mt-1 text-sm text-textSecondary">Registra un nuevo tomador de deuda.</p>
          </div>
          <Link href="/clients" className="text-primary hover:underline">
            Volver a clientes
          </Link>
        </div>
      </header>

      <div className="rounded-xl border border-border bg-surface p-6">
        {isAdminView && routesQuery.isLoading ? <p className="text-sm text-textSecondary">Cargando rutas...</p> : null}
        {isAdminView && routesQuery.isError ? (
          <p className="text-sm text-danger">No fue posible cargar las rutas.</p>
        ) : null}

        {(!isAdminView || routesQuery.data) ? (
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <div>
              <label htmlFor="name" className="mb-1 block text-sm text-textSecondary">
                Nombre
              </label>
              <input
                id="name"
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
                {...form.register("name")}
              />
              <p className="mt-1 text-xs text-danger">{form.formState.errors.name?.message}</p>
            </div>

            <div>
              <label htmlFor="email" className="mb-1 block text-sm text-textSecondary">
                Email
              </label>
              <input
                id="email"
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
                {...form.register("email")}
              />
              <p className="mt-1 text-xs text-danger">{form.formState.errors.email?.message}</p>
            </div>

            <div>
              <label htmlFor="phone" className="mb-1 block text-sm text-textSecondary">
                Teléfono (opcional)
              </label>
              <input
                id="phone"
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
                {...form.register("phone")}
              />
              <p className="mt-1 text-xs text-danger">{form.formState.errors.phone?.message}</p>
            </div>

            <div>
              <label htmlFor="password" className="mb-1 block text-sm text-textSecondary">
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
                {...form.register("password")}
              />
              <p className="mt-1 text-xs text-danger">{form.formState.errors.password?.message}</p>
            </div>

            {isAdminView ? (
              <div>
                <label htmlFor="routeId" className="mb-1 block text-sm text-textSecondary">
                  Ruta
                </label>
                <select
                  id="routeId"
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
                  value={form.watch("routeId") ?? ""}
                  onChange={(e) => form.setValue("routeId", e.target.value, { shouldValidate: true })}
                >
                  <option value="">Selecciona una ruta</option>
                  {routes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-danger">{form.formState.errors.routeId?.message}</p>
              </div>
            ) : (
              <div>
                <label htmlFor="routeId" className="mb-1 block text-sm text-textSecondary">
                  Ruta (automática)
                </label>
                <input
                  id="routeId"
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
                  value={
                    routeDetailQuery.isLoading
                      ? ""
                      : routeDetailQuery.data?.data.name ?? "Ruta no disponible"
                  }
                  readOnly
                />
                <p className="mt-1 text-xs text-danger">{form.formState.errors.routeId?.message}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={form.formState.isSubmitting || !form.formState.isValid}
              className="w-full rounded-md bg-primary px-4 py-2 font-medium text-white disabled:opacity-50"
            >
              {form.formState.isSubmitting ? "Creando..." : "Crear cliente"}
            </button>
          </form>
        ) : null}
      </div>
    </section>
  );
};

export default ClientsNewPage;

