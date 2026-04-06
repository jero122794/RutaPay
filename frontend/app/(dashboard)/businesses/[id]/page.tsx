// frontend/app/(dashboard)/businesses/[id]/page.tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../../../../lib/api";
import { getEffectiveRoles, pickPrimaryRole } from "../../../../lib/effective-roles";
import { useAuthStore, type UserRole } from "../../../../store/authStore";

const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: string } | undefined)?.message;
    return message ?? error.message;
  }
  return "Error desconocido.";
};

interface BusinessDetail {
  id: string;
  name: string;
  licenseStartsAt: string | null;
  licenseEndsAt: string | null;
  createdAt: string;
  updatedAt: string;
  members: Array<{
    userId: string;
    name: string;
    email: string | null;
    roles: string[];
  }>;
}

interface AssignableUser {
  id: string;
  name: string;
  email: string | null;
  businessId: string | null;
  businessName: string | null;
  roles: string[];
}

const nameSchema = z.object({
  name: z.string().min(2).max(120)
});

const assignSchema = z.object({
  userId: z.string().cuid(),
  role: z.enum(["ADMIN", "ROUTE_MANAGER", "CLIENT"])
});

const firstAdminSchema = z
  .object({
    name: z.string().min(2, "Nombre requerido"),
    email: z.string().email("Correo inválido"),
    password: z
      .string()
      .min(8, "Mínimo 8 caracteres")
      .regex(/[A-Z]/, "Debe incluir una mayúscula")
      .regex(/[a-z]/, "Debe incluir una minúscula")
      .regex(/[0-9]/, "Debe incluir un número")
      .regex(/[^A-Za-z0-9]/, "Debe incluir un símbolo"),
    confirmPassword: z.string()
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmPassword"]
  });

type NameForm = z.infer<typeof nameSchema>;
type AssignForm = z.infer<typeof assignSchema>;
type FirstAdminForm = z.infer<typeof firstAdminSchema>;

const licenseSchema = z
  .object({
    months: z.union([z.coerce.number().int().positive(), z.literal("")]).optional(),
    years: z.union([z.coerce.number().int().positive(), z.literal("")]).optional()
  })
  .refine((data) => Boolean(data.months) !== Boolean(data.years), {
    message: "Ingresa meses o años (solo uno)."
  });

type LicenseForm = z.infer<typeof licenseSchema>;

const roleLabel = (r: string): string => {
  switch (r) {
    case "ADMIN":
      return "Administrador";
    case "ROUTE_MANAGER":
      return "Encargado de ruta";
    case "CLIENT":
      return "Cliente";
    default:
      return r;
  }
};

