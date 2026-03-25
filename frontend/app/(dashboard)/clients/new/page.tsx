// frontend/app/(dashboard)/clients/new/page.tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import api from "../../../../lib/api";
import { getEffectiveRoles } from "../../../../lib/effective-roles";
import { useAuthStore, type UserRole } from "../../../../store/authStore";

interface RouteItem {
  id: string;
  name: string;
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
  phone: z.string().min(7).max(20),
  documentId: z.string().min(5, "Documento requerido"),
  email: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? undefined : v),
    z.string().email("Correo inválido").optional()
  ),
  address: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? undefined : v),
    z.string().max(160).optional()
  ),
  description: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? undefined : v),
    z.string().max(300).optional()
  ),
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
  const roles = useMemo((): UserRole[] => getEffectiveRoles(user), [user?.roles, user?.id]);
  const hasRole = (r: UserRole): boolean => roles.includes(r);

  const canCreate =
    hasRole("ADMIN") || hasRole("SUPER_ADMIN") || hasRole("ROUTE_MANAGER");
  const isAdminView = hasRole("ADMIN") || hasRole("SUPER_ADMIN");
  const isRouteManagerView = hasRole("ROUTE_MANAGER");

  const routesQuery = useQuery({
    queryKey: [isAdminView ? "routes-list" : "routes-me-for-client-create"],
    queryFn: async (): Promise<ListResponse<RouteItem>> => {
      const endpoint = isAdminView ? "/routes" : "/routes/me";
      const response = await api.get<ListResponse<RouteItem>>(endpoint);
      return response.data;
    },
    enabled: isAdminView || isRouteManagerView
  });

  const managerRoutes = routesQuery.data?.data ?? [];
  const defaultRouteIdForManager = managerRoutes[0]?.id ?? "";

  const form = useForm<CreateClientFormData>({
    resolver: zodResolver(createClientSchema),
    defaultValues: {
      name: "",
      phone: "",
      documentId: "",
      email: "",
      address: "",
      description: "",
      password: "",
      routeId: isAdminView ? "" : defaultRouteIdForManager
    },
    mode: "onChange"
  });

  useEffect(() => {
    if (!isRouteManagerView) {
      return;
    }
    const selected = form.getValues("routeId");
    if (!selected && defaultRouteIdForManager) {
      form.setValue("routeId", defaultRouteIdForManager, { shouldValidate: true, shouldDirty: true });
    }
  }, [defaultRouteIdForManager, form, isRouteManagerView]);

  const onSubmit = async (values: CreateClientFormData): Promise<void> => {
    if (!canCreate) {
      return;
    }

    const routeId = values.routeId;
    if (!routeId) {
      form.setError("routeId", { type: "manual", message: "Selecciona una ruta para el cliente." });
      return;
    }

    try {
      const response = await api.post("/clients", {
        name: values.name,
        phone: values.phone,
        documentId: values.documentId,
        password: values.password,
        routeId,
        ...(values.email?.trim() ? { email: values.email.trim() } : {}),
        ...(values.address?.trim() ? { address: values.address.trim() } : {}),
        ...(values.description?.trim() ? { description: values.description.trim() } : {})
      });

      const created = response.data.data as { id: string };
      router.push(`/clients/${created.id}`);
    } catch (error) {
      const message = getErrorMessage(error);
      form.setError("documentId", { type: "manual", message });
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
        {(isAdminView || isRouteManagerView) && routesQuery.isLoading ? (
          <p className="text-sm text-textSecondary">Cargando rutas...</p>
        ) : null}
        {(isAdminView || isRouteManagerView) && routesQuery.isError ? (
          <p className="text-sm text-danger">No fue posible cargar las rutas.</p>
        ) : null}

        {routesQuery.isSuccess || routesQuery.isError ? (
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
              <label htmlFor="phone" className="mb-1 block text-sm text-textSecondary">
                Teléfono
              </label>
              <input
                id="phone"
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
                {...form.register("phone")}
              />
              <p className="mt-1 text-xs text-danger">{form.formState.errors.phone?.message}</p>
            </div>

            <div>
              <label htmlFor="documentId" className="mb-1 block text-sm text-textSecondary">
                Documento de identidad
              </label>
              <input
                id="documentId"
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
                {...form.register("documentId")}
              />
              <p className="mt-1 text-xs text-danger">{form.formState.errors.documentId?.message}</p>
            </div>

            <div>
              <label htmlFor="email" className="mb-1 block text-sm text-textSecondary">
                Correo (opcional)
              </label>
              <input
                id="email"
                type="email"
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
                {...form.register("email")}
              />
              <p className="mt-1 text-xs text-danger">{form.formState.errors.email?.message}</p>
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

            <div>
              <label htmlFor="address" className="mb-1 block text-sm text-textSecondary">
                Dirección (opcional)
              </label>
              <input
                id="address"
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
                {...form.register("address")}
              />
              <p className="mt-1 text-xs text-danger">{form.formState.errors.address?.message}</p>
            </div>

            <div>
              <label htmlFor="description" className="mb-1 block text-sm text-textSecondary">
                Descripción (opcional)
              </label>
              <textarea
                id="description"
                rows={3}
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
                {...form.register("description")}
              />
              <p className="mt-1 text-xs text-danger">{form.formState.errors.description?.message}</p>
            </div>

            {isAdminView || isRouteManagerView ? (
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
                  {managerRoutes.map((r) => (
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
                  value="Ruta no disponible"
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

