// frontend/app/(dashboard)/users/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import TablePagination from "../../../components/ui/TablePagination";
import { DEFAULT_PAGE_SIZE, type PageSize } from "../../../lib/page-size";
import api from "../../../lib/api";
import { getEffectiveRoles, pickPrimaryRole } from "../../../lib/effective-roles";
import { useAuthStore, type UserRole } from "../../../store/authStore";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

interface ListResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

interface UserItem {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  roles: string[];
}

const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    if (error.code === "ERR_NETWORK" || error.message === "Network Error") {
      return "No se pudo contactar el servidor. Arranca el backend, revisa NEXT_PUBLIC_API_URL y la red (CORS si el front y el API están en distintos orígenes).";
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

const roleToneClasses = (roleName: string): { badge: string; chipText: string } => {
  if (roleName === "SUPER_ADMIN") {
    return { badge: "bg-primary/10 border-primary/20", chipText: "text-primary" };
  }
  if (roleName === "ADMIN") {
    return { badge: "bg-secondary-container/20 border-secondary-container/30", chipText: "text-secondary" };
  }
  if (roleName === "ROUTE_MANAGER") {
    return { badge: "bg-secondary-container/20 border-secondary-container/30", chipText: "text-secondary" };
  }
  return { badge: "bg-outline-variant/20 border-outline-variant/30", chipText: "text-on-surface-variant" };
};

const roleMeta = (
  roleName: "SUPER_ADMIN" | "ADMIN" | "ROUTE_MANAGER" | "CLIENT"
): { icon: string; title: string; description: string } => {
  switch (roleName) {
    case "SUPER_ADMIN":
      return {
        icon: "admin_panel_settings",
        title: "SUPER_ADMIN",
        description: "Control total del sistema"
      };
    case "ADMIN":
      return {
        icon: "manage_accounts",
        title: "ADMIN",
        description: "Gestión administrativa y operativa"
      };
    case "ROUTE_MANAGER":
      return {
        icon: "directions_run",
        title: "ROUTE_MANAGER",
        description: "Control de carteras de cobro"
      };
    default:
      return {
        icon: "person",
        title: "CLIENT",
        description: "Acceso para consulta de pagos"
      };
  }
};

const assignRolesSchemaSuper = z.object({
  roles: z.array(z.enum(["SUPER_ADMIN", "ADMIN", "ROUTE_MANAGER", "CLIENT"])).min(1)
});

const assignRolesSchemaAdmin = z.object({
  roles: z.array(z.enum(["ROUTE_MANAGER", "CLIENT"])).min(1)
});

type AssignRolesValues = z.infer<typeof assignRolesSchemaSuper>;

const UsersPage = (): JSX.Element => {
  const user = useAuthStore((state) => state.user);
  const hasAuthHydrated = useAuthStore((state) => state.hasAuthHydrated);
  const role: UserRole = pickPrimaryRole(getEffectiveRoles(user));
  const queryClient = useQueryClient();

  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [search, setSearch] = useState("");

  const usersQuery = useQuery({
    queryKey: ["users-list", page, limit],
    queryFn: async (): Promise<ListResponse<UserItem>> => {
      const response = await api.get<ListResponse<UserItem>>("/users", {
        params: { page, limit }
      });
      return response.data;
    },
    enabled: hasAuthHydrated && Boolean(user) && (role === "SUPER_ADMIN" || role === "ADMIN")
  });

  useEffect(() => {
    const d = usersQuery.data;
    if (!d) return;
    if (d.page !== page) setPage(d.page);
  }, [usersQuery.data, page]);

  useEffect(() => {
    const list = usersQuery.data?.data ?? [];
    if (selectedUserId && !list.some((u) => u.id === selectedUserId)) {
      setSelectedUserId("");
    }
  }, [usersQuery.data?.data, selectedUserId]);

  const allRoles = useMemo(() => ["SUPER_ADMIN", "ADMIN", "ROUTE_MANAGER", "CLIENT"] as const, []);
  const assignableRoles = useMemo((): readonly ("SUPER_ADMIN" | "ADMIN" | "ROUTE_MANAGER" | "CLIENT")[] => {
    if (role === "SUPER_ADMIN") {
      return allRoles;
    }
    return ["ROUTE_MANAGER", "CLIENT"];
  }, [allRoles, role]);

  const assignRolesResolver = useMemo<Resolver<AssignRolesValues>>(
    () =>
      zodResolver(role === "SUPER_ADMIN" ? assignRolesSchemaSuper : assignRolesSchemaAdmin) as Resolver<AssignRolesValues>,
    [role]
  );

  const form = useForm<AssignRolesValues>({
    resolver: assignRolesResolver,
    defaultValues: { roles: ["CLIENT"] },
    mode: "onChange"
  });

  const assignRolesMutation = useMutation({
    mutationFn: async (values: AssignRolesValues): Promise<UserItem> => {
      if (!selectedUserId) {
        throw new Error("Selecciona un usuario.");
      }
      const response = await api.post<{ data: UserItem; message: string }>(`/users/${selectedUserId}/roles`, values);
      return response.data.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["users-list"] });
    }
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (payload: { userId: string; nextIsActive: boolean }): Promise<void> => {
      await api.patch(`/users/${payload.userId}`, { isActive: payload.nextIsActive });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["users-list"] });
    }
  });
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string): Promise<void> => {
      await api.delete(`/users/${userId}`);
    },
    onSuccess: async () => {
      setSelectedUserId("");
      await queryClient.invalidateQueries({ queryKey: ["users-list"] });
    }
  });

  const selectedUser = useMemo<UserItem | null>(() => {
    const list = usersQuery.data?.data ?? [];
    return list.find((u) => u.id === selectedUserId) ?? null;
  }, [selectedUserId, usersQuery.data]);

  const filteredUsers = useMemo<UserItem[]>(() => {
    const q = search.trim().toLowerCase();
    const list = usersQuery.data?.data ?? [];
    if (!q) return list;
    return list.filter((u) => {
      const hay = `${u.name} ${u.email ?? ""} ${u.roles.join(" ")} ${u.id}`.toLowerCase();
      return hay.includes(q);
    });
  }, [usersQuery.data?.data, search]);

  useEffect(() => {
    if (!selectedUserId || !usersQuery.data?.data) {
      return;
    }
    const u = usersQuery.data.data.find((x) => x.id === selectedUserId);
    if (!u) {
      return;
    }
    const allowed = new Set(assignableRoles);
    const next = u.roles.filter((r) => allowed.has(r as (typeof assignableRoles)[number]));
    form.reset({ roles: (next.length > 0 ? next : ["CLIENT"]) as AssignRolesValues["roles"] });
  }, [assignableRoles, form.reset, selectedUserId, usersQuery.data?.data]);

  const canManage = role === "SUPER_ADMIN" || role === "ADMIN";
  const canDeleteUsers = role === "SUPER_ADMIN" || role === "ADMIN";
  const selectedIsClient = selectedUser?.roles.includes("CLIENT") ?? false;

  return (
    <section className="space-y-8">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
          <div className="min-w-0">
            <h1 className="font-headline text-3xl font-extrabold tracking-tight text-primary">Usuarios</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-on-surface-variant">
              Gestiona accesos y privilegios. Define responsabilidades precisas para el control administrativo de rutas
              y carteras de clientes.
            </p>
          </div>
          <Link href="/overview" className="text-sm font-bold text-primary hover:underline">
            Volver al inicio
          </Link>
        </div>

        <div className="relative w-full max-w-xl">
          <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
            search
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por usuario, email o rol…"
            className="w-full rounded-xl border-none bg-surface-container-lowest py-2.5 pl-10 pr-4 text-sm text-on-surface placeholder:text-on-surface-variant/70 focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      {role !== "SUPER_ADMIN" && role !== "ADMIN" ? (
        <div className="rounded-2xl border border-white/5 bg-surface-container p-6">
          <p className="text-sm text-error">No tienes permisos para gestionar usuarios.</p>
        </div>
      ) : null}

      {role === "SUPER_ADMIN" || role === "ADMIN" ? (
        <>
          {usersQuery.isLoading ? (
            <div className="rounded-2xl border border-white/5 bg-surface-container p-6">
              <p className="text-sm text-on-surface-variant">Cargando usuarios…</p>
            </div>
          ) : null}

          {usersQuery.isError ? (
            <div className="rounded-2xl border border-white/5 bg-surface-container p-6">
              <p className="text-sm text-error">{getErrorMessage(usersQuery.error)}</p>
            </div>
          ) : null}

          {toggleActiveMutation.isError ? (
            <div className="rounded-2xl border border-white/5 bg-surface-container p-4">
              <p className="text-sm text-error">{getErrorMessage(toggleActiveMutation.error)}</p>
            </div>
          ) : null}

          {usersQuery.data ? (
            <div className="flex flex-col gap-8 xl:flex-row">
              <section className="min-w-0 flex-1">
                <div className="rounded-3xl bg-surface-container-low shadow-2xl">
                  <div className="rutapay-table-wrap">
                    <table className="rutapay-table rutapay-table--responsive">
                      <thead>
                        <tr>
                          <th>Nombre</th>
                          <th>Email</th>
                          <th>Rol(es)</th>
                          <th>Activo</th>
                          <th className="text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredUsers.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-6 py-6 text-sm text-on-surface-variant">
                              {usersQuery.data.total === 0 ? "No hay usuarios." : "Sin resultados para la búsqueda."}
                            </td>
                          </tr>
                        ) : (
                          filteredUsers.map((u) => {
                            const selected = u.id === selectedUserId;
                            const togglingRow =
                              toggleActiveMutation.isPending && toggleActiveMutation.variables?.userId === u.id;

                            const rowClass = selected
                              ? "bg-surface-container-highest/80 border-l-4 border-primary shadow-inner"
                              : "bg-surface-container-high/30 hover:bg-surface-container-highest transition-colors";

                            return (
                              <tr
                                key={u.id}
                                className={`${rowClass} cursor-pointer`}
                                onClick={() => setSelectedUserId(u.id)}
                              >
                                <td data-label="Nombre" className="px-6 py-4">
                                  <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-container-highest ring-1 ring-outline-variant/20">
                                      <span className="text-xs font-bold text-on-surface">{initialsFromName(u.name)}</span>
                                    </div>
                                    <span className={`${selected ? "font-bold" : "font-semibold"} text-on-surface`}>
                                      {u.name}
                                    </span>
                                  </div>
                                </td>
                                <td data-label="Email" className="px-6 py-4 text-sm text-on-surface-variant">{u.email ?? "—"}</td>
                                <td data-label="Rol(es)" className="px-6 py-4">
                                  <div className="flex flex-wrap gap-1.5">
                                    {u.roles.map((r) => {
                                      const tone = roleToneClasses(r);
                                      return (
                                        <span
                                          key={`${u.id}-${r}`}
                                          className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${tone.badge} ${tone.chipText}`}
                                        >
                                          {r}
                                        </span>
                                      );
                                    })}
                                  </div>
                                </td>
                                <td data-label="Activo" className="px-6 py-4">
                                  <label className="relative inline-flex cursor-pointer items-center" onClick={(e) => e.stopPropagation()}>
                                    <input
                                      type="checkbox"
                                      className="peer sr-only"
                                      checked={u.isActive}
                                      disabled={togglingRow}
                                      onChange={() => {
                                        toggleActiveMutation.mutate({ userId: u.id, nextIsActive: !u.isActive });
                                      }}
                                    />
                                    <div className="h-6 w-11 rounded-full bg-surface-container-highest after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-outline-variant after:bg-white after:transition-all peer-checked:bg-primary-container peer-checked:after:translate-x-full peer-checked:after:border-white peer-disabled:opacity-50" />
                                  </label>
                                </td>
                                <td data-no-label="true" data-align="end" className="px-6 py-4 text-right">
                                  <button
                                    type="button"
                                    disabled={!canDeleteUsers || deleteUserMutation.isPending}
                                    className="text-xs font-bold uppercase tracking-wider text-error-dim transition-colors hover:text-error disabled:opacity-50"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      const confirmed = window.confirm("¿Seguro que deseas eliminar este usuario?");
                                      if (!confirmed) return;
                                      await deleteUserMutation.mutateAsync(u.id);
                                    }}
                                  >
                                    Eliminar
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center justify-between border-t border-outline-variant/10 bg-surface-container-lowest/30 px-6 py-4">
                    <span className="text-xs text-on-surface-variant">
                      Mostrando {usersQuery.data.total === 0 ? 0 : (page - 1) * limit + 1}-
                      {Math.min(page * limit, usersQuery.data.total)} de {usersQuery.data.total} usuarios
                    </span>
                    <div className="hidden xl:block">
                      <TablePagination
                        page={page}
                        limit={limit}
                        total={usersQuery.data.total}
                        onPageChange={setPage}
                        onLimitChange={(next) => {
                          setLimit(next);
                          setPage(1);
                        }}
                        className="border-t-0 pt-0"
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-4 xl:hidden">
                  <TablePagination
                    page={page}
                    limit={limit}
                    total={usersQuery.data.total}
                    onPageChange={setPage}
                    onLimitChange={(next) => {
                      setLimit(next);
                      setPage(1);
                    }}
                  />
                </div>
              </section>

              <aside className="w-full shrink-0 xl:w-96">
                <div className="sticky top-24 rounded-3xl border border-outline-variant/5 bg-surface-container-high p-8 shadow-xl">
                  <div className="mb-8 flex items-center justify-between">
                    <h2 className="font-headline text-xl font-bold text-on-surface">Asignar roles</h2>
                    <span className="material-symbols-outlined text-primary" aria-hidden>
                      security
                    </span>
                  </div>

                  {selectedUser ? (
                    <>
                      <div className="mb-8 flex items-center gap-4 rounded-2xl bg-surface-container-lowest/50 p-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-container-highest ring-2 ring-primary/40">
                          <span className="text-sm font-bold text-on-surface">{initialsFromName(selectedUser.name)}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-bold text-on-surface">{selectedUser.name}</p>
                          <p className="truncate text-xs text-on-surface-variant">{selectedUser.email ?? "—"}</p>
                        </div>
                      </div>

                      {selectedIsClient ? (
                        <Link
                          href={`/clients/${selectedUser.id}`}
                          className="mb-6 block w-full rounded-2xl border border-outline-variant/20 bg-surface-container-lowest/30 px-4 py-3 text-center text-sm font-bold text-on-surface transition-colors hover:bg-surface-container-highest"
                        >
                          Ir al detalle del cliente
                        </Link>
                      ) : null}

                      <div className="mb-10 space-y-3">
                        {assignableRoles.map((r) => {
                          const checked = form.watch("roles").includes(r);
                          const meta = roleMeta(r);
                          const tone = roleToneClasses(r);
                          return (
                            <label
                              key={r}
                              className={[
                                "flex cursor-pointer items-center justify-between rounded-2xl p-4 transition-colors",
                                checked ? "border border-primary/20 bg-primary/5" : "hover:bg-surface-container-highest"
                              ].join(" ")}
                            >
                              <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                  <span className="material-symbols-outlined" aria-hidden>
                                    {meta.icon}
                                  </span>
                                </div>
                                <div className="text-sm">
                                  <p className="font-bold text-on-surface">{meta.title}</p>
                                  <p className="mt-1 text-[10px] leading-none text-on-surface-variant">{meta.description}</p>
                                </div>
                              </div>
                              <input
                                type="checkbox"
                                className={`h-5 w-5 rounded border-outline-variant bg-surface-container-lowest ${tone.chipText}`}
                                checked={checked}
                                onChange={(e) => {
                                  const current = form.getValues("roles");
                                  if (e.target.checked) {
                                    form.setValue("roles", [...current, r], { shouldValidate: true });
                                  } else {
                                    form.setValue(
                                      "roles",
                                      current.filter((x) => x !== r),
                                      { shouldValidate: true }
                                    );
                                  }
                                }}
                              />
                            </label>
                          );
                        })}
                      </div>

                      <div className="space-y-4">
                        <button
                          type="button"
                          disabled={!canManage || assignRolesMutation.isPending || !form.formState.isValid}
                          onClick={() => {
                            const values = form.getValues();
                            assignRolesMutation.mutate(values);
                          }}
                          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-primary to-primary-container font-headline text-sm font-bold tracking-wide text-on-primary shadow-lg shadow-primary/10 transition-all active:scale-[0.98] disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined" aria-hidden>
                            sync
                          </span>
                          {assignRolesMutation.isPending ? "Actualizando…" : "Actualizar roles"}
                        </button>

                        {assignRolesMutation.isError ? (
                          <p className="text-sm text-error">{getErrorMessage(assignRolesMutation.error)}</p>
                        ) : null}

                        <div className="mt-6 border-t border-outline-variant/10 pt-6">
                          <button
                            type="button"
                            disabled={!canDeleteUsers || deleteUserMutation.isPending}
                            onClick={async () => {
                              const confirmed = window.confirm("¿Seguro que deseas eliminar este usuario?");
                              if (!confirmed) return;
                              await deleteUserMutation.mutateAsync(selectedUserId);
                            }}
                            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-xs font-bold uppercase tracking-widest text-error-dim transition-all hover:bg-error-container/10 disabled:opacity-50"
                          >
                            <span className="material-symbols-outlined text-sm" aria-hidden>
                              delete
                            </span>
                            {deleteUserMutation.isPending ? "Eliminando…" : "Eliminar usuario"}
                          </button>
                          {deleteUserMutation.isError ? (
                            <p className="mt-2 text-sm text-error">{getErrorMessage(deleteUserMutation.error)}</p>
                          ) : null}
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-on-surface-variant">Selecciona un usuario de la tabla para editar roles.</p>
                  )}
                </div>
              </aside>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
};

export default UsersPage;
