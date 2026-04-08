// frontend/app/(dashboard)/settings/role-modules/page.tsx
"use client";

import axios from "axios";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../../../../lib/api";
import { getEffectiveRoles, pickPrimaryRole } from "../../../../lib/effective-roles";
import { useAuthStore, type AppModuleKey, type UserRole } from "../../../../store/authStore";

const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: string } | undefined)?.message;
    return message ?? error.message;
  }
  return "Error desconocido.";
};

const ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "ROUTE_MANAGER", "CLIENT"];

const MODULE_OPTIONS: { value: AppModuleKey; label: string; icon: string }[] = [
  { value: "OVERVIEW", label: "OVERVIEW", icon: "grid_view" },
  { value: "ROUTES", label: "ROUTES", icon: "route" },
  { value: "CLIENTS", label: "CLIENTS", icon: "group" },
  { value: "LOANS", label: "LOANS", icon: "payments" },
  { value: "PAYMENTS", label: "PAYMENTS", icon: "account_balance_wallet" },
  { value: "TREASURY", label: "TREASURY", icon: "account_balance" },
  { value: "USERS", label: "USERS", icon: "person" },
  { value: "NOTIFICATIONS", label: "NOTIFICATIONS", icon: "notifications" },
  { value: "BUSINESSES", label: "BUSINESSES", icon: "store" },
  { value: "ROLE_MODULES", label: "ROLE_MODULES", icon: "shield_person" }
];

const mapApiToGrants = (d: Record<string, string[]>): Record<UserRole, AppModuleKey[]> => ({
  SUPER_ADMIN: (d.SUPER_ADMIN ?? []) as AppModuleKey[],
  ADMIN: (d.ADMIN ?? []) as AppModuleKey[],
  ROUTE_MANAGER: (d.ROUTE_MANAGER ?? []) as AppModuleKey[],
  CLIENT: (d.CLIENT ?? []) as AppModuleKey[]
});

const grantsEqual = (
  a: Record<UserRole, AppModuleKey[]> | null,
  b: Record<UserRole, AppModuleKey[]> | null
): boolean => {
  if (!a || !b) return a === b;
  return ROLES.every((r) => {
    const sa = [...(a[r] ?? [])].sort().join(",");
    const sb = [...(b[r] ?? [])].sort().join(",");
    return sa === sb;
  });
};

const roleRowMeta = (r: UserRole): { icon: string; iconClass: string; fill?: boolean } => {
  switch (r) {
    case "SUPER_ADMIN":
      return { icon: "grade", iconClass: "bg-primary/10 text-primary", fill: true };
    case "ADMIN":
      return { icon: "shield", iconClass: "bg-secondary/10 text-secondary" };
    case "ROUTE_MANAGER":
      return { icon: "route", iconClass: "bg-tertiary/10 text-tertiary" };
    case "CLIENT":
      return { icon: "person_outline", iconClass: "bg-on-surface-variant/10 text-on-surface-variant" };
    default:
      return { icon: "person", iconClass: "bg-on-surface-variant/10 text-on-surface-variant" };
  }
};

