import type { NextFunction, Request, Response } from 'express';
import type { AuthProvider, AuthUser } from './types';
import type { UserRole } from '../repositories/types';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Acting user, always resolved from the session token — never from the request body. */
      user?: AuthUser;
    }
  }
}

export function requireAuth(auth: AuthProvider) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const header = req.headers.authorization ?? '';
      const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
      if (!token) {
        res.status(401).json({ error: 'Sign in required.' });
        return;
      }
      const user = await auth.resolve(token);
      if (!user) {
        res.status(401).json({ error: 'Session expired. Please sign in again.' });
        return;
      }
      if (!user.isActive) {
        res.status(403).json({ error: 'Your account has been deactivated.' });
        return;
      }
      req.user = user;
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Sign in required.' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'You do not have permission for this action.' });
      return;
    }
    next();
  };
}

/** The authenticated user, guaranteed by requireAuth. */
export function actingUser(req: Request): AuthUser {
  return req.user as AuthUser;
}
