/**
 * SHA-256 over the canonical JSON of the data section. This detects truncation and accidental
 * corruption; it is not a signature and does not prove who made the file.
 */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Canonical form: JSON.stringify of the parsed value, independent of file whitespace. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value);
}
