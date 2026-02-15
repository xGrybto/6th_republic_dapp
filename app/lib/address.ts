import { getAddress, isAddress, type Address } from 'viem';

export function toAddress(value: unknown): Address | undefined {
  if (typeof value !== 'string') return undefined;
  if (!isAddress(value)) return undefined;
  return getAddress(value); // checksum + type Address
}
