'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  useBlock,
  useConnection,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { type Abi, zeroAddress } from 'viem';

import proposal from '@/abi/SixRProposal.json';
import passport from '@/abi/SixRPassport.json';
import o from "@/abi/Orchestrator.json";
import { toAddress } from '@/app/lib/address';

const PROPOSAL_ABI = proposal.abi as Abi;
const PASSPORT_ABI = passport.abi as Abi;
const ORCHESTRATOR_ABI = o.abi as Abi

const ORCHESTRATOR_ADDRESS = '0x05c0e7ef8211e6058a74338adef270cee67f2a4a' as const; // as const to fix the type on the value, no string by default

const CATEGORY_OPTIONS = [
  { value: 0, label: 'ECOLOGY' },
  { value: 1, label: 'EDUCATION' },
  { value: 2, label: 'ECONOMY' },
  { value: 3, label: 'DEFENSE' },
] as const;

const STATUS_OPTIONS = [
  { value: 0, label: 'ENDED' },
  { value: 1, label: 'ONGOING' },
  { value: 2, label: 'COUNTING' },
  { value: 3, label: 'CREATED' },
] as const;

const VOTE_OPTIONS = [
  { value: 1, label: 'NO' },
  { value: 2, label: 'YES' },
] as const;

export default function Page() {
  const [isClient, setIsClient] = useState(false);
  const { isConnected, address } = useConnection();
  const {
    mutate: writeContract,
    data: txHash,
    isPending: isTxPending,
    error: txError,
  } = useWriteContract();

  const {
    mutate: writeVote,
    data: voteTxHash,
    isPending: isVoteTxPending,
    error: voteTxError,
  } = useWriteContract();

  const [form, setForm] = useState({
    title: '',
    description: '',
    category: '0',
  });
  const [formError, setFormError] = useState<string | null>(null);

  const { data: rawPassportAddress } = useReadContract({
    address: ORCHESTRATOR_ADDRESS,
    abi: ORCHESTRATOR_ABI,
    functionName: 'passport',
  });

  const passportAddress = toAddress(rawPassportAddress);


  const { data: rawProposalAddress } = useReadContract({
    address: ORCHESTRATOR_ADDRESS,
    abi: ORCHESTRATOR_ABI,
    functionName: 'proposal',
  });

  const proposalAddress = toAddress(rawProposalAddress);

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

  const lastProposalId =
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
    args: lastProposalId !== undefined ? [lastProposalId] : undefined,
    query: { enabled: lastProposalId !== undefined },
  });

  type ProposalTuple = readonly [
    string,
    string,
    bigint,
    `0x${string}`,
    bigint,
    bigint,
    `0x${string}`,
  ];

  const proposal = proposalData as ProposalTuple | undefined;
  const isEmptyProposal =
    proposal && proposal[4] === BigInt(0) && proposal[3] === zeroAddress;
  const creationTime =
    proposal && proposal[4] !== undefined ? BigInt(proposal[4]) : undefined;
  const statusValue =
    proposal && proposal[5] !== undefined ? BigInt(proposal[5]) : undefined;
  const isCreated = statusValue === BigInt(3);
  const isOngoing = statusValue === BigInt(1);
  const isCounting = statusValue === BigInt(2);

  const categoryLabel =
    proposal &&
    CATEGORY_OPTIONS.find(
      (option) => option.value === Number(proposal[2]),
    )?.label;
  const statusLabel =
    proposal &&
    STATUS_OPTIONS.find((option) => option.value === Number(proposal[5]))
      ?.label;

  const isCreatedFinal = isCreated || statusLabel === 'CREATED';
  const isOngoingFinal = isOngoing || statusLabel === 'ONGOING';
  const isCountingFinal = isCounting || statusLabel === 'COUNTING';
  const isEndedFinal = statusLabel === 'ENDED' || statusValue === BigInt(0);

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

  const hasPassportValue = hasPassport === true;
  const isVoteDelegated =
    typeof representative === 'string' && representative !== zeroAddress;

  const { data: hasVoted } = useReadContract({
    address: proposalAddress,
    abi: PROPOSAL_ABI,
    functionName: 'hasVoted',
    args:
      address && lastProposalId !== undefined
        ? [lastProposalId, address]
        : undefined,
    query: { enabled: !!address && lastProposalId !== undefined },
  });

  const hasVotedValue = hasVoted === true;

  const { data: latestBlock } = useBlock({
    watch: true,
  });
  const blockTimestamp = latestBlock?.timestamp;
  const preparationPeriod = BigInt(86400);
  const votingPeriod = BigInt(259200);
  const canStartVoting =
    isConnected &&
    creationTime !== undefined &&
    blockTimestamp !== undefined &&
    blockTimestamp >= creationTime + preparationPeriod &&
    isCreatedFinal;

  const isVotingExpired =
    isOngoingFinal &&
    creationTime !== undefined &&
    blockTimestamp !== undefined &&
    blockTimestamp >= creationTime + preparationPeriod + votingPeriod;

  const canVote =
    isConnected &&
    isOngoingFinal &&
    !isVotingExpired &&
    hasPassportValue &&
    !isVoteDelegated &&
    !hasVotedValue;

  const formatCountdown = (secondsLeft: bigint) => {
    const total = secondsLeft > BigInt(0) ? secondsLeft : BigInt(0);
    const days = total / BigInt(86400);
    const hours = (total % BigInt(86400)) / BigInt(3600);
    const minutes = (total % BigInt(3600)) / BigInt(60);
    const seconds = total % BigInt(60);
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  };

  const preparationEndsAt =
    creationTime !== undefined ? creationTime + preparationPeriod : undefined;
  const votingEndsAt =
    creationTime !== undefined ? creationTime + preparationPeriod + votingPeriod : undefined;

  const preparationCountdown = useMemo(() => {
    if (!preparationEndsAt || !blockTimestamp) return null;
    return formatCountdown(preparationEndsAt - blockTimestamp);
  }, [preparationEndsAt, blockTimestamp]);

  const votingCountdown = useMemo(() => {
    if (!votingEndsAt || !blockTimestamp) return null;
    return formatCountdown(votingEndsAt - blockTimestamp);
  }, [votingEndsAt, blockTimestamp]);

  useEffect(() => {
    setIsClient(true);
  }, []);



  const { isSuccess: isTxConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const { isSuccess: isVoteTxConfirmed } = useWaitForTransactionReceipt({
    hash: voteTxHash,
  });

  useEffect(() => {
    if (isTxConfirmed) {
      refetchCounter();
      refetchProposal();
      setForm({ title: '', description: '', category: '0' });
    }
  }, [isTxConfirmed, refetchCounter, refetchProposal]);

  useEffect(() => {
    if (isVoteTxConfirmed) {
      fetchLatestCountResult();
    }
  }, [isTxConfirmed])

  useEffect(() => {
      fetchLatestCountResult();
  }, [])

  type CountResult = {
    type: 'VOTED' | 'REFUSED';
    yes: bigint;
    no: bigint;
    abstention: bigint;
    blockNumber?: bigint;
    logIndex?: number;
  };

  const [countResult, setCountResult] = useState<CountResult | null>(null);

  const fetchLatestCountResult = async () => {
    try {
      const response = await fetch('/api/logs');
      const payload = await response.json();
      console.debug('[countVotes] api payload', payload);
      if (!payload?.ok) {
        console.debug('[countVotes] api error', payload?.error);
        return;
      }
      const result = payload.countResult;
      if (!result) {
        console.debug('[countVotes] api returned no countResult');
        return;
      }
      setCountResult({
        type: result.type,
        yes: BigInt(result.yes),
        no: BigInt(result.no),
        abstention: BigInt(result.abstention),
        blockNumber: result.blockNumber ? BigInt(result.blockNumber) : undefined,
        logIndex: result.logIndex ?? undefined,
      });
    } catch (error) {
      console.error('[countVotes] getLogs failed', error);
    }
  };

  const handleCreateProposal = (event: React.FormEvent) => {
    event.preventDefault();
    const title = form.title.trim();
    const description = form.description.trim();
    const categoryNumber = Number(form.category);

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
    writeContract({
      address: ORCHESTRATOR_ADDRESS,
      abi: ORCHESTRATOR_ABI,
      functionName: 'createProposal',
      args: [title, description, categoryNumber],
    });
  };

  const handleStartVoting = () => {
    writeContract({
      address: ORCHESTRATOR_ADDRESS,
      abi: ORCHESTRATOR_ABI,
      functionName: 'startVoting',
    });
  };

  const handleVote = (voteValue: number) => {
    writeContract({
      address: ORCHESTRATOR_ADDRESS,
      abi: ORCHESTRATOR_ABI,
      functionName: 'voteProposal',
      args: [voteValue],
    });
  };

  const handleCountVotes = () => {
    writeContract({
      address: ORCHESTRATOR_ADDRESS,
      abi: ORCHESTRATOR_ABI,
      functionName: 'countVotes',
    });
  };

  const closeElectionAfterVoteExpiration = () => {
    writeContract({
      address: proposalAddress!, //!\\ Force le type à address
      abi: PROPOSAL_ABI,
      functionName: 'vote',
      args: [ORCHESTRATOR_ADDRESS, 0],
    });
  };

  return (
    <main className="fr-bg">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">Vote</h1>
          <p className="text-sm fr-muted">
            Latest proposal fetched from the Proposal contract.
          </p>
        </div>

        <section className="fr-panel p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Create Proposal</h2>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                isClient && isConnected
                  ? 'fr-pill-blue'
                  : 'fr-pill-red'
              }`}
            >
              {isClient && isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>

          <form
            onSubmit={handleCreateProposal}
            className="mt-4 grid w-full max-w-2xl gap-4"
          >
            <label className="grid w-full gap-2 text-sm fr-muted">
              Title
              <input
                value={form.title}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, title: event.target.value }))
                }
                className="fr-input w-full rounded-xl px-3 py-2 text-sm"
                required
              />
            </label>

            <label className="grid w-full gap-2 text-sm fr-muted">
              Description
              <textarea
                value={form.description}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, description: event.target.value }))
                }
                rows={4}
                className="fr-input w-full rounded-xl px-3 py-2 text-sm"
                required
              />
            </label>

            <label className="grid w-full gap-2 text-sm fr-muted">
              Category
              <select
                value={form.category}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, category: event.target.value }))
                }
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

            {formError && (
              <p className="w-full truncate text-sm text-[var(--fr-red)]">
                {formError}
              </p>
            )}
            {txError && (
              <p className="w-full truncate text-sm text-[var(--fr-red)]">
                Error: {txError.message}
              </p>
            )}

            <button
              type="submit"
              disabled={!isConnected || isTxPending || !isEndedFinal}
              className={`w-full rounded-xl px-4 py-2 text-sm font-semibold transition ${
                !isConnected || isTxPending || !isEndedFinal
                  ? 'fr-btn-muted'
                  : 'fr-btn-primary'
              }`}
            >
              {isTxPending ? 'Transaction...' : 'Create proposal'}
            </button>
          </form>
        </section>

        <section className="fr-panel p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Latest Proposal</h2>
            <span className="fr-badge rounded-full bg-[rgba(255,255,255,0.04)] px-2.5 py-1 text-xs font-medium text-[var(--fr-muted)]">
              {isCounterLoading
                ? 'Loading...'
                : lastProposalId !== undefined
                  ? `#${lastProposalId.toString()}`
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
            {!isProposalLoading && !proposalError && proposal === undefined && (
              <p>No proposal data available.</p>
            )}
          </div>

          {proposal && !isEmptyProposal && (
            <div className="fr-panel-muted mt-4 grid gap-3 p-4 text-sm">
              <div>
                <div className="text-xs fr-muted">Title</div>
                <div className="font-medium text-[var(--fr-white)]">
                  {proposal[0]}
                </div>
              </div>
              <div>
                <div className="text-xs fr-muted">Description</div>
                <div className="text-[var(--fr-white)]">{proposal[1]}</div>
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                <div>
                  <div className="text-xs fr-muted">Category</div>
                  <div>{categoryLabel ?? proposal[2].toString()}</div>
                </div>
                <div>
                  <div className="text-xs fr-muted">Creator</div>
                  <div className="font-mono text-xs">{proposal[3]}</div>
                </div>
                <div>
                  <div className="text-xs fr-muted">Status</div>
                  <div>{statusLabel ?? proposal[5].toString()}</div>
                </div>
              </div>
              {isClient && isCreatedFinal && preparationCountdown && (
                <p className="mt-2 text-sm text-[var(--fr-blue)]">
                  Preparation ends in: {preparationCountdown}
                </p>
              )}
              {isClient && isOngoingFinal && votingCountdown && (
                <p className="mt-2 text-sm text-[var(--fr-blue)]">
                  Voting ends in: {votingCountdown}
                </p>
              )}
              {isClient && canStartVoting && (
                <button
                  onClick={handleStartVoting}
                  disabled={isTxPending}
                  className={`mt-2 w-full rounded-xl px-4 py-2 text-sm font-semibold transition ${
                    isTxPending ? 'fr-btn-muted' : 'fr-btn-primary'
                  }`}
                >
                  {isTxPending ? 'Transaction...' : 'Start voting'}
                </button>
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
              {isClient && isVotingExpired && (
                <button
                  onClick={closeElectionAfterVoteExpiration}
                  disabled={isTxPending}
                  className={`mt-2 w-full rounded-xl px-4 py-2 text-sm font-semibold transition ${
                    isTxPending ? 'fr-btn-muted' : 'fr-btn-danger'
                  }`}
                >
                  {isTxPending ? 'Transaction...' : 'Close vote'}
                </button>
              )}
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
              {isClient && isCountingFinal && (
                <button
                  onClick={handleCountVotes}
                  disabled={isTxPending}
                  className={`mt-2 w-full rounded-xl px-4 py-2 text-sm font-semibold transition ${
                    isTxPending ? 'fr-btn-muted' : 'fr-btn-primary'
                  }`}
                >
                  {isTxPending ? 'Transaction...' : 'Count votes'}
                </button>
              )}
              {isClient && countResult && (
                <div className="fr-panel-muted mt-3 p-3 text-sm text-[var(--fr-white)]">
                  <div className="text-xs fr-muted">Last count result</div>
                  <div className="mt-1 font-semibold">
                    {countResult.type === 'VOTED' ? 'Accepted' : 'Refused'}
                  </div>
                  <div className="mt-2 grid gap-2 md:grid-cols-3">
                    <div>
                      <div className="text-xs fr-muted">YES</div>
                      <div>{countResult.yes.toString()}</div>
                    </div>
                    <div>
                      <div className="text-xs fr-muted">NO</div>
                      <div>{countResult.no.toString()}</div>
                    </div>
                    <div>
                      <div className="text-xs fr-muted">ABSTENTION</div>
                      <div>{countResult.abstention.toString()}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          {proposal && isEmptyProposal && (
            <p className="mt-4 text-sm fr-muted">
              Latest proposal slot is empty.
            </p>
          )}
          {isProposalLoading && <p className="mt-4 text-sm">Loading proposal...</p>}
        </section>
      </div>
    </main>
  );
}
