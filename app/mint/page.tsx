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
  type Address,
  isAddress,
  ContractFunctionRevertedError,
  type SimulateContractParameters,
} from 'viem';

import o from "@/abi/Orchestrator.json";
import passport from "@/abi/SixRPassport.json";
import { ORCHESTRATOR_ADDRESS } from '@/app/lib/contracts';
import { useAutoDismiss } from '@/app/lib/hooks';

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

  const { data: orchestratorOwner } = useReadContract({
    address: ORCHESTRATOR_ADDRESS,
    abi: ORCHESTRATOR_ABI,
    functionName: 'owner',
  });

  const { data: isPaused } = useReadContract({
    address: rawPassportAddress as `0x${string}` | undefined,
    abi: PASSPORT_ABI,
    functionName: 'paused',
    query: { enabled: !!rawPassportAddress },
  });

  const { isSuccess: isTxConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  // ─── Derived state ────────────────────────────────────────────────────────

  const isPassportPaused = isPaused === true;
  const isOwner =
    typeof orchestratorOwner === 'string' &&
    typeof address === 'string' &&
    orchestratorOwner.toLowerCase() === address.toLowerCase();

  // ─── UI state ─────────────────────────────────────────────────────────────

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
    if (!isOwner) {
      setFormError('Only the owner of the contract can mint passports.');
      return;
    }
    if (!isAddress(form.recipient)) {
      setFormError('Recipient address is invalid.');
      return;
    }
    setFormError(null);
    setMintError(null);
    simulateAndWrite(
      {
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
      },
      setMintError,
    );
  };

  // ─── Derived UI flags ─────────────────────────────────────────────────────

  const isMintDisabled = !isConnected || !isOwner || isPending || isPassportPaused;

  // ─── Render ───────────────────────────────────────────────────────────────

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
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${isConnected ? 'fr-pill-blue' : 'fr-pill-red'}`}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>

          <form onSubmit={handleMint} className="mt-4 grid gap-4">
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
              className={`mt-2 w-full rounded-xl px-4 py-2 text-sm font-semibold transition ${isMintDisabled ? 'fr-btn-muted' : 'fr-btn-primary'}`}
            >
              {isPending ? 'Transaction...' : 'Mint passport'}
            </button>
          </form>

          <div className="mt-4 space-y-2 text-sm fr-muted">
            {!isConnected && <p>Connect your wallet to enable the button.</p>}
            {isConnected && !isOwner && <p>Connected wallet is not the owner of the contract.</p>}
            {formError && <p className="text-[var(--fr-red)]">{formError}</p>}
            {mintError && <p className="text-[var(--fr-red)]">{mintError}</p>}
            {isTxConfirmed && <p className="text-[var(--fr-blue)]">Passport minted successfully.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
