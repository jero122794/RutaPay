// frontend/app/(dashboard)/businesses/[id]/page.tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../../../../lib/api";
import { getEffectiveRoles, pickPrimaryRole } from "../../../../lib/effective-roles";
import { useAuthStore, type UserRole } from "../../../../store/authStore";

const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    if (error.code === "ERR_NETWORK" || error.message === "Network Error") {
      return "No se pudo contactar el servidor. Arranca el backend y revisa NEXT_PUBLIC_API_URL.";
    }
    const message = (error.response?.data as { message?: string } | undefined)?.message;
    return message ?? error.message;
  }
  return "Error desconocido.";
};

const initialsFromName = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  const a = parts[0][0] ?? "U";
  const b = parts[parts.length - 1][0] ?? "";
  return `${a}${b}`.toUpperCase();
};

const formatShortDate = (iso: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", year: "numeric" }).format(d);
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
  const hasAuthHydrated = useAuthStore((state) => state.hasAuthHydrated);
  const role: UserRole = pickPrimaryRole(getEffectiveRoles(user));
  const queryClient = useQueryClient();
  const [memberFilter, setMemberFilter] = useState("");

  const detailQuery = useQuery({
    queryKey: ["business", id],
    queryFn: async (): Promise<BusinessDetail> => {
      const res = await api.get<{ data: BusinessDetail }>(`/businesses/${id}`);
      return res.data.data;
    },
    enabled: hasAuthHydrated && Boolean(user) && Boolean(id) && role === "SUPER_ADMIN"
  });

  const assignableQuery = useQuery({
    queryKey: ["business-assignable-users"],
    queryFn: async (): Promise<AssignableUser[]> => {
      const res = await api.get<{ data: AssignableUser[] }>("/businesses/assignable-users");
      return res.data.data;
    },
    enabled: hasAuthHydrated && Boolean(user) && role === "SUPER_ADMIN" && Boolean(id)
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

  const members = detailQuery.data?.members ?? [];
  const filteredMembers = useMemo(() => {
    const q = memberFilter.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => `${m.name} ${m.email ?? ""} ${m.roles.join(" ")} ${m.userId}`.toLowerCase().includes(q));
  }, [memberFilter, members]);

  if (role !== "SUPER_ADMIN") {
    return (
      <section className="rounded-2xl border border-white/5 bg-surface-container p-6">
        <p className="text-sm text-error">Solo el super administrador puede editar negocios.</p>
        <Link href="/overview" className="mt-4 inline-block font-bold text-primary hover:underline">
          Volver
        </Link>
      </section>
    );
  }

  if (!id) {
    return <p className="text-sm text-error">Identificador de negocio inválido.</p>;
  }

  if (detailQuery.isLoading) {
    return (
      <section className="rounded-3xl border border-outline-variant/10 bg-surface-container-low p-8">
        <p className="text-sm text-on-surface-variant">Cargando…</p>
      </section>
    );
  }

  if (detailQuery.isError) {
    return (
      <section className="rounded-3xl border border-outline-variant/10 bg-surface-container-low p-8">
        <p className="text-sm text-error">{getErrorMessage(detailQuery.error)}</p>
        <Link href="/businesses" className="mt-4 inline-block font-bold text-primary hover:underline">
          Volver a negocios
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-8">
      <div className="mb-2">
        <Link href="/businesses" className="inline-flex items-center gap-2 text-on-surface-variant hover:text-primary">
          <span className="material-symbols-outlined text-sm" aria-hidden>
            arrow_back
          </span>
          <span className="text-sm font-medium">Volver a negocios</span>
        </Link>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-headline text-4xl font-extrabold tracking-tight text-on-surface">Detalle del negocio</h1>
          <div className="mt-2 flex items-center gap-3">
            <span className="rounded-full bg-surface-container-highest px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary-dim">
              ID: {id}
            </span>
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
            <span className="text-sm text-on-surface-variant">Activo</span>
          </div>
        </div>
        <button
          type="button"
          disabled={reconcileMutation.isPending}
          className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/20 bg-surface-container-high px-5 py-2.5 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-bright disabled:opacity-50"
          onClick={() => {
            if (typeof window !== "undefined" && window.confirm("¿Alinear rutas y clientes de este negocio ahora?")) {
              void reconcileMutation.mutateAsync().catch(() => {});
            }
          }}
        >
          <span className="material-symbols-outlined text-sm" aria-hidden>
            sync
          </span>
          {reconcileMutation.isPending ? "Sincronizando…" : "Ejecutar sincronización"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="flex flex-col gap-6 lg:col-span-4">
          <div className="rounded-3xl bg-surface-container-low p-6 shadow-xl shadow-black/20">
            <h2 className="mb-6 flex items-center gap-2 font-headline text-lg font-bold">
              <span className="material-symbols-outlined text-primary" aria-hidden>
                edit_note
              </span>
              Nombre del negocio
            </h2>
            <form
              className="space-y-4"
              onSubmit={nameForm.handleSubmit(async (v) => {
                try {
                  await updateNameMutation.mutateAsync(v);
                } catch (e) {
                  nameForm.setError("name", { message: getErrorMessage(e) });
                }
              })}
            >
              <div className="relative">
                <label className="absolute left-4 top-2 z-10 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                  Business identity
                </label>
                <input
                  className="w-full rounded-xl border-none bg-surface-container-lowest px-4 pb-3 pt-7 text-on-surface shadow-inner focus:ring-2 focus:ring-primary/40"
                  {...nameForm.register("name")}
                />
              </div>
              <p className="text-xs text-error">{nameForm.formState.errors.name?.message}</p>
              <button
                type="submit"
                disabled={updateNameMutation.isPending}
                className="w-full rounded-xl border border-primary/10 bg-surface-container-highest py-3 text-sm font-bold text-on-surface transition-all hover:text-primary disabled:opacity-50"
              >
                {updateNameMutation.isPending ? "Guardando…" : "Guardar nombre"}
              </button>
            </form>
          </div>

          <div className="rounded-3xl bg-surface-container-low p-6 shadow-xl shadow-black/20">
            <h2 className="mb-6 flex items-center gap-2 font-headline text-lg font-bold">
              <span className="material-symbols-outlined text-tertiary" aria-hidden>
                history_edu
              </span>
              Sincronización
            </h2>
            <p className="mb-6 text-sm leading-relaxed text-on-surface-variant">
              Actualiza las rutas y clientes activos desde el servidor para este inquilino.
            </p>
            <div className="mb-4 flex items-center gap-4 rounded-2xl bg-surface-container-lowest p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-tertiary/10 text-tertiary">
                <span className="material-symbols-outlined" aria-hidden>
                  cloud_sync
                </span>
              </div>
              <div>
                <p className="text-xs font-medium text-on-surface-variant">Última sincronización</p>
                <p className="text-sm font-bold text-on-surface">—</p>
              </div>
            </div>
            <button
              type="button"
              disabled={reconcileMutation.isPending}
              className="w-full rounded-2xl bg-gradient-to-br from-primary to-primary-container py-4 text-sm font-bold text-on-primary shadow-lg shadow-primary/20 active:scale-[0.97] transition-all disabled:opacity-50"
              onClick={() => {
                if (typeof window !== "undefined" && window.confirm("¿Ejecutar sincronización ahora?")) {
                  void reconcileMutation.mutateAsync().catch(() => {});
                }
              }}
            >
              {reconcileMutation.isPending ? "Sincronizando…" : "Ejecutar sincronización"}
            </button>
            {reconcileMutation.isSuccess ? (
              <p className="mt-3 text-xs text-success">
                Rutas tocadas: {reconcileMutation.data.routesAligned}. Clientes actualizados:{" "}
                {reconcileMutation.data.clientUsersAligned}.
              </p>
            ) : null}
            {reconcileMutation.isError ? (
              <p className="mt-3 text-xs text-error">{getErrorMessage(reconcileMutation.error)}</p>
            ) : null}
          </div>
        </section>

        <section className="rounded-3xl bg-surface-container-low p-8 shadow-xl shadow-black/20 lg:col-span-8">
          <div className="mb-10 flex items-start justify-between gap-6">
            <div>
              <h2 className="mb-1 flex items-center gap-3 font-headline text-xl font-bold">
                <span className="material-symbols-outlined text-primary" aria-hidden>
                  workspace_premium
                </span>
                Gestión de licencia
              </h2>
              <p className="text-sm text-on-surface-variant">Configura la validez y el tiempo de servicio del inquilino.</p>
            </div>
            <div className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-2">
              <span className="text-sm font-bold text-primary">Estado: Activa</span>
            </div>
          </div>

          <div className="mb-10 grid grid-cols-1 gap-10 md:grid-cols-2">
            <div className="space-y-6">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-bold uppercase tracking-tighter text-on-surface-variant">Fecha de inicio</span>
                <span className="text-2xl font-bold tracking-tight text-on-surface">
                  {formatShortDate(detailQuery.data?.licenseStartsAt ?? null)}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-bold uppercase tracking-tighter text-on-surface-variant">Fecha de expiración</span>
                <span className="text-2xl font-bold tracking-tight text-error">
                  {formatShortDate(detailQuery.data?.licenseEndsAt ?? null)}
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-highest/30 p-6">
              <p className="mb-4 text-sm font-semibold text-on-surface">Extender licencia</p>
              <form
                className="space-y-4"
                onSubmit={licenseForm.handleSubmit(async (v) => {
                  try {
                    await licenseMutation.mutateAsync(v);
                  } catch (e) {
                    licenseForm.setError("root", { message: getErrorMessage(e) });
                  }
                })}
              >
                <div className="grid grid-cols-2 gap-4">
                  <div className="relative">
                    <label className="absolute left-3 top-2 text-[10px] font-bold uppercase text-on-surface-variant">Meses</label>
                    <input
                      className="w-full rounded-xl border-none bg-surface-container-lowest px-3 pb-2 pt-6 text-on-surface focus:ring-1 focus:ring-primary/40"
                      placeholder="0"
                      inputMode="numeric"
                      {...licenseForm.register("months")}
                    />
                  </div>
                  <div className="relative">
                    <label className="absolute left-3 top-2 text-[10px] font-bold uppercase text-on-surface-variant">Años</label>
                    <input
                      className="w-full rounded-xl border-none bg-surface-container-lowest px-3 pb-2 pt-6 text-on-surface focus:ring-1 focus:ring-primary/40"
                      placeholder="0"
                      inputMode="numeric"
                      {...licenseForm.register("years")}
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={licenseMutation.isPending}
                  className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-on-primary shadow-md transition-colors hover:bg-primary-dim active:scale-95 disabled:opacity-50"
                >
                  {licenseMutation.isPending ? "Asignando…" : "Asignar licencia"}
                </button>
                {licenseForm.formState.errors.root?.message ? (
                  <p className="text-xs text-error">{licenseForm.formState.errors.root.message}</p>
                ) : null}
              </form>
            </div>
          </div>

          <div className="relative border-t border-outline-variant/15 pt-6">
            <div className="mb-6 flex items-center justify-between text-xs font-bold uppercase tracking-widest text-on-surface-variant">
              <span>Ciclo de facturación</span>
              <span className="text-primary">85% completado</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-surface-container-lowest">
              <div className="h-full w-[85%] rounded-full bg-primary shadow-[0_0_15px_rgba(105,246,184,0.4)]" />
            </div>
          </div>
        </section>

        {!members.some((m) => m.roles.includes("ADMIN")) ? (
          <section className="rounded-3xl bg-surface-container-low p-8 shadow-xl shadow-black/20 lg:col-span-6">
            <h2 className="mb-6 flex items-center gap-3 font-headline text-xl font-bold">
              <span className="material-symbols-outlined text-primary" aria-hidden>
                person_add
              </span>
              Crear primer administrador
            </h2>
            <form
              className="grid grid-cols-1 gap-4 md:grid-cols-2"
              onSubmit={firstAdminForm.handleSubmit(async (v) => {
                try {
                  await firstAdminMutation.mutateAsync(v);
                } catch (e) {
                  firstAdminForm.setError("root", { message: getErrorMessage(e) });
                }
              })}
            >
              <div className="md:col-span-2">
                <input
                  className="w-full rounded-2xl border-none bg-surface-container-lowest px-5 py-4 text-on-surface focus:ring-1 focus:ring-primary/40 placeholder:text-outline/50"
                  placeholder="Nombre completo"
                  {...firstAdminForm.register("name")}
                />
                <p className="mt-1 text-xs text-error">{firstAdminForm.formState.errors.name?.message}</p>
              </div>
              <div className="md:col-span-2">
                <input
                  className="w-full rounded-2xl border-none bg-surface-container-lowest px-5 py-4 text-on-surface focus:ring-1 focus:ring-primary/40 placeholder:text-outline/50"
                  placeholder="Correo electrónico"
                  {...firstAdminForm.register("email")}
                />
                <p className="mt-1 text-xs text-error">{firstAdminForm.formState.errors.email?.message}</p>
              </div>
              <input
                className="w-full rounded-2xl border-none bg-surface-container-lowest px-5 py-4 text-on-surface focus:ring-1 focus:ring-primary/40 placeholder:text-outline/50"
                placeholder="Contraseña"
                type="password"
                {...firstAdminForm.register("password")}
              />
              <input
                className="w-full rounded-2xl border-none bg-surface-container-lowest px-5 py-4 text-on-surface focus:ring-1 focus:ring-primary/40 placeholder:text-outline/50"
                placeholder="Confirmar contraseña"
                type="password"
                {...firstAdminForm.register("confirmPassword")}
              />
              <button
                className="col-span-1 mt-2 rounded-2xl bg-primary py-4 text-sm font-bold text-on-primary shadow-xl active:scale-[0.98] transition-all md:col-span-2"
                type="submit"
                disabled={firstAdminMutation.isPending}
              >
                {firstAdminMutation.isPending ? "Creando…" : "Crear administrador"}
              </button>
              {firstAdminForm.formState.errors.root?.message ? (
                <p className="md:col-span-2 text-xs text-error">{firstAdminForm.formState.errors.root.message}</p>
              ) : null}
            </form>
          </section>
        ) : null}

        <section className="flex flex-col rounded-3xl bg-surface-container-low p-8 shadow-xl shadow-black/20 lg:col-span-6">
          <h2 className="mb-6 flex items-center gap-3 font-headline text-xl font-bold">
            <span className="material-symbols-outlined text-primary" aria-hidden>
              group_add
            </span>
            Asignar usuario existente
          </h2>
          <form
            className="flex-1 space-y-6"
            onSubmit={assignForm.handleSubmit(async (v) => {
              try {
                await assignMutation.mutateAsync(v);
              } catch (e) {
                assignForm.setError("userId", { message: getErrorMessage(e) });
              }
            })}
          >
            <div className="space-y-2">
              <label className="ml-1 text-xs font-bold uppercase text-on-surface-variant">Seleccionar usuario</label>
              <select
                className="w-full appearance-none rounded-2xl border-none bg-surface-container-lowest px-5 py-4 text-on-surface focus:ring-1 focus:ring-primary/40"
                {...assignForm.register("userId")}
              >
                <option value="">Buscar usuario…</option>
                {(assignableQuery.data ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                    {u.email ? ` (${u.email})` : ""}
                    {u.businessId && u.businessId !== id ? ` — otro negocio: ${u.businessName ?? u.businessId}` : ""}
                  </option>
                ))}
              </select>
              <p className="text-xs text-error">{assignForm.formState.errors.userId?.message}</p>
            </div>
            <div className="space-y-2">
              <label className="ml-1 text-xs font-bold uppercase text-on-surface-variant">Rol en el negocio</label>
              <select
                className="w-full appearance-none rounded-2xl border-none bg-surface-container-lowest px-5 py-4 text-on-surface focus:ring-1 focus:ring-primary/40"
                {...assignForm.register("role")}
              >
                <option value="ADMIN">Administrador</option>
                <option value="ROUTE_MANAGER">Encargado de Ruta</option>
                <option value="CLIENT">Visualizador (Cliente)</option>
              </select>
            </div>
            <button
              className="w-full rounded-2xl border border-outline-variant/20 bg-surface-container-highest py-4 text-sm font-bold text-on-surface transition-all active:scale-[0.98] hover:text-primary disabled:opacity-50"
              type="submit"
              disabled={assignMutation.isPending}
            >
              {assignMutation.isPending ? "Asignando…" : "Asignar usuario al negocio"}
            </button>
            {assignableQuery.isLoading ? <p className="text-xs text-on-surface-variant">Cargando usuarios…</p> : null}
          </form>
        </section>

        <section className="rounded-3xl bg-surface-container-low p-8 shadow-xl shadow-black/20 lg:col-span-12">
          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="mb-1 flex items-center gap-3 font-headline text-xl font-bold">
                <span className="material-symbols-outlined text-primary" aria-hidden>
                  groups
                </span>
                Miembros del negocio
              </h2>
              <p className="text-sm text-on-surface-variant">Lista de personal autorizado para operar en este inquilino.</p>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-outline-variant/10 bg-surface-container-lowest px-4 py-2">
              <span className="material-symbols-outlined text-sm text-on-surface-variant" aria-hidden>
                search
              </span>
              <input
                className="w-48 border-none bg-transparent text-sm text-on-surface placeholder:text-outline/50 focus:ring-0"
                placeholder="Filtrar miembros…"
                value={memberFilter}
                onChange={(e) => setMemberFilter(e.target.value)}
              />
            </div>
          </div>

          {members.length === 0 ? (
            <p className="text-sm text-on-surface-variant">Nadie asignado aún.</p>
          ) : (
            <div className="rutapay-table-wrap custom-scrollbar">
              <table className="rutapay-table rutapay-table--responsive">
                <thead>
                  <tr>
                    <th>Miembro</th>
                    <th>Rol</th>
                    <th>Estado</th>
                    <th>Último acceso</th>
                    <th className="text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.map((m) => (
                    <tr key={m.userId} className="group transition-colors hover:bg-surface-container-high">
                      <td data-label="Miembro" className="py-5 pl-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-primary/10 bg-gradient-to-br from-primary/20 to-primary-container/20 font-bold text-primary">
                            {initialsFromName(m.name)}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-bold text-on-surface">{m.name}</span>
                            <span className="text-xs text-on-surface-variant">{m.email ?? "—"}</span>
                          </div>
                        </div>
                      </td>
                      <td data-label="Rol" className="py-5">
                        <span className="rounded-lg bg-surface-container-highest px-3 py-1 text-sm font-medium text-on-surface">
                          {m.roles.map((r) => roleLabel(r)).join(", ")}
                        </span>
                      </td>
                      <td data-label="Estado" className="py-5">
                        <div className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-outline" />
                          <span className="text-sm">—</span>
                        </div>
                      </td>
                      <td data-label="Último acceso" className="py-5 text-sm text-on-surface-variant">—</td>
                      <td data-no-label="true" data-align="end" className="py-5 pr-4 text-right">
                        <button
                          className="ml-auto flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-tighter text-error/60 transition-colors group-hover:bg-error/10 hover:text-error"
                          type="button"
                          disabled={removeMutation.isPending}
                          onClick={() => {
                            if (
                              typeof window !== "undefined" &&
                              window.confirm(
                                "¿Quitar a este usuario del negocio? Pasará a rol Cliente sin negocio asignado hasta que un administrador lo gestione."
                              )
                            ) {
                              void removeMutation.mutateAsync(m.userId).catch(() => {});
                            }
                          }}
                        >
                          <span className="material-symbols-outlined text-base" aria-hidden>
                            person_remove
                          </span>
                          Quitar del negocio
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {removeMutation.isError ? <p className="mt-2 text-xs text-error">{getErrorMessage(removeMutation.error)}</p> : null}
        </section>
      </div>
    </section>
  );
};

export default BusinessDetailPage;
