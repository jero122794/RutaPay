// frontend/app/(dashboard)/settings/role-modules/page.tsx
"use client";

import axios from "axios";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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

const MODULE_OPTIONS: { value: AppModuleKey; label: string }[] = [
  { value: "OVERVIEW", label: "Inicio" },
  { value: "ROUTES", label: "Rutas" },
  { value: "CLIENTS", label: "Clientes" },
  { value: "LOANS", label: "Préstamos" },
  { value: "PAYMENTS", label: "Pagos" },
  { value: "TREASURY", label: "Tesorería" },
  { value: "USERS", label: "Usuarios" },
  { value: "NOTIFICATIONS", label: "Alertas" },
  { value: "BUSINESSES", label: "Negocios" },
  { value: "ROLE_MODULES", label: "Módulos por rol" }
];

const roleLabel = (r: UserRole): string => {
  switch (r) {
    case "SUPER_ADMIN":
      return "Super administrador";
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

const RoleModulesPage = (): JSX.Element => {
  const user = useAuthStore((state) => state.user);
  const role: UserRole = pickPrimaryRole(getEffectiveRoles(user));
  const queryClient = useQueryClient();

  const [grants, setGrants] = useState<Record<UserRole, AppModuleKey[]> | null>(null);

  const grantsQuery = useQuery({
    queryKey: ["role-modules"],
    queryFn: async (): Promise<Record<string, string[]>> => {
      const res = await api.get<{ data: Record<string, string[]> }>("/role-modules");
      return res.data.data;
    },
    enabled: role === "SUPER_ADMIN"
  });

  useEffect(() => {
    const d = grantsQuery.data;
    if (!d) {
      return;
    }
    const next: Record<UserRole, AppModuleKey[]> = {
      SUPER_ADMIN: (d.SUPER_ADMIN ?? []) as AppModuleKey[],
      ADMIN: (d.ADMIN ?? []) as AppModuleKey[],
      ROUTE_MANAGER: (d.ROUTE_MANAGER ?? []) as AppModuleKey[],
      CLIENT: (d.CLIENT ?? []) as AppModuleKey[]
    };
    setGrants(next);
  }, [grantsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async (body: Record<UserRole, AppModuleKey[]>): Promise<void> => {
      await api.put("/role-modules", { grants: body });
    },
    onSuccess: async () => {
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

  if (role !== "SUPER_ADMIN") {
    return (
      <section className="rounded-xl border border-border bg-surface p-6">
        <p className="text-sm text-danger">Solo el super administrador puede editar permisos por módulo.</p>
        <Link href="/overview" className="mt-4 inline-block text-primary hover:underline">
          Volver
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <header className="rounded-xl border border-border bg-surface p-6">
        <h1 className="text-xl font-semibold">Módulos por rol</h1>
        <p className="mt-1 text-sm text-textSecondary">
          Define qué secciones puede ver cada rol en la aplicación. El rol SUPER_ADMIN ignora estas reglas en el
          servidor y conserva acceso total.
        </p>
        <Link href="/overview" className="mt-3 inline-block text-sm text-primary hover:underline">
          Volver al inicio
        </Link>
      </header>

      {grantsQuery.isLoading ? <p className="text-sm text-textSecondary">Cargando...</p> : null}
      {grantsQuery.isError ? (
        <p className="text-sm text-danger">{getErrorMessage(grantsQuery.error)}</p>
      ) : null}

      {grants ? (
        <div className="space-y-6">
          {ROLES.map((r) => (
            <div key={r} className="rounded-xl border border-border bg-surface p-4">
              <h2 className="text-sm font-semibold text-textPrimary">{roleLabel(r)}</h2>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {MODULE_OPTIONS.map((opt) => (
                  <label key={opt.value} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={(grants[r] ?? []).includes(opt.value)}
                      onChange={() => {
                        toggle(r, opt.value);
                      }}
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!canSave || saveMutation.isPending}
              onClick={() => {
                if (!grants) {
                  return;
                }
                void saveMutation.mutateAsync(grants).catch(() => {
                  // Error surfaced below
                });
              }}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saveMutation.isPending ? "Guardando..." : "Guardar cambios"}
            </button>
            {!canSave ? (
              <span className="text-xs text-amber-500">Cada rol debe tener al menos un módulo.</span>
            ) : null}
            {saveMutation.isError ? (
              <span className="text-xs text-danger">{getErrorMessage(saveMutation.error)}</span>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default RoleModulesPage;
