import { createHash } from "node:crypto";

/** Deterministic, checksum-valid v3 name for controlled fixtures, never public sites. */
export function fixtureOnion(seed = 7) {
  const publicKey = Buffer.alloc(32, seed);
  const version = Buffer.from([3]);
  const checksum = createHash("sha3-256")
    .update(".onion checksum")
    .update(publicKey)
    .update(version)
    .digest()
    .subarray(0, 2);
  const bytes = Buffer.concat([publicKey, checksum, version]);
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  let bits = 0;
  let accumulator = 0;
  let encoded = "";
  for (const byte of bytes) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      encoded += alphabet[(accumulator >> bits) & 31];
    }
  }
  return `${encoded}.onion`;
}
