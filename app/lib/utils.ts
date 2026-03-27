// ─── Input validation ─────────────────────────────────────────────────────────

// Blocks characters that break on-chain JSON (tokenURI) or data integrity:
//   - `"` and `\`  → JSON injection
//   - ASCII control chars (0x00–0x1F, 0x7F) → null bytes, newlines, etc.
const JSON_UNSAFE = /["\\]/;
const CONTROL_CHARS = /[\x00-\x1F\x7F]/;

export function validateInput(
  value: string,
  label: string,
  maxLen: number,
): string | null {
  if (!value.trim()) return `${label} is required.`;
  if (value.length > maxLen) return `${label} must be at most ${maxLen} characters.`;
  if (JSON_UNSAFE.test(value)) return `${label} must not contain " or \\.`;
  if (CONTROL_CHARS.test(value)) return `${label} contains invalid characters.`;
  return null;
}
