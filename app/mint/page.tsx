'use client';

import { useState } from 'react';
import { useConnection, useReadContract, useWriteContract } from 'wagmi';
import { type Abi, type Address, isAddress } from 'viem';

import o from "@/abi/Orchestrator.json";
import passport from "@/abi/SixRPassport.json";

function formatWalletError(message: string) {
  const lower = message.toLowerCase();
  if (
    lower.includes('user rejected') ||
    lower.includes('user denied') ||
    lower.includes('rejected the request')
  ) {
    return 'Transaction cancelled in wallet.';
  }
  if (lower.includes('insufficient funds')) {
    return 'Insufficient funds to pay gas fees.';
  }
  if (lower.includes('execution reverted')) {
    return 'Transaction reverted by the smart contract.';
  }
  return 'Transaction failed. Please try again.';
}

export default function Page() {
  const { address, isConnected } = useConnection();
  const {
    mutate: writeContract,
    isPending,
    isSuccess,
    error,
  } = useWriteContract();

  const [form, setForm] = useState({
    recipient: '' as Address | '',
    firstName: '',
    lastName: '',
    nationality: '',
    birthDate: '',
    birthPlace: '',
    height: '',
  });
  const [formError, setFormError] = useState<string | null>(null);

  const ORCHESTRATOR_ADDRESS =
    '0x05c0e7ef8211e6058a74338adef270cee67f2a4a' as const; // as const to fix the type on the value, no string by default

  const ORCHESTRATOR_ABI = o.abi as Abi;
  const PASSSPORT_ABI = passport.abi as Abi;

  const { data: passportAddress } = useReadContract({
    address: ORCHESTRATOR_ADDRESS,
    abi: ORCHESTRATOR_ABI,
    functionName: 'passport',
  });
  const { data: orchestratorOwner } = useReadContract({
    address: ORCHESTRATOR_ADDRESS,
    abi: ORCHESTRATOR_ABI,
    functionName: 'owner',
  });

  const { data: isPaused } = useReadContract({
    address: passportAddress as `0x${string}` | undefined,
    abi: PASSSPORT_ABI,
    functionName: 'paused',
    query: { enabled: !!passportAddress },
  });

  const isPassportPaused = isPaused === true;
  const isOwner =
    typeof orchestratorOwner === 'string' &&
    typeof address === 'string' &&
    orchestratorOwner.toLowerCase() === address.toLowerCase();

  const handleChange =
    (field: keyof typeof form) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: event.target.value }));
    };

  const handleMintMock = (event: React.FormEvent) => {
    event.preventDefault();
    if (!address) {
      setFormError('Connect your wallet first.');
      return;
    }
    if (!isOwner) {
      setFormError('Only the owner of the contract can mint passports.');
      return;
    }
    if (!isAddress(form.recipient)) {
      setFormError('Recipient address is invalid.');
      return;
    }
    setFormError(null);
    writeContract({
      address: ORCHESTRATOR_ADDRESS,
      abi: ORCHESTRATOR_ABI,
      functionName: 'mintPassport',
      args: [
        form.recipient,
        form.firstName,
        form.lastName,
        form.nationality,
        form.birthDate,
        form.birthPlace,
        form.height,
      ],
    });
  };

  const isMintDisabled = !isConnected || !isOwner || isPending || isPassportPaused;
  const prettyError = error ? formatWalletError(error.message) : null;

  return (
    <main className="fr-bg">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">Mint Passport</h1>
          <p className="text-sm fr-muted">
            Create an on-chain passport for a citizen.
          </p>
        </div>

        <section className="fr-panel p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Form</h2>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                isConnected
                  ? 'fr-pill-blue'
                  : 'fr-pill-red'
              }`}
            >
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>

          <form onSubmit={handleMintMock} className="mt-4 grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm fr-muted">
                Recipient address
                <input
                  value={form.recipient}
                  onChange={handleChange('recipient')}
                  placeholder="0x..."
                  required
                  className="fr-input rounded-xl px-3 py-2 text-sm"
                />
              </label>
              <label className="grid gap-2 text-sm fr-muted">
                Nationality
                <input
                  value={form.nationality}
                  onChange={handleChange('nationality')}
                  required
                  className="fr-input rounded-xl px-3 py-2 text-sm"
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm fr-muted">
                First name
                <input
                  value={form.firstName}
                  onChange={handleChange('firstName')}
                  required
                  className="fr-input rounded-xl px-3 py-2 text-sm"
                />
              </label>
              <label className="grid gap-2 text-sm fr-muted">
                Last name
                <input
                  value={form.lastName}
                  onChange={handleChange('lastName')}
                  required
                  className="fr-input rounded-xl px-3 py-2 text-sm"
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="grid gap-2 text-sm fr-muted">
                Birth date
                <input
                  value={form.birthDate}
                  onChange={handleChange('birthDate')}
                  placeholder="YYYY-MM-DD"
                  required
                  className="fr-input rounded-xl px-3 py-2 text-sm"
                />
              </label>
              <label className="grid gap-2 text-sm fr-muted">
                Birth place
                <input
                  value={form.birthPlace}
                  onChange={handleChange('birthPlace')}
                  required
                  className="fr-input rounded-xl px-3 py-2 text-sm"
                />
              </label>
              <label className="grid gap-2 text-sm fr-muted">
                Height
                <input
                  value={form.height}
                  onChange={handleChange('height')}
                  placeholder="ex: 1m78"
                  required
                  className="fr-input rounded-xl px-3 py-2 text-sm"
                />
              </label>
            </div>

            {isPassportPaused && (
              <p className="text-sm text-[var(--fr-red)]">
                Passport contract is paused. Minting is disabled.
              </p>
            )}
            <button
              type="submit"
              disabled={isMintDisabled}
              className={`mt-2 w-full rounded-xl px-4 py-2 text-sm font-semibold transition ${
                isMintDisabled
                  ? 'fr-btn-muted'
                  : 'fr-btn-primary'
              }`}
            >
              {isPending ? 'Transaction...' : 'Mint passport'}
            </button>
          </form>

          <div className="mt-4 text-sm fr-muted">
            {!isConnected && <p>Connect your wallet to enable the button.</p>}
            {isConnected && !isOwner && (
              <p>Connected wallet is not the owner of the contract.</p>
            )}
            {formError && <p className="text-[var(--fr-red)]">Error: {formError}</p>}
            {isSuccess && <p className="text-[var(--fr-blue)]">Transaction sent ✅</p>}
            {prettyError && <p className="text-[var(--fr-red)]">{prettyError}</p>}
            {error && (
              <details className="mt-2 fr-panel-muted p-3 text-xs">
                <summary className="cursor-pointer fr-muted">Technical details</summary>
                <p className="mt-2 break-all text-[var(--fr-red)]">{error.message}</p>
              </details>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
