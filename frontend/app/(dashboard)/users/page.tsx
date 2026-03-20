// frontend/app/(dashboard)/users/page.tsx
"use client";

import { useMemo, useState } from "react";
import axios from "axios";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import api from "../../../lib/api";
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
  email: string;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  roles: string[];
}

const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: string } | undefined)?.message;
    return message ?? error.message;
  }
  return "Error desconocido.";
};

const assignRolesSchema = z.object({
  roles: z.array(z.enum(["SUPER_ADMIN", "ADMIN", "ROUTE_MANAGER", "CLIENT"])).min(1)
});

type AssignRolesValues = z.infer<typeof assignRolesSchema>;

const UsersPage = (): JSX.Element => {
  const user = useAuthStore((state) => state.user);
  const role: UserRole = user?.roles[0] ?? "CLIENT";
  const queryClient = useQueryClient();

  const [selectedUserId, setSelectedUserId] = useState<string>("");

  const usersQuery = useQuery({
    queryKey: ["users-list"],
    queryFn: async (): Promise<ListResponse<UserItem>> => {
      const response = await api.get<ListResponse<UserItem>>("/users");
      return response.data;
    },
    enabled: role === "SUPER_ADMIN"
  });

  const allRoles = useMemo(() => ["SUPER_ADMIN", "ADMIN", "ROUTE_MANAGER", "CLIENT"] as const, []);

  const form = useForm<AssignRolesValues>({
    resolver: zodResolver(assignRolesSchema),
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

  const selectedUser = useMemo<UserItem | null>(() => {
    const list = usersQuery.data?.data ?? [];
    return list.find((u) => u.id === selectedUserId) ?? null;
  }, [selectedUserId, usersQuery.data]);

  const canManage = role === "SUPER_ADMIN";

  return (
    <section className="space-y-4">
      <header className="rounded-xl border border-border bg-surface p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-semibold">Usuarios</h1>
            <p className="mt-1 text-sm text-textSecondary">Gestión global (SUPER_ADMIN).</p>
          </div>
          <Link href="/overview" className="text-primary hover:underline">
            Volver al inicio
          </Link>
        </div>
      </header>

      {role !== "SUPER_ADMIN" ? (
        <div className="rounded-xl border border-border bg-surface p-6">
          <p className="text-sm text-danger">No tienes permisos para gestionar usuarios.</p>
        </div>
      ) : null}

      {role === "SUPER_ADMIN" ? (
        <>
          {usersQuery.isLoading ? (
            <div className="rounded-xl border border-border bg-surface p-6">
              <p className="text-sm text-textSecondary">Cargando usuarios...</p>
            </div>
          ) : null}

          {usersQuery.isError ? (
            <div className="rounded-xl border border-border bg-surface p-6">
              <p className="text-sm text-danger">{getErrorMessage(usersQuery.error)}</p>
            </div>
          ) : null}

          {usersQuery.data ? (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <div className="space-y-4 xl:col-span-2">
                <div className="rutapay-table-wrap">
                  {usersQuery.data.data.length === 0 ? (
                    <p className="p-4 text-sm text-textSecondary">No hay usuarios.</p>
                  ) : (
                    <table className="rutapay-table">
                      <thead>
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                            Nombre
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                            Email
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-textSecondary">
                            Rol(es)
                          </th>
                          <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-textSecondary">
                            Activo
                          </th>
                          <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-textSecondary">
                            Acciones
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {usersQuery.data.data.map((u) => {
                          const activeBadge = u.isActive ? (
                            <span className="rounded-full bg-success/10 px-2 py-1 text-xs text-success">Sí</span>
                          ) : (
                            <span className="rounded-full bg-danger/10 px-2 py-1 text-xs text-danger">No</span>
                          );

                          const selected = u.id === selectedUserId;

                          return (
                            <tr key={u.id} className="border-t border-border">
                              <td className="px-3 py-3 text-sm">
                                <button
                                  type="button"
                                  onClick={() => setSelectedUserId(u.id)}
                                  className={`text-left ${selected ? "text-primary" : "text-textPrimary"}`}
                                >
                                  {u.name}
                                </button>
                              </td>
                              <td className="px-3 py-3 text-sm text-textSecondary">{u.email}</td>
                              <td className="px-3 py-3 text-sm text-textSecondary">{u.roles.join(", ")}</td>
                              <td className="px-3 py-3 text-right">{activeBadge}</td>
                              <td className="px-3 py-3 text-right">
                                <button
                                  type="button"
                                  className="rounded-md border border-border px-3 py-1 text-sm hover:bg-bg"
                                  onClick={async () => {
                                    await toggleActiveMutation.mutateAsync({
                                      userId: u.id,
                                      nextIsActive: !u.isActive
                                    });
                                  }}
                                >
                                  {u.isActive ? "Desactivar" : "Activar"}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              <aside className="space-y-4 xl:col-span-1">
                <div className="rounded-xl border border-border bg-surface p-6">
                  <h2 className="text-lg font-semibold">Asignar roles</h2>
                  <p className="mt-1 text-sm text-textSecondary">Selecciona un usuario de la tabla.</p>

                  {selectedUser ? (
                    <div className="mt-4 space-y-3">
                      <p className="text-sm text-textSecondary">
                        Usuario: <span className="text-textPrimary">{selectedUser.name}</span>
                      </p>

                      <div className="space-y-2">
                        {allRoles.map((r) => {
                          const checked = form.watch("roles").includes(r);
                          return (
                            <label key={r} className="flex items-center justify-between gap-3 text-sm">
                              <span className="text-textSecondary">{r}</span>
                              <input
                                type="checkbox"
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

                      <button
                        type="button"
                        disabled={!canManage || assignRolesMutation.isPending || !form.formState.isValid}
                        onClick={async () => {
                          const values = form.getValues();
                          await assignRolesMutation.mutateAsync(values);
                        }}
                        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                      >
                        {assignRolesMutation.isPending ? "Guardando..." : "Actualizar roles"}
                      </button>

                      {assignRolesMutation.isError ? (
                        <p className="text-sm text-danger">
                          {getErrorMessage(assignRolesMutation.error)}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-textSecondary">Aún no has seleccionado un usuario.</p>
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