const ModuleSwitch = ({
  checked,
  onChange,
  disabled
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}): JSX.Element => (
  <label className={`relative inline-flex h-6 w-11 items-center ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
    <input
      type="checkbox"
      className="peer sr-only"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
    />
    <span className="absolute inset-0 rounded-full bg-surface transition peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/50" />
    <span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-on-surface-variant shadow transition-transform peer-checked:translate-x-[1.25rem] peer-checked:bg-on-primary" />
  </label>
);

const RoleModulesPage = (): JSX.Element => {
  const user = useAuthStore((state) => state.user);
  const hasAuthHydrated = useAuthStore((state) => state.hasAuthHydrated);
  const role: UserRole = pickPrimaryRole(getEffectiveRoles(user));
  const queryClient = useQueryClient();

  const [grants, setGrants] = useState<Record<UserRole, AppModuleKey[]> | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const grantsQuery = useQuery({
    queryKey: ["role-modules"],
    queryFn: async (): Promise<Record<string, string[]>> => {
      const res = await api.get<{ data: Record<string, string[]> }>("/role-modules");
      return res.data.data;
    },
    enabled: hasAuthHydrated && Boolean(user) && role === "SUPER_ADMIN"
  });

  useEffect(() => {
    const d = grantsQuery.data;
    if (!d) {
      return;
    }
    setGrants(mapApiToGrants(d));
  }, [grantsQuery.data]);

  const serverGrants = useMemo((): Record<UserRole, AppModuleKey[]> | null => {
    if (!grantsQuery.data) return null;
    return mapApiToGrants(grantsQuery.data);
  }, [grantsQuery.data]);

  const isDirty = useMemo((): boolean => !grantsEqual(grants, serverGrants), [grants, serverGrants]);

  const saveMutation = useMutation({
    mutationFn: async (body: Record<UserRole, AppModuleKey[]>): Promise<void> => {
      await api.put("/role-modules", { grants: body });
    },
    onSuccess: async () => {
      setLastSavedAt(new Date());
      await queryClient.invalidateQueries({ queryKey: ["role-modules"] });
    }
  });

  const toggle = (r: UserRole, mod: AppModuleKey): void => {
    setGrants((prev) => {
      if (!prev) {
        return prev;
      }
      const cur = prev[r] ?? [];
      const has = cur.includes(mod);
      const nextList = has ? cur.filter((x) => x !== mod) : [...cur, mod];
      return { ...prev, [r]: nextList };
    });
  };

  const canSave = useMemo((): boolean => Boolean(grants && ROLES.every((r) => (grants[r] ?? []).length > 0)), [grants]);

  const disabledCellCount = useMemo((): number => {
    if (!grants) return 0;
    let c = 0;
    ROLES.forEach((r) => {
      MODULE_OPTIONS.forEach((opt) => {
        if (!(grants[r] ?? []).includes(opt.value)) c += 1;
      });
    });
    return c;
  }, [grants]);

  const handleDiscard = (): void => {
    if (!grantsQuery.data) return;
    setGrants(mapApiToGrants(grantsQuery.data));
  };

  if (role !== "SUPER_ADMIN") {
    return (
      <section className="rounded-xl border border-border bg-surface p-6">
        <p className="text-sm text-error">Solo el super administrador puede editar permisos por módulo.</p>
        <Link href="/overview" className="mt-4 inline-block text-primary hover:underline">
          Volver
        </Link>
      </section>
    );
  }

  return (
    <section className="relative mx-auto max-w-[1600px] space-y-10 pb-24">
      <header className="mb-10 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="font-headline text-4xl font-extrabold tracking-tight text-on-surface">Gestión de permisos</h1>
          <p className="mt-2 font-medium text-on-surface-variant">Define el acceso a los módulos según el rol del usuario.</p>
          <p className="mt-1 text-xs text-on-surface-variant/80">
            El rol SUPER_ADMIN ignora estas reglas en el servidor y conserva acceso total.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={!isDirty || grantsQuery.isFetching}
            className="rounded-xl bg-surface-container-high px-6 py-3 text-sm font-semibold text-on-surface shadow-lg transition-all hover:bg-surface-bright active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={handleDiscard}
          >
            Descartar cambios
          </button>
          <button
            type="button"
            disabled={!canSave || !isDirty || saveMutation.isPending}
            className="rounded-xl bg-gradient-to-br from-primary to-primary-container px-6 py-3 text-sm font-bold text-on-primary shadow-[0_12px_32px_rgba(0,0,0,0.4),0_4px_8px_rgba(105,246,184,0.04)] transition-all hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => {
              if (!grants) return;
              void saveMutation.mutateAsync(grants).catch(() => {});
            }}
          >
            {saveMutation.isPending ? "Guardando…" : "Guardar matriz"}
          </button>
        </div>
      </header>

      {grantsQuery.isLoading ? (
        <p className="text-sm text-on-surface-variant">Cargando…</p>
      ) : null}
      {grantsQuery.isError ? (
        <p className="text-sm text-error">{getErrorMessage(grantsQuery.error)}</p>
      ) : null}

      {grants ? (
        <>
          {/* Mobile: cards per role */}
          <div className="space-y-4 md:hidden">
            {ROLES.map((r) => {
              const meta = roleRowMeta(r);
              const selected = grants[r] ?? [];
              return (
                <article
                  key={r}
                  className="overflow-hidden rounded-3xl border border-outline-variant/10 bg-surface-container-high shadow-[0_12px_32px_rgba(0,0,0,0.4)]"
                >
                  <header className="flex items-center justify-between gap-4 border-b border-outline-variant/10 bg-surface-container-highest/20 px-5 py-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${meta.iconClass}`}>
                        <span
                          className="material-symbols-outlined"
                          style={meta.fill ? { fontVariationSettings: "'FILL' 1" } : undefined}
                          aria-hidden
                        >
                          {meta.icon}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-headline text-base font-extrabold text-on-surface">{r}</p>
                        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-on-surface-variant">
                          {selected.length} módulos activos
                        </p>
                      </div>
                    </div>
                  </header>

                  <div className="divide-y divide-outline-variant/10">
                    {MODULE_OPTIONS.map((opt) => {
                      const checked = (grants[r] ?? []).includes(opt.value);
                      return (
                        <div key={`${r}-${opt.value}`} className="flex items-center justify-between gap-4 px-5 py-4">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                              <span className="material-symbols-outlined text-[20px]" aria-hidden>
                                {opt.icon}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-on-surface">{opt.label}</p>
                              <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
                                {opt.value}
                              </p>
                            </div>
                          </div>
                          <ModuleSwitch
                            checked={checked}
                            onChange={() => {
                              toggle(r, opt.value);
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </div>

          {/* Desktop/tablet: matrix */}
          <div className="relative hidden overflow-hidden rounded-[2rem] bg-surface-container-low p-1 shadow-2xl md:block">
            <div className="custom-scrollbar overflow-x-auto rounded-[1.8rem] bg-surface-container-high">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-surface-container-highest/50 backdrop-blur-md">
                    <th className="sticky left-0 z-20 w-64 border-r border-outline-variant/10 bg-surface-container-highest/80 p-6 text-left backdrop-blur-md">
                      <span className="text-xs font-bold uppercase tracking-widest text-primary">Rol / módulo</span>
                    </th>
                    {MODULE_OPTIONS.map((opt) => (
                      <th key={opt.value} className="border-r border-outline-variant/5 p-6 text-center last:border-r-0">
                        <span className="material-symbols-outlined mb-2 block text-primary" aria-hidden>
                          {opt.icon}
                        </span>
                        <span className="block whitespace-nowrap text-[11px] font-semibold text-on-surface">
                          {opt.label}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {ROLES.map((r) => {
                    const meta = roleRowMeta(r);
                    return (
                      <tr key={r} className="group transition-colors hover:bg-surface-bright/30">
                        <td className="sticky left-0 z-10 border-r border-outline-variant/10 bg-surface-container-high p-6 transition-colors group-hover:bg-surface-bright/50">
                          <div className="flex items-center gap-3">
                            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${meta.iconClass}`}>
                              <span
                                className="material-symbols-outlined text-sm"
                                style={meta.fill ? { fontVariationSettings: "'FILL' 1" } : undefined}
                                aria-hidden
                              >
                                {meta.icon}
                              </span>
                            </div>
                            <span className="text-sm font-bold tracking-wide text-on-surface">{r}</span>
                          </div>
                        </td>
                        {MODULE_OPTIONS.map((opt) => (
                          <td key={opt.value} className="p-6 text-center">
                            <div className="flex justify-center">
                              <ModuleSwitch
                                checked={(grants[r] ?? []).includes(opt.value)}
                                onChange={() => {
                                  toggle(r, opt.value);
                                }}
                              />
                            </div>
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {!canSave ? (
            <p className="text-xs text-amber-500">Cada rol debe tener al menos un módulo.</p>
          ) : null}
          {saveMutation.isError ? (
            <p className="text-xs text-error">{getErrorMessage(saveMutation.error)}</p>
          ) : null}

          <section className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="flex items-center gap-4 rounded-3xl border border-outline-variant/10 bg-surface-container-high p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <span className="material-symbols-outlined" aria-hidden>
                  history
                </span>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Último cambio</p>
                <p className="font-semibold text-on-surface">
                  {lastSavedAt
                    ? `${formatDistanceToNow(lastSavedAt, { addSuffix: true, locale: es })} por ${user?.name ?? "SUPER_ADMIN"}`
                    : "Aún no guardas en esta sesión"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 rounded-3xl border border-outline-variant/10 bg-surface-container-high p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary/10 text-secondary">
                <span className="material-symbols-outlined" aria-hidden>
                  security
                </span>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Políticas activas</p>
                <p className="font-semibold text-on-surface">
                  {ROLES.length} roles · {MODULE_OPTIONS.length} módulos
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 rounded-3xl border border-outline-variant/10 bg-surface-container-high p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-tertiary/10 text-tertiary">
                <span className="material-symbols-outlined" aria-hidden>
                  error_outline
                </span>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Combinaciones sin acceso</p>
                <p className="font-semibold text-on-surface">
                  {disabledCellCount} celdas sin permiso (rol × módulo)
                </p>
              </div>
            </div>
          </section>

          <div className="fixed bottom-8 right-8 z-30 max-w-xs animate-pulse rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 shadow-2xl backdrop-blur-xl sm:flex sm:items-center sm:gap-3">
            <span className="material-symbols-outlined text-primary" aria-hidden>
              info
            </span>
            <p className="text-[10px] leading-tight text-on-surface-variant">
              Los cambios guardados en esta matriz aplican a la navegación por módulos según el rol (validado también en el
              servidor).
            </p>
          </div>
        </>
      ) : null}
    </section>
  );
};

export default RoleModulesPage;
