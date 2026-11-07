import crypto from 'node:crypto';
import type { AuthProvider, AuthUser, LoginResult } from './types';
import { AuthError } from './types';
import { verifyPin } from './passwords';
import type { Repositories, UserRecord } from '../repositories/types';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

const GENERIC_INVALID = 'Invalid mobile number or PIN.';
const GENERIC_LOCKED = 'Sign-in temporarily unavailable. Please try again later.';

function sha256(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** SQLite `datetime('now')`-compatible UTC timestamp for a Date. */
function sqliteUtc(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function parseUtc(value: string): number {
  return Date.parse(`${value.replace(' ', 'T')}Z`);
}

export function toAuthUser(user: UserRecord): AuthUser {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    role: user.role,
    city: user.city,
    isActive: user.isActive,
    createdAt: user.createdAt,
  };
}

export class SqliteAuthProvider implements AuthProvider {
  constructor(private readonly repos: Repositories) {}

  async login(phone: string, pin: string): Promise<LoginResult> {
    const lock = this.repos.loginLocks.findByPhone(phone);
    if (lock?.lockedUntil && parseUtc(lock.lockedUntil) > Date.now()) {
      throw new AuthError('locked', GENERIC_LOCKED);
    }

    const user = this.repos.users.findByPhone(phone);
    const pinOk = user ? verifyPin(pin, user.pinHash, user.pinSalt) : false;

    if (!user || !pinOk) {
      // Account for failed attempts per phone (existing or not) so PINs cannot
      // be brute-forced and logins do not reveal which phones have accounts.
      const failed = (lock?.failedCount ?? 0) + 1;
      const lockedUntil = failed >= MAX_FAILED_ATTEMPTS ? sqliteUtc(new Date(Date.now() + LOCK_DURATION_MS)) : null;
      this.repos.loginLocks.upsert(phone, lockedUntil ? 0 : failed, lockedUntil);
      throw new AuthError('invalid_credentials', GENERIC_INVALID);
    }

    if (!user.isActive) {
      throw new AuthError('inactive', 'Your account has been deactivated.');
    }

    this.repos.loginLocks.clear(phone);
    this.repos.sessions.deleteExpired();

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = sqliteUtc(new Date(Date.now() + SESSION_TTL_MS));
    this.repos.sessions.insert(user.id, sha256(token), expiresAt);

    return { token, user: toAuthUser(user) };
  }

  async logout(token: string): Promise<void> {
    if (!token) return;
    this.repos.sessions.deleteByTokenHash(sha256(token));
  }

  async resolve(token: string): Promise<AuthUser | null> {
    if (!token) return null;
    const session = this.repos.sessions.findByTokenHash(sha256(token));
    if (!session) return null;
    if (parseUtc(session.expiresAt) <= Date.now()) {
      this.repos.sessions.deleteByTokenHash(session.tokenHash);
      return null;
    }
    const user = this.repos.users.findById(session.userId);
    return user ? toAuthUser(user) : null;
  }
}
