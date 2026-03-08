'use client';

import { useEffect, useState } from 'react';
import {
  useConnection,
  useWriteContract,
  useReadContract,
  useWaitForTransactionReceipt,
  usePublicClient,
} from 'wagmi';
import {
  type Abi,
  type Address,
  isAddress,
  zeroAddress,
  ContractFunctionRevertedError,
  type SimulateContractParameters,
} from 'viem';

import passport from "@/abi/SixRPassport.json";
import o from "@/abi/Orchestrator.json";
import { toAddress } from '@/app/lib/address';
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

  const passportAddress = toAddress(rawPassportAddress);

  const { data: isPaused } = useReadContract({
    address: passportAddress,
    abi: PASSPORT_ABI,
    functionName: 'paused',
  });

  const {
    data: delegatedModeRaw,
    isLoading: isDelegatedModeLoading,
    error: delegatedModeError,
    refetch: refetchDelegatedMode,
  } = useReadContract({
    address: passportAddress,
    abi: PASSPORT_ABI,
    functionName: 's_delegatedMode',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const {
    data: hasPassport,
    isLoading: isPassportLoading,
    error: passportError,
    refetch: refetchPassport,
  } = useReadContract({
    address: passportAddress,
    abi: PASSPORT_ABI,
    functionName: 'hasPassport',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const {
    data: representative,
    isLoading: isRepresentativeLoading,
    error: representativeError,
    refetch: refetchRepresentative,
  } = useReadContract({
    address: passportAddress,
    abi: PASSPORT_ABI,
    functionName: 's_representatives',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const {
    data: delegatePowers,
    isLoading: isDelegatePowersLoading,
    error: delegatePowersError,
    refetch: refetchDelegatePowers,
  } = useReadContract({
    address: passportAddress,
    abi: PASSPORT_ABI,
    functionName: 's_delegatePowers',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { isSuccess: isTxConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  // ─── Derived state ────────────────────────────────────────────────────────

  const hasPassportValue = hasPassport === true;
  const hasDelegatedModeValue = delegatedModeRaw === true || delegatedModeRaw === false;
  const isDelegatedModeActivated = delegatedModeRaw === true;
  const isVoteDelegated = typeof representative === 'string' && representative !== zeroAddress;
  const isPassportPaused = isPaused === true;
  const delegatePowersValue = typeof delegatePowers === 'bigint' ? delegatePowers : BigInt(0);

  // ─── UI state ─────────────────────────────────────────────────────────────

  const [delegateAddress, setDelegateAddress] = useState<Address | ''>('');
  const [delegateModeError, setDelegateModeError] = useState<string | null>(null);
  const [delegationError, setDelegationError] = useState<string | null>(null);

  useAutoDismiss(delegateModeError, setDelegateModeError);
  useAutoDismiss(delegationError, setDelegationError);

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

  const handleSwitchMode = () => {
    if (!passportAddress) return;
    setDelegateModeError(null);
    const functionToUse = isDelegatedModeActivated ? 'disableDelegatedMode' : 'enableDelegatedMode';
    simulateAndWrite(
      { address: passportAddress, abi: PASSPORT_ABI, functionName: functionToUse },
      setDelegateModeError,
    );
  };

  const handleDelegateVote = () => {
    // Guards: client-side checks that give clearer messages than contract reverts
    if (!isAddress(delegateAddress)) {
      setDelegationError('Invalid address.');
      return;
    }
    if (address && delegateAddress.toLowerCase() === address.toLowerCase()) {
      setDelegationError('You cannot delegate to yourself.');
      return;
    }
    if (!passportAddress) return;
    setDelegationError(null);
    simulateAndWrite(
      { address: passportAddress, abi: PASSPORT_ABI, functionName: 'delegateVoteTo', args: [delegateAddress] },
      setDelegationError,
    );
  };

  const handleRevokeVote = () => {
    if (!passportAddress) return;
    setDelegationError(null);
    simulateAndWrite(
      { address: passportAddress, abi: PASSPORT_ABI, functionName: 'revokeDelegation' },
      setDelegationError,
    );
  };

  // ─── Post-tx refresh ──────────────────────────────────────────────────────

  useEffect(() => {
    if (isTxConfirmed) {
      refetchDelegatedMode();
      refetchPassport();
      refetchRepresentative();
      refetchDelegatePowers();
    }
  }, [isTxConfirmed, refetchDelegatedMode, refetchPassport, refetchRepresentative, refetchDelegatePowers]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <main className="fr-bg">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">Account</h1>
          <p className="text-sm fr-muted">
            Manage delegated mode and check on-chain status.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">

          {/* Passport */}
          <section className="fr-panel p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">Passport</h2>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${hasPassportValue ? 'fr-pill-blue' : 'fr-pill-red'}`}>
                {isPassportLoading ? 'Loading...' : hasPassportValue ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="mt-4 space-y-3 text-sm fr-muted">
              {passportError && (
                <p className="text-[var(--fr-red)]">Error: {passportError.message}</p>
              )}
              {!isConnected && (
                <p className="text-[var(--fr-blue)]">Connect your wallet to check.</p>
              )}
              {!hasPassportValue && !isPassportLoading && isConnected && (
                <p>You need a passport to access delegation features.</p>
              )}
            </div>
          </section>

          {/* Delegate Mode */}
          {hasPassportValue && (
          <section className="fr-panel p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">Delegate Mode</h2>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${isDelegatedModeActivated ? 'fr-pill-blue' : 'fr-pill-red'}`}>
                {!hasDelegatedModeValue ? 'Unknown' : isDelegatedModeActivated ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <div className="mt-4 space-y-3 text-sm fr-muted">
              {!isConnected && (
                <p className="text-[var(--fr-blue)]">Connect your wallet to view data.</p>
              )}
              {isDelegatedModeLoading && <p>Loading...</p>}
              {delegatedModeError && (
                <p className="text-[var(--fr-red)]">Error: {delegatedModeError.message}</p>
              )}
              {!hasDelegatedModeValue && isConnected && !isDelegatedModeLoading && !delegatedModeError && (
                <p>No data available.</p>
              )}
            </div>
            {isPassportPaused && (
              <p className="text-sm text-[var(--fr-blue)]">
                Passport contract is paused. Actions are disabled.
              </p>
            )}
            <button
              onClick={handleSwitchMode}
              disabled={!isConnected || !hasDelegatedModeValue || isPending || isPassportPaused}
              className={`mt-4 w-full rounded-xl px-4 py-2 text-sm font-semibold transition ${
                !isConnected || !hasDelegatedModeValue || isPending || isPassportPaused
                  ? 'fr-btn-muted'
                  : 'fr-btn-primary'
              }`}
            >
              {isPending ? 'Transaction...' : 'Switch mode'}
            </button>
            {delegateModeError && (
              <p className="mt-2 text-sm text-[var(--fr-red)]">{delegateModeError}</p>
            )}
          </section>
          )}

          {/* Vote Delegation */}
          {hasPassportValue && (
          <section className="fr-panel p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">Vote Delegation</h2>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${isVoteDelegated ? 'fr-pill-blue' : 'fr-pill-red'}`}>
                {isRepresentativeLoading ? 'Loading...' : isVoteDelegated ? 'Delegated' : 'Not delegated'}
              </span>
            </div>
            <div className="mt-4 space-y-3 text-sm fr-muted">
              {representativeError && (
                <p className="text-[var(--fr-red)]">Error: {representativeError.message}</p>
              )}
              {isVoteDelegated && (
                <div className="fr-panel-muted px-3 py-2 font-mono text-xs text-[var(--fr-white)]">
                  {representative as string}
                </div>
              )}
              {delegatePowersError && (
                <p className="text-[var(--fr-red)]">Error: {delegatePowersError.message}</p>
              )}
              {isDelegatedModeActivated && (
                <div className="fr-panel-muted px-3 py-2 text-xs text-[var(--fr-white)]">
                  {isDelegatePowersLoading
                    ? 'Loading delegate powers...'
                    : `Delegations received: ${delegatePowersValue.toString()}`}
                </div>
              )}
            </div>
            {!isVoteDelegated && (
              <div className="mt-4 space-y-3">
                <label className="grid gap-2 text-sm fr-muted">
                  Delegate address
                  <input
                    value={delegateAddress}
                    onChange={(event) => setDelegateAddress(event.target.value as Address)}
                    placeholder="0x..."
                    className="fr-input rounded-xl px-3 py-2 text-sm"
                  />
                </label>
                <button
                  onClick={handleDelegateVote}
                  disabled={!isConnected || isPending || isDelegatedModeActivated || isPassportPaused}
                  className={`w-full rounded-xl px-4 py-2 text-sm font-semibold transition ${
                    !isConnected || isPending || isDelegatedModeActivated || isPassportPaused
                      ? 'fr-btn-muted'
                      : 'fr-btn-primary'
                  }`}
                >
                  {isDelegatedModeActivated
                    ? 'Cannot delegate while delegated mode is enabled'
                    : isPending
                      ? 'Transaction...'
                      : 'Delegate vote'}
                </button>
              </div>
            )}
            {isVoteDelegated && (
              <button
                onClick={handleRevokeVote}
                disabled={!isConnected || isPending || isPassportPaused}
                className={`mt-4 w-full rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  !isConnected || isPending || isPassportPaused ? 'fr-btn-muted' : 'fr-btn-danger'
                }`}
              >
                {isPending ? 'Transaction...' : 'Revoke delegation'}
              </button>
            )}
            {delegationError && (
              <p className="mt-2 text-sm text-[var(--fr-red)]">{delegationError}</p>
            )}
          </section>
          )}

        </div>
      </div>
    </main>
  );
}
