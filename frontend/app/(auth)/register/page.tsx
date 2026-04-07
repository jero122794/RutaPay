// frontend/app/(auth)/register/page.tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import api, { setAccessToken } from "../../../lib/api";
import { getEffectiveRoles, pickPrimaryRole } from "../../../lib/effective-roles";
import { useAuthStore, type AppModuleKey, type UserRole } from "../../../store/authStore";
import { useQuery } from "@tanstack/react-query";

const passwordRules = z
  .string()
  .min(8, "Mínimo 8 caracteres")
  .regex(/[A-Z]/, "Debe incluir una mayúscula")
  .regex(/[a-z]/, "Debe incluir una minúscula")
  .regex(/[0-9]/, "Debe incluir un número")
  .regex(/[^A-Za-z0-9]/, "Debe incluir un símbolo");

const registerSchema = z
  .object({
    name: z.string().min(2, "Nombre requerido"),
    email: z.union([z.string().email("Correo inválido"), z.literal("")]).optional(),
    phone: z.string().min(7, "Teléfono inválido"),
    address: z.union([z.string().max(160), z.literal("")]).optional(),
    description: z.union([z.string().max(300), z.literal("")]).optional(),
    documentId: z.string().min(5, "Documento requerido"),
    routeId: z.preprocess(
      (value) => (value === "" || value === null || value === undefined ? undefined : value),
      z.string().cuid().optional()
    ),
    password: passwordRules,
    confirmPassword: z.string().min(8, "Confirma la contraseña"),
    acceptTerms: z.boolean().refine((v) => v === true, "Debes aceptar los términos y condiciones")
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"]
  });

type RegisterFormData = z.infer<typeof registerSchema>;

interface RegisterResponse {
  data: {
    accessToken: string;
    user: {
      id: string;
      name: string;
      email: string;
      roles: string[];
      businessId: string | null;
      modules: string[];
    };
  };
  message: string;
}

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

interface RegisterRoutesResponse {
  data: RouteItem[];
}

const selectClass =
  "h-14 w-full rounded-xl border-none bg-surface-container-lowest pl-12 pr-4 text-on-surface focus:ring-2 focus:ring-primary/40 focus:bg-surface-container";

