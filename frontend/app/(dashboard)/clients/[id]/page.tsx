// frontend/app/(dashboard)/clients/[id]/page.tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import api from "../../../../lib/api";
import { getEffectiveRoles, pickPrimaryRole } from "../../../../lib/effective-roles";
import { useAuthStore, type UserRole } from "../../../../store/authStore";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

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

  const badge = useMemo(() => {
    if (!query.data?.data) return null;
    return query.data.data.isActive ? (
      <span className="rounded-full bg-success/10 px-2 py-1 text-xs text-success">Activo</span>
    ) : (
      <span className="rounded-full bg-danger/10 px-2 py-1 text-xs text-danger">Inactivo</span>
    );
  }, [query.data]);

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
    if (!query.data?.data) return;
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
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
              <p className="text-base font-medium text-textPrimary">{query.data.data.email ?? "-"}</p>
            </div>
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-textSecondary">Acceso a la app</p>
              <p className="text-base font-medium text-textPrimary">
                {query.data.data.canLoginApp
                  ? "Habilitado (puede iniciar sesión)"
                  : "Sin acceso — define contraseña al editar"}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-textSecondary">Teléfono</p>
              <p className="text-base font-medium text-textPrimary">
                {query.data.data.phone ?? "-"}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-textSecondary">Documento</p>
              <p className="text-base font-medium text-textPrimary">{query.data.data.documentId ?? "-"}</p>
            </div>
            <div className="space-y-2 md:col-span-2">
              <p className="text-xs uppercase tracking-wider text-textSecondary">Dirección</p>
              <p className="text-base font-medium text-textPrimary">{query.data.data.address ?? "-"}</p>
            </div>
            <div className="space-y-2 md:col-span-2">
              <p className="text-xs uppercase tracking-wider text-textSecondary">Descripción</p>
              <p className="text-base font-medium text-textPrimary">{query.data.data.description ?? "-"}</p>
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

          {canEditClient ? (
            <form
              className="space-y-3 rounded-xl border border-border bg-surface p-6"
              onSubmit={form.handleSubmit(async (values) => {
                await updateMutation.mutateAsync(values);
              })}
            >
              <h2 className="text-lg font-semibold">Editar cliente</h2>
              {!query.data.data.canLoginApp ? (
                <p className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                  Este cliente aún no puede iniciar sesión. Agrega una contraseña (y opcionalmente correo) y
                  guarda para habilitar el acceso; puede entrar con documento o correo según lo que registres.
                </p>
              ) : null}
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
                  Correo (opcional)
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
                  {...form.register("email")}
                />
                <p className="mt-1 text-xs text-danger">{form.formState.errors.email?.message}</p>
              </div>
              <div>
                <label htmlFor="password" className="mb-1 block text-sm text-textSecondary">
                  Nueva contraseña (opcional)
                </label>
                <p className="mb-1 text-xs text-textSecondary">
                  Solo completa este campo si quieres definir o cambiar la contraseña de acceso. Déjalo vacío
                  para no modificarla.
                </p>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
                  {...form.register("password")}
                />
                <p className="mt-1 text-xs text-danger">{form.formState.errors.password?.message}</p>
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
                <label htmlFor="address" className="mb-1 block text-sm text-textSecondary">
                  Dirección
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
                  Descripción
                </label>
                <textarea
                  id="description"
                  rows={3}
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
                  {...form.register("description")}
                />
                <p className="mt-1 text-xs text-danger">{form.formState.errors.description?.message}</p>
              </div>
              <label className="flex items-center justify-between text-sm text-textSecondary">
                Activo
                <input type="checkbox" {...form.register("isActive")} />
              </label>
              <button
                type="submit"
                disabled={updateMutation.isPending}
                className="w-full rounded-md bg-primary px-4 py-2 font-medium text-white disabled:opacity-50"
              >
                {updateMutation.isPending ? "Guardando..." : "Guardar cambios"}
              </button>
              {updateMutation.isError ? (
                <p className="text-sm text-danger">{getErrorMessage(updateMutation.error)}</p>
              ) : null}
            </form>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};

export default ClientProfilePage;

