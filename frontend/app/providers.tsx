// frontend/app/providers.tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAuthStore } from "../store/authStore";
import AppLoader from "../components/ui/AppLoader";

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

  const hasAuthHydrated = useAuthStore((state) => state.hasAuthHydrated);
  const [loaderVisible, setLoaderVisible] = useState(true);

  useEffect(() => {
    void (async (): Promise<void> => {
      await Promise.resolve(useAuthStore.persist.rehydrate());
      useAuthStore.getState().markAuthHydrated();
    })();
  }, []);

  // Keep loader visible until hydration is done, then fade out
  useEffect(() => {
    if (hasAuthHydrated) {
      // Small extra delay so the fade-out is visible
      const t = setTimeout(() => setLoaderVisible(false), 500);
      return () => clearTimeout(t);
    }
  }, [hasAuthHydrated]);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthHydrationBridge />
      <AppLoader visible={loaderVisible} />
      {children}
    </QueryClientProvider>
  );
};

export default Providers;
