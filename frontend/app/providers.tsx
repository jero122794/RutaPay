// frontend/app/providers.tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAuthStore } from "../store/authStore";

interface ProvidersProps {
  children: React.ReactNode;
}

/** Subscribes to auth hydration so trees using getEffectiveRoles() re-render once JWT roles may be merged. */
const AuthHydrationBridge = (): null => {
  useAuthStore((state) => state.hasAuthHydrated);
  return null;
};

const Providers = ({ children }: ProvidersProps): JSX.Element => {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false
          }
        }
      })
  );

  useEffect(() => {
    void (async (): Promise<void> => {
      await Promise.resolve(useAuthStore.persist.rehydrate());
      useAuthStore.getState().markAuthHydrated();
    })();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthHydrationBridge />
      {children}
    </QueryClientProvider>
  );
};

export default Providers;
