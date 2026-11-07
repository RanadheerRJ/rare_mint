import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { DatabaseSync } from 'node:sqlite';

const DEV_PHONE = '9848012345';
const DEV_PIN = '1357';
const DEV_NAME = 'Platform Dev';

let base = '';
let db: DatabaseSync;
let server: ReturnType<express.Express['listen']> | undefined;
let previousCwd = '';
let tempDir = '';

interface CallResult {
  status: number;
  body: any;
}

async function call(
  path: string,
  opts: { method?: string; token?: string | null; body?: unknown } = {}
): Promise<CallResult> {
  const method = opts.method ?? (opts.body !== undefined ? 'POST' : 'GET');
  const res = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

async function login(phone: string, pin: string): Promise<CallResult> {
  return call('/auth/login', { body: { phone, pin } });
}

/** Asserts no PIN or PIN-hash field appears anywhere in the response payload. */
function assertNoSecrets(body: unknown): void {
  const forbidden = new Set(['pin', 'pinhash', 'pin_hash', 'pinsalt', 'pin_salt', 'pinHash', 'pinSalt']);
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        assert.equal(forbidden.has(key), false, `response must not include secret field "${key}"`);
        walk(child);
      }
    }
  };
  walk(body);
}

function countRows(sql: string, ...params: unknown[]): number {
  return (db.prepare(sql).get(...(params as never[])) as { c: number }).c;
}

