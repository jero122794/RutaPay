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
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="relative flex min-h-screen overflow-hidden bg-surface font-body text-on-surface">
      <section className="relative hidden w-1/2 flex-col justify-between overflow-hidden p-16 lg:flex">
        <div className="absolute inset-0 z-0">
          <img
            alt=""
            className="h-full w-full object-cover opacity-60"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuDFniqbKhO9ZZYLPSMaDpTAzVsGU36O469ra6gQ-pBd56HqFHLE6XgvwtuhyyjJ-8aNlQCPTQrENyN16Gv0aTzUZUqIvCxNpYphHic0cNuaD6SlPfFAWRBnzMXH8OM72vs6Uvk-WEEnnR6e9ZSA5IazlsMn2DapKztE5uuG6oVkG62UxZ16eSjJuRrgb02p4myTkzr2r7jWisQr61O7uLWy59GgBYEfUeykeXKPkhIJY6OxYfnLdbT9C3gpG0nkIKk_I2wplPDZ8lo"
          />
          <div className="absolute inset-0 bg-gradient-to-tr from-surface via-transparent to-primary/10" />
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center">
              <img
                src="/brand/ruut_logo_1.svg"
                alt="Ruut"
                className="h-full w-full object-contain"
              />
            </div>
            <h1 className="font-headline text-2xl font-black tracking-tighter text-primary">Ruut</h1>
          </div>
        </div>

        <div className="relative z-10 max-w-lg">
          <h2 className="mb-6 font-headline text-4xl font-extrabold leading-tight text-on-surface xl:text-5xl">
            Gestión de rutas con <span className="text-primary">precisión</span> absoluta.
          </h2>
          <p className="text-lg leading-relaxed text-on-surface-variant">
            Diseñado para el mercado colombiano. Control de cobros, reportes en tiempo real y seguridad para tu
            microcrédito en un solo lugar.
          </p>
        </div>

        <div className="relative z-10 flex flex-wrap gap-10">
          <div>
            <div className="font-headline text-3xl font-bold text-primary">100%</div>
            <div className="text-sm font-medium tracking-wide text-on-surface-variant">FIABILIDAD</div>
          </div>
          <div>
            <div className="font-headline text-3xl font-bold text-primary">Cifrado</div>
            <div className="text-sm font-medium tracking-wide text-on-surface-variant">DATOS PROTEGIDOS</div>
          </div>
        </div>
      </section>

      <main className="flex min-h-[100dvh] w-full flex-col items-center bg-surface p-6 sm:p-8 lg:min-h-screen lg:w-1/2">
        <div className="flex w-full flex-1 flex-col items-center justify-center">
          <div className="auth-form w-full max-w-md space-y-10">
            <div className="text-center lg:text-left">
              <h3 className="mb-2 font-headline text-3xl font-bold text-on-surface">Iniciar sesión</h3>
              <p className="font-medium text-on-surface-variant">Ingresa tu cédula o correo y contraseña para acceder.</p>
            </div>

            <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <div className="space-y-2">
              <label
                className="ml-1 font-headline text-xs font-bold uppercase tracking-widest text-on-surface-variant"
                htmlFor="identifier"
              >
                Correo o cédula
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center">
                  <span className="material-symbols-outlined text-lg text-outline" aria-hidden>
                    mail
                  </span>
                </div>
                <input
                  id="identifier"
                  type="text"
                  autoComplete="username"
                  placeholder="nombre@empresa.com o documento"
                  className="auth-field-inset h-14 w-full rounded-xl border-none pl-12 pr-4 text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary/40"
                  {...form.register("identifier")}
                />
              </div>
              <p className="text-xs text-error">{form.formState.errors.identifier?.message}</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <label
                  className="font-headline text-xs font-bold uppercase tracking-widest text-on-surface-variant"
                  htmlFor="password"
                >
                  Contraseña
                </label>
                <span
                  className="cursor-not-allowed font-label text-xs font-semibold text-primary opacity-70"
                  title="Próximamente"
                >
                  ¿Olvidaste tu contraseña?
                </span>
              </div>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center">
                  <span className="material-symbols-outlined text-lg text-outline" aria-hidden>
                    lock
                  </span>
                </div>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="auth-field-inset h-14 w-full rounded-xl border-none pl-12 pr-14 text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary/40"
                  {...form.register("password")}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-4 flex items-center text-outline hover:text-on-surface"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  <span className="material-symbols-outlined text-lg" aria-hidden>
                    {showPassword ? "visibility_off" : "visibility"}
                  </span>
                </button>
              </div>
              <p className="text-xs text-error">{form.formState.errors.password?.message}</p>
            </div>

            {error ? <p className="text-sm text-error">{error}</p> : null}
            {success ? <p className="text-sm text-primary">{success}</p> : null}

            <button
              type="submit"
              disabled={!form.formState.isValid || form.formState.isSubmitting}
              className="auth-tonal-shadow group flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-container font-headline text-lg font-bold text-on-primary transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100"
            >
              {form.formState.isSubmitting ? "Ingresando…" : "Iniciar sesión"}
              <span
                className="material-symbols-outlined transition-transform group-hover:translate-x-1"
                aria-hidden
              >
                arrow_forward
              </span>
            </button>
          </form>

          <div className="pt-2 text-center">
            <p className="text-sm font-medium text-on-surface-variant">
              ¿No tienes una cuenta?{" "}
              <Link href="/register" className="ml-1 font-bold text-primary underline-offset-4 hover:underline">
                Regístrate
              </Link>
            </p>
          </div>
        </div>
        </div>

        <footer className="flex w-full max-w-md shrink-0 flex-col items-center gap-4 pt-8 pb-6 lg:pb-8">
          <div className="flex flex-wrap items-center justify-center gap-6">
            <span className="font-label text-xs font-medium text-outline">Términos</span>
            <span className="font-label text-xs font-medium text-outline">Privacidad</span>
            <span className="font-label text-xs font-medium text-outline">Legal</span>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-outline-variant">
            © {new Date().getFullYear()} Ruut
          </span>
        </footer>
      </main>

      <div
        className="pointer-events-none fixed inset-0 z-[5] opacity-[0.03] mix-blend-overlay contrast-150"
        aria-hidden
      >
        <svg className="h-full w-full" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
          <filter id="noiseFilterLogin">
            <feTurbulence baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" type="fractalNoise" />
          </filter>
          <rect width="100%" height="100%" filter="url(#noiseFilterLogin)" />
        </svg>
      </div>

      {licenseWarning ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-outline-variant/20 bg-surface-container-high p-6 shadow-2xl">
            <h2 className="font-headline text-lg font-semibold text-on-surface">Tu licencia está por vencer</h2>
            <p className="mt-2 text-sm text-on-surface-variant">
              Te quedan{" "}
              <span className="font-semibold text-on-surface">{licenseWarning.daysRemaining}</span> días de licencia.
              Vence el <span className="font-semibold text-on-surface">{licenseWarning.endsAt.slice(0, 10)}</span>.
            </p>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                className="rounded-xl bg-primary px-5 py-2.5 font-label text-sm font-bold text-on-primary"
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
    </div>
  );
};

export default LoginPage;
