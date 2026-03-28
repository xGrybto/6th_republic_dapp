'use client';

import { useState } from 'react';
import {
  useConnection,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  usePublicClient,
} from 'wagmi';
import {
  type Abi,
  ContractFunctionRevertedError,
  type SimulateContractParameters,
} from 'viem';

import { countries } from 'countries-list';

import o from "@/abi/Orchestrator.json";
import passport from "@/abi/SixRPassport.json";
import { ORCHESTRATOR_ADDRESS } from '@/app/lib/contracts';
import { useAutoDismiss } from '@/app/lib/hooks';
import { validateInput } from '@/app/lib/utils';

// ─── Countries ────────────────────────────────────────────────────────────────

const COUNTRY_NAMES = Object.values(countries)
  .map((c) => c.name)
  .sort();

// ─── ABIs ─────────────────────────────────────────────────────────────────────

const ORCHESTRATOR_ABI = o.abi as Abi;
const PASSPORT_ABI = passport.abi as Abi;

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function Page() {

  // ─── Wallet ───────────────────────────────────────────────────────────────

  const { address, isConnected } = useConnection();
  const publicClient = usePublicClient();
  const { mutate: writeContract, data: txHash, isPending } = useWriteContract();

  // ─── On-chain reads ───────────────────────────────────────────────────────

  const { data: rawPassportAddress } = useReadContract({
    address: ORCHESTRATOR_ADDRESS,
    abi: ORCHESTRATOR_ABI,
    functionName: 'passport',
  });

  const { data: hasPassport } = useReadContract({
    address: rawPassportAddress as `0x${string}` | undefined,
    abi: PASSPORT_ABI,
    functionName: 'hasPassport',
    args: address ? [address] : undefined,
    query: { enabled: !!rawPassportAddress && !!address },
  });

  const { isSuccess: isTxConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  // ─── Derived state ────────────────────────────────────────────────────────

  const alreadyMinted = hasPassport === true || isTxConfirmed;

  // ─── UI state ─────────────────────────────────────────────────────────────

  const [form, setForm] = useState({
    pseudo: '',
    nationality: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [mintError, setMintError] = useState<string | null>(null);

  useAutoDismiss(formError, setFormError);
  useAutoDismiss(mintError, setMintError);

  // ─── Transaction simulation ───────────────────────────────────────────────
  // Simulates the call against the RPC before submitting, so contract revert
  // reasons are surfaced directly instead of a generic gas estimation error.

  const simulateAndWrite = async (
    params: SimulateContractParameters,
    setError: (msg: string) => void,
  ) => {
    if (!publicClient || !address) return;
    try {
      const { request } = await publicClient.simulateContract({ ...params, account: address });
      writeContract(request);
    } catch (err) {
      if (err instanceof ContractFunctionRevertedError) {
        setError(err.reason ?? err.shortMessage ?? 'Transaction would fail.');
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unknown error occurred.');
      }
    }
  };

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleChange =
    (field: keyof typeof form) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: event.target.value }));
    };

  const handleMint = (event: React.FormEvent) => {
    event.preventDefault();
    // Guards: client-side checks before simulation
    if (!address) {
      setFormError('Connect your wallet first.');
      return;
    }
    const pseudoError = validateInput(form.pseudo, 'Pseudo', 32);
    if (pseudoError) { setFormError(pseudoError); return; }
    const nationalityError = validateInput(form.nationality, 'Nationality', 50);
    if (nationalityError) { setFormError(nationalityError); return; }
    setFormError(null);
    setMintError(null);
    simulateAndWrite(
      {
        address: ORCHESTRATOR_ADDRESS,
        abi: ORCHESTRATOR_ABI,
        functionName: 'mintPassport',
        args: [form.pseudo, form.nationality],
      },
      setMintError,
    );
  };

  // ─── Derived UI flags ─────────────────────────────────────────────────────

  const isMintDisabled = !isConnected || isPending || alreadyMinted;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <main className="fr-bg">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
        <section className="fr-panel overflow-hidden px-8 py-8 text-center">
          <div className="mb-5 flex h-px w-full overflow-hidden rounded-full">
            <div className="flex-1 bg-[var(--fr-blue)]" />
            <div className="flex-1 bg-[var(--fr-white)] opacity-15" />
            <div className="flex-1 bg-[var(--fr-red)]" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-[var(--fr-white)]">Mint Passport</h1>
          <p className="mt-2 text-sm fr-muted">Mint your on-chain identity to join the 6th Republic.</p>
        </section>

        <section className="fr-panel p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Form</h2>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${isConnected ? 'fr-pill-blue' : 'fr-pill-red'}`}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>

          <form onSubmit={handleMint} className="mt-4 grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm fr-muted">
                Pseudo
                <input
                  value={form.pseudo}
                  onChange={handleChange('pseudo')}
                  maxLength={32}
                  required
                  className="fr-input rounded-xl px-3 py-2 text-sm"
                />
              </label>
              <label className="grid gap-2 text-sm fr-muted">
                Nationality
                <select
                  value={form.nationality}
                  onChange={(e) => setForm((prev) => ({ ...prev, nationality: e.target.value }))}
                  required
                  className="fr-input rounded-xl px-3 py-2 text-sm"
                >
                  <option value="" disabled>Select a country</option>
                  {COUNTRY_NAMES.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </label>
            </div>

            <button
              type="submit"
              disabled={isMintDisabled}
              className={`mt-2 w-full rounded-xl px-4 py-2 text-sm font-semibold transition ${isMintDisabled ? 'fr-btn-muted' : 'fr-btn-primary'}`}
            >
              {isPending ? 'Transaction...' : alreadyMinted ? 'Passport minted' : 'Mint passport'}
            </button>
          </form>

          <div className="mt-4 space-y-2 text-sm fr-muted">
            {!isConnected && <p>Connect your wallet to enable the button.</p>}
            {formError && <p className="text-[var(--fr-red)]">{formError}</p>}
            {mintError && <p className="text-[var(--fr-red)]">{mintError}</p>}
            {isTxConfirmed && <p className="text-[var(--fr-blue)]">Passport minted successfully.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