before(async () => {
  previousCwd = process.cwd();
  tempDir = mkdtempSync(join(tmpdir(), 'rare-mint-test-'));
  process.chdir(tempDir);
  process.env.DEV_PHONE = DEV_PHONE;
  process.env.DEV_PIN = DEV_PIN;
  process.env.DEV_NAME = DEV_NAME;

  const dbModule = await import('../server/db');
  db = dbModule.db;
  dbModule.initDatabase();
  const { seedDeveloperFromEnv } = await import('../server/seed');
  seedDeveloperFromEnv();
  const { apiRouter } = await import('../server/routes');

  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server!.once('listening', resolve));
  base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/api`;
});

after(async () => {
  if (server) await new Promise<void>((resolve, reject) => server!.close((err) => (err ? reject(err) : resolve())));
  db.close();
  process.chdir(previousCwd);
  rmSync(tempDir, { recursive: true, force: true });
});

// ------------------------------------------------------------------ helpers

async function inviteOwner(
  devToken: string,
  name: string,
  phone: string,
  pin: string
): Promise<{ id: number; name: string; phone: string; chitCount: number }> {
  const res = await call('/dev/owners', {
    token: devToken,
    body: { name, phone, pin, city: 'Hyderabad' },
  });
  assert.equal(res.status, 201);
  return res.body.owner;
}

async function createChit(token: string, code: string, name = code): Promise<{ id: number }> {
  const res = await call('/chits', {
    token,
    body: {
      name,
      code,
      chitType: 'AUCTION',
      faceValue: 40000,
      durationMonths: 4,
      startDate: '2026-11-10',
      dueDayOfMonth: 10,
      baseInstallment: 10000,
    },
  });
  assert.equal(res.status, 201);
  return res.body.group;
}

async function enrollNewMember(
  token: string,
  groupId: number,
  ticketNumber: number,
  name: string,
  phone: string,
  pin: string
): Promise<{ id: number; userId: number }> {
  const res = await call(`/chits/${groupId}/slots`, {
    token,
    body: { ticketNumber, newMemberName: name, newMemberPhone: phone, newMemberPin: pin },
  });
  assert.equal(res.status, 201);
  return res.body.slot;
}

// ------------------------------------------------------------------ tests

test('developer is seeded from env; login works; self-registration is gone', async () => {
  // No developer row exists without the env seed; the seed created exactly one.
  assert.equal(countRows(`SELECT COUNT(*) AS c FROM users WHERE role = 'developer'`), 1);
  const devRow = db.prepare(`SELECT * FROM users WHERE phone = ?`).get(DEV_PHONE) as Record<string, unknown>;
  assert.equal(devRow.name, DEV_NAME);
  assert.equal(Number(devRow.is_active), 1);

  // PINs are stored hashed: no plaintext column, no plaintext value.
  const userCols = (db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>).map((c) => c.name);
  assert.equal(userCols.includes('pin'), false, 'users table must not keep a plaintext pin column');
  assert.notEqual(String(devRow.pin_hash), DEV_PIN);
  assert.ok(String(devRow.pin_salt).length >= 16);

  // Login issues a session token and never leaks secrets.
  const okLogin = await login(DEV_PHONE, DEV_PIN);
  assert.equal(okLogin.status, 200);
  assert.equal(okLogin.body.user.role, 'developer');
  assert.match(String(okLogin.body.token), /^[0-9a-f]{64}$/);
  assertNoSecrets(okLogin.body);

  // Only the SHA-256 hash of the token is stored.
  const sessionRows = db.prepare('SELECT token_hash FROM sessions').all() as Array<{ token_hash: string }>;
  assert.equal(sessionRows.length, 1);
  assert.notEqual(sessionRows[0].token_hash, okLogin.body.token);

  const devToken: string = okLogin.body.token;
  const me = await call('/auth/me', { token: devToken });
  assert.equal(me.status, 200);
  assert.equal(me.body.user.phone, DEV_PHONE);
  assertNoSecrets(me.body);
  assert.equal((await call('/auth/me')).status, 401);
  assert.equal((await call('/auth/me', { token: 'bogus' })).status, 401);

  // Wrong PIN is a generic 401 and reveals nothing.
  const badLogin = await login(DEV_PHONE, '0000');
  assert.equal(badLogin.status, 401);
  assert.equal(badLogin.body.error, 'Invalid mobile number or PIN.');

  // The public register route no longer exists (invite-only).
  const register = await call('/auth/register', {
    body: { name: 'X', phone: '9000000000', pin: '1234', role: 'organizer' },
  });
  assert.ok(register.status === 404 || register.status === 410, `got ${register.status}`);

  // Logout invalidates the session.
  assert.equal((await call('/auth/logout', { method: 'POST', token: devToken })).status, 200);
  assert.equal((await call('/auth/me', { token: devToken })).status, 401);
});

test('developer invites and manages owners; /dev/* is developer-only', async () => {
  const dev = await login(DEV_PHONE, DEV_PIN);
  const devToken: string = dev.body.token;

  const owner = await inviteOwner(devToken, 'Owner T2', '9111111111', '2468');
  assert.equal(owner.chitCount, 0);
  assertNoSecrets(owner);

  // The invited owner can log in.
  const ownerLogin = await login('9111111111', '2468');
  assert.equal(ownerLogin.status, 200);
  assert.equal(ownerLogin.body.user.role, 'organizer');
  const ownerToken: string = ownerLogin.body.token;

  // Owner and (later) member can never call /dev/*.
  for (const path of ['/dev/owners', '/dev/stats']) {
    assert.equal((await call(path, { token: ownerToken })).status, 403);
    assert.equal((await call(path)).status, 401);
  }
  assert.equal((await call('/dev/owners', { token: ownerToken, body: { name: 'X', phone: '9000000009', pin: '1234' } })).status, 403);

  // Platform counts.
  const stats = await call('/dev/stats', { token: devToken });
  assert.equal(stats.status, 200);
  assert.ok(stats.body.stats.owners >= 1 && stats.body.stats.chits >= 0 && stats.body.stats.members >= 0);

  // Owners list shows name/phone/city/chitCount/status/createdAt.
  const list = await call('/dev/owners', { token: devToken });
  assert.equal(list.status, 200);
  const listed = list.body.owners.find((o: { id: number }) => o.id === owner.id);
  assert.ok(listed);
  assert.equal(listed.city, 'Hyderabad');
  assert.equal(listed.isActive, true);
  assert.ok(listed.createdAt);
  assertNoSecrets(list.body);

  // Edit name/city.
  const patched = await call(`/dev/owners/${owner.id}`, {
    method: 'PATCH',
    token: devToken,
    body: { name: 'Owner T2 Renamed', city: 'Secunderabad' },
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.owner.name, 'Owner T2 Renamed');
  assert.equal(patched.body.owner.city, 'Secunderabad');

  // Reset PIN: old PIN stops working, new one works.
  const reset = await call(`/dev/owners/${owner.id}/reset-pin`, {
    token: devToken,
    body: { pin: '9999' },
  });
  assert.equal(reset.status, 200);
  assertNoSecrets(reset.body);
  assert.equal((await login('9111111111', '2468')).status, 401);
  assert.equal((await login('9111111111', '9999')).status, 200);

  // Deactivate -> login blocked; reactivate -> login works.
  assert.equal((await call(`/dev/owners/${owner.id}`, { method: 'PATCH', token: devToken, body: { isActive: false } })).status, 200);
  const inactiveLogin = await login('9111111111', '9999');
  assert.ok(inactiveLogin.status === 401 || inactiveLogin.status === 403);
  assert.equal((await call(`/dev/owners/${owner.id}`, { method: 'PATCH', token: devToken, body: { isActive: true } })).status, 200);
  assert.equal((await login('9111111111', '9999')).status, 200);

  // Validation: bad phone / PIN are rejected.
  assert.equal((await call('/dev/owners', { token: devToken, body: { name: 'X', phone: '123', pin: '1234' } })).status, 400);
  assert.equal((await call('/dev/owners', { token: devToken, body: { name: 'X', phone: '9000000011', pin: '12' } })).status, 400);

  // Duplicate phone conflicts.
  assert.equal((await call('/dev/owners', { token: devToken, body: { name: 'Dup', phone: '9111111111', pin: '1234' } })).status, 409);

  // Delete with no chits succeeds and kills login.
  assert.equal((await call(`/dev/owners/${owner.id}`, { method: 'DELETE', token: devToken })).status, 200);
  assert.equal((await login('9111111111', '9999')).status, 401);
  assert.equal((await call(`/dev/owners/${owner.id}`, { method: 'DELETE', token: devToken })).status, 404);
});

test('owner A cannot read, update or delete owner B\'s chits, slots or payments', async () => {
  const devToken = (await login(DEV_PHONE, DEV_PIN)).body.token;
  const ownerA = await inviteOwner(devToken, 'Owner A', '9222222222', '1111');
  const ownerB = await inviteOwner(devToken, 'Owner B', '9333333333', '2222');
  const tokenA: string = (await login('9222222222', '1111')).body.token;
  const tokenB: string = (await login('9333333333', '2222')).body.token;

  const chitA = await createChit(tokenA, 'ISO-A');
  const slot = await enrollNewMember(tokenA, chitA.id, 1, 'Member A', '9444444444', '5678');
  const paymentRes = await call(`/chits/${chitA.id}/payments`, {
    token: tokenA,
    body: { memberSlotId: slot.id, monthNumber: 1, amountPaid: 10000, paymentMethod: 'CASH' },
  });
  assert.equal(paymentRes.status, 201);
  const paymentId = paymentRes.body.payment.id;

  // B cannot see or touch A's chit.
  assert.equal((await call(`/chits/${chitA.id}`, { token: tokenB })).status, 403);
  assert.equal((await call(`/chits/${chitA.id}`, { method: 'PATCH', token: tokenB, body: { name: 'Hijack' } })).status, 403);
  assert.equal((await call(`/chits/${chitA.id}`, { method: 'DELETE', token: tokenB })).status, 403);
  assert.equal((await call(`/chits/${chitA.id}/current-month`, { token: tokenB, body: { currentMonth: 2 } })).status, 403);
  assert.equal(
    (await call(`/chits/${chitA.id}/lift`, { token: tokenB, body: { monthNumber: 1, winnerMemberSlotId: slot.id } })).status,
    403
  );

  // B cannot touch A's slot.
  assert.equal((await call(`/chits/${chitA.id}/slots`, { token: tokenB, body: { ticketNumber: 2, newMemberName: 'X', newMemberPhone: '9000000021', newMemberPin: '1234' } })).status, 403);
  assert.equal((await call(`/chits/${chitA.id}/slots/${slot.id}`, { method: 'PATCH', token: tokenB, body: { memberName: 'Hijack' } })).status, 403);
  assert.equal((await call(`/chits/${chitA.id}/slots/${slot.id}`, { method: 'DELETE', token: tokenB })).status, 403);
  // A's member is missing from B's directory -> 403 or 404, never success.
  const resetByB = await call(`/members/${slot.userId}/reset-pin`, { token: tokenB, body: { pin: '1111' } });
  assert.ok([403, 404].includes(resetByB.status), `reset-pin got ${resetByB.status}`);
  const patchByB = await call(`/members/${slot.userId}`, { method: 'PATCH', token: tokenB, body: { name: 'Hijack' } });
  assert.ok([403, 404].includes(patchByB.status), `member patch got ${patchByB.status}`);

  // B cannot touch A's payment.
  assert.equal((await call(`/chits/${chitA.id}/payments`, { token: tokenB, body: { memberSlotId: slot.id, monthNumber: 2 } })).status, 403);
  assert.equal((await call(`/chits/${chitA.id}/payments/${paymentId}`, { method: 'PATCH', token: tokenB, body: { amountPaid: 1 } })).status, 403);
  assert.equal((await call(`/chits/${chitA.id}/payments/${paymentId}`, { method: 'DELETE', token: tokenB, body: { reason: 'x' } })).status, 403);

  // B's listings only include B's own rows.
  const bChits = await call('/chits', { token: tokenB });
  assert.equal(bChits.status, 200);
  assert.equal(bChits.body.groups.length, 0);
  const bMembers = await call('/users/members', { token: tokenB });
  assert.equal(bMembers.status, 200);
  assert.equal(bMembers.body.members.length, 0);

  // A still owns everything untouched.
  const aChits = await call('/chits', { token: tokenA });
  assert.equal(aChits.body.groups.length, 1);
  assert.equal(countRows('SELECT COUNT(*) AS c FROM payments WHERE id = ?', paymentId), 1);
  assert.equal(countRows(`SELECT COUNT(*) AS c FROM payments WHERE id = ? AND status = 'POSTED'`, paymentId), 1);

  // Owners with chits cannot be deleted (clear message).
  const blocked = await call(`/dev/owners/${ownerA.id}`, { method: 'DELETE', token: devToken });
  assert.equal(blocked.status, 409);
  assert.match(String(blocked.body.error), /chit/i);

  // Owner B (no chits) can be deleted.
  assert.equal((await call(`/dev/owners/${ownerB.id}`, { method: 'DELETE', token: devToken })).status, 200);
});

test('members see only their own data and every write is 403', async () => {
  const devToken = (await login(DEV_PHONE, DEV_PIN)).body.token;
  await inviteOwner(devToken, 'Owner C', '9222222233', '3333');
  const tokenC: string = (await login('9222222233', '3333')).body.token;

  const chit1 = await createChit(tokenC, 'MEM-1');
  const chit2 = await createChit(tokenC, 'MEM-2');
  const slot1 = await enrollNewMember(tokenC, chit1.id, 1, 'Member One', '9444444455', '5678');
  const slot2 = await enrollNewMember(tokenC, chit1.id, 2, 'Member Two', '9555555555', '8765');
  await call(`/chits/${chit1.id}/payments`, {
    token: tokenC,
    body: { memberSlotId: slot1.id, monthNumber: 1, amountPaid: 10000, paymentMethod: 'CASH' },
  });
  await call(`/chits/${chit1.id}/payments`, {
    token: tokenC,
    body: { memberSlotId: slot2.id, monthNumber: 1, amountPaid: 10000, paymentMethod: 'CASH' },
  });

  const memberLogin = await login('9444444455', '5678');
  assert.equal(memberLogin.status, 200);
  assert.equal(memberLogin.body.user.role, 'member');
  const memberToken: string = memberLogin.body.token;

  // Own chit visible, other chit 403; detail filtered to own rows.
  const chits = await call('/chits', { token: memberToken });
  assert.equal(chits.status, 200);
  assert.deepEqual(chits.body.groups.map((g: { id: number }) => g.id), [chit1.id]);

  const detail = await call(`/chits/${chit1.id}`, { token: memberToken });
  assert.equal(detail.status, 200);
  assert.ok(detail.body.group.slots.length >= 1);
  assert.ok(detail.body.group.slots.every((s: { userId: number }) => s.userId === memberLogin.body.user.id));
  assert.ok(detail.body.group.payments.every((p: { memberName: string }) => p.memberName === 'Member One'));
  assert.equal(JSON.stringify(detail.body).includes('9555555555'), false, 'other members must not appear');
  assert.equal(JSON.stringify(detail.body).includes('Member Two'), false);
  assertNoSecrets(detail.body);

  assert.equal((await call(`/chits/${chit2.id}`, { token: memberToken })).status, 403);

  // Dues and receipts are member-scoped.
  const dues = await call('/dues', { token: memberToken });
  assert.equal(dues.status, 200);
  assert.ok(dues.body.dues.every((d: { memberSlotId: number }) => d.memberSlotId === slot1.id));
  const receipts = await call('/receipts', { token: memberToken });
  assert.equal(receipts.status, 200);
  assert.ok(receipts.body.receipts.length >= 1);
  assert.ok(receipts.body.receipts.every((r: { memberName: string }) => r.memberName === 'Member One'));

  // Every organizer-style write is 403.
  const writes: Array<[string, string, unknown?]> = [
    ['/chits', 'POST', { name: 'X', faceValue: 40000, durationMonths: 4, startDate: '2026-11-10' }],
    [`/chits/${chit1.id}`, 'PATCH', { name: 'X' }],
    [`/chits/${chit1.id}`, 'DELETE', undefined],
    [`/chits/${chit1.id}/slots`, 'POST', { ticketNumber: 3 }],
    [`/chits/${chit1.id}/slots/${slot1.id}`, 'PATCH', { memberName: 'X' }],
    [`/chits/${chit1.id}/slots/${slot1.id}`, 'DELETE', undefined],
    [`/chits/${chit1.id}/payments`, 'POST', { memberSlotId: slot1.id, monthNumber: 2 }],
    [`/chits/${chit1.id}/lift`, 'POST', { monthNumber: 1, winnerMemberSlotId: slot1.id }],
    [`/chits/${chit1.id}/current-month`, 'POST', { currentMonth: 2 }],
    [`/members/${slot1.userId}`, 'PATCH', { name: 'X' }],
    [`/members/${slot1.userId}/reset-pin`, 'POST', { pin: '1111' }],
    ['/users/members', 'GET', undefined],
    ['/dev/owners', 'GET', undefined],
    ['/dev/stats', 'GET', undefined],
  ];
  for (const [path, method, body] of writes) {
    const res = await call(path, { method, token: memberToken, body });
    assert.equal(res.status, 403, `${method} ${path} must be 403 for members (got ${res.status})`);
  }
});

test('5 failed PINs lock a phone for 15 minutes; correct PIN is rejected during lockout', async () => {
  const devToken = (await login(DEV_PHONE, DEV_PIN)).body.token;
  await inviteOwner(devToken, 'Owner Lock', '9666666666', '1111');

  for (let i = 0; i < 5; i++) {
    const res = await login('9666666666', '0000');
    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'Invalid mobile number or PIN.');
  }

  // Locked now: even the CORRECT PIN is rejected with a generic message.
  const lockedCorrect = await login('9666666666', '1111');
  assert.equal(lockedCorrect.status, 401);
  assert.equal(typeof lockedCorrect.body.error, 'string');
  assert.doesNotMatch(String(lockedCorrect.body.error), /\d{1,2}:\d{2}/, 'lockout message must not leak timing details');

  // A phone below the threshold can still sign in (lock is per-phone).
  await inviteOwner(devToken, 'Owner Fine', '9777777777', '2222');
  for (let i = 0; i < 4; i++) {
    assert.equal((await login('9777777777', '0000')).status, 401);
  }
  assert.equal((await login('9777777777', '2222')).status, 200);
});

test('payment rules, receipt sequence and audit trail on update/void', async () => {
  const devToken = (await login(DEV_PHONE, DEV_PIN)).body.token;
  await inviteOwner(devToken, 'Owner Audit', '9222222244', '4444');
  const token: string = (await login('9222222244', '4444')).body.token;

  const chit = await createChit(token, 'AUD-1');
  const slot = await enrollNewMember(token, chit.id, 1, 'Member Aud', '9444444466', '5678');

  // Validation: amount must be a positive integer, month within 1..duration.
  assert.equal((await call(`/chits/${chit.id}/payments`, { token, body: { memberSlotId: slot.id, monthNumber: 0 } })).status, 400);
  assert.equal((await call(`/chits/${chit.id}/payments`, { token, body: { memberSlotId: slot.id, monthNumber: 5 } })).status, 400);
  assert.equal((await call(`/chits/${chit.id}/payments`, { token, body: { memberSlotId: slot.id, monthNumber: 1, amountPaid: 0 } })).status, 400);
  assert.equal((await call(`/chits/${chit.id}/payments`, { token, body: { memberSlotId: slot.id, monthNumber: 1, amountPaid: -5 } })).status, 400);

  // Receipt numbering: sequence inside the transaction, year from the date.
  const pay1 = await call(`/chits/${chit.id}/payments`, {
    token,
    body: { memberSlotId: slot.id, monthNumber: 1, amountPaid: 10000, paidDate: '2027-03-05', paymentMethod: 'CASH' },
  });
  assert.equal(pay1.status, 201);
  assert.match(String(pay1.body.payment.receiptNumber), /^RM-2027-\d{5}$/);
  assertNoSecrets(pay1.body);

  const slot2 = await enrollNewMember(token, chit.id, 2, 'Member Aud2', '9444444477', '5678');
  const pay2 = await call(`/chits/${chit.id}/payments`, {
    token,
    body: { memberSlotId: slot2.id, monthNumber: 1, amountPaid: 10000, paidDate: '2027-03-05', paymentMethod: 'CASH' },
  });
  assert.equal(pay2.status, 201);
  const seq1 = Number(String(pay1.body.payment.receiptNumber).split('-')[2]);
  const seq2 = Number(String(pay2.body.payment.receiptNumber).split('-')[2]);
  assert.equal(seq2, seq1 + 1, 'receipt sequence must be a monotonic counter');

  // Duplicate month conflicts.
  const dup = await call(`/chits/${chit.id}/payments`, {
    token,
    body: { memberSlotId: slot.id, monthNumber: 1, amountPaid: 10000 },
  });
  assert.equal(dup.status, 409);

  // Update writes an audit row (and re-signs the receipt).
  const paymentId = pay1.body.payment.id;
  const updated = await call(`/chits/${chit.id}/payments/${paymentId}`, {
    method: 'PATCH',
    token,
    body: { amountPaid: 12000, referenceNote: 'Corrected amount' },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.payment.amountPaid, 12000);
  assert.notEqual(updated.body.payment.signatureHash, pay1.body.payment.signatureHash);
  assert.equal(countRows(`SELECT COUNT(*) AS c FROM audit_log WHERE action = 'payment.update' AND entity_id = ?`, paymentId), 1);

  // Void requires a reason.
  assert.equal((await call(`/chits/${chit.id}/payments/${paymentId}`, { method: 'DELETE', token })).status, 400);
  assert.equal((await call(`/chits/${chit.id}/payments/${paymentId}`, { method: 'DELETE', token, body: { reason: '' } })).status, 400);

  // Void keeps the row (status VOID) and writes an audit row with the before state.
  const voided = await call(`/chits/${chit.id}/payments/${paymentId}`, {
    method: 'DELETE',
    token,
    body: { reason: 'Entered twice by mistake' },
  });
  assert.equal(voided.status, 200);
  assert.equal(voided.body.payment.status, 'VOID');
  assert.equal(voided.body.payment.voidReason, 'Entered twice by mistake');
  assert.equal(countRows(`SELECT COUNT(*) AS c FROM audit_log WHERE action = 'payment.void' AND entity_id = ?`, paymentId), 1);
  const auditRow = db
    .prepare(`SELECT before_json, after_json FROM audit_log WHERE action = 'payment.void' AND entity_id = ?`)
    .get(paymentId) as { before_json: string; after_json: string };
  assert.ok(String(auditRow.before_json).includes('12000'), 'audit keeps the pre-void state');
  assert.equal(String(auditRow.after_json).includes('Entered twice by mistake'), true);

  // A voided month can be re-recorded; a POSTED duplicate cannot.
  const reRecorded = await call(`/chits/${chit.id}/payments`, {
    token,
    body: { memberSlotId: slot.id, monthNumber: 1, amountPaid: 10000, paidDate: '2027-03-06' },
  });
  assert.equal(reRecorded.status, 201);

  // A voided payment cannot be edited.
  assert.equal(
    (await call(`/chits/${chit.id}/payments/${paymentId}`, { method: 'PATCH', token, body: { amountPaid: 1 } })).status,
    409
  );

  // Chit delete is blocked while payments exist; slot removal too.
  assert.equal((await call(`/chits/${chit.id}`, { method: 'DELETE', token })).status, 409);
  assert.equal((await call(`/chits/${chit.id}/slots/${slot.id}`, { method: 'DELETE', token })).status, 409);

  // A chit with no payments can be deleted.
  const emptyChit = await createChit(token, 'AUD-2');
  const emptySlot = await enrollNewMember(token, emptyChit.id, 1, 'Member Aud3', '9444444488', '5678');
  assert.equal((await call(`/chits/${emptyChit.id}/slots/${emptySlot.id}`, { method: 'DELETE', token })).status, 200);
  assert.equal((await call(`/chits/${emptyChit.id}`, { method: 'DELETE', token })).status, 200);
  assert.equal(countRows('SELECT COUNT(*) AS c FROM chit_groups WHERE id = ?', emptyChit.id), 0);
});

test('PINs are hashed, never returned, and member PIN reset works for the owning organizer', async () => {
  const devToken = (await login(DEV_PHONE, DEV_PIN)).body.token;
  await inviteOwner(devToken, 'Owner Pin', '9222222255', '5555');
  const token: string = (await login('9222222255', '5555')).body.token;

  const chit = await createChit(token, 'PIN-1');
  const slot = await enrollNewMember(token, chit.id, 1, 'Member Pin', '9444444499', '2468');

  // Stored as scrypt hash + per-user salt, never plaintext.
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(slot.userId) as Record<string, unknown>;
  assert.notEqual(String(row.pin_hash), '2468');
  assert.notEqual(String(row.pin_salt), '2468');
  assert.ok(String(row.pin_hash).length === 64);
  const { verifyPin } = await import('../server/auth/passwords');
  assert.equal(verifyPin('2468', String(row.pin_hash), String(row.pin_salt)), true);
  assert.equal(verifyPin('0000', String(row.pin_hash), String(row.pin_salt)), false);

  // Member reset PIN by the owning organizer; new PIN required to log in.
  const reset = await call(`/members/${slot.userId}/reset-pin`, { token, body: { pin: '1357' } });
  assert.equal(reset.status, 200);
  assertNoSecrets(reset.body);
  assert.equal((await login('9444444499', '2468')).status, 401);
  assert.equal((await login('9444444499', '1357')).status, 200);

  // No API response ever contains the PIN or its hash.
  const detail = await call(`/chits/${chit.id}`, { token });
  assertNoSecrets(detail.body);
  const members = await call('/users/members', { token });
  assertNoSecrets(members.body);
  const devOwners = await call('/dev/owners', { token: devToken });
  assertNoSecrets(devOwners.body);

  // Audit trail records the reset without storing the PIN.
  const auditRow = db
    .prepare(`SELECT after_json FROM audit_log WHERE action = 'member.reset-pin' AND entity_id = ?`)
    .get(slot.userId) as { after_json: string };
  assert.ok(auditRow);
  assert.equal(String(auditRow.after_json).includes('1357'), false);
  assert.equal(String(auditRow.after_json).includes('***'), true);
});

test('chit create derives a default schedule when the UI sends an empty schedule list', async () => {
  const devToken = (await login(DEV_PHONE, DEV_PIN)).body.token;
  await inviteOwner(devToken, 'Owner Sched', '9333333355', '5555');
  const token: string = (await login('9333333355', '5555')).body.token;

  // The create form sends `schedule: []` for AUCTION chits (the month table is
  // derived server-side), so creation must succeed (regression: it used to fail
  // with "Schedule is missing month 1.").
  const create = await call('/chits', {
    token,
    body: {
      name: '₹10,00,000 — 25 Months Business Auction',
      code: 'RM-10L-25M-38',
      chitType: 'AUCTION',
      faceValue: 1000000,
      durationMonths: 25,
      startDate: '2026-11-07',
      dueDayOfMonth: 10,
      baseInstallment: 40000,
      foremanCommissionPct: 5,
      maxBidPct: 35,
      notes: '',
      schedule: [],
    },
  });
  assert.equal(create.status, 201, create.body?.error ?? 'create should succeed');

  const detail = await call(`/chits/${create.body.group.id}`, { token });
  assert.equal(detail.status, 200);
  assert.equal(detail.body.group.schedule.length, 25);
  assert.equal(detail.body.group.schedule[0].monthNumber, 1);
  assert.equal(detail.body.group.schedule[0].nonPrizedInstallment, 40000);
  assert.equal(detail.body.group.schedule[24].monthNumber, 25);

  // A schedule that IS provided must still cover every month.
  const partial = await call('/chits', {
    token,
    body: {
      name: 'Partial Schedule',
      chitType: 'FIXED_TABLE',
      faceValue: 200000,
      durationMonths: 2,
      startDate: '2026-12-01',
      dueDayOfMonth: 5,
      baseInstallment: 100000,
      schedule: [
        { monthNumber: 1, nonPrizedInstallment: 100000, chitValue: 200000, prizedInstallment: 100000 },
      ],
    },
  });
  assert.equal(partial.status, 400);
  assert.match(String(partial.body?.error), /missing month 2/);

  // Schedule replacement via PATCH /chits/:id keeps strict row-per-month validation.
  const patched = await call(`/chits/${create.body.group.id}`, {
    method: 'PATCH',
    token,
    body: { schedule: [] },
  });
  assert.equal(patched.status, 400);
  assert.match(String(patched.body?.error), /missing month 1/);
});

test('partial payments: part payment, top-up, overpay rejection and full-payment lock', async () => {
  const devToken = (await login(DEV_PHONE, DEV_PIN)).body.token;
  await inviteOwner(devToken, 'Owner Partial', '9333333377', '7777');
  const token: string = (await login('9333333377', '7777')).body.token;

  const chit = await createChit(token, 'PARTIAL-1');
  const slot = await enrollNewMember(token, chit.id, 1, 'Member Part', '9555555501', '2468');

  // 1) A partial payment (4,000 of the 10,000 payable) is accepted…
  const p1 = await call(`/chits/${chit.id}/payments`, {
    token,
    body: { memberSlotId: slot.id, monthNumber: 1, amountPaid: 4000 },
  });
  assert.equal(p1.status, 201, p1.body?.error ?? 'partial payment should be accepted');
  assert.equal(p1.body.payment.amountPaid, 4000);

  // …and dues keep showing the remaining balance plus what was paid.
  const dues1 = await call('/dues', { token });
  const due1 = dues1.body.dues.find(
    (d: { monthNumber: number; memberSlotId: number }) =>
      d.monthNumber === 1 && d.memberSlotId === slot.id
  );
  assert.ok(due1, 'month 1 must stay due after a partial payment');
  assert.equal(due1.amountDue, 6000);
  assert.equal(due1.amountPaid, 4000);

  // Member summary reflects the remaining balance, not the full installment.
  const memberToken = (await login('9555555501', '2468')).body.token;
  let detail = await call(`/chits/${chit.id}`, { token: memberToken });
  assert.equal(detail.body.group.mySlots[0].currentMonthDue, 6000);
  assert.equal(detail.body.group.mySlots[0].currentMonthPaid, false);
  assert.equal(detail.body.group.mySlots[0].totalPaidSoFar, 4000);

  // 2) Collecting the balance marks the month fully paid.
  const p2 = await call(`/chits/${chit.id}/payments`, {
    token,
    body: { memberSlotId: slot.id, monthNumber: 1, amountPaid: 6000 },
  });
  assert.equal(p2.status, 201, p2.body?.error ?? 'top-up should be accepted');

  const dues2 = await call('/dues', { token });
  assert.equal(
    dues2.body.dues.some(
      (d: { monthNumber: number; memberSlotId: number }) =>
        d.monthNumber === 1 && d.memberSlotId === slot.id
    ),
    false,
    'a fully paid month must drop out of dues'
  );

  detail = await call(`/chits/${chit.id}`, { token: memberToken });
  assert.equal(detail.body.group.mySlots[0].currentMonthDue, 0);
  assert.equal(detail.body.group.mySlots[0].currentMonthPaid, true);
  assert.equal(detail.body.group.mySlots[0].totalPaidSoFar, 10000);

  // The organizer summary counts the ticket as paid only once fully covered.
  const list = await call('/chits', { token });
  assert.equal(list.body.groups[0].currentMonthPaidCount, 1);

  // 3) A third payment on a fully paid month is rejected.
  const p3 = await call(`/chits/${chit.id}/payments`, {
    token,
    body: { memberSlotId: slot.id, monthNumber: 1, amountPaid: 1 },
  });
  assert.equal(p3.status, 409);
  assert.match(String(p3.body?.error), /already fully paid/);

  // 4) An amount above the outstanding balance is rejected.
  const over = await call(`/chits/${chit.id}/payments`, {
    token,
    body: { memberSlotId: slot.id, monthNumber: 2, amountPaid: 10001 },
  });
  assert.equal(over.status, 400);
  assert.match(String(over.body?.error), /exceeds the outstanding balance/);

  // 5) Voiding the top-up reopens the month as partially paid.
  const voidRes = await call(`/chits/${chit.id}/payments/${p2.body.payment.id}`, {
    method: 'DELETE',
    token,
    body: { reason: 'top-up reversed' },
  });
  assert.equal(voidRes.status, 200);

  const dues3 = await call('/dues', { token });
  const due3 = dues3.body.dues.find(
    (d: { monthNumber: number; memberSlotId: number }) =>
      d.monthNumber === 1 && d.memberSlotId === slot.id
  );
  assert.ok(due3, 'voiding the top-up must reopen the month');
  assert.equal(due3.amountDue, 6000);
  assert.equal(due3.amountPaid, 4000);
});
