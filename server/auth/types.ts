import type { UserRole } from '../repositories/types';

/**
 * Auth contract. The SQLite session implementation is used now; a Supabase
 * Auth implementation can replace it without touching routes or UI.
 */

export interface AuthUser {
  id: number;
  name: string;
  phone: string;
  role: UserRole;
  city: string;
  isActive: boolean;
  createdAt: string;
}

export type AuthErrorCode = 'invalid_credentials' | 'locked' | 'inactive';

export class AuthError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export interface LoginResult {
  /** Raw session token; returned to the client once and never stored server-side. */
  token: string;
  user: AuthUser;
}

export interface AuthProvider {
  /** Verifies phone + PIN and issues a session token. Throws AuthError on failure. */
  login(phone: string, pin: string): Promise<LoginResult>;
  /** Invalidates the session for the given raw token (idempotent). */
  logout(token: string): Promise<void>;
  /** Resolves a raw bearer token to its user, or null when unknown/expired. */
  resolve(token: string): Promise<AuthUser | null>;
}
