import { Router, type NextFunction, type Request, type Response } from 'express';
import { AuthError, type AuthProvider } from './auth/types';
import { SqliteAuthProvider } from './auth/sqliteAuthProvider';
import { actingUser, requireAuth, requireRole } from './auth/middleware';
import { repositories, runInTransaction } from './repositories';
import { DevService } from './services/devService';
import { LedgerService } from './services/ledgerService';
import { ApiError, badRequest, requirePin, requirePhone } from './services/validation';

const auth: AuthProvider = new SqliteAuthProvider(repositories);
const devService = new DevService(repositories, runInTransaction);
const ledgerService = new LedgerService(repositories, runInTransaction);

type Handler = (req: Request, res: Response) => void | Promise<void>;

/** Wraps handlers so ApiError/AuthError become JSON responses with proper status. */
function route(handler: Handler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve()
      .then(() => handler(req, res))
      .catch((err: unknown) => {
        if (err instanceof ApiError) {
          res.status(err.status).json({ error: err.message });
          return;
        }
        if (err instanceof AuthError) {
          res.status(err.code === 'inactive' ? 403 : 401).json({ error: err.message });
          return;
        }
        next(err);
      });
  };
}

function bearerToken(req: Request): string {
  const header = req.headers.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

export const apiRouter = Router();

// ------------------------------------------------------------------ health

apiRouter.get(
  '/health',
  route((_req, res) => {
    res.json({ ok: true });
  })
);

// ------------------------------------------------------------------ auth

apiRouter.post(
  '/auth/login',
  route(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const phone = requirePhone(body.phone, 'Mobile number');
    const pin = requirePin(body.pin);
    const result = await auth.login(phone, pin);
    res.json({ token: result.token, user: result.user });
  })
);

apiRouter.post(
  '/auth/logout',
  route(async (req, res) => {
    await auth.logout(bearerToken(req));
    res.json({ ok: true });
  })
);

apiRouter.get(
  '/auth/me',
  requireAuth(auth),
  route((req, res) => {
    res.json({ user: actingUser(req) });
  })
);

// Invite-only: self-registration no longer exists.
apiRouter.all(
  '/auth/register',
  route((_req, res) => {
    res.status(410).json({
      error: 'Self-registration is disabled. Accounts are invite-only — ask the platform developer for an owner invite.',
    });
  })
);

// ------------------------------------------------------------------ developer

const developerOnly = [requireAuth(auth), requireRole('developer')];

apiRouter.get(
  '/dev/owners',
  ...developerOnly,
  route((_req, res) => {
    res.json({ owners: devService.listOwners() });
  })
);

apiRouter.post(
  '/dev/owners',
  ...developerOnly,
  route((req, res) => {
    const owner = devService.inviteOwner(actingUser(req), (req.body ?? {}) as Record<string, unknown>);
    res.status(201).json({ owner });
  })
);

apiRouter.patch(
  '/dev/owners/:id',
  ...developerOnly,
  route((req, res) => {
    const owner = devService.updateOwner(
      actingUser(req),
      Number(req.params.id),
      (req.body ?? {}) as Record<string, unknown>
    );
    res.json({ owner });
  })
);

apiRouter.post(
  '/dev/owners/:id/reset-pin',
  ...developerOnly,
  route((req, res) => {
    devService.resetOwnerPin(actingUser(req), Number(req.params.id), (req.body as Record<string, unknown>)?.pin);
    res.json({ ok: true });
  })
);

apiRouter.delete(
  '/dev/owners/:id',
  ...developerOnly,
  route((req, res) => {
    devService.deleteOwner(actingUser(req), Number(req.params.id));
    res.json({ ok: true });
  })
);

apiRouter.get(
  '/dev/stats',
  ...developerOnly,
  route((_req, res) => {
    res.json({ stats: devService.platformStats() });
  })
);

// ------------------------------------------------------------------ members directory

apiRouter.get(
  '/users/members',
  requireAuth(auth),
  requireRole('organizer'),
  route((req, res) => {
    res.json({ members: ledgerService.listMembers(actingUser(req)) });
  })
);

// ------------------------------------------------------------------ chits

apiRouter.get(
  '/chits',
  requireAuth(auth),
  route((req, res) => {
    res.json(ledgerService.listChits(actingUser(req)));
  })
);

apiRouter.post(
  '/chits',
  requireAuth(auth),
  requireRole('organizer'),
  route((req, res) => {
    const group = ledgerService.createChit(actingUser(req), (req.body ?? {}) as Record<string, unknown>);
    res.status(201).json({ group });
  })
);

