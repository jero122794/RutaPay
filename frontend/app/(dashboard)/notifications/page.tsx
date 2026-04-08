// frontend/app/(dashboard)/notifications/page.tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import axios from "axios";
import api from "../../../lib/api";
import {
  formatBogotaDateFromString,
  formatBogotaTimeHHmm,
  getBogotaTodayKey,
  getBogotaYesterdayKey,
  toBogotaDayKey
} from "../../../lib/bogota";
import { getEffectiveRoles, pickPrimaryRole } from "../../../lib/effective-roles";
import { useAuthStore, type UserRole } from "../../../store/authStore";
import { subscribeToPush } from "../../../lib/push";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

interface NotificationsResponse {
  data: NotificationItem[];
  total: number;
}

type NotificationType = "OVERDUE_TODAY" | "UPCOMING_TOMORROW" | "CRITICAL_OVERDUE";

interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
}

const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: string } | undefined)?.message;
    return message ?? error.message;
  }
  return "Error desconocido.";
};

const pad2 = (n: number): string => String(n).padStart(2, "0");

interface NotificationVisual {
  border: string;
  iconWrap: string;
  icon: string;
  iconFilled: boolean;
  iconColor: string;
}

const notificationVisual = (n: NotificationItem): NotificationVisual => {
  if (n.read) {
    return {
      border: "border-l-secondary",
      iconWrap: "bg-secondary-container/20",
      icon: "update",
      iconFilled: false,
      iconColor: "text-secondary"
    };
  }
  switch (n.type) {
    case "CRITICAL_OVERDUE":
      return {
        border: "border-l-error",
        iconWrap: "bg-error-container/20",
        icon: "warning",
        iconFilled: true,
        iconColor: "text-error"
      };
    case "OVERDUE_TODAY":
      return {
        border: "border-l-tertiary",
        iconWrap: "bg-tertiary-container/20",
        icon: "distance",
        iconFilled: true,
        iconColor: "text-tertiary"
      };
    case "UPCOMING_TOMORROW":
    default:
      return {
        border: "border-l-primary",
        iconWrap: "bg-primary-container/20",
        icon: "event_upcoming",
        iconFilled: true,
        iconColor: "text-primary"
      };
  }
};

