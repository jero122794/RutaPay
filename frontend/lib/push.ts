// frontend/lib/push.ts
import api from "./api";

interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

interface PushSubscriptionPayload {
  endpoint: string;
  keys: PushSubscriptionKeys;
}

const getApplicationServerKey = (): string => {
  const key = process.env.NEXT_PUBLIC_VAPID_KEY;
  if (!key) {
    throw new Error("NEXT_PUBLIC_VAPID_KEY is not defined.");
  }
  return key;
};

const subscribeToPush = async (): Promise<void> => {
  if (!("serviceWorker" in navigator) || !navigator.serviceWorker) {
    throw new Error("Service worker no disponible en este navegador.");
  }

  const registration = await navigator.serviceWorker.ready;

  const sub = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: getApplicationServerKey()
  });

  const payload: PushSubscriptionPayload = {
    endpoint: sub.endpoint,
    keys: {
      p256dh: sub.toJSON().keys?.p256dh ?? "",
      auth: sub.toJSON().keys?.auth ?? ""
    }
  };

  await api.post("/notifications/subscribe", payload);
};

export { subscribeToPush };
