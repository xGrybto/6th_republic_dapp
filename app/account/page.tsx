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
import { Tooltip } from '@/app/ui/tooltip';

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

  const { data: passportAttributes } = useReadContract({
    address: passportAddress,
    abi: PASSPORT_ABI,
    functionName: 'getPassportAttributes',
    args: address ? [address] : undefined,
    query: { enabled: !!address && hasPassport === true },
  });

  const { data: tokenURIData } = useReadContract({
    address: passportAddress,
    abi: PASSPORT_ABI,
    functionName: 'getTokenURI',
    args: address ? [address] : undefined,
    query: { enabled: !!address && hasPassport === true },
  });

  const { isSuccess: isTxConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  // ─── Derived state ────────────────────────────────────────────────────────

  const hasPassportValue         = hasPassport === true;
  const hasDelegatedModeValue    = delegatedModeRaw === true || delegatedModeRaw === false;
  const isDelegatedModeActivated = delegatedModeRaw === true;
  const isVoteDelegated          = typeof representative === 'string' && representative !== zeroAddress;
  const isPassportPaused         = isPaused === true;
  const delegatePowersValue      = typeof delegatePowers === 'bigint' ? delegatePowers : BigInt(0);

  const [pseudo, nationality] = Array.isArray(passportAttributes)
    ? [passportAttributes[0] as string, passportAttributes[1] as string]
    : [null, null];

  const nftImageUrl = (() => {
    if (typeof tokenURIData !== 'string') return null;
    try {
      const json = JSON.parse(atob(tokenURIData.replace('data:application/json;base64,', '')));
      const image: string = json.image ?? '';
      return image.startsWith('ipfs://')
        ? image.replace('ipfs://', 'https://ipfs.io/ipfs/')
        : image;
    } catch {
      return null;
    }
  })();

  // ─── UI state ─────────────────────────────────────────────────────────────

  const [delegateAddress, setDelegateAddress] = useState<Address | ''>('');
  const [delegateModeError, setDelegateModeError] = useState<string | null>(null);
  const [delegationError,   setDelegationError]   = useState<string | null>(null);

  useAutoDismiss(delegateModeError, setDelegateModeError);
  useAutoDismiss(delegationError,   setDelegationError);

  // ─── Transaction simulation ───────────────────────────────────────────────

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

        {/* Hero */}
        <section className="fr-panel overflow-hidden px-8 py-8 text-center">
          <div className="mb-5 flex h-px w-full overflow-hidden rounded-full">
            <div className="flex-1 bg-[var(--fr-blue)]" />
            <div className="flex-1 bg-[var(--fr-white)] opacity-15" />
            <div className="flex-1 bg-[var(--fr-red)]" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-[var(--fr-white)]">Account</h1>
          <p className="mt-2 text-sm fr-muted">Manage delegated mode and check on-chain status.</p>
        </section>

        {/* Profile */}
        <section className="fr-panel p-6">
          <div className="flex items-start gap-6">
            {hasPassportValue && nftImageUrl && (
              <img
                src={nftImageUrl}
                alt="Passport NFT"
                className="w-32 flex-shrink-0 rounded-xl"
              />
            )}
            <div className="flex flex-1 flex-col gap-4">
              <h2 className="text-lg font-medium">
                Passport <Tooltip text="A Soulbound Token (SBT) — non-transferable and unique to your address." />
              </h2>
              <div className="grid gap-2 text-sm">
                <div className="flex items-center justify-between border-b border-[var(--fr-border)] pb-2">
                  <span className="fr-muted">Pseudo</span>
                  <span className="text-[var(--fr-white)]">{pseudo ?? '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="fr-muted">Nationality</span>
                  <span className="text-[var(--fr-white)]">{nationality ?? '—'}</span>
                </div>
              </div>
              <div className="space-y-2 text-sm fr-muted">
                {passportError && <p className="text-[var(--fr-red)]">Error: {passportError.message}</p>}
                {!isConnected && <p className="text-[var(--fr-blue)]">Connect your wallet to check.</p>}
                {!hasPassportValue && !isPassportLoading && isConnected && (
                  <p>You need a passport to access delegation features.</p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Delegation */}
        {hasPassportValue && (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-base font-medium">Delegation</h2>
              <p className="mt-0.5 text-xs fr-muted opacity-60">Manage how your vote is represented on-chain.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">

              {/* Delegate Mode */}
              <section className="fr-panel p-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-medium">
                    Delegate Mode <Tooltip text="When enabled, other citizens can delegate their vote to you. Your vote weight increases accordingly." />
                  </h2>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${isDelegatedModeActivated ? 'fr-pill-blue' : 'fr-pill-red'}`}>
                    {!hasDelegatedModeValue ? 'Unknown' : isDelegatedModeActivated ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <div className="mt-4 space-y-3 text-sm fr-muted">
                  {!isConnected && <p className="text-[var(--fr-blue)]">Connect your wallet to view data.</p>}
                  {isDelegatedModeLoading && <p>Loading...</p>}
                  {delegatedModeError && <p className="text-[var(--fr-red)]">Error: {delegatedModeError.message}</p>}
                  {!hasDelegatedModeValue && isConnected && !isDelegatedModeLoading && !delegatedModeError && (
                    <p>No data available.</p>
                  )}
                  {isDelegatedModeActivated && (
                    <div className="fr-panel-muted rounded-xl px-3 py-2 text-xs text-[var(--fr-white)]">
                      {isDelegatePowersLoading
                        ? 'Loading...'
                        : `${delegatePowersValue.toString()} citizen${delegatePowersValue === BigInt(1) ? '' : 's'} delegated to you`}
                    </div>
                  )}
                  {delegatePowersError && <p className="text-[var(--fr-red)]">Error: {delegatePowersError.message}</p>}
                </div>
                {isPassportPaused && (
                  <p className="mt-3 text-sm text-[var(--fr-blue)]">Contract paused — actions disabled.</p>
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
                  {isPending ? 'Transaction...' : isDelegatedModeActivated ? 'Disable delegate mode' : 'Enable delegate mode'}
                </button>
                {delegateModeError && (
                  <p className="mt-2 text-sm text-[var(--fr-red)]">{delegateModeError}</p>
                )}
              </section>

              {/* Vote Delegation */}
              <section className="fr-panel p-6 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-medium">
                    Vote Delegation <Tooltip text="Transfer your voting power to a representative. They will vote on your behalf — revocable at any time." />
                  </h2>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${isVoteDelegated ? 'fr-pill-blue' : 'fr-pill-red'}`}>
                    {isRepresentativeLoading ? 'Loading...' : isVoteDelegated ? 'Delegated' : 'Not delegated'}
                  </span>
                </div>

                {representativeError && (
                  <p className="text-sm text-[var(--fr-red)]">Error: {representativeError.message}</p>
                )}

                {/* Currently delegated to */}
                {isVoteDelegated && (
                  <div className="space-y-3">
                    <p className="text-xs fr-muted opacity-60">Your vote is delegated to</p>
                    <div className="fr-panel-muted rounded-xl px-3 py-2 font-mono text-xs text-[var(--fr-white)]">
                      {representative as string}
                    </div>
                    <button
                      onClick={handleRevokeVote}
                      disabled={!isConnected || isPending || isPassportPaused}
                      className={`w-full rounded-xl px-4 py-2 text-sm font-semibold transition ${
                        !isConnected || isPending || isPassportPaused ? 'fr-btn-muted' : 'fr-btn-danger'
                      }`}
                    >
                      {isPending ? 'Transaction...' : 'Revoke delegation'}
                    </button>
                  </div>
                )}

                {/* Delegate-mode active: cannot delegate out */}
                {!isVoteDelegated && isDelegatedModeActivated && (
                  <p className="text-sm fr-muted">
                    You are acting as a representative. Disable delegate mode first to delegate your own vote.
                  </p>
                )}

                {/* Input */}
                {!isVoteDelegated && !isDelegatedModeActivated && (
                  <div className="flex flex-col gap-3">
                    <label className="grid gap-1.5 text-xs fr-muted">
                      Representative address
                      <input
                        value={delegateAddress}
                        onChange={(event) => setDelegateAddress(event.target.value as Address)}
                        placeholder="0x…"
                        className="fr-input rounded-xl px-3 py-2 text-sm"
                      />
                    </label>
                    <button
                      onClick={handleDelegateVote}
                      disabled={!isConnected || isPending || isPassportPaused}
                      className={`w-full rounded-xl px-4 py-2 text-sm font-semibold transition ${
                        !isConnected || isPending || isPassportPaused ? 'fr-btn-muted' : 'fr-btn-primary'
                      }`}
                    >
                      {isPending ? 'Transaction...' : 'Delegate vote'}
                    </button>
                    {isPassportPaused && (
                      <p className="text-sm text-[var(--fr-blue)]">Contract paused — actions disabled.</p>
                    )}
                  </div>
                )}

                {delegationError && (
                  <p className="text-sm text-[var(--fr-red)]">{delegationError}</p>
                )}
              </section>

            </div>
          </div>
        )}

      </div>
    </main>
  );
}
