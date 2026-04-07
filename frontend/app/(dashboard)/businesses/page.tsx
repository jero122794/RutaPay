// frontend/app/(dashboard)/businesses/page.tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import Link from "next/link";
import { useMemo, useState } from "react";
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
    if (error.code === "ERR_NETWORK" || error.message === "Network Error") {
      return "No se pudo contactar el servidor. Arranca el backend y revisa NEXT_PUBLIC_API_URL.";
    }
    const message = (error.response?.data as { message?: string } | undefined)?.message;
    return message ?? error.message;
  }
  return "Error desconocido.";
};

const initialsFromName = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "N";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  const a = parts[0][0] ?? "N";
  const b = parts[parts.length - 1][0] ?? "";
  return `${a}${b}`.toUpperCase();
};

const formatShortDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", year: "numeric" }).format(d);
};

const createSchema = z.object({
  name: z.string().min(2).max(120)
});

type CreateForm = z.infer<typeof createSchema>;

const BusinessesPage = (): JSX.Element => {
  const user = useAuthStore((state) => state.user);
  const role: UserRole = pickPrimaryRole(getEffectiveRoles(user));
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = listQuery.data ?? [];
    if (!q) return list;
    return list.filter((b) => `${b.name} ${b.id}`.toLowerCase().includes(q));
  }, [listQuery.data, search]);

  if (role !== "SUPER_ADMIN") {
    return (
      <section className="rounded-2xl border border-white/5 bg-surface-container p-6">
        <p className="text-sm text-error">Solo el super administrador puede gestionar negocios.</p>
        <Link href="/overview" className="mt-4 inline-block font-bold text-primary hover:underline">
          Volver
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-8">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="font-headline text-4xl font-extrabold tracking-tight text-on-surface">Listado de negocios</h1>
            <p className="mt-1 text-on-surface-variant">Gestiona y audita la estructura multi-tenant.</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center rounded-2xl border border-outline-variant/10 bg-surface-container-high px-6 py-3 shadow-lg">
              <span className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Total</span>
              <span className="font-headline text-2xl font-black text-primary">
                {listQuery.data ? listQuery.data.length : "—"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setCreateOpen(true);
              }}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-br from-primary to-primary-container px-6 py-4 font-bold text-on-primary shadow-xl shadow-primary/20 transition-transform hover:scale-[1.02]"
            >
              <span className="material-symbols-outlined" aria-hidden>
                add_business
              </span>
              Nuevo negocio
            </button>
          </div>
        </div>

        <div className="relative w-full max-w-xl">
          <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
            search
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar negocios por nombre o ID…"
            className="w-full rounded-full border border-outline-variant/20 bg-surface-container-low px-4 py-2 pl-10 text-sm text-on-surface placeholder:text-on-surface-variant focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-outline-variant/20 bg-surface-container-high p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-headline text-lg font-bold text-on-surface">Nuevo negocio</h2>
                <p className="mt-1 text-sm text-on-surface-variant">
                  Crea una organización para agrupar usuarios y rutas.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCreateOpen(false);
                  form.reset();
                }}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-outline-variant/20 text-on-surface-variant hover:bg-surface-container-highest/40 hover:text-on-surface"
                aria-label="Cerrar"
              >
                <span className="material-symbols-outlined" aria-hidden>
                  close
                </span>
              </button>
            </div>

            <form
              className="mt-6 space-y-4"
              onSubmit={form.handleSubmit(async (v) => {
                try {
                  await createMutation.mutateAsync(v);
                  setCreateOpen(false);
                } catch (e) {
                  form.setError("name", { message: getErrorMessage(e) });
                }
              })}
            >
              <div>
                <label
                  htmlFor="biz-name"
                  className="mb-1 block text-xs font-bold uppercase tracking-widest text-on-surface-variant"
                >
                  Nombre
                </label>
                <input
                  id="biz-name"
                  className="w-full rounded-2xl border-none bg-surface-container-lowest px-4 py-4 text-on-surface shadow-inner focus:ring-2 focus:ring-primary/40"
                  placeholder="Ej. Global Logistics SAS"
                  {...form.register("name")}
                  autoFocus
                />
                <p className="mt-2 text-xs text-error">{form.formState.errors.name?.message}</p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setCreateOpen(false);
                    form.reset();
                  }}
                  className="rounded-2xl border border-outline-variant/20 bg-surface-container-highest/40 px-6 py-4 text-sm font-bold text-on-surface-variant hover:bg-surface-container-highest/70 hover:text-on-surface"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="rounded-2xl bg-primary px-6 py-4 text-sm font-bold text-on-primary shadow-lg shadow-primary/10 disabled:opacity-50"
                >
                  {createMutation.isPending ? "Guardando…" : "Crear negocio"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Mobile: cards */}
      <div className="space-y-4 md:hidden">
        {listQuery.isLoading ? <p className="text-sm text-on-surface-variant">Cargando…</p> : null}
        {listQuery.isError ? <p className="text-sm text-error">{getErrorMessage(listQuery.error)}</p> : null}
        {!listQuery.isLoading && !listQuery.isError ? (
          filtered.length === 0 ? (
            <div className="rounded-3xl border border-outline-variant/10 bg-surface-container-low p-6 text-sm text-on-surface-variant">
              Sin resultados.
            </div>
          ) : (
            filtered.map((b) => (
              <article
                key={b.id}
                className="rounded-3xl border border-outline-variant/10 bg-surface-container-high p-5 shadow-[0_12px_32px_rgba(0,0,0,0.4)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-outline-variant/20 bg-surface-container-highest text-primary shadow-inner">
                      <span className="font-bold">{initialsFromName(b.name)}</span>
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate font-headline text-lg font-extrabold text-on-surface">{b.name}</h3>
                      <p className="truncate font-mono text-xs text-on-surface-variant">ID: {b.id}</p>
                      <p className="mt-1 text-xs text-on-surface-variant">Creado: {formatShortDate(b.createdAt)}</p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-tighter text-primary">
                    Activo
                  </span>
                </div>

                <Link
                  href={`/businesses/${b.id}`}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-primary to-primary-container py-4 text-xs font-bold uppercase tracking-widest text-on-primary shadow-[0_4px_12px_rgba(105,246,184,0.2)] active:scale-95"
                >
                  <span className="material-symbols-outlined text-lg" aria-hidden>
                    edit_square
                  </span>
                  Administrar negocio
                </Link>
              </article>
            ))
          )
        ) : null}

        <p className="text-xs text-on-surface-variant">
          Mostrando {filtered.length} de {listQuery.data?.length ?? 0} negocios
        </p>
      </div>

      {/* Desktop/tablet: grid list */}
      <div className="hidden overflow-hidden rounded-3xl border border-outline-variant/10 bg-surface-container-low shadow-2xl md:block">
        <div className="grid grid-cols-12 border-b border-outline-variant/10 bg-surface-container-high/50 px-8 py-5 text-xs font-bold uppercase tracking-widest text-on-surface-variant">
          <div className="col-span-5">Negocio & ID</div>
          <div className="col-span-3">Registro</div>
          <div className="col-span-2">Estado</div>
          <div className="col-span-2 text-right">Acciones</div>
        </div>

        {listQuery.isLoading ? (
          <div className="p-8">
            <p className="text-sm text-on-surface-variant">Cargando…</p>
          </div>
        ) : null}

        {listQuery.isError ? (
          <div className="p-8">
            <p className="text-sm text-error">{getErrorMessage(listQuery.error)}</p>
          </div>
        ) : null}

        {!listQuery.isLoading && !listQuery.isError ? (
          <div className="divide-y divide-outline-variant/5">
            {filtered.length === 0 ? (
              <div className="px-8 py-10 text-sm text-on-surface-variant">Sin resultados.</div>
            ) : (
              filtered.map((b) => (
                <div
                  key={b.id}
                  className="grid grid-cols-12 items-center px-8 py-6 transition-all hover:bg-surface-container-highest/30"
                >
                  <div className="col-span-5 flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-outline-variant/20 bg-surface-container-highest text-primary shadow-inner">
                      <span className="font-bold">{initialsFromName(b.name)}</span>
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate font-headline font-bold text-on-surface">{b.name}</h3>
                      <p className="truncate font-mono text-xs text-on-surface-variant">{b.id}</p>
                    </div>
                  </div>
                  <div className="col-span-3 text-sm text-on-surface-variant">{formatShortDate(b.createdAt)}</div>
                  <div className="col-span-2">
                    <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-tighter text-primary">
                      Activo
                    </span>
                  </div>
                  <div className="col-span-2 text-right">
                    <Link
                      href={`/businesses/${b.id}`}
                      className="ml-auto inline-flex items-center gap-2 rounded-lg bg-surface-container-highest px-4 py-2 text-xs font-bold text-on-surface shadow-sm transition-all hover:bg-primary hover:text-on-primary"
                    >
                      <span className="material-symbols-outlined text-sm" aria-hidden>
                        person_add
                      </span>
                      Editar y asignar usuarios
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}

        <div className="flex items-center justify-between border-t border-outline-variant/10 bg-surface-container-high/30 px-8 py-6">
          <p className="text-xs text-on-surface-variant">
            Mostrando {filtered.length} de {listQuery.data?.length ?? 0} negocios
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-3xl border border-outline-variant/10 bg-gradient-to-br from-surface-container-low to-surface-container-high p-6 shadow-lg">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <span className="material-symbols-outlined" aria-hidden>
              security
            </span>
          </div>
          <h3 className="mb-2 font-headline font-bold text-on-surface">Auditoría</h3>
          <p className="text-xs leading-relaxed text-on-surface-variant">
            Las modificaciones a negocios quedan registradas para trazabilidad.
          </p>
        </div>
        <div className="rounded-3xl border border-outline-variant/10 bg-gradient-to-br from-surface-container-low to-surface-container-high p-6 shadow-lg">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-secondary/10 text-secondary">
            <span className="material-symbols-outlined" aria-hidden>
              group_work
            </span>
          </div>
          <h3 className="mb-2 font-headline font-bold text-on-surface">Propagación</h3>
          <p className="text-xs leading-relaxed text-on-surface-variant">
            Asignar miembros al negocio alinea rutas y clientes cuando aplica.
          </p>
        </div>
        <div className="rounded-3xl border border-outline-variant/10 bg-gradient-to-br from-surface-container-low to-surface-container-high p-6 shadow-lg">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-tertiary/10 text-tertiary">
            <span className="material-symbols-outlined" aria-hidden>
              key
            </span>
          </div>
          <h3 className="mb-2 font-headline font-bold text-on-surface">Provisionamiento</h3>
          <p className="text-xs leading-relaxed text-on-surface-variant">
            Cada negocio tiene un ID único para integraciones y licencias.
          </p>
        </div>
      </div>
    </section>
  );
};

export default BusinessesPage;
