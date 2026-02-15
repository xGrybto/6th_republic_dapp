'use client';

import { useEffect, useState } from 'react';
import {
  useConnection,
  useWriteContract,
  useReadContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { type Abi, type Address, isAddress, zeroAddress } from 'viem';

import passport from "@/abi/SixRPassport.json";

export default function Page() {
  const { address, isConnected } = useConnection();
  const {
    mutate: writeContract,
    data: txHash,
    isPending,
  } = useWriteContract();

  const PASSPORT_ADDRESS =
    '0x6a1AC2f24e64F8477cAF201981424E504c8df9BF' as Address;

  // const ORCHESTRATOR_ABI = o.abi as Abi
  const PASSPORT_ABI = passport.abi as Abi;

  const { data: isPaused } = useReadContract({
    address: PASSPORT_ADDRESS,
    abi: PASSPORT_ABI,
    functionName: 'paused',
  });

  const {
    data,
    isLoading,
    error: readError,
    refetch: refetchDelegatedMode,
  } = useReadContract({
    address: PASSPORT_ADDRESS,
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
    address: PASSPORT_ADDRESS,
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
    address: PASSPORT_ADDRESS,
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
    address: PASSPORT_ADDRESS,
    abi: PASSPORT_ABI,
    functionName: 's_delegatePowers',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { isSuccess: isTxConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const hasDelegatedModeValue = data === true || data === false;
  const isDelegatedModeActivated = data === true;
  const isVoteDelegated =
    typeof representative === 'string' && representative !== zeroAddress;
  const isPassportPaused = isPaused === true;
  const hasPassportValue = hasPassport === true;
  const delegatePowersValue =
    typeof delegatePowers === 'bigint' ? delegatePowers : BigInt(0);

  const [delegateAddress, setDelegateAddress] = useState<Address | ''>('');
  const [delegateError, setDelegateError] = useState<string | null>(null);


  const handleSwitchMode = () => {
    const functionToUse = isDelegatedModeActivated
      ? 'disableDelegatedMode'
      : 'enableDelegatedMode';
    writeContract({
      address: PASSPORT_ADDRESS,
      abi: PASSPORT_ABI,
      functionName: functionToUse,
    });
  };

  const handleDelegateVote = () => {
    if (!isAddress(delegateAddress)) {
      setDelegateError('Adresse invalide.');
      return;
    }
    if (address && delegateAddress.toLowerCase() === address.toLowerCase()) {
      setDelegateError("Tu ne peux pas te déléguer toi-même.");
      return;
    }
    setDelegateError(null);
    writeContract({
      address: PASSPORT_ADDRESS,
      abi: PASSPORT_ABI,
      functionName: 'delegateVoteTo',
      args: [delegateAddress],
    });
  };

  const handleRevokeVote = () => {
    writeContract({
      address: PASSPORT_ADDRESS,
      abi: PASSPORT_ABI,
      functionName: 'revokeVote',
    });
  };

  useEffect(() => {
    if (isTxConfirmed) {
      refetchDelegatedMode();
      refetchPassport();
      refetchRepresentative();
      refetchDelegatePowers();
    }
  }, [
    isTxConfirmed,
    refetchDelegatedMode,
    refetchPassport,
    refetchRepresentative,
    refetchDelegatePowers,
  ]);

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
          <section className="fr-panel p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">Passport</h2>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  hasPassportValue
                    ? 'fr-pill-blue'
                    : 'fr-pill-red'
                }`}
              >
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

          {hasPassportValue && (
          <section className="fr-panel p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">Delegate Mode</h2>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  isDelegatedModeActivated
                    ? 'fr-pill-blue'
                    : 'fr-pill-red'
                }`}
              >
                {!hasDelegatedModeValue
                  ? 'Unknown'
                  : isDelegatedModeActivated
                    ? 'Enabled'
                    : 'Disabled'}
              </span>
            </div>

            <div className="mt-4 space-y-3 text-sm fr-muted">
              {!isConnected && (
                <p className="text-[var(--fr-blue)]">Connect your wallet to view data.</p>
              )}
              {isLoading && <p>Loading...</p>}
              {readError && (
                <p className="text-[var(--fr-red)]">Error: {readError.message}</p>
              )}
              {!hasDelegatedModeValue && isConnected && !isLoading && !readError && (
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
          </section>
          )}

          {hasPassportValue && (
          <section className="fr-panel p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">Vote Delegation</h2>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  isVoteDelegated
                    ? 'fr-pill-blue'
                    : 'fr-pill-red'
                }`}
              >
                {isRepresentativeLoading
                  ? 'Loading...'
                  : isVoteDelegated
                    ? 'Delegated'
                    : 'Not delegated'}
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
              {delegateError && (
                <p className="text-sm text-[var(--fr-red)]">{delegateError}</p>
              )}
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
                !isConnected || isPending || isPassportPaused
                  ? 'fr-btn-muted'
                  : 'fr-btn-danger'
              }`}
            >
                {isPending ? 'Transaction...' : 'Revoke delegation'}
              </button>
            )}
          </section>
          )}
        </div>
      </div>
    </main>
  );
}
