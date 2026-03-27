// frontend/app/(dashboard)/businesses/page.tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../../../lib/api";
import { getEffectiveRoles, pickPrimaryRole } from "../../../lib/effective-roles";
import { useAuthStore, type UserRole } from "../../../store/authStore";

interface BusinessRow {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: string } | undefined)?.message;
    return message ?? error.message;
  }
  return "Error desconocido.";
};

const createSchema = z.object({
  name: z.string().min(2).max(120)
});

type CreateForm = z.infer<typeof createSchema>;

const BusinessesPage = (): JSX.Element => {
  const user = useAuthStore((state) => state.user);
  const role: UserRole = pickPrimaryRole(getEffectiveRoles(user));
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ["businesses"],
    queryFn: async (): Promise<BusinessRow[]> => {
      const res = await api.get<{ data: BusinessRow[] }>("/businesses");
      return res.data.data;
    },
    enabled: role === "SUPER_ADMIN"
  });

  const form = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: "" },
    mode: "onChange"
  });

  const createMutation = useMutation({
    mutationFn: async (values: CreateForm): Promise<void> => {
      await api.post("/businesses", values);
    },
    onSuccess: async () => {
      form.reset();
      await queryClient.invalidateQueries({ queryKey: ["businesses"] });
    }
  });

  if (role !== "SUPER_ADMIN") {
    return (
      <section className="rounded-xl border border-border bg-surface p-6">
        <p className="text-sm text-danger">Solo el super administrador puede gestionar negocios.</p>
        <Link href="/overview" className="mt-4 inline-block text-primary hover:underline">
          Volver
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <header className="rounded-xl border border-border bg-surface p-6">
        <h1 className="text-xl font-semibold">Negocios</h1>
        <p className="mt-1 text-sm text-textSecondary">
          Cada negocio agrupa administradores, encargados de ruta y clientes. Asigna usuarios al negocio al
          crearlos (SUPER_ADMIN).
        </p>
        <Link href="/overview" className="mt-3 inline-block text-sm text-primary hover:underline">
          Volver al inicio
        </Link>
      </header>

      <div className="rounded-xl border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold text-textSecondary">Nuevo negocio</h2>
        <form
          className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={form.handleSubmit(async (v) => {
            try {
              await createMutation.mutateAsync(v);
            } catch (e) {
              form.setError("name", { message: getErrorMessage(e) });
            }
          })}
        >
          <div className="flex-1">
            <label htmlFor="biz-name" className="mb-1 block text-xs text-textSecondary">
              Nombre
            </label>
            <input
              id="biz-name"
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-textPrimary"
              {...form.register("name")}
            />
            <p className="mt-1 text-xs text-danger">{form.formState.errors.name?.message}</p>
          </div>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {createMutation.isPending ? "Guardando..." : "Crear"}
          </button>
        </form>
      </div>

      <div className="rounded-xl border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold text-textSecondary">Listado</h2>
        {listQuery.isLoading ? <p className="mt-2 text-sm text-textSecondary">Cargando...</p> : null}
        {listQuery.isError ? (
          <p className="mt-2 text-sm text-danger">{getErrorMessage(listQuery.error)}</p>
        ) : null}
        {listQuery.data && listQuery.data.length === 0 ? (
          <p className="mt-2 text-sm text-textSecondary">No hay negocios registrados.</p>
        ) : null}
        {listQuery.data && listQuery.data.length > 0 ? (
          <ul className="mt-3 divide-y divide-border">
            {listQuery.data.map((b) => (
              <li key={b.id} className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <span className="font-medium text-textPrimary">{b.name}</span>
                  <span className="ml-2 text-xs text-textSecondary">({b.id})</span>
                </div>
                <Link
                  href={`/businesses/${b.id}`}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Editar y asignar usuarios
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
};

export default BusinessesPage;