const RegisterContent = (): JSX.Element => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const setUser = useAuthStore((state) => state.setUser);
  const user = useAuthStore((state) => state.user);

  const routeIdFromQuery = searchParams.get("routeId") ?? "";
  const role: UserRole = pickPrimaryRole(getEffectiveRoles(user));
  const isRouteManager = role === "ROUTE_MANAGER";

  const form = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      address: "",
      description: "",
      documentId: "",
      routeId: routeIdFromQuery || "",
      password: "",
      confirmPassword: "",
      acceptTerms: false
    },
    mode: "onChange"
  });

  const routesMeQuery = useQuery({
    queryKey: ["routes-me-for-register"],
    queryFn: async (): Promise<ListResponse<RouteItem>> => {
      const response = await api.get<ListResponse<RouteItem>>("/routes/me");
      return response.data;
    },
    enabled: isRouteManager
  });

  const routesPublicQuery = useQuery({
    queryKey: ["auth-register-routes"],
    queryFn: async (): Promise<RegisterRoutesResponse> => {
      const response = await api.get<RegisterRoutesResponse>("/auth/register/routes");
      return response.data;
    },
    enabled: !isRouteManager
  });

  useEffect(() => {
    if (isRouteManager) {
      const routes = routesMeQuery.data?.data ?? [];
      const selectedRouteId = form.getValues("routeId");
      const hasSelectedRoute = selectedRouteId ? routes.some((route) => route.id === selectedRouteId) : false;
      const queryRouteExists = routeIdFromQuery
        ? routes.some((route) => route.id === routeIdFromQuery)
        : false;

      if (routeIdFromQuery && queryRouteExists && selectedRouteId !== routeIdFromQuery) {
        form.setValue("routeId", routeIdFromQuery, { shouldValidate: true, shouldDirty: true });
        return;
      }

      if (hasSelectedRoute) {
        return;
      }

      if (routes.length === 1) {
        form.setValue("routeId", routes[0].id, { shouldValidate: true, shouldDirty: true });
        return;
      }

      if (routes.length > 1) {
        form.setValue("routeId", routes[0].id, { shouldValidate: true, shouldDirty: true });
      }
      return;
    }

    const routes = routesPublicQuery.data?.data ?? [];
    const selectedRouteId = form.getValues("routeId");
    if (routeIdFromQuery && routes.some((r) => r.id === routeIdFromQuery)) {
      if (selectedRouteId !== routeIdFromQuery) {
        form.setValue("routeId", routeIdFromQuery, { shouldValidate: true, shouldDirty: true });
      }
      return;
    }
    if (selectedRouteId && routes.length > 0 && !routes.some((r) => r.id === selectedRouteId)) {
      form.setValue("routeId", "", { shouldValidate: true });
    }
  }, [form, isRouteManager, routesMeQuery.data, routesPublicQuery.data, routeIdFromQuery]);

  const onSubmit = async (values: RegisterFormData): Promise<void> => {
    setError("");
    setSuccess("");

    if (isRouteManager) {
      const routes = routesMeQuery.data?.data ?? [];
      const hasRoutes = routes.length > 0;
      const selectedRouteId = values.routeId;
      const isSelectedRouteValid = selectedRouteId ? routes.some((route) => route.id === selectedRouteId) : false;

      if (hasRoutes && !isSelectedRouteValid) {
        form.setError("routeId", {
          type: "manual",
          message: "Selecciona una ruta válida para asignar el cliente."
        });
        return;
      }
    }

    const { confirmPassword: _c, acceptTerms: _a, ...payload } = values;

    try {
      const response = await api.post<RegisterResponse>("/auth/register", payload);
      setAccessToken(response.data.data.accessToken);
      setUser({
        id: response.data.data.user.id,
        name: response.data.data.user.name,
        email: response.data.data.user.email ?? "",
        roles: response.data.data.user.roles as UserRole[],
        businessId: response.data.data.user.businessId ?? null,
        modules: (response.data.data.user.modules ?? []) as AppModuleKey[]
      });
      setSuccess(`Cuenta creada para ${response.data.data.user.name}.`);
      form.reset();
      router.push("/overview");
    } catch {
      setError("No fue posible crear la cuenta. Verifica los datos.");
    }
  };

  return (
    <div className="flex min-h-screen w-full bg-surface font-body text-on-surface selection:bg-primary selection:text-on-primary">
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-surface-container-low p-16 lg:flex">
        <div
          className="pointer-events-none absolute inset-0 z-0 opacity-20"
          style={{
            background:
              "radial-gradient(circle at 20% 30%, #06b77f 0%, transparent 40%), radial-gradient(circle at 80% 70%, #69f6b8 0%, transparent 40%)"
          }}
        />

        <div className="relative z-10">
          <div className="mb-20">
            <div className="flex items-center gap-3">
              <img
                src="/brand/ruut_logo_1.svg"
                alt="Ruut"
                className="h-12 w-12 object-contain"
              />
              <span className="font-headline text-3xl font-black tracking-tighter text-primary">Ruut</span>
            </div>
          </div>
          <h1 className="mb-8 font-headline text-5xl font-extrabold leading-tight tracking-tight text-on-surface xl:text-6xl">
            La herramienta de <span className="text-primary">precisión</span> para tu <br />
            ruta de cobro.
          </h1>
          <p className="max-w-lg text-xl leading-relaxed text-on-surface-variant">
            Gestiona préstamos, controla cobros y optimiza tus rutas con una infraestructura pensada para el mercado
            colombiano.
          </p>
        </div>

        <div className="relative z-10 mt-auto">
          <div className="auth-tonal-shadow rounded-2xl border border-outline-variant/15 bg-surface-bright/40 p-8 backdrop-blur-md">
            <div className="mb-6 flex items-center gap-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-container/20">
                <span className="material-symbols-outlined text-primary" aria-hidden>
                  security
                </span>
              </div>
              <div>
                <p className="font-headline text-lg font-bold text-on-surface">Seguridad y trazabilidad</p>
                <p className="text-sm text-on-surface-variant">Tus operaciones con respaldo y control de acceso.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl bg-surface-container-lowest/40 p-4">
                <p className="font-headline text-2xl font-bold text-primary">99.9%</p>
                <p className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">Disponibilidad</p>
              </div>
              <div className="rounded-xl bg-surface-container-lowest/40 p-4">
                <p className="font-headline text-2xl font-bold text-primary">24/7</p>
                <p className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">Operación</p>
              </div>
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-[-10%] right-[-10%] z-0 aspect-square w-[80%] opacity-40 mix-blend-screen">
          <img
            alt=""
            className="h-full w-full object-contain"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuAX2MfdfDruPVH7T-cUKJ4FhqIVF4B_vdL2gyPoArFskb-5OjbsR1koONFiyWHpPPKRT6CpdB4zRqpNJCtxzckBAuwoJ6LdBMvpgWy0ZBPBsTgfGw5DjXe7kAcNNfK5mlvOMdjvc9DsMZmZygnCTCiDt-duGaZFM7cZaT31oK7MeA9zYRJDVzfe-80B4sL0-T_gB85l2SRaeeo3xNasXMpTGfyjgw0Q64f92xIMEEvtjIp1yvE6r9PF1Jputh78UdI-_dYTnO5x9gs"
          />
        </div>
      </div>

      <div className="flex w-full flex-col justify-center bg-surface p-6 sm:p-12 md:p-16 lg:w-1/2">
        <div className="auth-form auth-form--register mx-auto w-full max-w-md">
          <div className="mb-10 text-center lg:text-left">
            <h2 className="mb-2 font-headline text-3xl font-bold text-on-surface">Crear nueva cuenta</h2>
            <p className="text-on-surface-variant">Regístrate para acceder a tu panel de microcrédito.</p>
          </div>

          <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <div className="space-y-2">
              <label className="px-1 text-xs font-semibold uppercase tracking-wider text-on-surface-variant" htmlFor="name">
                Nombre completo
              </label>
              <div className="group relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                  <span className="material-symbols-outlined text-lg text-outline group-focus-within:text-primary">
                    person
                  </span>
                </div>
                <input
                  id="name"
                  type="text"
                  autoComplete="name"
                  placeholder="Ej. Juan Pérez"
                  className="h-14 w-full rounded-xl border-none bg-surface-container-lowest pl-12 pr-4 text-on-surface placeholder:text-outline focus:bg-surface-container focus:ring-2 focus:ring-primary/40"
                  {...form.register("name")}
                />
              </div>
              <p className="text-xs text-error">{form.formState.errors.name?.message}</p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="px-1 text-xs font-semibold uppercase tracking-wider text-on-surface-variant" htmlFor="email">
                  Email
                </label>
                <div className="group relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                    <span className="material-symbols-outlined text-lg text-outline group-focus-within:text-primary">
                      mail
                    </span>
                  </div>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="email@ejemplo.com"
                    className="h-14 w-full rounded-xl border-none bg-surface-container-lowest pl-12 pr-4 text-on-surface placeholder:text-outline focus:bg-surface-container focus:ring-2 focus:ring-primary/40"
                    {...form.register("email")}
                  />
                </div>
                <p className="text-xs text-error">{form.formState.errors.email?.message}</p>
              </div>
              <div className="space-y-2">
                <label className="px-1 text-xs font-semibold uppercase tracking-wider text-on-surface-variant" htmlFor="phone">
                  Teléfono
                </label>
                <div className="group relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                    <span className="material-symbols-outlined text-lg text-outline group-focus-within:text-primary">
                      call
                    </span>
                  </div>
                  <input
                    id="phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder="+57 300…"
                    className="h-14 w-full rounded-xl border-none bg-surface-container-lowest pl-12 pr-4 text-on-surface placeholder:text-outline focus:bg-surface-container focus:ring-2 focus:ring-primary/40"
                    {...form.register("phone")}
                  />
                </div>
                <p className="text-xs text-error">{form.formState.errors.phone?.message}</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="flex justify-between px-1 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                Documento de identidad
              </label>
              <div className="group relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                  <span className="material-symbols-outlined text-lg text-outline group-focus-within:text-primary">
                    badge
                  </span>
                </div>
                <input
                  id="documentId"
                  type="text"
                  autoComplete="off"
                  placeholder="Cédula o documento"
                  className="h-14 w-full rounded-xl border-none bg-surface-container-lowest pl-12 pr-4 text-on-surface placeholder:text-outline focus:bg-surface-container focus:ring-2 focus:ring-primary/40"
                  {...form.register("documentId")}
                />
              </div>
              <p className="text-xs text-error">{form.formState.errors.documentId?.message}</p>
            </div>

            <div className="space-y-2">
              <label className="mb-1 flex justify-between px-1 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                Ruta de cobro
                <span className="text-[10px] font-normal lowercase opacity-60">Opcional</span>
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                  <span className="material-symbols-outlined text-lg text-outline">route</span>
                </div>
                {isRouteManager ? (
                  routesMeQuery.isLoading ? (
                    <select id="routeId" disabled className={`${selectClass} opacity-60`} value="">
                      <option value="">Cargando rutas…</option>
                    </select>
                  ) : routesMeQuery.data && routesMeQuery.data.data.length > 0 ? (
                    <select id="routeId" className={selectClass} {...form.register("routeId")}>
                      {routesMeQuery.data.data.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="rounded-xl bg-surface-container-lowest px-4 py-4 pl-12 text-sm text-on-surface-variant">
                      No tienes rutas asignadas. Solicita una ruta a administración.
                    </p>
                  )
                ) : routesPublicQuery.isLoading ? (
                  <select id="routeId" disabled className={`${selectClass} opacity-60`} value="">
                    <option value="">Cargando rutas…</option>
                  </select>
                ) : routesPublicQuery.isError ? (
                  <p className="text-sm text-error">No se pudieron cargar las rutas.</p>
                ) : routesPublicQuery.data && routesPublicQuery.data.data.length > 0 ? (
                  <select id="routeId" className={selectClass} {...form.register("routeId")}>
                    <option value="">Selecciona una ruta (opcional)</option>
                    {routesPublicQuery.data.data.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="rounded-xl bg-surface-container-lowest px-4 py-4 pl-12 text-sm text-on-surface-variant">
                    No hay rutas públicas aún. Contacta a administración.
                  </p>
                )}
              </div>
              <p className="text-xs text-error">{form.formState.errors.routeId?.message}</p>
              <p className="text-xs text-on-surface-variant">
                {isRouteManager
                  ? "El cliente quedará asociado a la ruta elegida."
                  : "Puedes vincularte a una ruta o usar un enlace con ?routeId=…"}
              </p>
            </div>

            <details className="rounded-xl border border-outline-variant/20 bg-surface-container-low/50 px-4 py-3">
              <summary className="cursor-pointer font-label text-sm font-semibold text-on-surface-variant">
                Dirección y notas (opcional)
              </summary>
              <div className="mt-4 space-y-4">
                <div>
                  <label className="mb-1 block text-xs text-on-surface-variant" htmlFor="address">
                    Dirección
                  </label>
                  <input
                    id="address"
                    type="text"
                    className="h-12 w-full rounded-xl border-none bg-surface-container-lowest px-4 text-on-surface focus:ring-2 focus:ring-primary/40"
                    {...form.register("address")}
                  />
                  <p className="text-xs text-error">{form.formState.errors.address?.message}</p>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-on-surface-variant" htmlFor="description">
                    Descripción
                  </label>
                  <textarea
                    id="description"
                    rows={2}
                    className="w-full rounded-xl border-none bg-surface-container-lowest px-4 py-3 text-on-surface focus:ring-2 focus:ring-primary/40"
                    {...form.register("description")}
                  />
                  <p className="text-xs text-error">{form.formState.errors.description?.message}</p>
                </div>
              </div>
            </details>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="px-1 text-xs font-semibold uppercase tracking-wider text-on-surface-variant" htmlFor="password">
                  Contraseña
                </label>
                <div className="group relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                    <span className="material-symbols-outlined text-lg text-outline group-focus-within:text-primary">
                      lock
                    </span>
                  </div>
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="••••••••"
                    className="h-14 w-full rounded-xl border-none bg-surface-container-lowest pl-12 pr-12 text-on-surface placeholder:text-outline focus:bg-surface-container focus:ring-2 focus:ring-primary/40"
                    {...form.register("password")}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-3 flex items-center text-outline hover:text-on-surface"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Ocultar" : "Mostrar"}
                  >
                    <span className="material-symbols-outlined text-lg">{showPassword ? "visibility_off" : "visibility"}</span>
                  </button>
                </div>
                <p className="text-xs text-error">{form.formState.errors.password?.message}</p>
              </div>
              <div className="space-y-2">
                <label
                  className="px-1 text-xs font-semibold uppercase tracking-wider text-on-surface-variant"
                  htmlFor="confirmPassword"
                >
                  Confirmar
                </label>
                <div className="group relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                    <span className="material-symbols-outlined text-lg text-outline group-focus-within:text-primary">
                      lock_reset
                    </span>
                  </div>
                  <input
                    id="confirmPassword"
                    type={showConfirm ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="••••••••"
                    className="h-14 w-full rounded-xl border-none bg-surface-container-lowest pl-12 pr-12 text-on-surface placeholder:text-outline focus:bg-surface-container focus:ring-2 focus:ring-primary/40"
                    {...form.register("confirmPassword")}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-3 flex items-center text-outline hover:text-on-surface"
                    onClick={() => setShowConfirm((v) => !v)}
                    aria-label={showConfirm ? "Ocultar" : "Mostrar"}
                  >
                    <span className="material-symbols-outlined text-lg">{showConfirm ? "visibility_off" : "visibility"}</span>
                  </button>
                </div>
                <p className="text-xs text-error">{form.formState.errors.confirmPassword?.message}</p>
              </div>
            </div>

            <div className="flex items-start gap-3 px-1 py-2">
              <div className="flex h-5 items-center">
                <input
                  id="acceptTerms"
                  type="checkbox"
                  className="h-5 w-5 rounded border-outline-variant bg-surface-container-lowest text-primary focus:ring-primary focus:ring-offset-2 focus:ring-offset-surface"
                  {...form.register("acceptTerms")}
                />
              </div>
              <label htmlFor="acceptTerms" className="text-sm text-on-surface-variant">
                Acepto los{" "}
                <span className="font-medium text-primary">Términos y Condiciones</span> y la{" "}
                <span className="font-medium text-primary">Política de Privacidad</span> de Ruut.
              </label>
            </div>
            <p className="text-xs text-error">{form.formState.errors.acceptTerms?.message}</p>

            {error ? <p className="text-sm text-error">{error}</p> : null}
            {success ? <p className="text-sm text-primary">{success}</p> : null}

            <button
              type="submit"
              disabled={!form.formState.isValid || form.formState.isSubmitting}
              className="auth-tonal-shadow h-14 w-full rounded-2xl bg-gradient-to-br from-primary to-primary-container font-headline text-lg font-bold tracking-wide text-on-primary transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
            >
              {form.formState.isSubmitting ? "Creando cuenta…" : "Registrarse"}
            </button>
          </form>

          <div className="mt-8 text-center">
            <p className="text-on-surface-variant">
              ¿Ya tienes una cuenta?{" "}
              <Link href="/login" className="ml-1 font-bold text-primary hover:underline">
                Iniciar sesión
              </Link>
            </p>
          </div>

          <div className="mt-16 flex flex-wrap justify-center gap-4 text-[10px] font-medium uppercase tracking-widest text-outline opacity-50">
            <span>© {new Date().getFullYear()} Ruut</span>
            <span className="h-1 w-1 self-center rounded-full bg-outline" />
            <span>Microcrédito de ruta</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const RegisterPage = (): JSX.Element => {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen w-full items-center justify-center bg-surface p-8">
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-outline-variant/20 bg-surface-container-low p-8">
            <div className="h-8 w-40 animate-pulse rounded bg-white/10" />
            <div className="h-14 animate-pulse rounded-xl bg-white/5" />
            <div className="h-14 animate-pulse rounded-xl bg-white/5" />
          </div>
        </div>
      }
    >
      <RegisterContent />
    </Suspense>
  );
};

export default RegisterPage;
