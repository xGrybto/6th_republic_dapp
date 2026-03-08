'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  useBlock,
  useConnection,
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
  usePublicClient,
} from 'wagmi';
import {
  type Abi,
  zeroAddress,
  ContractFunctionRevertedError,
  type SimulateContractParameters,
} from 'viem';

import proposalAbi from '@/abi/SixRProposal.json';
import passport from '@/abi/SixRPassport.json';
import o from "@/abi/Orchestrator.json";
import { toAddress } from '@/app/lib/address';
import { ORCHESTRATOR_ADDRESS } from '@/app/lib/contracts';
import { useAutoDismiss } from '@/app/lib/hooks';

// ─── ABIs ─────────────────────────────────────────────────────────────────────

const PROPOSAL_ABI = proposalAbi.abi as Abi;
const PASSPORT_ABI = passport.abi as Abi;
const ORCHESTRATOR_ABI = o.abi as Abi;

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_OPTIONS = [
  { value: 0, label: 'ECOLOGY' },
  { value: 1, label: 'EDUCATION' },
  { value: 2, label: 'ECONOMY' },
  { value: 3, label: 'DEFENSE' },
] as const;

const STATUS_OPTIONS = [
  { value: 0, label: 'ENDED' },
  { value: 1, label: 'ONGOING' },
  { value: 2, label: 'CREATED' },
] as const;