const BusinessDetailPage = (): JSX.Element => {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const user = useAuthStore((state) => state.user);
  const role: UserRole = pickPrimaryRole(getEffectiveRoles(user));
  const queryClient = useQueryClient();

  const detailQuery = useQuery({
    queryKey: ["business", id],
    queryFn: async (): Promise<BusinessDetail> => {
      const res = await api.get<{ data: BusinessDetail }>(`/businesses/${id}`);
      return res.data.data;
    },
    enabled: Boolean(id) && role === "SUPER_ADMIN"
  });

  const assignableQuery = useQuery({
    queryKey: ["business-assignable-users"],
    queryFn: async (): Promise<AssignableUser[]> => {
      const res = await api.get<{ data: AssignableUser[] }>("/businesses/assignable-users");
      return res.data.data;
    },
    enabled: role === "SUPER_ADMIN" && Boolean(id)
  });

  const nameForm = useForm<NameForm>({
    resolver: zodResolver(nameSchema),
    values: detailQuery.data ? { name: detailQuery.data.name } : { name: "" }
  });

  const assignForm = useForm<AssignForm>({
    resolver: zodResolver(assignSchema),
    defaultValues: { userId: "", role: "ROUTE_MANAGER" }
  });

  const firstAdminForm = useForm<FirstAdminForm>({
    resolver: zodResolver(firstAdminSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: ""
    }
  });

  const licenseForm = useForm<LicenseForm>({
    resolver: zodResolver(licenseSchema),
    defaultValues: { months: "", years: "" }
  });

  const updateNameMutation = useMutation({
    mutationFn: async (values: NameForm): Promise<void> => {
      await api.patch(`/businesses/${id}`, values);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["business", id] });
      await queryClient.invalidateQueries({ queryKey: ["businesses"] });
    }
  });

  const assignMutation = useMutation({
    mutationFn: async (values: AssignForm): Promise<void> => {
      await api.post(`/businesses/${id}/members`, values);
    },
    onSuccess: async () => {
      assignForm.reset({ userId: "", role: "ROUTE_MANAGER" });
      await queryClient.invalidateQueries({ queryKey: ["business", id] });
      await queryClient.invalidateQueries({ queryKey: ["business-assignable-users"] });
    }
  });

  const firstAdminMutation = useMutation({
    mutationFn: async (values: FirstAdminForm): Promise<void> => {
      const { confirmPassword: _confirm, ...body } = values;
      await api.post(`/businesses/${id}/first-admin`, body);
    },
    onSuccess: async () => {
      firstAdminForm.reset({
        name: "",
        email: "",
        password: "",
        confirmPassword: ""
      });
      await queryClient.invalidateQueries({ queryKey: ["business", id] });
      await queryClient.invalidateQueries({ queryKey: ["business-assignable-users"] });
    }
  });

  const removeMutation = useMutation({
    mutationFn: async (userId: string): Promise<void> => {
      await api.delete(`/businesses/${id}/members/${userId}`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["business", id] });
      await queryClient.invalidateQueries({ queryKey: ["business-assignable-users"] });
    }
  });

  const reconcileMutation = useMutation({
    mutationFn: async (): Promise<{ routesAligned: number; clientUsersAligned: number }> => {
      const res = await api.post<{
        data: { routesAligned: number; clientUsersAligned: number };
        message?: string;
      }>(`/businesses/${id}/reconcile-scope`);
      return res.data.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["business", id] });
      await queryClient.invalidateQueries({ queryKey: ["business-assignable-users"] });
    }
  });

  const licenseMutation = useMutation({
    mutationFn: async (values: LicenseForm): Promise<void> => {
      const months = typeof values.months === "number" ? values.months : undefined;
      const years = typeof values.years === "number" ? values.years : undefined;
      await api.post(`/businesses/${id}/license`, { months, years });
    },
    onSuccess: async () => {
      licenseForm.reset({ months: "", years: "" });
      await queryClient.invalidateQueries({ queryKey: ["business", id] });
      await queryClient.invalidateQueries({ queryKey: ["businesses"] });
    }
  });

  if (role !== "SUPER_ADMIN") {
    return (
      <section className="rounded-xl border border-border bg-surface p-6">
        <p className="text-sm text-danger">Solo el super administrador puede editar negocios.</p>
        <Link href="/overview" className="mt-4 inline-block text-primary hover:underline">
          Volver
        </Link>
      </section>
    );
  }

  if (!id) {
    return (
      <p className="text-sm text-danger">Identificador de negocio inválido.</p>
    );
  }

  return (
    <section className="space-y-6">
      <header className="rounded-xl border border-border bg-surface p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-semibold">
              {detailQuery.data?.name ?? "Negocio"}
            </h1>
            <p className="mt-1 text-xs text-textSecondary">{id}</p>
          </div>
          <Link href="/businesses" className="text-sm text-primary hover:underline">
            ← Volver a negocios
          </Link>
        </div>
      </header>

      {detailQuery.isLoading ? <p className="text-sm text-textSecondary">Cargando...</p> : null}
      {detailQuery.isError ? (
        <p className="text-sm text-danger">{getErrorMessage(detailQuery.error)}</p>
      ) : null}

      {detailQuery.data ? (
        <>
          <div className="rounded-xl border border-border bg-surface p-6">
            <h2 className="text-sm font-semibold text-textSecondary">Licencia del negocio</h2>
            <p className="mt-1 text-xs text-textSecondary">
              Define por cuántos meses o años estará habilitado el uso para roles operativos (ADMIN y ROUTE_MANAGER).
              Los CLIENT pueden seguir accediendo.
            </p>
            <div className="mt-3 text-xs text-textSecondary">
              <div>
                <span className="font-medium text-textPrimary">Inicio:</span>{" "}
                {detailQuery.data.licenseStartsAt ? detailQuery.data.licenseStartsAt.slice(0, 10) : "—"}
              </div>
              <div className="mt-1">
                <span className="font-medium text-textPrimary">Vence:</span>{" "}
                {detailQuery.data.licenseEndsAt ? detailQuery.data.licenseEndsAt.slice(0, 10) : "—"}
              </div>
            </div>

            <form
              className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3"
              onSubmit={licenseForm.handleSubmit(async (v) => {
                try {
                  await licenseMutation.mutateAsync(v);
                } catch (e) {
                  licenseForm.setError("root", { message: getErrorMessage(e) });
                }
              })}
            >
              <div>
                <label className="mb-1 block text-xs text-textSecondary">Meses</label>
                <input
                  inputMode="numeric"
                  placeholder="Ej: 12"
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-textPrimary"
                  {...licenseForm.register("months")}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-textSecondary">Años</label>
                <input
                  inputMode="numeric"
                  placeholder="Ej: 1"
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-textPrimary"
                  {...licenseForm.register("years")}
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={licenseMutation.isPending}
                  className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50 sm:w-auto"
                >
                  {licenseMutation.isPending ? "Actualizando..." : "Asignar licencia"}
                </button>
              </div>
              {licenseForm.formState.errors.root?.message ? (
                <p className="sm:col-span-3 text-xs text-danger">{licenseForm.formState.errors.root.message}</p>
              ) : null}
              {!licenseForm.formState.isValid && licenseForm.formState.isSubmitted ? (
                <p className="sm:col-span-3 text-xs text-danger">
                  {licenseForm.formState.errors.months?.message ??
                    licenseForm.formState.errors.years?.message ??
                    "Formulario inválido."}
                </p>
              ) : null}
            </form>
          </div>

          <div className="rounded-xl border border-border bg-surface p-6">
            <h2 className="text-sm font-semibold text-textSecondary">Nombre del negocio</h2>
            <form
              className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end"
              onSubmit={nameForm.handleSubmit(async (v) => {
                try {
                  await updateNameMutation.mutateAsync(v);
                } catch (e) {
                  nameForm.setError("name", { message: getErrorMessage(e) });
                }
              })}
            >
              <div className="flex-1">
                <input
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
                  {...nameForm.register("name")}
                />
                <p className="mt-1 text-xs text-danger">{nameForm.formState.errors.name?.message}</p>
              </div>
              <button
                type="submit"
                disabled={updateNameMutation.isPending}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {updateNameMutation.isPending ? "Guardando..." : "Guardar nombre"}
              </button>
            </form>
          </div>

          <div className="rounded-xl border border-border bg-surface p-6">
            <h2 className="text-sm font-semibold text-textSecondary">Alinear rutas y clientes con el negocio</h2>
            <p className="mt-1 text-xs text-textSecondary">
              Alinea cada ruta con el negocio de su encargado y actualiza el negocio de los clientes en esas rutas.
              Úsalo tras un despliegue o si había datos viejos inconsistentes. Las nuevas asignaciones de miembros ya
              aplican esta lógica en cascada.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                disabled={reconcileMutation.isPending}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-textPrimary hover:bg-white/5 disabled:opacity-50"
                onClick={() => {
                  if (
                    typeof window !== "undefined" &&
                    window.confirm("¿Alinear rutas y clientes de este negocio ahora?")
                  ) {
                    void reconcileMutation.mutateAsync().catch(() => {
                      // error shown below
                    });
                  }
                }}
              >
                {reconcileMutation.isPending ? "Sincronizando..." : "Ejecutar sincronización"}
              </button>
              {reconcileMutation.isSuccess ? (
                <p className="text-xs text-success">
                  Rutas tocadas: {reconcileMutation.data.routesAligned}. Clientes actualizados:{" "}
                  {reconcileMutation.data.clientUsersAligned}.
                </p>
              ) : null}
              {reconcileMutation.isError ? (
                <p className="text-xs text-danger">{getErrorMessage(reconcileMutation.error)}</p>
              ) : null}
            </div>
          </div>

          {detailQuery.data.members.some((m) => m.roles.includes("ADMIN")) ? null : (
            <div className="rounded-xl border border-border bg-surface p-6">
              <h2 className="text-sm font-semibold text-textSecondary">Crear primer administrador</h2>
              <p className="mt-1 text-xs text-textSecondary">
                Crea la cuenta del administrador de este negocio (correo y contraseña para iniciar sesión). Solo
                puedes usar este bloque mientras el negocio no tenga ningún usuario con rol Administrador.
              </p>
              <form
                className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2"
                onSubmit={firstAdminForm.handleSubmit(async (v) => {
                  try {
                    await firstAdminMutation.mutateAsync(v);
                  } catch (e) {
                    firstAdminForm.setError("root", { message: getErrorMessage(e) });
                  }
                })}
              >
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs text-textSecondary">Nombre completo</label>
                  <input
                    type="text"
                    autoComplete="name"
                    className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-textPrimary"
                    {...firstAdminForm.register("name")}
                  />
                  <p className="mt-1 text-xs text-danger">{firstAdminForm.formState.errors.name?.message}</p>
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs text-textSecondary">Correo electrónico</label>
                  <input
                    type="email"
                    autoComplete="email"
                    className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-textPrimary"
                    {...firstAdminForm.register("email")}
                  />
                  <p className="mt-1 text-xs text-danger">{firstAdminForm.formState.errors.email?.message}</p>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-textSecondary">Contraseña</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-textPrimary"
                    {...firstAdminForm.register("password")}
                  />
                  <p className="mt-1 text-xs text-danger">{firstAdminForm.formState.errors.password?.message}</p>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-textSecondary">Confirmar contraseña</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-textPrimary"
                    {...firstAdminForm.register("confirmPassword")}
                  />
                  <p className="mt-1 text-xs text-danger">
                    {firstAdminForm.formState.errors.confirmPassword?.message}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    disabled={firstAdminMutation.isPending}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {firstAdminMutation.isPending ? "Creando..." : "Crear administrador"}
                  </button>
                  {firstAdminForm.formState.errors.root?.message ? (
                    <p className="mt-2 text-xs text-danger">{firstAdminForm.formState.errors.root.message}</p>
                  ) : null}
                </div>
              </form>
            </div>
          )}

          <div className="rounded-xl border border-border bg-surface p-6">
            <h2 className="text-sm font-semibold text-textSecondary">Asignar usuario al negocio</h2>
            <p className="mt-1 text-xs text-textSecondary">
              El usuario queda con un solo rol en el sistema (Administrador, Encargado de ruta o Cliente). Si ya
              pertenecía a otro negocio, pasa a este.
            </p>
            <form
              className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3"
              onSubmit={assignForm.handleSubmit(async (v) => {
                try {
                  await assignMutation.mutateAsync(v);
                } catch (e) {
                  assignForm.setError("userId", { message: getErrorMessage(e) });
                }
              })}
            >
              <div>
                <label className="mb-1 block text-xs text-textSecondary">Usuario</label>
                <select
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-textPrimary"
                  {...assignForm.register("userId")}
                >
                  <option value="">Selecciona…</option>
                  {(assignableQuery.data ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                      {u.email ? ` (${u.email})` : ""}
                      {u.businessId && u.businessId !== id
                        ? ` — otro negocio: ${u.businessName ?? u.businessId}`
                        : ""}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-danger">{assignForm.formState.errors.userId?.message}</p>
              </div>
              <div>
                <label className="mb-1 block text-xs text-textSecondary">Rol en el negocio</label>
                <select
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-textPrimary"
                  {...assignForm.register("role")}
                >
                  <option value="ADMIN">Administrador</option>
                  <option value="ROUTE_MANAGER">Encargado de ruta</option>
                  <option value="CLIENT">Cliente</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={assignMutation.isPending}
                  className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50 sm:w-auto"
                >
                  {assignMutation.isPending ? "Asignando..." : "Asignar"}
                </button>
              </div>
            </form>
            {assignableQuery.isLoading ? (
              <p className="mt-2 text-xs text-textSecondary">Cargando usuarios...</p>
            ) : null}
          </div>

          <div className="rounded-xl border border-border bg-surface p-6">
            <h2 className="text-sm font-semibold text-textSecondary">Miembros del negocio</h2>
            {detailQuery.data.members.length === 0 ? (
              <p className="mt-2 text-sm text-textSecondary">Nadie asignado aún.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {detailQuery.data.members.map((m) => (
                  <li
                    key={m.userId}
                    className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <span className="font-medium text-textPrimary">{m.name}</span>
                      <span className="ml-2 text-xs text-textSecondary">{m.email ?? "—"}</span>
                      <div className="mt-1 text-xs text-textSecondary">
                        {m.roles.map((r) => roleLabel(r)).join(", ")}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="rounded-md border border-border px-3 py-1.5 text-xs text-danger hover:bg-white/5"
                      disabled={removeMutation.isPending}
                      onClick={() => {
                        if (
                          typeof window !== "undefined" &&
                          window.confirm(
                            "¿Quitar a este usuario del negocio? Pasará a rol Cliente sin negocio asignado hasta que un administrador lo gestione."
                          )
                        ) {
                          void removeMutation.mutateAsync(m.userId).catch(() => {
                            // surfaced via mutation state if we add it
                          });
                        }
                      }}
                    >
                      Quitar del negocio
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {removeMutation.isError ? (
              <p className="mt-2 text-xs text-danger">{getErrorMessage(removeMutation.error)}</p>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
};

export default BusinessDetailPage;
