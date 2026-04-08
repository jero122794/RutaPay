// frontend/app/(dashboard)/clients/new/page.tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  password: z.preprocess(
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
  ),
  routeId: z.string().cuid().optional()
});

type CreateClientFormData = z.infer<typeof createClientSchema>;

const insetShell =
  "rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-4 py-3 transition-all focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/50";

const sectionCard =
  "rounded-xl border border-outline-variant/5 bg-surface-container-low p-6 shadow-2xl md:p-8";

const fieldLabel = "text-xs font-semibold uppercase tracking-wider text-on-surface-variant";

const ClientsNewPage = (): JSX.Element => {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const hasAuthHydrated = useAuthStore((state) => state.hasAuthHydrated);
  const roles = useMemo((): UserRole[] => {
    if (!hasAuthHydrated) {
      return [];
    }
    return getEffectiveRoles(user);
  }, [hasAuthHydrated, user]);
  const hasRole = (r: UserRole): boolean => roles.includes(r);

  const canCreate =
    hasRole("ADMIN") || hasRole("SUPER_ADMIN") || hasRole("ROUTE_MANAGER");
  const isAdminView = hasRole("ADMIN") || hasRole("SUPER_ADMIN");
  const isRouteManagerView = hasRole("ROUTE_MANAGER");

  const [passwordVisible, setPasswordVisible] = useState(false);

  const routesQuery = useQuery({
    queryKey: [isAdminView ? "routes-list" : "routes-me-for-client-create"],
    queryFn: async (): Promise<ListResponse<RouteItem>> => {
      const endpoint = isAdminView ? "/routes" : "/routes/me";
      const response = await api.get<ListResponse<RouteItem>>(endpoint);
      return response.data;
    },
    enabled: hasAuthHydrated && Boolean(user) && (isAdminView || isRouteManagerView)
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
        routeId,
        ...(values.email?.trim() ? { email: values.email.trim() } : {}),
        ...(values.password?.trim() ? { password: values.password } : {}),
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
      <section className="rounded-xl border border-outline-variant/10 bg-surface-container-low p-6">
        <p className="text-sm text-error">No tienes permisos para crear clientes.</p>
        <div className="mt-4">
          <Link href="/clients" className="text-primary hover:underline">
            Volver
          </Link>
        </div>
      </section>
    );
  }

  const inputBase =
    "w-full border-0 bg-transparent text-on-surface outline-none placeholder:text-outline/40";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 pb-28 md:pb-8">
      <div className="flex items-center gap-4">
        <Link
          href="/clients"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-on-surface transition-colors hover:bg-surface-container-highest"
          aria-label="Volver a clientes"
        >
          <span className="material-symbols-outlined" aria-hidden>
            arrow_back
          </span>
        </Link>
        <div>
          <h1 className="font-headline text-xl font-bold tracking-tight text-on-surface">Crear nuevo cliente</h1>
          <p className="mt-0.5 text-sm text-on-surface-variant">Registra un tomador de deuda y su ruta.</p>
        </div>
      </div>

      {(isAdminView || isRouteManagerView) && routesQuery.isLoading ? (
        <p className="text-sm text-on-surface-variant">Cargando rutas…</p>
      ) : null}
      {(isAdminView || isRouteManagerView) && routesQuery.isError ? (
        <p className="text-sm text-error">No fue posible cargar las rutas.</p>
      ) : null}

      {routesQuery.isSuccess || routesQuery.isError ? (
        <form className="space-y-8" onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <section className={sectionCard}>
            <div className="mb-8 flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <span className="material-symbols-outlined text-primary" aria-hidden>
                  badge
                </span>
              </div>
              <div>
                <h2 className="text-lg font-bold text-on-surface">Información personal</h2>
                <p className="text-sm text-on-surface-variant">Datos básicos de identificación del cliente</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="name" className={fieldLabel}>
                  Nombre completo
                </label>
                <div className={insetShell}>
                  <input
                    id="name"
                    type="text"
                    autoComplete="name"
                    placeholder="Ej: Juan Pérez"
                    className={inputBase}
                    {...form.register("name")}
                  />
                </div>
                <p className="text-xs text-error">{form.formState.errors.name?.message}</p>
              </div>

              <div className="space-y-2">
                <label htmlFor="documentId" className={fieldLabel}>
                  Documento de identidad
                </label>
                <div className={insetShell}>
                  <input
                    id="documentId"
                    type="text"
                    autoComplete="off"
                    placeholder="CC / NIT"
                    className={inputBase}
                    {...form.register("documentId")}
                  />
                </div>
                <p className="text-xs text-error">{form.formState.errors.documentId?.message}</p>
              </div>

              <div className="space-y-2">
                <label htmlFor="phone" className={fieldLabel}>
                  Teléfono
                </label>
                <div className={`${insetShell} flex items-center`}>
                  <span className="mr-2 shrink-0 text-sm text-on-surface-variant" aria-hidden>
                    +57
                  </span>
                  <input
                    id="phone"
                    type="tel"
                    autoComplete="tel-national"
                    placeholder="300 000 0000"
                    className={inputBase}
                    {...form.register("phone")}
                  />
                </div>
                <p className="text-xs text-error">{form.formState.errors.phone?.message}</p>
              </div>

              <div className="space-y-2">
                <label htmlFor="email" className={fieldLabel}>
                  Correo (opcional)
                </label>
                <div className={insetShell}>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="cliente@email.com"
                    className={inputBase}
                    {...form.register("email")}
                  />
                </div>
                <p className="text-xs text-on-surface-variant">
                  Sin correo ni contraseña el cliente queda solo registrado; puedes habilitar acceso después.
                </p>
                <p className="text-xs text-error">{form.formState.errors.email?.message}</p>
              </div>
            </div>
          </section>

          <section className={sectionCard}>
            <div className="mb-8 flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-secondary/10">
                <span className="material-symbols-outlined text-secondary" aria-hidden>
                  location_on
                </span>
              </div>
              <div>
                <h2 className="text-lg font-bold text-on-surface">Acceso y ubicación</h2>
                <p className="text-sm text-on-surface-variant">Ruta asignada y credenciales de la app</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {isAdminView || isRouteManagerView ? (
                <div className="space-y-2">
                  <label htmlFor="routeId" className={fieldLabel}>
                    Ruta
                  </label>
                  <div className={`${insetShell} relative flex items-center`}>
                    <select
                      id="routeId"
                      className={`${inputBase} cursor-pointer appearance-none pr-10`}
                      value={form.watch("routeId") ?? ""}
                      onChange={(e) => form.setValue("routeId", e.target.value, { shouldValidate: true })}
                    >
                      <option value="">Seleccione una ruta activa</option>
                      {managerRoutes.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                    <span
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant material-symbols-outlined"
                      aria-hidden
                    >
                      expand_more
                    </span>
                  </div>
                  <p className="text-xs text-error">{form.formState.errors.routeId?.message}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <label htmlFor="routeId-ro" className={fieldLabel}>
                    Ruta
                  </label>
                  <div className={insetShell}>
                    <input
                      id="routeId-ro"
                      readOnly
                      className={inputBase}
                      value="Ruta no disponible"
                    />
                  </div>
                  <p className="text-xs text-error">{form.formState.errors.routeId?.message}</p>
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="password" className={fieldLabel}>
                  Contraseña (acceso app, opcional)
                </label>
                <div className={`${insetShell} flex items-center gap-2`}>
                  <input
                    id="password"
                    type={passwordVisible ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="••••••••"
                    className={inputBase}
                    {...form.register("password")}
                  />
                  <button
                    type="button"
                    className="shrink-0 text-on-surface-variant transition-colors hover:text-on-surface"
                    onClick={() => setPasswordVisible((v) => !v)}
                    aria-label={passwordVisible ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    <span className="material-symbols-outlined" aria-hidden>
                      {passwordVisible ? "visibility" : "visibility_off"}
                    </span>
                  </button>
                </div>
                <p className="text-xs text-on-surface-variant">
                  Mínimo 8 caracteres con mayúscula, minúscula, número y símbolo.
                </p>
                <p className="text-xs text-error">{form.formState.errors.password?.message}</p>
              </div>

              <div className="space-y-2 md:col-span-2">
                <label htmlFor="address" className={fieldLabel}>
                  Dirección (opcional)
                </label>
                <div className={`${insetShell} flex items-center`}>
                  <span className="material-symbols-outlined mr-3 text-lg text-on-surface-variant" aria-hidden>
                    map
                  </span>
                  <input
                    id="address"
                    type="text"
                    autoComplete="street-address"
                    placeholder="Calle 123 #45-67, ciudad"
                    className={inputBase}
                    {...form.register("address")}
                  />
                </div>
                <p className="text-xs text-error">{form.formState.errors.address?.message}</p>
              </div>

              <div className="space-y-2 md:col-span-2">
                <label htmlFor="description" className={fieldLabel}>
                  Descripción (opcional)
                </label>
                <div className={insetShell}>
                  <textarea
                    id="description"
                    rows={3}
                    placeholder="Detalles adicionales sobre el cliente o el punto de cobro…"
                    className={`${inputBase} resize-none`}
                    {...form.register("description")}
                  />
                </div>
                <p className="text-xs text-error">{form.formState.errors.description?.message}</p>
              </div>
            </div>
          </section>

          <div className="flex flex-col-reverse items-stretch justify-end gap-4 pt-2 sm:flex-row sm:items-center">
            <Link
              href="/clients"
              className="rounded-xl border border-outline-variant/30 px-8 py-3 text-center text-sm font-semibold text-on-surface transition-all hover:bg-surface-container-highest active:scale-[0.98]"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={form.formState.isSubmitting}
              className="rounded-xl bg-gradient-to-br from-primary to-primary-container px-10 py-3 text-sm font-bold text-on-primary shadow-[0_8px_24px_rgba(105,246,184,0.2)] transition-all hover:shadow-[0_12px_32px_rgba(105,246,184,0.3)] active:scale-[0.98] disabled:opacity-50"
            >
              {form.formState.isSubmitting ? "Creando…" : "Crear cliente"}
            </button>
          </div>
        </form>
      ) : null}

      <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="relative overflow-hidden rounded-xl border border-outline-variant/5 bg-surface-container-high p-6 md:col-span-2">
          <div
            className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-primary/20 via-primary-container/10 to-transparent opacity-60"
            aria-hidden
          />
          <div className="relative z-10 max-w-md">
            <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
              Dato rápido
            </span>
            <h3 className="font-headline text-xl font-bold text-on-surface">
              Datos correctos hoy, reportes confiables mañana.
            </h3>
          </div>
        </div>
        <div className="flex flex-col justify-center rounded-xl border border-outline-variant/5 bg-surface-container-high p-6 text-center">
          <span className="material-symbols-outlined mb-2 text-4xl text-tertiary" aria-hidden>
            shield_with_heart
          </span>
          <h3 className="text-sm font-bold text-on-surface">Privacidad</h3>
          <p className="mt-1 text-[11px] text-on-surface-variant">
            La información sensible se transmite de forma segura y se almacena con buenas prácticas de acceso.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ClientsNewPage;
