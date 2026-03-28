'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  parseAbiItem,
  ContractFunctionRevertedError,
  type SimulateContractParameters,
} from 'viem';

import proposalAbi from '@/abi/SixRProposal.json';
import passport from '@/abi/SixRPassport.json';
import o from "@/abi/Orchestrator.json";
import { toAddress } from '@/app/lib/address';
import { ORCHESTRATOR_ADDRESS } from '@/app/lib/contracts';
import { useAutoDismiss } from '@/app/lib/hooks';
import { validateInput } from '@/app/lib/utils';
import { Tooltip } from '@/app/ui/tooltip';

// ─── ABIs ─────────────────────────────────────────────────────────────────────

const PROPOSAL_ABI = proposalAbi.abi as Abi;
const PASSPORT_ABI = passport.abi as Abi;
const ORCHESTRATOR_ABI = o.abi as Abi;

// ─── Constants ────────────────────────────────────────────────────────────────

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

  const { data: orchestratorOwner } = useReadContract({
    address: ORCHESTRATOR_ADDRESS,
    abi: ORCHESTRATOR_ABI,
    functionName: 'owner',
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
  const isEmptyProposal  = currentProposal && currentProposal[3] === BigInt(0) && currentProposal[2] === zeroAddress;
  const creationTime     = currentProposal ? BigInt(currentProposal[3]) : undefined;
  const votingTime       = currentProposal ? BigInt(currentProposal[4]) : undefined;
  const statusValue      = currentProposal ? BigInt(currentProposal[5]) : undefined;

  const isOwner =
    typeof orchestratorOwner === 'string' &&
    typeof address === 'string' &&
    orchestratorOwner.toLowerCase() === address.toLowerCase();

  const statusLabel = currentProposal
    ? STATUS_OPTIONS.find((opt) => opt.value === Number(currentProposal[5]))?.label
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

  const [form, setForm] = useState({ title: '', description: '' });
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

    // Guards: client-side checks before simulation
    if (!isOwner) {
      setFormError('Only the contract owner can create a proposal.');
      return;
    }
    if (!isEndedFinal) {
      setFormError('You cannot create a proposal while another one is active.');
      return;
    }
    const titleError = validateInput(title, 'Title', 100);
    if (titleError) { setFormError(titleError); return; }
    const descriptionError = validateInput(description, 'Description', 500);
    if (descriptionError) { setFormError(descriptionError); return; }

    setFormError(null);
    setCreateProposalError(null);
    simulateAndWrite(
      {
        address: ORCHESTRATOR_ADDRESS,
        abi: ORCHESTRATOR_ABI,
        functionName: 'createProposal',
        args: [title, description],
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
      setForm({ title: '', description: '' });
    }
  }, [isTxConfirmed, refetchCounter, refetchProposal]);

  // ─── Recent voters — floating pseudos ────────────────────────────────────

  const [voterAddresses, setVoterAddresses] = useState<`0x${string}`[]>([]);
  const seenVotersRef = useRef<Set<string>>(new Set());
  const [animatingPseudos, setAnimatingPseudos] = useState<Array<{ id: number; pseudo: string; delay: number }>>([]);
  const nextIdRef = useRef(0);

  // Reset when proposal changes
  useEffect(() => {
    seenVotersRef.current = new Set();
    setVoterAddresses([]);
    setAnimatingPseudos([]);
  }, [currentProposalId]);

  // Fetch Voted events from last 50 blocks for the current proposal
  useEffect(() => {
    if (!publicClient || !proposalAddress || currentProposalId === undefined || !isOngoingFinal || !latestBlock) return;

    const fromBlock = latestBlock.number > BigInt(50) ? latestBlock.number - BigInt(50) : BigInt(0);

    publicClient.getLogs({
      address: proposalAddress,
      event: parseAbiItem('event Voted(uint256 indexed proposalId, address indexed voter)'),
      args: { proposalId: currentProposalId },
      fromBlock,
      toBlock: 'latest',
    }).then((logs) => {
      const addresses = logs
        .map((log) => (log.args as { voter?: `0x${string}` }).voter)
        .filter((a): a is `0x${string}` => !!a);
      setVoterAddresses([...new Set(addresses)]);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicClient, proposalAddress, isOngoingFinal, currentProposalId, latestBlock?.number]);

  // Batch-fetch passport attributes for all voter addresses
  const { data: voterAttributesData } = useReadContracts({
    contracts: voterAddresses.map((addr) => ({
      address: passportAddress!,
      abi: PASSPORT_ABI,
      functionName: 'getPassportAttributes' as const,
      args: [addr] as const,
    })),
    query: { enabled: voterAddresses.length > 0 && !!passportAddress },
  });

  const voterPseudos = useMemo(() => {
    if (!voterAttributesData) return [];
    return voterAddresses.flatMap((addr, i) => {
      const r = voterAttributesData[i];
      if (r?.status === 'success' && Array.isArray(r.result)) {
        return [{ addr, pseudo: r.result[0] as string }];
      }
      return [];
    });
  }, [voterAttributesData, voterAddresses]);

  // Trigger floating animation for new voters
  useEffect(() => {
    if (voterPseudos.length === 0) return;
    const newVoters = voterPseudos.filter(({ addr }) => !seenVotersRef.current.has(addr.toLowerCase()));
    if (newVoters.length === 0) return;

    newVoters.forEach(({ addr }) => seenVotersRef.current.add(addr.toLowerCase()));

    const newItems = newVoters.map(({ pseudo }, i) => ({
      id: nextIdRef.current++,
      pseudo,
      delay: i * 400,
    }));
    setAnimatingPseudos((prev) => [...prev, ...newItems]);

    const removeAfter = 4000 + newVoters.length * 400;
    const timer = setTimeout(() => {
      const ids = new Set(newItems.map((x) => x.id));
      setAnimatingPseudos((prev) => prev.filter((x) => !ids.has(x.id)));
    }, removeAfter);
    return () => clearTimeout(timer);
  }, [voterPseudos]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <main className="fr-bg">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
        {/* Hero */}
        <section className="fr-panel overflow-hidden px-8 py-10 text-center">
          <div className="mb-6 flex h-px w-full overflow-hidden rounded-full">
            <div className="flex-1 bg-[var(--fr-blue)]" />
            <div className="flex-1 bg-[var(--fr-white)] opacity-15" />
            <div className="flex-1 bg-[var(--fr-red)]" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-[var(--fr-white)]">VI<sup className="text-2xl">e</sup> Republic</h1>
          <p className="mt-2 text-sm fr-muted">Participatory democracy on-chain</p>
          <p className="mt-1 text-xs fr-muted opacity-50">EthCC · Cannes</p>
        </section>

        {/* How it works */}
        <details className="fr-panel group">
          <summary className="flex cursor-pointer list-none items-center justify-between p-6">
            <h2 className="text-lg font-medium">How it works</h2>
            <svg className="h-4 w-4 flex-shrink-0 fr-muted transition-transform duration-200 group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 9l-7 7-7-7" />
            </svg>
          </summary>
          <div className="grid gap-4 px-6 pb-6 sm:grid-cols-2">
            <div className="fr-panel-muted p-4">
              <p className="text-sm font-medium text-[var(--fr-white)]">1 — Get Sepolia ETH</p>
              <p className="mt-1 text-xs fr-muted leading-relaxed">This app runs exclusively on the Sepolia testnet. Every transaction requires gas — get test ETH from a Sepolia faucet before anything else.</p>
            </div>
            <div className="fr-panel-muted p-4">
              <p className="text-sm font-medium text-[var(--fr-white)]">2 — Mint your Passport</p>
              <p className="mt-1 text-xs fr-muted leading-relaxed">A Soulbound Token (SBT) that serves as your on-chain identity. Required to participate in votes.</p>
              <p className="mt-2 text-[10px] text-[var(--fr-blue)] opacity-70">→ Mint page</p>
            </div>
            <div className="fr-panel-muted p-4">
              <p className="text-sm font-medium text-[var(--fr-white)]">3 — Vote</p>
              <p className="mt-1 text-xs fr-muted leading-relaxed">When a proposal is active, cast your YES or NO vote directly on-chain. Each passport counts as one vote.</p>
              <p className="mt-2 text-[10px] text-[var(--fr-blue)] opacity-70">→ Vote page</p>
            </div>
            <div className="fr-panel-muted p-4">
              <p className="text-sm font-medium text-[var(--fr-white)]">4 — Delegate <span className="fr-muted opacity-60">(optional)</span></p>
              <p className="mt-1 text-xs fr-muted leading-relaxed">Assign your vote to a trusted representative, or enable Delegate Mode to receive voting power from others.</p>
              <p className="mt-2 text-[10px] text-[var(--fr-blue)] opacity-70">→ Account page</p>
            </div>
          </div>
        </details>

        {/* Create a new proposal — owner only */}
        {isClient && isOwner && (
          <section className="fr-panel p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">Create a new proposal</h2>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${isConnected ? 'fr-pill-blue' : 'fr-pill-red'}`}>
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>

            <form onSubmit={handleCreateProposal} className="mt-4 grid w-full gap-4">
              <label className="grid w-full gap-2 text-sm fr-muted">
                Title
                <input
                  value={form.title}
                  onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                  maxLength={100}
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
                  maxLength={500}
                  className="fr-input w-full rounded-xl px-3 py-2 text-sm"
                  required
                />
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
        )}

        {/* Current proposal */}
        <section className="fr-panel p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Current Proposal</h2>
          </div>
          <p className="mt-1 text-xs fr-muted opacity-60">Cast your vote on the active community proposal.</p>

          {counterError && (
            <p className="mt-4 text-sm text-[var(--fr-red)]">Error: {counterError.message}</p>
          )}
          {proposalError && (
            <p className="mt-4 text-sm text-[var(--fr-red)]">Error: {proposalError.message}</p>
          )}
          {isProposalLoading && <p className="mt-4 text-sm fr-muted">Loading proposal...</p>}

          {/* Active proposal card */}
          {currentProposal && !isEmptyProposal && (isCreatedFinal || isOngoingFinal) && (
            <div className="mt-4 grid gap-4">
              <div>
                <div className="text-xl font-semibold text-[var(--fr-white)]">{currentProposal[0]}</div>
                <div className="mt-2 text-sm fr-muted leading-relaxed">{currentProposal[1]}</div>
              </div>

              {/* Floating voter pseudos */}
              {isClient && isOngoingFinal && animatingPseudos.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {animatingPseudos.map(({ id, pseudo, delay }) => (
                    <span
                      key={id}
                      className="inline-block rounded-full px-3 py-1 text-xs font-medium fr-pill-blue"
                      style={{ animation: `fr-voter-float 4s ease-out ${delay}ms both` }}
                    >
                      ✓ {pseudo}
                    </span>
                  ))}
                </div>
              )}

              {/* Preparation countdown + start voting */}
              {isClient && isCreatedFinal && preparationCountdown && (
                <p className="text-sm text-[var(--fr-blue)]">
                  Preparation ends in: {preparationCountdown}
                </p>
              )}
              {isClient && canStartVoting && (
                <>
                  <button
                    onClick={handleStartVoting}
                    disabled={isTxPending}
                    className={`w-full rounded-xl px-4 py-2 text-sm font-semibold transition ${isTxPending ? 'fr-btn-muted' : 'fr-btn-primary'}`}
                  >
                    {isTxPending ? 'Transaction...' : 'Start voting'}
                  </button>
                  {startVotingError && (
                    <p className="text-sm text-[var(--fr-red)]">{startVotingError}</p>
                  )}
                </>
              )}

              {/* Voting countdown + vote buttons */}
              {isClient && isOngoingFinal && (
                <div className="flex items-center gap-2 text-sm text-[var(--fr-blue)]">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--fr-blue)] opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--fr-blue)]" />
                  </span>
                  {votingCountdown ? <>Voting ends in: {votingCountdown}</> : 'Vote in progress'}
                </div>
              )}
              {isClient && isOngoingFinal && !isVotingExpired && (
                <div className="grid gap-2 md:grid-cols-2">
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
                  className={`w-full rounded-xl px-4 py-2 text-sm font-semibold transition ${isTxPending ? 'fr-btn-muted' : 'fr-btn-danger'}`}
                >
                  {isTxPending ? 'Transaction...' : 'Close vote'}
                </button>
              )}

              {/* Vote error */}
              {isClient && voteError && (
                <p className="text-sm text-[var(--fr-red)]">{voteError}</p>
              )}

              {/* Voting status messages */}
              {isClient && isOngoingFinal && !hasPassportValue && (
                <p className="text-sm text-[var(--fr-red)]">You need a passport to vote.</p>
              )}
              {isClient && isOngoingFinal && hasVotedValue && (
                <p className="text-sm text-[var(--fr-blue)]">You already voted on this proposal.</p>
              )}
              {isClient && isOngoingFinal && isVoteDelegated && (
                <p className="text-sm text-[var(--fr-red)]">You cannot vote while your vote is delegated.</p>
              )}
            </div>
          )}

          {/* Waiting message */}
          {!isProposalLoading && (isEndedFinal || isEmptyProposal || currentProposal === undefined) && (
            <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--fr-border)] py-10">
              <svg className="h-10 w-10 opacity-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="8" width="18" height="13" rx="2" />
                <path d="M16 8V6a4 4 0 0 0-8 0v2" />
                <path d="M12 13v3M10.5 14.5h3" />
              </svg>
              <p className="text-sm font-medium text-[var(--fr-white)] opacity-50">No active proposal</p>
              <p className="text-xs fr-muted opacity-50">A new vote will appear here once created.</p>
            </div>
          )}
        </section>

        {/* Past proposals — includes current if ended */}
        {(pastProposalIds.length > 0 || (isEndedFinal && currentProposal && !isEmptyProposal)) && (
          <section className="fr-panel p-6">
            <h2 className="text-lg font-medium">Past Proposals</h2>
            <p className="mt-1 text-xs fr-muted opacity-60">Completed votes — results weighted by delegation.</p>
            <div className="mt-4 flex flex-col gap-3">

              {/* Current proposal pinned at top if ended */}
              {isEndedFinal && currentProposal && !isEmptyProposal && (
                <div className="fr-panel-muted grid gap-3 p-4 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs fr-muted">#{currentProposalId?.toString()}</div>
                      <div className="font-medium text-[var(--fr-white)]">{currentProposal[0]}</div>
                    </div>
                  </div>
                  {voteCount && (() => {
                    const yes = Number(voteCount[0]);
                    const no  = Number(voteCount[1]);
                    const total = yes + no;
                    const yesPct = total === 0 ? 50 : Math.round((yes / total) * 100);
                    const noPct  = 100 - yesPct;
                    return (
                      <div className="grid gap-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-[var(--fr-blue)] font-semibold">YES — {yes}</span>
                          <span className="text-[var(--fr-red)] font-semibold">NO — {no}</span>
                        </div>
                        <div className="flex h-2 w-full overflow-hidden rounded-full">
                          <div style={{ width: `${yesPct}%` }} className="bg-[var(--fr-blue)] transition-all duration-500" />
                          <div style={{ width: `${noPct}%` }} className="bg-[var(--fr-red)] transition-all duration-500" />
                        </div>
                        <div className="flex justify-between fr-muted">
                          <span>{yesPct}%</span>
                          <span>{noPct}%</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {[...pastProposalIds].reverse().map((id, reversedIndex) => {
                const index = pastProposalIds.length - 1 - reversedIndex;
                const p = pastProposalsData?.[index]?.result as ProposalTuple | undefined;
                const votes = pastVoteCountsData?.[index]?.result as readonly [bigint, bigint] | undefined;

                return (
                  <div key={id.toString()} className="fr-panel-muted grid gap-3 p-4 text-sm">
                    <div>
                      <div className="text-xs fr-muted">#{id.toString()}</div>
                      <div className="font-medium text-[var(--fr-white)]">
                        {p ? p[0] : 'Loading...'}
                      </div>
                    </div>
                    {votes && (() => {
                      const yes = Number(votes[0]);
                      const no  = Number(votes[1]);
                      const total = yes + no;
                      const yesPct = total === 0 ? 50 : Math.round((yes / total) * 100);
                      const noPct  = 100 - yesPct;
                      return (
                        <div className="grid gap-2 text-xs">
                          <div className="flex justify-between">
                            <span className="text-[var(--fr-blue)] font-semibold">YES — {yes}</span>
                            <span className="text-[var(--fr-red)] font-semibold">NO — {no}</span>
                          </div>
                          <div className="flex h-2 w-full overflow-hidden rounded-full">
                            <div style={{ width: `${yesPct}%` }} className="bg-[var(--fr-blue)] transition-all duration-500" />
                            <div style={{ width: `${noPct}%` }} className="bg-[var(--fr-red)] transition-all duration-500" />
                          </div>
                          <div className="flex justify-between fr-muted">
                            <span>{yesPct}%</span>
                            <span>{noPct}%</span>
                          </div>
                        </div>
                      );
                    })()}
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
