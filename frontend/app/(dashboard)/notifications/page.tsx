// frontend/app/(dashboard)/notifications/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import api from "../../../lib/api";
import { useAuthStore, type UserRole } from "../../../store/authStore";
import { formatBogotaDateFromString } from "../../../lib/bogota";
import { formatCOP } from "../../../lib/formatters";
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

const NotificationsPage = (): JSX.Element => {
  const user = useAuthStore((state) => state.user);
  const role: UserRole = user?.roles[0] ?? "CLIENT";
  const queryClient = useQueryClient();

  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string>("");

  const notificationsQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: async (): Promise<NotificationsResponse> => {
      const response = await api.get<NotificationsResponse>("/notifications");
      return response.data;
    },
    enabled: Boolean(user) && role !== undefined
  });

  const markReadMutation = useMutation({
    mutationFn: async (notificationId: string): Promise<void> => {
      await api.patch(`/notifications/${notificationId}/read`, {});
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }
  });

  const unreadCount = useMemo(() => {
    const items = notificationsQuery.data?.data ?? [];
    return items.filter((n) => !n.read).length;
  }, [notificationsQuery.data]);

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

  return (
    <section className="space-y-4">
      <header className="rounded-xl border border-border bg-surface p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-semibold">Centro de notificaciones</h1>
            <p className="mt-1 text-sm text-textSecondary">Alertas de cuotas vencidas y próximas.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-primary/10 px-3 py-1 text-sm text-primary">
              Sin leer: {unreadCount}
            </span>
            <button
              type="button"
              disabled={pushBusy}
              onClick={() => void onSubscribe()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {pushBusy ? "Suscribiendo..." : "Activar Push"}
            </button>
          </div>
        </div>
      </header>

      {notificationsQuery.isLoading ? (
        <div className="rounded-xl border border-border bg-surface p-6">
          <p className="text-sm text-textSecondary">Cargando notificaciones...</p>
        </div>
      ) : null}

      {notificationsQuery.isError ? (
        <div className="rounded-xl border border-border bg-surface p-6">
          <p className="text-sm text-danger">{getErrorMessage(notificationsQuery.error)}</p>
        </div>
      ) : null}

      {pushError ? (
        <div className="rounded-xl border border-border bg-surface p-6">
          <p className="text-sm text-danger">{pushError}</p>
        </div>
      ) : null}

      {notificationsQuery.data ? (
        <div className="rounded-xl border border-border bg-surface p-6">
          {notificationsQuery.data.data.length === 0 ? (
            <p className="text-sm text-textSecondary">No tienes notificaciones por ahora.</p>
          ) : (
            <div className="space-y-3">
              {notificationsQuery.data.data.map((n) => (
                <article
                  key={n.id}
                  className={`rounded-lg border border-border bg-bg p-4 ${
                    n.read ? "opacity-60" : "opacity-100"
                  }`}
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">{n.title}</p>
                      <p className="text-sm text-textSecondary">{n.message}</p>
                      <p className="text-xs text-textSecondary">
                        {formatBogotaDateFromString(n.createdAt)} • {n.type}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {n.read ? (
                        <span className="rounded-full bg-success/10 px-2 py-1 text-xs text-success">
                          Leída
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void markReadMutation.mutateAsync(n.id)}
                          disabled={markReadMutation.isPending}
                          className="rounded-md border border-border px-3 py-2 text-xs text-textPrimary hover:bg-surface disabled:opacity-50"
                        >
                          Marcar como leída
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
};

export default NotificationsPage;
