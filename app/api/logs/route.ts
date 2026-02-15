import { NextResponse } from 'next/server';
import { createPublicClient, http, parseAbiItem } from 'viem';
import { sepolia } from 'viem/chains';

const ORCHESTRATOR_ADDRESS =
  '0x05c0e7ef8211e6058a74338adef270cee67f2a4a' as const;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RPC_URL =
  process.env.SEPOLIA_RPC_URL ?? 'https://11155111.rpc.thirdweb.com';

export async function GET() {
  try {
    const client = createPublicClient({
      chain: sepolia,
      transport: http(RPC_URL),
    });

    const latestBlock = await client.getBlockNumber();
    const range = BigInt(1000);
    const fromBlock = latestBlock > range ? latestBlock - range : BigInt(0);

    const [voted, refused] = await Promise.all([
      client.getLogs({
        address: ORCHESTRATOR_ADDRESS,
        event: parseAbiItem(
          'event ElectionVoted(uint256 yes, uint256 no, uint256 abstention)',
        ),
        fromBlock,
        toBlock: 'latest',
      }),
      client.getLogs({
        address: ORCHESTRATOR_ADDRESS,
        event: parseAbiItem(
          'event ElectionRefused(uint256 yes, uint256 no, uint256 abstention)',
        ),
        fromBlock,
        toBlock: 'latest',
      }),
    ]);

    const all = [...voted, ...refused];
    if (all.length === 0) {
      return NextResponse.json({
        ok: true,
        countResult: null,
        meta: {
          fromBlock: fromBlock.toString(),
          toBlock: 'latest',
          votedCount: voted.length,
          refusedCount: refused.length,
        },
      });
    }

    const latest = all.reduce((acc, cur) => {
      if (!acc) return cur;
      if (cur.blockNumber > acc.blockNumber) return cur;
      if (cur.blockNumber === acc.blockNumber && cur.logIndex > acc.logIndex)
        return cur;
      return acc;
    }, all[0]);

    const isVoted = latest.eventName === 'ElectionVoted';
    const args = latest.args as {
      yes: bigint;
      no: bigint;
      abstention: bigint;
    };

    return NextResponse.json({
      ok: true,
      countResult: {
        type: isVoted ? 'VOTED' : 'REFUSED',
        yes: args.yes.toString(),
        no: args.no.toString(),
        abstention: args.abstention.toString(),
        blockNumber: latest.blockNumber.toString(),
        logIndex: latest.logIndex,
      },
      meta: {
        fromBlock: fromBlock.toString(),
        toBlock: 'latest',
        votedCount: voted.length,
        refusedCount: refused.length,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