apiRouter.get(
  '/chits/:id',
  requireAuth(auth),
  route((req, res) => {
    res.json({ group: ledgerService.getChitDetail(actingUser(req), Number(req.params.id)) });
  })
);

apiRouter.patch(
  '/chits/:id',
  requireAuth(auth),
  requireRole('organizer'),
  route((req, res) => {
    const group = ledgerService.updateChit(
      actingUser(req),
      Number(req.params.id),
      (req.body ?? {}) as Record<string, unknown>
    );
    res.json({ group });
  })
);

apiRouter.delete(
  '/chits/:id',
  requireAuth(auth),
  requireRole('organizer'),
  route((req, res) => {
    ledgerService.deleteChit(actingUser(req), Number(req.params.id));
    res.json({ ok: true });
  })
);

// ------------------------------------------------------------------ slots / tickets

apiRouter.post(
  '/chits/:id/slots',
  requireAuth(auth),
  requireRole('organizer'),
  route((req, res) => {
    const slot = ledgerService.addSlot(
      actingUser(req),
      Number(req.params.id),
      (req.body ?? {}) as Record<string, unknown>
    );
    res.status(201).json({ slot });
  })
);

apiRouter.patch(
  '/chits/:id/slots/:slotId',
  requireAuth(auth),
  requireRole('organizer'),
  route((req, res) => {
    const slot = ledgerService.updateSlot(
      actingUser(req),
      Number(req.params.id),
      Number(req.params.slotId),
      (req.body ?? {}) as Record<string, unknown>
    );
    res.json({ slot });
  })
);

apiRouter.delete(
  '/chits/:id/slots/:slotId',
  requireAuth(auth),
  requireRole('organizer'),
  route((req, res) => {
    ledgerService.removeSlot(actingUser(req), Number(req.params.id), Number(req.params.slotId));
    res.json({ ok: true });
  })
);

apiRouter.patch(
  '/members/:id',
  requireAuth(auth),
  requireRole('organizer'),
  route((req, res) => {
    const member = ledgerService.updateMember(
      actingUser(req),
      Number(req.params.id),
      (req.body ?? {}) as Record<string, unknown>
    );
    res.json({ member });
  })
);

apiRouter.post(
  '/members/:id/reset-pin',
  requireAuth(auth),
  requireRole('organizer'),
  route((req, res) => {
    ledgerService.resetMemberPin(actingUser(req), Number(req.params.id), (req.body as Record<string, unknown>)?.pin);
    res.json({ ok: true });
  })
);

// ------------------------------------------------------------------ payments

apiRouter.post(
  '/chits/:id/payments',
  requireAuth(auth),
  requireRole('organizer'),
  route((req, res) => {
    const payment = ledgerService.recordPayment(
      actingUser(req),
      Number(req.params.id),
      (req.body ?? {}) as Record<string, unknown>
    );
    res.status(201).json({ payment });
  })
);

apiRouter.patch(
  '/chits/:id/payments/:paymentId',
  requireAuth(auth),
  requireRole('organizer'),
  route((req, res) => {
    const payment = ledgerService.updatePayment(
      actingUser(req),
      Number(req.params.id),
      Number(req.params.paymentId),
      (req.body ?? {}) as Record<string, unknown>
    );
    res.json({ payment });
  })
);

apiRouter.delete(
  '/chits/:id/payments/:paymentId',
  requireAuth(auth),
  requireRole('organizer'),
  route((req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const payment = ledgerService.voidPayment(
      actingUser(req),
      Number(req.params.id),
      Number(req.params.paymentId),
      body.reason ?? body.voidReason
    );
    res.json({ payment });
  })
);

// ------------------------------------------------------------------ lift & cycle

apiRouter.post(
  '/chits/:id/lift',
  requireAuth(auth),
  requireRole('organizer'),
  route((req, res) => {
    ledgerService.recordLift(actingUser(req), Number(req.params.id), (req.body ?? {}) as Record<string, unknown>);
    res.json({ ok: true });
  })
);

apiRouter.post(
  '/chits/:id/current-month',
  requireAuth(auth),
  requireRole('organizer'),
  route((req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const currentMonth = ledgerService.setCurrentMonth(actingUser(req), Number(req.params.id), body.currentMonth);
    res.json({ ok: true, currentMonth });
  })
);

// ------------------------------------------------------------------ dues & receipts

apiRouter.get(
  '/dues',
  requireAuth(auth),
  route((req, res) => {
    res.json(ledgerService.getDues(actingUser(req)));
  })
);

apiRouter.get(
  '/receipts',
  requireAuth(auth),
  route((req, res) => {
    res.json(ledgerService.getReceipts(actingUser(req)));
  })
);
