"use client";

import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { wagmiConfig } from "@/lib/wagmi";
import { ToastProvider } from "@/components/toast";

/**
 * wagmi needs a react-query client alongside it. The QueryClient lives in state rather
 * than at module scope so that a server render and a client render never share one
 * instance — a module-level client would leak one user's cached queries into the next
 * request's render on the server.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
