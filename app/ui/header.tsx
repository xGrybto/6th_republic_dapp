'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useConnection } from 'wagmi';

export default function Header() {
  const { isConnected } = useConnection();
  const pathname = usePathname();

  const linkClasses = (href: string) =>
    `w-full border-b border-[var(--fr-border)] py-3 text-center text-sm transition last:border-b-0 ${
      pathname === href
        ? 'bg-[rgba(155,188,255,0.18)] text-[var(--fr-white)]'
        : 'text-[var(--fr-muted)] hover:bg-[rgba(15,26,47,0.6)] hover:text-[var(--fr-white)]'
    }`;

  return (
    <aside className="fixed right-0 top-0 z-40 h-screen w-60 border-l border-[var(--fr-border)] bg-[rgba(11,16,32,0.9)] text-[var(--fr-text)] backdrop-blur">
      <div className="flex h-full flex-col gap-6">
        <div className="p-6">
          <div className="flex items-center gap-3">
            <img
              src="/logo.svg"
              alt="6R logo"
              className="h-12 w-auto"
            />
            <span className="text-sm font-semibold tracking-tight text-[var(--fr-white)]">
              6R
            </span>
          </div>
        </div>

        <nav className="mx-auto mt-4 flex w-full flex-col overflow-hidden border border-[var(--fr-border)]">
          <Link href="/" className={linkClasses('/')}>
            Vote
          </Link>
          <Link href="/account" className={linkClasses('/account')}>
            Account
          </Link>
          <Link href="/mint" className={linkClasses('/mint')}>
            Mint
          </Link>
          <Link href="/admin" className={linkClasses('/admin')}>
            Admin
          </Link>
        </nav>

        <div className="mt-auto flex flex-col gap-3 p-6">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              isConnected
                ? 'fr-pill-blue'
                : 'fr-pill-red'
            }`}
          >
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
          <ConnectButton.Custom>
            {({
              account,
              chain,
              openAccountModal,
              openChainModal,
              openConnectModal,
              mounted,
            }) => {
              const connected = mounted && account && chain;

              if (!connected) {
                return (
                  <button
                    onClick={openConnectModal}
                    className="fr-btn-primary w-full whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition"
                    type="button"
                  >
                    Connect wallet
                  </button>
                );
              }

              return (
                <div className="flex w-full gap-2">
                  <button
                    onClick={openChainModal}
                    className="flex-1 whitespace-nowrap rounded-xl border border-[var(--fr-border)] bg-[rgba(15,26,47,0.75)] px-3 py-2 text-xs text-[var(--fr-white)] transition hover:border-[rgba(155,188,255,0.5)]"
                    type="button"
                  >
                    {chain.name}
                  </button>
                  <button
                    onClick={openAccountModal}
                    className="flex-1 whitespace-nowrap rounded-xl border border-[var(--fr-border)] bg-[rgba(15,26,47,0.75)] px-3 py-2 text-xs text-[var(--fr-white)] transition hover:border-[rgba(243,167,183,0.6)]"
                    type="button"
                  >
                    {account.displayName}
                  </button>
                </div>
              );
            }}
          </ConnectButton.Custom>
        </div>
      </div>
    </aside>
  );
}
