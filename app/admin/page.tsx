'use client';

import { useEffect, useState, useCallback } from 'react';
import { useConnection, useReadContract, usePublicClient } from 'wagmi';
import { type Abi, parseAbiItem } from 'viem';

import orchestrator from '@/abi/Orchestrator.json';
import passport from '@/abi/SixRPassport.json';
import proposal from '@/abi/SixRProposal.json';
import { toAddress } from '@/app/lib/address';
import { ORCHESTRATOR_ADDRESS } from '@/app/lib/contracts';

// ─── ABIs ─────────────────────────────────────────────────────────────────────

const ORCHESTRATOR_ABI = orchestrator.abi as Abi;
const PASSPORT_ABI = passport.abi as Abi;
const PROPOSAL_ABI = proposal.abi as Abi;

// ─── Event signatures ─────────────────────────────────────────────────────────

const EV_MINT     = parseAbiItem('event MintPassport(uint256 indexed passportId, address indexed citizen, string pseudo)');
const EV_VOTED    = parseAbiItem('event Voted(uint256 indexed proposalId, address indexed voter)');
const EV_DELEGATE = parseAbiItem('event DelegationTo(address indexed citizen, address indexed delegatedCitizen)');
const EV_REVOKE   = parseAbiItem('event RevokeDelegationTo(address indexed citizen, address indexed delegatedCitizen)');
const EV_RESULT   = parseAbiItem('event ElectionResult(uint256 indexed proposalId, uint256 yes, uint256 no)');

// ─── Types ────────────────────────────────────────────────────────────────────

type MintEvent       = { passportId: bigint; citizen: `0x${string}`; pseudo: string; blockNumber: bigint };
type VotedEvent      = { proposalId: bigint; voter: `0x${string}`; blockNumber: bigint };
type DelegateEvent   = { citizen: `0x${string}`; delegatedCitizen: `0x${string}`; blockNumber: bigint; revoked: boolean };
type ElectionEvent   = { proposalId: bigint; yes: bigint; no: bigint; blockNumber: bigint };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const short = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm border-b border-[var(--fr-border)] last:border-0">
      <span className="fr-muted shrink-0">{label}</span>
      <span className="font-mono text-xs text-[var(--fr-white)] text-right break-all">{value}</span>
    </div>
  );
}

