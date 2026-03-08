'use client';

import { useConnection, useReadContract } from 'wagmi';
import { type Abi } from 'viem';

import orchestrator from '@/abi/Orchestrator.json';
import passport from '@/abi/SixRPassport.json';
import proposal from '@/abi/SixRProposal.json';
import { ORCHESTRATOR_ADDRESS } from '@/app/lib/contracts';

// ─── ABIs ─────────────────────────────────────────────────────────────────────

const ORCHESTRATOR_ABI = orchestrator.abi as Abi;
const PASSPORT_ABI = passport.abi as Abi;
const PROPOSAL_ABI = proposal.abi as Abi;

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_OPTIONS = ['ECOLOGY', 'EDUCATION', 'ECONOMY', 'DEFENSE'] as const;
const STATUS_OPTIONS = ['ENDED', 'ONGOING', 'CREATED'] as const;

type ProposalTuple = readonly [
  string,   // title
  string,   // description
  bigint,   // category (enum index)
  `0x${string}`, // creator
  bigint,   // creation timestamp
  bigint,   // status (enum index)
  `0x${string}`, // closed block hash
];

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function AdminPage() {

  // ─── Wallet ───────────────────────────────────────────────────────────────

  const { address, isConnected } = useConnection();

  // ─── On-chain reads — Orchestrator ────────────────────────────────────────

  const { data: orchestratorOwner, error: orchestratorOwnerError } = useReadContract({
    address: ORCHESTRATOR_ADDRESS,
    abi: ORCHESTRATOR_ABI,
    functionName: 'owner',
  });

  const { data: passportAddress } = useReadContract({
    address: ORCHESTRATOR_ADDRESS,
    abi: ORCHESTRATOR_ABI,
    functionName: 'passport',
  });

  const { data: proposalAddress } = useReadContract({
    address: ORCHESTRATOR_ADDRESS,
    abi: ORCHESTRATOR_ABI,
    functionName: 'proposal',
  });

  // ─── On-chain reads — Passport ────────────────────────────────────────────

  const { data: passportOwner } = useReadContract({
    address: passportAddress as `0x${string}` | undefined,
    abi: PASSPORT_ABI,
    functionName: 'owner',
    query: { enabled: !!passportAddress },
  });

  const { data: passportPaused } = useReadContract({
    address: passportAddress as `0x${string}` | undefined,
    abi: PASSPORT_ABI,
    functionName: 'paused',
    query: { enabled: !!passportAddress },
  });

  const { data: passportName } = useReadContract({
    address: passportAddress as `0x${string}` | undefined,
    abi: PASSPORT_ABI,
    functionName: 'name',
    query: { enabled: !!passportAddress },
  });

  const { data: passportSymbol } = useReadContract({
    address: passportAddress as `0x${string}` | undefined,
    abi: PASSPORT_ABI,
    functionName: 'symbol',
    query: { enabled: !!passportAddress },
  });

  const { data: hasPassport } = useReadContract({
    address: passportAddress as `0x${string}` | undefined,
    abi: PASSPORT_ABI,
    functionName: 'hasPassport',
    args: address ? [address] : undefined,
    query: { enabled: !!passportAddress && !!address },
  });

  const { data: delegatedMode } = useReadContract({
    address: passportAddress as `0x${string}` | undefined,
    abi: PASSPORT_ABI,
    functionName: 's_delegatedMode',
    args: address ? [address] : undefined,
    query: { enabled: !!passportAddress && !!address },
  });

  const { data: delegatePowers } = useReadContract({
    address: passportAddress as `0x${string}` | undefined,
    abi: PASSPORT_ABI,
    functionName: 's_delegatePowers',
    args: address ? [address] : undefined,
    query: { enabled: !!passportAddress && !!address },
  });

  // ─── On-chain reads — Proposal ────────────────────────────────────────────

  const { data: proposalOwner } = useReadContract({
    address: proposalAddress as `0x${string}` | undefined,
    abi: PROPOSAL_ABI,
    functionName: 'owner',
    query: { enabled: !!proposalAddress },
  });

  const { data: proposalCounter } = useReadContract({
    address: proposalAddress as `0x${string}` | undefined,
    abi: PROPOSAL_ABI,
    functionName: 'proposalCounter',
    query: { enabled: !!proposalAddress },
  });

  const latestProposalId =
    typeof proposalCounter === 'bigint' && proposalCounter > BigInt(0)
      ? proposalCounter - BigInt(1)
      : undefined;

  const { data: latestProposal } = useReadContract({
    address: proposalAddress as `0x${string}` | undefined,
    abi: PROPOSAL_ABI,
    functionName: 'get',
    args: latestProposalId !== undefined ? [latestProposalId] : undefined,
    query: { enabled: !!proposalAddress && latestProposalId !== undefined },
  });

  // ─── Derived state ────────────────────────────────────────────────────────

  const isAdmin =
    typeof orchestratorOwner === 'string' &&
    typeof address === 'string' &&
    orchestratorOwner.toLowerCase() === address.toLowerCase();

  const proposalData = latestProposal as ProposalTuple | undefined;

  const latestCategory =
    proposalData && Number(proposalData[2]) < CATEGORY_OPTIONS.length
      ? CATEGORY_OPTIONS[Number(proposalData[2])]
      : proposalData?.[2]?.toString();

  const latestStatus =
    proposalData && Number(proposalData[5]) < STATUS_OPTIONS.length
      ? STATUS_OPTIONS[Number(proposalData[5])]
      : proposalData?.[5]?.toString();

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <main className="fr-bg">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">Admin</h1>
          <p className="text-sm fr-muted">
            Contract status dashboard for Orchestrator, Passport and Proposal.
          </p>
        </div>

        {/* Not connected */}
        {!isConnected && (
          <section className="fr-panel p-6">
            <p className="fr-muted">Connect your wallet to access this page.</p>
          </section>
        )}

        {/* Access denied */}
        {isConnected && !isAdmin && (
          <section className="fr-panel p-6">
            <h2 className="text-lg font-medium text-[var(--fr-red)]">Access denied</h2>
            <p className="mt-2 fr-muted">This page is only available to the Orchestrator owner.</p>
            <p className="mt-2 text-xs fr-muted">Connected: {address}</p>
            <p className="text-xs fr-muted">Owner: {String(orchestratorOwner ?? 'unknown')}</p>
            {orchestratorOwnerError && (
              <p className="mt-2 text-sm text-[var(--fr-red)]">
                Error: {orchestratorOwnerError.message}
              </p>
            )}
          </section>
        )}

        {/* Dashboard */}
        {isConnected && isAdmin && (
          <>
            {/* Orchestrator */}
            <section className="fr-panel p-6">
              <h2 className="text-lg font-medium">Orchestrator</h2>
              <div className="mt-4 space-y-2 text-sm fr-muted">
                <p>Address: {ORCHESTRATOR_ADDRESS}</p>
                <p>Owner: {String(orchestratorOwner)}</p>
                <p>Passport: {String(passportAddress ?? 'unknown')}</p>
                <p>Proposal: {String(proposalAddress ?? 'unknown')}</p>
              </div>
            </section>

            {/* Passport */}
            <section className="fr-panel p-6">
              <h2 className="text-lg font-medium">Passport</h2>
              <div className="mt-4 space-y-2 text-sm fr-muted">
                <p>Owner: {String(passportOwner ?? 'unknown')}</p>
                <p>Name: {String(passportName ?? 'unknown')}</p>
                <p>Symbol: {String(passportSymbol ?? 'unknown')}</p>
                <p>Paused: {passportPaused === true ? 'true' : 'false'}</p>
                <p>Has passport (connected): {hasPassport === true ? 'true' : 'false'}</p>
                <p>Delegated mode (connected): {delegatedMode === true ? 'true' : 'false'}</p>
                <p>
                  Delegate powers (connected):{' '}
                  {typeof delegatePowers === 'bigint' ? delegatePowers.toString() : '0'}
                </p>
              </div>
            </section>

            {/* Proposal */}
            <section className="fr-panel p-6">
              <h2 className="text-lg font-medium">Proposal</h2>
              <div className="mt-4 space-y-2 text-sm fr-muted">
                <p>Owner: {String(proposalOwner ?? 'unknown')}</p>
                <p>
                  Proposal counter:{' '}
                  {typeof proposalCounter === 'bigint' ? proposalCounter.toString() : '0'}
                </p>
                <p>
                  Latest proposal id:{' '}
                  {latestProposalId !== undefined ? latestProposalId.toString() : 'none'}
                </p>
              </div>
              {proposalData && (
                <div className="fr-panel-muted mt-4 space-y-2 p-4 text-sm fr-muted">
                  <p>Title: {proposalData[0]}</p>
                  <p>Description: {proposalData[1]}</p>
                  <p>Category: {String(latestCategory ?? 'unknown')}</p>
                  <p>Creator: {proposalData[3]}</p>
                  <p>Creation time: {proposalData[4].toString()}</p>
                  <p>Status: {String(latestStatus ?? 'unknown')}</p>
                  <p>Closed block hash: {proposalData[6]}</p>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