const VOTE_OPTIONS = [
  { value: 1, label: 'NO' },
  { value: 2, label: 'YES' },
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

type ProposalTuple = readonly [
  string,        // title
  string,        // description
  bigint,        // category (enum index)
  `0x${string}`, // creator
  bigint,        // creation timestamp
  bigint,        // voting start timestamp
  bigint,        // status (enum index)
  `0x${string}`, // closed block hash
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCountdown(secondsLeft: bigint): string {
  const total = secondsLeft > BigInt(0) ? secondsLeft : BigInt(0);
  const days    = total / BigInt(86400);
  const hours   = (total % BigInt(86400)) / BigInt(3600);
  const minutes = (total % BigInt(3600)) / BigInt(60);
  const seconds = total % BigInt(60);
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function Page() {

  // ─── SSR hydration guard ──────────────────────────────────────────────────
  // Prevents wallet-dependent UI from rendering on the server (hydration mismatch).

  const [isClient, setIsClient] = useState(false);
  useEffect(() => { setIsClient(true); }, []);

  // ─── Wallet ───────────────────────────────────────────────────────────────

  const { isConnected, address } = useConnection();
  const publicClient = usePublicClient();
  const { mutate: writeContract, data: txHash, isPending: isTxPending } = useWriteContract();

  // ─── On-chain reads — Orchestrator ────────────────────────────────────────

  const { data: rawPassportAddress } = useReadContract({
    address: ORCHESTRATOR_ADDRESS,
    abi: ORCHESTRATOR_ABI,
    functionName: 'passport',
  });

  const { data: rawProposalAddress } = useReadContract({
    address: ORCHESTRATOR_ADDRESS,
    abi: ORCHESTRATOR_ABI,
    functionName: 'proposal',
  });

  const passportAddress = toAddress(rawPassportAddress);
  const proposalAddress = toAddress(rawProposalAddress);

  // ─── On-chain reads — Proposal ────────────────────────────────────────────

  const {
    data: proposalCounter,
    isLoading: isCounterLoading,
    error: counterError,
    refetch: refetchCounter,
  } = useReadContract({
    address: proposalAddress,
    abi: PROPOSAL_ABI,
    functionName: 'proposalCounter',
  });

  const currentProposalId =
    typeof proposalCounter === 'bigint' && proposalCounter > BigInt(0)
      ? proposalCounter - BigInt(1)
      : undefined;

  const {
    data: proposalData,
    isLoading: isProposalLoading,
    error: proposalError,
    refetch: refetchProposal,
  } = useReadContract({
    address: proposalAddress,
    abi: PROPOSAL_ABI,
    functionName: 'get',
    args: currentProposalId !== undefined ? [currentProposalId] : undefined,
    query: { enabled: currentProposalId !== undefined },
  });

  const { data: rawPreparationPeriod } = useReadContract({
    address: proposalAddress,
    abi: PROPOSAL_ABI,
    functionName: 'PREPARATION_PERIOD',
    query: { enabled: !!proposalAddress },
  });

  const { data: rawVotingPeriod } = useReadContract({
    address: proposalAddress,
    abi: PROPOSAL_ABI,
    functionName: 'VOTING_PERIOD',
    query: { enabled: !!proposalAddress },
  });

  const { data: hasVoted } = useReadContract({
    address: proposalAddress,
    abi: PROPOSAL_ABI,
    functionName: 'hasVoted',
    args: address && currentProposalId !== undefined ? [currentProposalId, address] : undefined,
    query: { enabled: !!address && currentProposalId !== undefined },
  });

  // ─── On-chain reads — Passport ────────────────────────────────────────────

  const { data: hasPassport } = useReadContract({
    address: passportAddress,
    abi: PASSPORT_ABI,
    functionName: 'hasPassport',
    args: address ? [address] : undefined,
    query: { enabled: !!passportAddress && !!address },
  });

  const { data: representative } = useReadContract({
    address: passportAddress,
    abi: PASSPORT_ABI,
    functionName: 's_representatives',
    args: address ? [address] : undefined,
    query: { enabled: !!passportAddress && !!address },
  });

  // ─── On-chain reads — Vote results (ended proposals only) ─────────────────

  const { data: voteCountData } = useReadContract({
    address: ORCHESTRATOR_ADDRESS,
    abi: ORCHESTRATOR_ABI,
    functionName: 'countVotes',
    args: currentProposalId !== undefined ? [currentProposalId] : undefined,
    query: { enabled: currentProposalId !== undefined },
  });

  // ─── On-chain reads — Past proposals (batch) ──────────────────────────────

  const pastProposalIds = useMemo(() => {
    if (currentProposalId === undefined || currentProposalId <= BigInt(1)) return [];
    return Array.from({ length: Number(currentProposalId) - 1 }, (_, i) => BigInt(i + 1));
  }, [currentProposalId]);

  const { data: pastProposalsData } = useReadContracts({
    contracts: pastProposalIds.map((id) => ({
      address: proposalAddress!,
      abi: PROPOSAL_ABI,
      functionName: 'get' as const,
      args: [id] as const,
    })),
    query: { enabled: pastProposalIds.length > 0 && !!proposalAddress },
  });

  const { data: pastVoteCountsData } = useReadContracts({
    contracts: pastProposalIds.map((id) => ({
      address: ORCHESTRATOR_ADDRESS,
      abi: ORCHESTRATOR_ABI,
      functionName: 'countVotes' as const,
      args: [id] as const,
    })),
    query: { enabled: pastProposalIds.length > 0 },
  });

  // ─── Block (for countdowns) ───────────────────────────────────────────────

  const { data: latestBlock } = useBlock({ watch: true });
  const blockTimestamp = latestBlock?.timestamp;

  const { isSuccess: isTxConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  // ─── Derived state ────────────────────────────────────────────────────────

  const currentProposal  = proposalData as ProposalTuple | undefined;
  const isEmptyProposal  = currentProposal && currentProposal[4] === BigInt(0) && currentProposal[3] === zeroAddress;
  const creationTime     = currentProposal ? BigInt(currentProposal[4]) : undefined;
  const votingTime       = currentProposal ? BigInt(currentProposal[5]) : undefined;
  const statusValue      = currentProposal ? BigInt(currentProposal[6]) : undefined;

  const categoryLabel = currentProposal
    ? CATEGORY_OPTIONS.find((opt) => opt.value === Number(currentProposal[2]))?.label
    : undefined;
  const statusLabel = currentProposal
    ? STATUS_OPTIONS.find((opt) => opt.value === Number(currentProposal[6]))?.label
    : undefined;

  const isCreatedFinal = statusValue === BigInt(2) || statusLabel === 'CREATED';
  const isOngoingFinal = statusValue === BigInt(1) || statusLabel === 'ONGOING';
  const isEndedFinal   = statusValue === BigInt(0) || statusLabel === 'ENDED';

  const hasPassportValue = hasPassport === true;
  const isVoteDelegated  = typeof representative === 'string' && representative !== zeroAddress;
  const hasVotedValue    = hasVoted === true;
  const voteCount        = voteCountData as readonly [bigint, bigint] | undefined;
  const preparationPeriod = typeof rawPreparationPeriod === 'bigint' ? rawPreparationPeriod : undefined;
  const votingPeriod      = typeof rawVotingPeriod === 'bigint' ? rawVotingPeriod : undefined;

  const canStartVoting =
    isConnected &&
    creationTime !== undefined &&
    blockTimestamp !== undefined &&
    preparationPeriod !== undefined &&
    blockTimestamp >= creationTime + preparationPeriod &&
    isCreatedFinal;

  const isVotingExpired =
    isOngoingFinal &&
    votingTime !== undefined &&
    blockTimestamp !== undefined &&
    votingPeriod !== undefined &&
    blockTimestamp >= votingTime + votingPeriod;

  const canVote =
    isConnected &&
    isOngoingFinal &&
    !isVotingExpired &&
    hasPassportValue &&
    !isVoteDelegated &&
    !hasVotedValue;

  // ─── Countdowns ───────────────────────────────────────────────────────────

  const preparationEndsAt = creationTime !== undefined && preparationPeriod !== undefined
    ? creationTime + preparationPeriod
    : undefined;
  const votingEndsAt = votingTime !== undefined && votingPeriod !== undefined
    ? votingTime + votingPeriod
    : undefined;

  const preparationCountdown = useMemo(() => {
    if (!preparationEndsAt || !blockTimestamp) return null;
    return formatCountdown(preparationEndsAt - blockTimestamp);
  }, [preparationEndsAt, blockTimestamp]);

  const votingCountdown = useMemo(() => {
    if (!votingEndsAt || !blockTimestamp) return null;
    return formatCountdown(votingEndsAt - blockTimestamp);
  }, [votingEndsAt, blockTimestamp]);

  // ─── UI state ─────────────────────────────────────────────────────────────

  const [form, setForm] = useState({ title: '', description: '', category: '0' });
  const [formError, setFormError] = useState<string | null>(null);
  const [createProposalError, setCreateProposalError] = useState<string | null>(null);
  const [startVotingError, setStartVotingError] = useState<string | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);

  useAutoDismiss(formError, setFormError);
  useAutoDismiss(createProposalError, setCreateProposalError);
  useAutoDismiss(startVotingError, setStartVotingError);
  useAutoDismiss(voteError, setVoteError);

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

  const handleCreateProposal = (event: React.FormEvent) => {
    event.preventDefault();
    const title = form.title.trim();
    const description = form.description.trim();
    const categoryNumber = Number(form.category);

    // Guards: client-side checks before simulation
    if (!isEndedFinal) {
      setFormError('You cannot create a proposal while another one is active.');
      return;
    }
    if (!title || !description) {
      setFormError('Title and description are required.');
      return;
    }
    if (!Number.isInteger(categoryNumber) || categoryNumber < 0 || categoryNumber > 255) {
      setFormError('Category must be an integer between 0 and 255.');
      return;
    }

    setFormError(null);
    setCreateProposalError(null);
    simulateAndWrite(
      {
        address: ORCHESTRATOR_ADDRESS,
        abi: ORCHESTRATOR_ABI,
        functionName: 'createProposal',
        args: [title, description, categoryNumber],
      },
      setCreateProposalError,
    );
  };

  const handleStartVoting = () => {
    setStartVotingError(null);
    simulateAndWrite(
      {
        address: ORCHESTRATOR_ADDRESS,
        abi: ORCHESTRATOR_ABI,
        functionName: 'startVoting',
        args: [currentProposalId],
      },
      setStartVotingError,
    );
  };

  const handleVote = (voteValue: number) => {
    setVoteError(null);
    simulateAndWrite(
      {
        address: ORCHESTRATOR_ADDRESS,
        abi: ORCHESTRATOR_ABI,
        functionName: 'voteProposal',
        args: [currentProposalId, voteValue],
      },
      setVoteError,
    );
  };

  const handleCloseElection = () => {
    setVoteError(null);
    simulateAndWrite(
      {
        address: ORCHESTRATOR_ADDRESS,
        abi: ORCHESTRATOR_ABI,
        functionName: 'voteProposal',
        args: [currentProposalId, 1],
      },
      setVoteError,
    );
  };

  // ─── Post-tx refresh ──────────────────────────────────────────────────────

  useEffect(() => {
    if (isTxConfirmed) {
      refetchCounter();
      refetchProposal();
      setForm({ title: '', description: '', category: '0' });
    }
  }, [isTxConfirmed, refetchCounter, refetchProposal]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <main className="fr-bg">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">Vote</h1>
          <p className="text-sm fr-muted">
            Join 6R community, vote in a decentralized way !
          </p>
        </div>

        {/* Create a new proposal */}
        <section className="fr-panel p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Create a new proposal</h2>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${isClient && isConnected ? 'fr-pill-blue' : 'fr-pill-red'}`}>
              {isClient && isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>

          <form onSubmit={handleCreateProposal} className="mt-4 grid w-full max-w-2xl gap-4">
            <label className="grid w-full gap-2 text-sm fr-muted">
              Title
              <input
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                className="fr-input w-full rounded-xl px-3 py-2 text-sm"
                required
              />
            </label>

            <label className="grid w-full gap-2 text-sm fr-muted">
              Description
              <textarea
                value={form.description}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                rows={4}
                className="fr-input w-full rounded-xl px-3 py-2 text-sm"
                required
              />
            </label>

            <label className="grid w-full gap-2 text-sm fr-muted">
              Category
              <select
                value={form.category}
                onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
                className="fr-input w-full rounded-xl px-3 py-2 text-sm"
                required
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {!isEndedFinal && (
              <p className="text-sm text-[var(--fr-blue)]">
                Vote ongoing, proposal creation disabled.
              </p>
            )}
            {formError && (
              <p className="text-sm text-[var(--fr-red)]">{formError}</p>
            )}
            {createProposalError && (
              <p className="text-sm text-[var(--fr-red)]">{createProposalError}</p>
            )}
            <button
              type="submit"
              disabled={!isConnected || isTxPending || !isEndedFinal}
              className={`w-full rounded-xl px-4 py-2 text-sm font-semibold transition ${
                !isConnected || isTxPending || !isEndedFinal ? 'fr-btn-muted' : 'fr-btn-primary'
              }`}
            >
              {isTxPending ? 'Transaction...' : 'Create proposal'}
            </button>
          </form>
        </section>

        {/* Current proposal */}
        <section className="fr-panel p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Current Proposal</h2>
            <span className="fr-badge rounded-full bg-[rgba(255,255,255,0.04)] px-2.5 py-1 text-xs font-medium text-[var(--fr-muted)]">
              {isCounterLoading
                ? 'Loading...'
                : currentProposalId !== undefined
                  ? `#${currentProposalId.toString()}`
                  : 'None'}
            </span>
          </div>

          <div className="mt-4 space-y-3 text-sm fr-muted">
            {counterError && (
              <p className="text-[var(--fr-red)]">Error: {counterError.message}</p>
            )}
            {proposalError && (
              <p className="text-[var(--fr-red)]">Error: {proposalError.message}</p>
            )}
            {!isProposalLoading && !proposalError && currentProposal === undefined && (
              <p>No proposal data available.</p>
            )}
          </div>

          {currentProposal && !isEmptyProposal && (
            <div className="fr-panel-muted mt-4 grid gap-3 p-4 text-sm">
              <div>
                <div className="text-xs fr-muted">Title</div>
                <div className="font-medium text-[var(--fr-white)]">{currentProposal[0]}</div>
              </div>
              <div>
                <div className="text-xs fr-muted">Description</div>
                <div className="text-[var(--fr-white)]">{currentProposal[1]}</div>
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                <div>
                  <div className="text-xs fr-muted">Category</div>
                  <div>{categoryLabel ?? currentProposal[2].toString()}</div>
                </div>
                <div>
                  <div className="text-xs fr-muted">Creator</div>
                  <div className="font-mono text-xs">{currentProposal[3]}</div>
                </div>
                <div>
                  <div className="text-xs fr-muted">Status</div>
                  <div>{statusLabel ?? currentProposal[6].toString()}</div>
                </div>
              </div>

              {/* Preparation countdown + start voting */}
              {isClient && isCreatedFinal && preparationCountdown && (
                <p className="mt-2 text-sm text-[var(--fr-blue)]">
                  Preparation ends in: {preparationCountdown}
                </p>
              )}
              {isClient && canStartVoting && (
                <>
                  <button
                    onClick={handleStartVoting}
                    disabled={isTxPending}
                    className={`mt-2 w-full rounded-xl px-4 py-2 text-sm font-semibold transition ${isTxPending ? 'fr-btn-muted' : 'fr-btn-primary'}`}
                  >
                    {isTxPending ? 'Transaction...' : 'Start voting'}
                  </button>
                  {startVotingError && (
                    <p className="text-sm text-[var(--fr-red)]">{startVotingError}</p>
                  )}
                </>
              )}

              {/* Voting countdown + vote buttons */}
              {isClient && isOngoingFinal && votingCountdown && (
                <p className="mt-2 text-sm text-[var(--fr-blue)]">
                  Voting ends in: {votingCountdown}
                </p>
              )}
              {isClient && isOngoingFinal && !isVotingExpired && (
                <div className="mt-2 grid gap-2 md:grid-cols-3">
                  {VOTE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => handleVote(option.value)}
                      disabled={!canVote || isTxPending}
                      className={`w-full rounded-xl px-4 py-2 text-sm font-semibold transition ${
                        !canVote || isTxPending
                          ? 'fr-btn-muted'
                          : option.value === 2
                            ? 'fr-btn-primary'
                            : 'fr-btn-danger'
                      }`}
                    >
                      {isTxPending ? 'Transaction...' : option.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Close vote (after expiration) */}
              {isClient && isVotingExpired && (
                <button
                  onClick={handleCloseElection}
                  disabled={isTxPending}
                  className={`mt-2 w-full rounded-xl px-4 py-2 text-sm font-semibold transition ${isTxPending ? 'fr-btn-muted' : 'fr-btn-danger'}`}
                >
                  {isTxPending ? 'Transaction...' : 'Close vote'}
                </button>
              )}

              {/* Vote error (shared between vote + close) */}
              {isClient && voteError && (
                <p className="text-sm text-[var(--fr-red)]">{voteError}</p>
              )}

              {/* Voting status messages */}
              {isClient && isOngoingFinal && !hasPassportValue && (
                <p className="mt-2 text-sm text-[var(--fr-red)]">
                  You need a passport to vote.
                </p>
              )}
              {isClient && isOngoingFinal && hasVotedValue && (
                <p className="mt-2 text-sm text-[var(--fr-blue)]">
                  You already voted on this proposal.
                </p>
              )}
              {isClient && isOngoingFinal && isVoteDelegated && (
                <p className="mt-2 text-sm text-[var(--fr-red)]">
                  You cannot vote while your vote is delegated.
                </p>
              )}

              {/* Vote results (ended) */}
              {isClient && isEndedFinal && voteCount && (
                <div className="fr-panel-muted mt-3 p-3 text-sm text-[var(--fr-white)]">
                  <div className="text-xs fr-muted">Vote results</div>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    <div>
                      <div className="text-xs fr-muted">YES</div>
                      <div>{voteCount[0].toString()}</div>
                    </div>
                    <div>
                      <div className="text-xs fr-muted">NO</div>
                      <div>{voteCount[1].toString()}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          {currentProposal && isEmptyProposal && (
            <p className="mt-4 text-sm fr-muted">Latest proposal slot is empty.</p>
          )}
          {isProposalLoading && <p className="mt-4 text-sm">Loading proposal...</p>}
        </section>

        {/* Past proposals */}
        {pastProposalIds.length > 0 && (
          <section className="fr-panel p-6">
            <h2 className="text-lg font-medium">Past Proposals</h2>
            <div className="mt-4 flex flex-col gap-3">
              {[...pastProposalIds].reverse().map((id, reversedIndex) => {
                const index = pastProposalIds.length - 1 - reversedIndex;
                const p = pastProposalsData?.[index]?.result as ProposalTuple | undefined;
                const votes = pastVoteCountsData?.[index]?.result as readonly [bigint, bigint] | undefined;
                const catLabel = p
                  ? CATEGORY_OPTIONS.find((opt) => opt.value === Number(p[2]))?.label
                  : undefined;

                return (
                  <div key={id.toString()} className="fr-panel-muted grid gap-3 p-4 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs fr-muted">#{id.toString()}</div>
                        <div className="font-medium text-[var(--fr-white)]">
                          {p ? p[0] : 'Loading...'}
                        </div>
                      </div>
                      {catLabel && (
                        <span className="rounded-full px-2.5 py-1 text-xs font-medium fr-pill-blue shrink-0">
                          {catLabel}
                        </span>
                      )}
                    </div>
                    {p && (
                      <div className="text-xs fr-muted font-mono truncate">{p[3]}</div>
                    )}
                    {votes && (
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="fr-panel rounded-lg px-3 py-2">
                          <div className="fr-muted">YES</div>
                          <div className="font-semibold text-[var(--fr-white)]">{votes[0].toString()}</div>
                        </div>
                        <div className="fr-panel rounded-lg px-3 py-2">
                          <div className="fr-muted">NO</div>
                          <div className="font-semibold text-[var(--fr-white)]">{votes[1].toString()}</div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

      </div>
    </main>
  );
}
