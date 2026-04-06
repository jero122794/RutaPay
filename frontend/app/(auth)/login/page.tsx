// frontend/app/(auth)/login/page.tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import api, { setAccessToken } from "../../../lib/api";
import { useAuthStore, type AppModuleKey, type UserRole } from "../../../store/authStore";

const loginSchema = z.object({
  identifier: z.string().min(3, "Ingresa cédula o correo"),
  password: z.string().min(8, "La contraseña debe tener mínimo 8 caracteres")
});

type LoginFormData = z.infer<typeof loginSchema>;

interface LoginResponse {
  data: {
    accessToken: string;
    licenseWarning?: {
      endsAt: string;
      daysRemaining: number;
    };
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

const LoginPage = (): JSX.Element => {
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [licenseWarning, setLicenseWarning] = useState<{ endsAt: string; daysRemaining: number } | null>(
    null
  );
  const [shouldRedirectAfterWarning, setShouldRedirectAfterWarning] = useState(false);
  const setUser = useAuthStore((state) => state.setUser);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      identifier: "",
      password: ""
    },
    mode: "onChange"
  });

  const onSubmit = async (values: LoginFormData): Promise<void> => {
    setError("");
    setSuccess("");
    setLicenseWarning(null);
    setShouldRedirectAfterWarning(false);
    try {
      const response = await api.post<LoginResponse>("/auth/login", values);
      setAccessToken(response.data.data.accessToken);
      setUser({
        id: response.data.data.user.id,
        name: response.data.data.user.name,
        email: response.data.data.user.email ?? "",
        roles: response.data.data.user.roles as UserRole[],
        businessId: response.data.data.user.businessId ?? null,
        modules: (response.data.data.user.modules ?? []) as AppModuleKey[]
      });

      const roles = response.data.data.user.roles as UserRole[];
      const isAdmin = roles.includes("ADMIN") && !roles.includes("SUPER_ADMIN");
      if (isAdmin && response.data.data.licenseWarning) {
        setLicenseWarning(response.data.data.licenseWarning);
        setShouldRedirectAfterWarning(true);
        setSuccess(`Bienvenido, ${response.data.data.user.name}.`);
        return;
      }

      setSuccess(`Bienvenido, ${response.data.data.user.name}.`);
      router.push("/overview");
    } catch {
      setError("No fue posible iniciar sesión. Verifica tus credenciales.");
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-xl">
        <h1 className="mb-2 text-2xl font-semibold text-textPrimary">Iniciar sesión</h1>
        <p className="mb-6 text-sm text-textSecondary">Accede a tu cuenta para gestionar tu ruta.</p>

        <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
          <div>
            <label htmlFor="identifier" className="mb-1 block text-sm text-textSecondary">
              Cédula (o correo)
            </label>
            <input
              id="identifier"
              type="text"
              placeholder="Ej: 1032456789"
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
              {...form.register("identifier")}
            />
            <p className="mt-1 text-xs text-danger">{form.formState.errors.identifier?.message}</p>
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
            {form.formState.isSubmitting ? "Ingresando..." : "Ingresar"}
          </button>
        </form>

        <p className="mt-4 text-sm text-textSecondary">
          ¿No tienes cuenta?{" "}
          <Link href="/register" className="text-primary hover:underline">
            Regístrate
          </Link>
        </p>
      </div>

      {licenseWarning ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-textPrimary">Tu licencia está por vencer</h2>
            <p className="mt-2 text-sm text-textSecondary">
              Te quedan <span className="font-semibold text-textPrimary">{licenseWarning.daysRemaining}</span>{" "}
              días de licencia. Vence el{" "}
              <span className="font-semibold text-textPrimary">
                {licenseWarning.endsAt.slice(0, 10)}
              </span>
              .
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-border bg-bg px-4 py-2 text-sm font-medium text-textPrimary"
                onClick={() => {
                  setLicenseWarning(null);
                  if (shouldRedirectAfterWarning) {
                    router.push("/overview");
                  }
                }}
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
};

export default LoginPage;
