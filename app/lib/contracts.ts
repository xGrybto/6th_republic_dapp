import type { Address } from 'viem';

// Orchestrator contract deployed on Sepolia.
// Update this address after each new deployment.
// Retrieve sub-contract addresses via cast:
//   cast call $ORCHESTRATOR_ADDRESS "passport()(address)" --rpc-url $SEPOLIA_RPC_URL
//   cast call $ORCHESTRATOR_ADDRESS "proposal()(address)" --rpc-url $SEPOLIA_RPC_URL
export const ORCHESTRATOR_ADDRESS = process.env.NEXT_PUBLIC_ORCHESTRATOR_CONTRACT as Address;

