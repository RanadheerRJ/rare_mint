import crypto from 'node:crypto';

const SCRYPT_KEYLEN = 32;
const SALT_BYTES = 16;

export interface HashedPin {
  hash: string;
  salt: string;
}

/** Hash a 4-digit PIN with scrypt and a fresh per-user salt. */
export function hashPin(pin: string): HashedPin {
  const salt = crypto.randomBytes(SALT_BYTES).toString('hex');
  const hash = crypto.scryptSync(pin, salt, SCRYPT_KEYLEN).toString('hex');
  return { hash, salt };
}

/** Constant-time PIN verification against a stored scrypt hash + salt. */
export function verifyPin(pin: string, hash: string, salt: string): boolean {
  const candidate = crypto.scryptSync(pin, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}
