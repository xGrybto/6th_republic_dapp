'use client';

import { useState } from 'react';
import '@rainbow-me/rainbowkit/styles.css';
import { getDefaultConfig, RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? '701021154da8250015453f9d76d12a33';

export function Providers({ children }: { children: React.ReactNode }) {
  const [config] = useState(() => getDefaultConfig({
    appName: '6r-dapp',
    projectId,
    chains: [sepolia],
    ssr: true,
  }));
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