const NotificationsPage = (): JSX.Element => {
  const user = useAuthStore((state) => state.user);
  const hasAuthHydrated = useAuthStore((state) => state.hasAuthHydrated);
  const role: UserRole = pickPrimaryRole(getEffectiveRoles(user));
  const queryClient = useQueryClient();

  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string>("");

  const notificationsQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: async (): Promise<NotificationsResponse> => {
      const response = await api.get<NotificationsResponse>("/notifications");
      return response.data;
    },
    enabled: Boolean(user) && hasAuthHydrated && role !== undefined
  });

  const markReadMutation = useMutation({
    mutationFn: async (notificationId: string): Promise<void> => {
      await api.patch(`/notifications/${notificationId}/read`, {});
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }
  });

  const items = notificationsQuery.data?.data ?? [];

  const unreadCount = useMemo(
    () => items.filter((n) => !n.read).length,
    [items]
  );

  const criticalUnread = useMemo(
    () => items.filter((n) => !n.read && n.type === "CRITICAL_OVERDUE").length,
    [items]
  );

  const riskUnread = useMemo(
    () => items.filter((n) => !n.read && n.type === "OVERDUE_TODAY").length,
    [items]
  );

  const { todayItems, yesterdayItems, olderItems } = useMemo(() => {
    const todayK = getBogotaTodayKey();
    const yestK = getBogotaYesterdayKey();
    const sortDesc = (a: NotificationItem, b: NotificationItem): number =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

    const today = items.filter((n) => toBogotaDayKey(n.createdAt) === todayK).sort(sortDesc);
    const yesterday = items.filter((n) => toBogotaDayKey(n.createdAt) === yestK).sort(sortDesc);
    const older = items
      .filter((n) => {
        const k = toBogotaDayKey(n.createdAt);
        return k !== todayK && k !== yestK;
      })
      .sort(sortDesc);

    return { todayItems: today, yesterdayItems: yesterday, olderItems: older };
  }, [items]);

  const onSubscribe = async (): Promise<void> => {
    setPushBusy(true);
    setPushError("");
    try {
      await subscribeToPush();
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    } catch (error: unknown) {
      setPushError(getErrorMessage(error));
    } finally {
      setPushBusy(false);
    }
  };

  const obsidianCard =
    "rounded-xl border border-outline-variant/10 bg-surface-container-high p-5 shadow-[0_12px_32px_rgba(0,0,0,0.4),0_4px_8px_rgba(105,246,184,0.04)]";

  return (
    <section className="space-y-6 overflow-x-hidden pb-28 md:pb-8">
      <div className="space-y-6">
        <header className="hidden rounded-2xl border border-outline-variant/10 bg-surface-container-low p-6 shadow-[0_4px_20px_rgba(0,0,0,0.2)] md:block">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-container-highest text-primary">
                <span className="material-symbols-outlined" aria-hidden>
                  notifications
                </span>
              </div>
              <div>
                <h2 className="font-headline text-xl font-bold text-on-surface">Alertas</h2>
                <p className="mt-0.5 text-sm text-on-surface-variant">Cuotas vencidas y próximas a vencer.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">
                Sin leer: {unreadCount}
              </span>
              <button
                type="button"
                disabled={pushBusy}
                onClick={() => void onSubscribe()}
                className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-on-primary shadow-[0_8px_20px_rgba(105,246,184,0.15)] transition-transform active:scale-[0.98] disabled:opacity-50"
              >
                {pushBusy ? "Suscribiendo…" : "Activar push"}
              </button>
            </div>
          </div>
        </header>

        <section className="rounded-xl bg-surface-container-low p-6 md:hidden">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Resumen diario</span>
            <div className="flex items-end gap-2">
              <span className="font-headline text-4xl font-black leading-none text-primary">{pad2(unreadCount)}</span>
              <span className="mb-1 text-sm text-on-surface">Pendientes de acción</span>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1 rounded-xl bg-surface-container-lowest p-4">
              <span className="text-[10px] font-bold uppercase tracking-tight text-error">Críticos</span>
              <span className="font-headline text-2xl font-bold text-on-surface">{pad2(criticalUnread)}</span>
            </div>
            <div className="flex flex-col gap-1 rounded-xl bg-surface-container-lowest p-4">
              <span className="text-[10px] font-bold uppercase tracking-tight text-tertiary">Riesgos</span>
              <span className="font-headline text-2xl font-bold text-on-surface">{pad2(riskUnread)}</span>
            </div>
          </div>
          <button
            type="button"
            disabled={pushBusy}
            onClick={() => void onSubscribe()}
            className="mt-4 w-full rounded-lg border border-primary/20 py-2.5 text-xs font-bold text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
          >
            {pushBusy ? "Suscribiendo…" : "Activar notificaciones push"}
          </button>
        </section>

        {notificationsQuery.isLoading ? (
          <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low p-6">
            <p className="text-sm text-on-surface-variant">Cargando alertas…</p>
          </div>
        ) : null}

        {notificationsQuery.isError ? (
          <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low p-6">
            <p className="text-sm text-error">{getErrorMessage(notificationsQuery.error)}</p>
          </div>
        ) : null}

        {pushError ? (
          <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low p-6">
            <p className="text-sm text-error">{pushError}</p>
          </div>
        ) : null}

        {notificationsQuery.data ? (
          <div className="flex flex-col gap-3">
            {items.length === 0 ? (
              <p className="px-2 text-sm text-on-surface-variant">No tienes alertas por ahora.</p>
            ) : null}

            {todayItems.length > 0 ? (
              <>
                <h2 className="px-2 font-headline text-sm font-bold uppercase tracking-widest text-on-surface-variant">
                  Hoy
                </h2>
                {todayItems.map((n) => (
                  <NotificationFeedCard
                    key={n.id}
                    n={n}
                    obsidianCard={obsidianCard}
                    markReadPending={markReadMutation.isPending}
                    onMarkRead={() => void markReadMutation.mutateAsync(n.id)}
                  />
                ))}
              </>
            ) : null}

            {yesterdayItems.length > 0 ? (
              <>
                <h2 className="mt-4 px-2 font-headline text-sm font-bold uppercase tracking-widest text-on-surface-variant">
                  Ayer
                </h2>
                {yesterdayItems.map((n) => (
                  <NotificationFeedCard
                    key={n.id}
                    n={n}
                    obsidianCard={obsidianCard}
                    markReadPending={markReadMutation.isPending}
                    onMarkRead={() => void markReadMutation.mutateAsync(n.id)}
                  />
                ))}
              </>
            ) : null}

            {olderItems.length > 0 ? (
              <>
                <h2 className="mt-4 px-2 font-headline text-sm font-bold uppercase tracking-widest text-on-surface-variant">
                  Anteriores
                </h2>
                {olderItems.map((n) => (
                  <NotificationFeedCard
                    key={n.id}
                    n={n}
                    obsidianCard={obsidianCard}
                    markReadPending={markReadMutation.isPending}
                    onMarkRead={() => void markReadMutation.mutateAsync(n.id)}
                  />
                ))}
              </>
            ) : null}
          </div>
        ) : null}

        <section className="mt-8 space-y-4 md:mt-10">
          <h3 className="px-2 font-headline text-sm font-bold uppercase tracking-widest text-on-surface-variant">
            Estado de rutas activas
          </h3>
          <div className={`${obsidianCard} relative overflow-hidden`}>
            <div className="pointer-events-none absolute right-0 top-0 p-8 opacity-5">
              <span className="material-symbols-outlined text-[120px]" aria-hidden>
                route
              </span>
            </div>
            <div className="relative z-10 space-y-6 py-1">
              <p className="text-sm text-on-surface-variant">
                El progreso por ruta en tiempo real se mostrará aquí cuando esté conectado al módulo operativo.
              </p>
              <Link
                href="/routes"
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-primary to-primary-container px-4 py-2 text-xs font-extrabold uppercase text-on-primary"
              >
                Ir a rutas
                <span className="material-symbols-outlined text-sm" aria-hidden>
                  arrow_forward
                </span>
              </Link>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
};