function StatusBadge({ ok, label }: { ok: boolean; label?: string }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${ok ? 'fr-pill-blue' : 'fr-pill-red'}`}>
      {label ?? (ok ? 'OK' : 'Issue')}
    </span>
  );
}

function EmptyFeed({ label }: { label: string }) {
  return <p className="py-3 text-xs fr-muted opacity-50 text-center">{label}</p>;
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { address, isConnected } = useConnection();
  const publicClient = usePublicClient();

  // ─── On-chain reads — Orchestrator ──────────────────────────────────────────

  const { data: orchestratorOwner, error: orchestratorOwnerError } = useReadContract({
    address: ORCHESTRATOR_ADDRESS,
    abi: ORCHESTRATOR_ABI,
    functionName: 'owner',
  });

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

  // ─── On-chain reads — Passport ──────────────────────────────────────────────

  const { data: passportOwner }  = useReadContract({ address: passportAddress, abi: PASSPORT_ABI, functionName: 'owner',  query: { enabled: !!passportAddress } });
  const { data: passportPaused } = useReadContract({ address: passportAddress, abi: PASSPORT_ABI, functionName: 'paused', query: { enabled: !!passportAddress } });
  const { data: passportName }   = useReadContract({ address: passportAddress, abi: PASSPORT_ABI, functionName: 'name',   query: { enabled: !!passportAddress } });
  const { data: passportSymbol } = useReadContract({ address: passportAddress, abi: PASSPORT_ABI, functionName: 'symbol', query: { enabled: !!passportAddress } });

  // ─── On-chain reads — Proposal ──────────────────────────────────────────────

  const { data: proposalOwner }   = useReadContract({ address: proposalAddress, abi: PROPOSAL_ABI, functionName: 'owner',           query: { enabled: !!proposalAddress } });
  const { data: proposalCounter } = useReadContract({ address: proposalAddress, abi: PROPOSAL_ABI, functionName: 'proposalCounter', query: { enabled: !!proposalAddress } });

  // ─── Derived state ──────────────────────────────────────────────────────────

  const isAdmin =
    typeof orchestratorOwner === 'string' &&
    typeof address === 'string' &&
    orchestratorOwner.toLowerCase() === address.toLowerCase();

  const totalProposals = typeof proposalCounter === 'bigint' ? Number(proposalCounter) - 1 : null;
  const isPaused       = passportPaused === true;

  // ─── Event feeds (last 50 blocks) ──────────────────────────────────────────

  const [mints,      setMints]      = useState<MintEvent[]>([]);
  const [votes,      setVotes]      = useState<VotedEvent[]>([]);
  const [delegations,setDelegations]= useState<DelegateEvent[]>([]);
  const [results,    setResults]    = useState<ElectionEvent[]>([]);
  const [fromBlock,  setFromBlock]  = useState<bigint | null>(null);
  const [isLoading,  setIsLoading]  = useState(false);
  const [feedError,  setFeedError]  = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    if (!publicClient || !passportAddress || !proposalAddress) return;
    setIsLoading(true);
    setFeedError(null);
    try {
      const latest = await publicClient.getBlockNumber();
      const from   = latest > BigInt(50) ? latest - BigInt(50) : BigInt(0);
      setFromBlock(from);

      const [mintLogs, votedLogs, delegateLogs, revokeLogs, resultLogs] = await Promise.all([
        publicClient.getLogs({ address: passportAddress,  event: EV_MINT,     fromBlock: from, toBlock: 'latest' }),
        publicClient.getLogs({ address: proposalAddress,  event: EV_VOTED,    fromBlock: from, toBlock: 'latest' }),
        publicClient.getLogs({ address: passportAddress,  event: EV_DELEGATE, fromBlock: from, toBlock: 'latest' }),
        publicClient.getLogs({ address: passportAddress,  event: EV_REVOKE,   fromBlock: from, toBlock: 'latest' }),
        publicClient.getLogs({ address: ORCHESTRATOR_ADDRESS, event: EV_RESULT, fromBlock: from, toBlock: 'latest' }),
      ]);

      setMints(mintLogs.map((l) => ({
        passportId: l.args.passportId as bigint,
        citizen:    l.args.citizen    as `0x${string}`,
        pseudo:     l.args.pseudo     as string,
        blockNumber: l.blockNumber ?? BigInt(0),
      })).reverse());

      setVotes(votedLogs.map((l) => ({
        proposalId: l.args.proposalId as bigint,
        voter:      l.args.voter      as `0x${string}`,
        blockNumber: l.blockNumber ?? BigInt(0),
      })).reverse());

      const allDelegations: DelegateEvent[] = [
        ...delegateLogs.map((l) => ({
          citizen:         l.args.citizen         as `0x${string}`,
          delegatedCitizen:l.args.delegatedCitizen as `0x${string}`,
          blockNumber:     l.blockNumber ?? BigInt(0),
          revoked: false,
        })),
        ...revokeLogs.map((l) => ({
          citizen:         l.args.citizen         as `0x${string}`,
          delegatedCitizen:l.args.delegatedCitizen as `0x${string}`,
          blockNumber:     l.blockNumber ?? BigInt(0),
          revoked: true,
        })),
      ].sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1));
      setDelegations(allDelegations);

      setResults(resultLogs.map((l) => ({
        proposalId: l.args.proposalId as bigint,
        yes:        l.args.yes        as bigint,
        no:         l.args.no         as bigint,
        blockNumber: l.blockNumber ?? BigInt(0),
      })).reverse());

    } catch (err) {
      setFeedError(err instanceof Error ? err.message : 'Failed to fetch events.');
    } finally {
      setIsLoading(false);
    }
  }, [publicClient, passportAddress, proposalAddress]);

  useEffect(() => {
    if (isAdmin) fetchEvents();
  }, [isAdmin, fetchEvents]);

  // ─── Render ─────────────────────────────────────────────────────────────────

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
          <h1 className="text-4xl font-bold tracking-tight text-[var(--fr-white)]">Admin</h1>
          <p className="mt-2 text-sm fr-muted">Contract dashboard — Orchestrator, Passport & Proposal.</p>
        </section>

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
            <p className="mt-2 fr-muted">This page is only available to the owner.</p>
            {orchestratorOwnerError && (
              <p className="mt-2 text-sm text-[var(--fr-red)]">Error: {orchestratorOwnerError.message}</p>
            )}
          </section>
        )}

        {/* Dashboard */}
        {isConnected && isAdmin && (
          <>
            {/* ── Contract info grid ── */}
            <div className="grid gap-4 md:grid-cols-3">

              {/* Orchestrator */}
              <section className="fr-panel p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-widest fr-muted opacity-60">Orchestrator</h2>
                  <StatusBadge ok={true} label="Active" />
                </div>
                <div>
                  <StatRow label="Address"  value={short(ORCHESTRATOR_ADDRESS)} />
                  <StatRow label="Owner"    value={typeof orchestratorOwner === 'string' ? short(orchestratorOwner) : '…'} />
                  <StatRow label="Passport" value={passportAddress ? short(passportAddress) : '…'} />
                  <StatRow label="Proposal" value={proposalAddress ? short(proposalAddress) : '…'} />
                </div>
              </section>

              {/* Passport */}
              <section className="fr-panel p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-widest fr-muted opacity-60">Passport</h2>
                  <StatusBadge ok={!isPaused} label={isPaused ? 'Paused' : 'Active'} />
                </div>
                <div>
                  <StatRow label="Address" value={passportAddress ? short(passportAddress) : '…'} />
                  <StatRow label="Owner"   value={typeof passportOwner === 'string' ? short(passportOwner) : '…'} />
                  <StatRow label="Name"    value={String(passportName ?? '…')} />
                  <StatRow label="Symbol"  value={String(passportSymbol ?? '…')} />
                  <StatRow label="Paused"  value={passportPaused === undefined ? '…' : isPaused ? 'Yes' : 'No'} />
                </div>
              </section>

              {/* Proposal */}
              <section className="fr-panel p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-widest fr-muted opacity-60">Proposal</h2>
                  <StatusBadge ok={true} label="Active" />
                </div>
                <div>
                  <StatRow label="Address"   value={proposalAddress ? short(proposalAddress) : '…'} />
                  <StatRow label="Owner"     value={typeof proposalOwner === 'string' ? short(proposalOwner) : '…'} />
                  <StatRow label="Proposals" value={totalProposals !== null ? String(totalProposals) : '…'} />
                </div>
                {totalProposals !== null && (
                  <div className="mt-auto pt-2">
                    <div className="text-3xl font-bold text-[var(--fr-white)]">{totalProposals}</div>
                    <div className="text-xs fr-muted opacity-60">total proposals created</div>
                  </div>
                )}
              </section>
            </div>

            {/* ── Activity feeds ── */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-medium">Recent activity</h2>
                <p className="mt-0.5 text-xs fr-muted opacity-60">
                  {fromBlock !== null ? `Blocks ${fromBlock.toString()} → latest` : 'Last 50 blocks'}
                </p>
              </div>
              <button
                onClick={fetchEvents}
                disabled={isLoading}
                className={`rounded-xl border border-[var(--fr-border)] px-4 py-1.5 text-xs font-medium transition ${
                  isLoading ? 'fr-btn-muted' : 'text-[var(--fr-white)] hover:border-[rgba(155,188,255,0.5)]'
                }`}
              >
                {isLoading ? 'Loading…' : 'Refresh'}
              </button>
            </div>

            {feedError && (
              <p className="text-sm text-[var(--fr-red)]">Error: {feedError}</p>
            )}

            <div className="grid gap-4 md:grid-cols-2">

              {/* Mints */}
              <section className="fr-panel p-5 flex flex-col gap-3">
                <h3 className="text-sm font-semibold uppercase tracking-widest fr-muted opacity-60">
                  Mints
                  {mints.length > 0 && (
                    <span className="ml-2 rounded-full bg-[rgba(155,188,255,0.12)] px-2 py-0.5 text-[var(--fr-blue)] normal-case font-normal tracking-normal">
                      {mints.length}
                    </span>
                  )}
                </h3>
                {isLoading && <p className="py-2 text-xs fr-muted opacity-50 text-center">Loading…</p>}
                {!isLoading && mints.length === 0 && <EmptyFeed label="No mints in the last 50 blocks." />}
                {mints.map((m, i) => (
                  <div key={i} className="fr-panel-muted rounded-xl px-3 py-2 flex items-center justify-between gap-3">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-sm font-medium text-[var(--fr-white)] truncate">{m.pseudo}</span>
                      <span className="font-mono text-xs fr-muted opacity-60">{short(m.citizen)}</span>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      <span className="text-xs fr-pill-blue rounded-full px-2 py-0.5 font-medium">#{m.passportId.toString()}</span>
                      <span className="font-mono text-xs fr-muted opacity-40">blk {m.blockNumber.toString()}</span>
                    </div>
                  </div>
                ))}
              </section>

              {/* Votes */}
              <section className="fr-panel p-5 flex flex-col gap-3">
                <h3 className="text-sm font-semibold uppercase tracking-widest fr-muted opacity-60">
                  Votes
                  {votes.length > 0 && (
                    <span className="ml-2 rounded-full bg-[rgba(155,188,255,0.12)] px-2 py-0.5 text-[var(--fr-blue)] normal-case font-normal tracking-normal">
                      {votes.length}
                    </span>
                  )}
                </h3>
                {isLoading && <p className="py-2 text-xs fr-muted opacity-50 text-center">Loading…</p>}
                {!isLoading && votes.length === 0 && <EmptyFeed label="No votes in the last 50 blocks." />}
                {votes.map((v, i) => (
                  <div key={i} className="fr-panel-muted rounded-xl px-3 py-2 flex items-center justify-between gap-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono text-xs text-[var(--fr-white)]">{short(v.voter)}</span>
                      <span className="text-xs fr-muted opacity-60">Proposal #{v.proposalId.toString()}</span>
                    </div>
                    <span className="font-mono text-xs fr-muted opacity-40 shrink-0">blk {v.blockNumber.toString()}</span>
                  </div>
                ))}
              </section>

              {/* Delegations */}
              <section className="fr-panel p-5 flex flex-col gap-3">
                <h3 className="text-sm font-semibold uppercase tracking-widest fr-muted opacity-60">
                  Delegations
                  {delegations.length > 0 && (
                    <span className="ml-2 rounded-full bg-[rgba(155,188,255,0.12)] px-2 py-0.5 text-[var(--fr-blue)] normal-case font-normal tracking-normal">
                      {delegations.length}
                    </span>
                  )}
                </h3>
                {isLoading && <p className="py-2 text-xs fr-muted opacity-50 text-center">Loading…</p>}
                {!isLoading && delegations.length === 0 && <EmptyFeed label="No delegations in the last 50 blocks." />}
                {delegations.map((d, i) => (
                  <div key={i} className="fr-panel-muted rounded-xl px-3 py-2 flex items-center justify-between gap-3">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <div className="flex items-center gap-1.5 text-xs text-[var(--fr-white)]">
                        <span className="font-mono">{short(d.citizen)}</span>
                        <span className="fr-muted opacity-40">→</span>
                        <span className="font-mono">{short(d.delegatedCitizen)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${d.revoked ? 'fr-pill-red' : 'fr-pill-blue'}`}>
                        {d.revoked ? 'Revoked' : 'Delegated'}
                      </span>
                    </div>
                  </div>
                ))}
              </section>

              {/* Election results */}
              <section className="fr-panel p-5 flex flex-col gap-3">
                <h3 className="text-sm font-semibold uppercase tracking-widest fr-muted opacity-60">
                  Election results
                  {results.length > 0 && (
                    <span className="ml-2 rounded-full bg-[rgba(155,188,255,0.12)] px-2 py-0.5 text-[var(--fr-blue)] normal-case font-normal tracking-normal">
                      {results.length}
                    </span>
                  )}
                </h3>
                {isLoading && <p className="py-2 text-xs fr-muted opacity-50 text-center">Loading…</p>}
                {!isLoading && results.length === 0 && <EmptyFeed label="No results in the last 50 blocks." />}
                {results.map((r, i) => {
                  const total = Number(r.yes) + Number(r.no);
                  const yesPct = total === 0 ? 50 : Math.round((Number(r.yes) / total) * 100);
                  return (
                    <div key={i} className="fr-panel-muted rounded-xl px-3 py-3 flex flex-col gap-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[var(--fr-white)] font-medium">Proposal #{r.proposalId.toString()}</span>
                        <span className="fr-muted opacity-40">blk {r.blockNumber.toString()}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-[var(--fr-blue)] font-semibold">YES — {r.yes.toString()}</span>
                        <span className="text-[var(--fr-red)] font-semibold">NO — {r.no.toString()}</span>
                      </div>
                      <div className="flex h-1.5 w-full overflow-hidden rounded-full">
                        <div style={{ width: `${yesPct}%` }} className="bg-[var(--fr-blue)]" />
                        <div style={{ width: `${100 - yesPct}%` }} className="bg-[var(--fr-red)]" />
                      </div>
                    </div>
                  );
                })}
              </section>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
