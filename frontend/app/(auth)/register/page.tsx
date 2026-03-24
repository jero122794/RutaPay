// frontend/app/(auth)/register/page.tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import api, { setAccessToken } from "../../../lib/api";
import { useAuthStore, type UserRole } from "../../../store/authStore";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

const registerSchema = z.object({
  name: z.string().min(2, "Nombre requerido"),
  email: z.union([z.string().email("Correo inválido"), z.literal("")]).optional(),
  phone: z.string().min(7, "Teléfono inválido"),
  address: z.string().min(5, "Dirección requerida"),
  description: z.string().min(3, "Descripción requerida"),
  documentId: z.string().min(5, "Documento requerido"),
  routeId: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : value),
    z.string().cuid().optional()
  ),
  password: z
    .string()
    .min(8, "Mínimo 8 caracteres")
    .regex(/[A-Z]/, "Debe incluir una mayúscula")
    .regex(/[0-9]/, "Debe incluir un número")
    .regex(/[^A-Za-z0-9]/, "Debe incluir un símbolo")
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

const RegisterContent = (): JSX.Element => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const setUser = useAuthStore((state) => state.setUser);
  const user = useAuthStore((state) => state.user);

  const routeIdFromQuery = searchParams.get("routeId") ?? "";
  const role: UserRole = user?.roles[0] ?? "CLIENT";
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
      password: ""
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

    try {
      const response = await api.post<RegisterResponse>("/auth/register", values);
      setAccessToken(response.data.data.accessToken);
      setUser({
        id: response.data.data.user.id,
        name: response.data.data.user.name,
        email: response.data.data.user.email,
        roles: response.data.data.user.roles as UserRole[]
      });
      setSuccess(`Cuenta creada para ${response.data.data.user.name}.`);
      form.reset();
      router.push("/overview");
    } catch {
      setError("No fue posible crear la cuenta. Verifica los datos.");
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-xl">
        <h1 className="mb-2 text-2xl font-semibold text-textPrimary">Registro</h1>
        <p className="mb-6 text-sm text-textSecondary">Crea una cuenta nueva para acceder al sistema.</p>

        <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
          <div>
            <label htmlFor="name" className="mb-1 block text-sm text-textSecondary">
              Nombre completo
            </label>
            <input
              id="name"
              type="text"
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
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
              {...form.register("email")}
            />
            <p className="mt-1 text-xs text-danger">{form.formState.errors.email?.message}</p>
          </div>

          <div>
            <label htmlFor="phone" className="mb-1 block text-sm text-textSecondary">
              Teléfono
            </label>
            <input
              id="phone"
              type="text"
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
              type="text"
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
              type="text"
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

          <div>
            <label htmlFor="routeId" className="mb-1 block text-sm text-textSecondary">
              Ruta
            </label>
            {isRouteManager ? (
              routesMeQuery.isLoading ? (
                <select
                  id="routeId"
                  disabled
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary opacity-60"
                  value=""
                >
                  <option value="">Cargando rutas...</option>
                </select>
              ) : routesMeQuery.data && routesMeQuery.data.data.length > 0 ? (
                <select
                  id="routeId"
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
                  {...form.register("routeId")}
                >
                  {routesMeQuery.data.data.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-textSecondary">
                  No tienes rutas asignadas. Solicita una ruta a administración.
                </p>
              )
            ) : routesPublicQuery.isLoading ? (
              <select
                id="routeId"
                disabled
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary opacity-60"
                value=""
              >
                <option value="">Cargando rutas...</option>
              </select>
            ) : routesPublicQuery.isError ? (
              <p className="text-sm text-danger">No se pudieron cargar las rutas. Intenta de nuevo más tarde.</p>
            ) : routesPublicQuery.data && routesPublicQuery.data.data.length > 0 ? (
              <select
                id="routeId"
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
                {...form.register("routeId")}
              >
                <option value="">Selecciona una ruta (opcional)</option>
                {routesPublicQuery.data.data.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-textSecondary">
                No hay rutas registradas aún. Contacta a administración.
              </p>
            )}
            <p className="mt-1 text-xs text-danger">{form.formState.errors.routeId?.message}</p>
            <p className="mt-1 text-xs text-textSecondary">
              {isRouteManager
                ? "El cliente quedará asociado a la ruta elegida. Sin ruta no aparecerá en tu módulo de clientes."
                : "Opcional: vincula tu cuenta a la ruta de tu microcrédito. También puedes usar un enlace con ?routeId=…"}
            </p>
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

          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {success ? <p className="text-sm text-success">{success}</p> : null}

          <button
            type="submit"
            disabled={!form.formState.isValid || form.formState.isSubmitting}
            className="w-full rounded-md bg-primary px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            {form.formState.isSubmitting ? "Creando cuenta..." : "Registrarme"}
          </button>
        </form>

        <p className="mt-4 text-sm text-textSecondary">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="text-primary hover:underline">
            Inicia sesión
          </Link>
        </p>
      </div>
    </main>
  );
};

const RegisterPage = (): JSX.Element => {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-bg px-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6">
            <p className="text-sm text-textSecondary">Cargando...</p>
          </div>
        </main>
      }
    >
      <RegisterContent />
    </Suspense>
  );
};

export default RegisterPage;