interface NotificationFeedCardProps {
  n: NotificationItem;
  obsidianCard: string;
  markReadPending: boolean;
  onMarkRead: () => void;
}

const NotificationFeedCard = ({
  n,
  obsidianCard,
  markReadPending,
  onMarkRead
}: NotificationFeedCardProps): JSX.Element => {
  const v = notificationVisual(n);
  const timeLabel = n.read ? "Leída" : formatBogotaTimeHHmm(n.createdAt);

  return (
    <article
      className={[
        obsidianCard,
        "flex gap-4 border-l-4 transition-all duration-200 active:scale-[0.98]",
        v.border,
        n.read ? "opacity-70" : ""
      ].join(" ")}
    >
      <div
        className={[
          "flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl",
          v.iconWrap
        ].join(" ")}
      >
        <span
          className={["material-symbols-outlined", v.iconColor].join(" ")}
          aria-hidden
          style={
            v.iconFilled
              ? { fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }
              : { fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }
          }
        >
          {v.icon}
        </span>
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <span className="font-headline text-base font-bold text-on-surface">{n.title}</span>
          <span className="flex-shrink-0 text-[10px] uppercase text-on-surface-variant">{timeLabel}</span>
        </div>
        <p className="text-sm leading-relaxed text-on-surface-variant">{n.message}</p>
        <p className="text-[10px] text-on-surface-variant">
          {formatBogotaDateFromString(n.createdAt)} · {n.type.replace(/_/g, " ")}
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          {!n.read && n.type === "CRITICAL_OVERDUE" ? (
            <Link
              href="/loans"
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-primary to-primary-container px-4 py-2 text-xs font-extrabold uppercase text-on-primary"
            >
              Gestionar cobro
              <span className="material-symbols-outlined text-sm" aria-hidden>
                arrow_forward
              </span>
            </Link>
          ) : null}
          {!n.read ? (
            <button
              type="button"
              disabled={markReadPending}
              onClick={() => onMarkRead()}
              className="rounded-lg border border-outline-variant/30 px-4 py-2 text-xs font-bold uppercase text-on-surface transition-colors hover:bg-surface-bright disabled:opacity-50"
            >
              Marcar leída
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
};

export default NotificationsPage;
