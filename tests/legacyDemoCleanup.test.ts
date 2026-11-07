import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localStore } from '../src/api/localStore';

const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
} });

const user = (id: number, phone: string, pin: string, role: 'organizer' | 'member') =>
  ({ id, name: `User ${id}`, phone, pin, role, city: '', createdAt: '2026-06-01' });
const group = (id: number, code: string, organizerId: number) =>
  ({ id, code, name: code, chitType: 'FIXED_TABLE', faceValue: 40000, durationMonths: 4, totalSlots: 4,
    currentMonth: 1, startDate: '2026-06-10', dueDayOfMonth: 10, baseInstallment: 10000,
    foremanCommissionPct: 5, maxBidPct: 0, organizerId, status: 'ACTIVE', notes: '', createdAt: '2026-06-01' });
const schedule = (id: number, chitGroupId: number, winnerMemberSlotId: number | null) =>
  ({ id, chitGroupId, monthNumber: 1, chitDate: '2026-06-10', nonPrizedInstallment: 10000, chitValue: 40000,
    prizedInstallment: 10000, bidDiscount: null, dividendPerMember: null, foremanCommission: null,
    isAuctionCompleted: winnerMemberSlotId !== null, winnerMemberSlotId, winnerName: winnerMemberSlotId ? 'Demo' : null,
    winnerTicketNumber: winnerMemberSlotId ? 1 : null, payoutDate: winnerMemberSlotId ? '2026-06-12' : null,
    payoutReference: winnerMemberSlotId ? 'NEFT-RM5L-M01' : null });
const slot = (id: number, chitGroupId: number, userId: number, ticketNumber: number) =>
  ({ id, chitGroupId, userId, ticketNumber, memberName: '', memberPhone: '', joinedDate: '2026-06-01',
    prizedMonth: null, prizedAmount: null, payoutDate: null });
const payment = (id: number, chitGroupId: number, memberSlotId: number) =>
  ({ id, receiptNumber: `RM-2026-${1000 + id}`, chitGroupId, memberSlotId, monthNumber: 1, amountPaid: 10000,
    paidDate: '2026-06-10', paymentMethod: 'UPI', referenceNote: '', signedByName: 'Foreman', signatureHash: 'x', createdAt: '2026-06-10' });

function legacyLedger() {
  return {
    version: 1,
    users: [
      user(1, '9848011111', '1234', 'organizer'), // demo organizer
      user(2, '9848022222', '1234', 'member'), // demo member
      user(3, '9123456780', '1234', 'member'), // added only to a demo chit
      user(4, '9000000001', '4567', 'organizer'), // real organizer
      user(5, '9000000005', '4567', 'member'), // real member
      user(6, '9848033333', '9999', 'member'), // demo phone, real PIN → kept
    ],
    chitGroups: [group(1, 'RM-5L-16M', 1), group(2, 'REAL', 4)],
    schedules: [schedule(1, 1, 1), schedule(2, 2, 4)],
    slots: [slot(1, 1, 2, 1), slot(2, 1, 3, 2), slot(3, 2, 5, 2), slot(4, 2, 2, 1), slot(5, 2, 6, 3)],
    payments: [payment(1, 1, 1), payment(2, 2, 3), payment(3, 2, 4)],
  };
}

test('browser ledger drops legacy demo data and keeps real entries', () => {
  storage.clear();
  storage.set('rm_static_ledger_v1', JSON.stringify(legacyLedger()));
  const state = JSON.parse(localStore.exportBackupJson());
  assert.equal(state.version, 2);
  assert.deepEqual(state.users.map((u: { id: number }) => u.id), [4, 5, 6]);
  assert.deepEqual(state.chitGroups.map((g: { code: string }) => g.code), ['REAL']);
  assert.deepEqual(state.slots.map((s: { id: number }) => s.id), [3, 5]);
  assert.deepEqual(state.payments.map((p: { id: number }) => p.id), [2]);
  assert.deepEqual(state.schedules.map((s: { id: number }) => s.id), [2]);
  assert.equal(state.schedules[0].winnerMemberSlotId, null);
  assert.equal(state.schedules[0].isAuctionCompleted, false);
  assert.equal(JSON.parse(storage.get('rm_static_ledger_v1')!).version, 2);
  assert.throws(() => localStore.login('9848011111', '1234'), /Invalid|not found|incorrect/i);

  // Restoring an old backup cleans it too.
  localStore.importBackupJson(JSON.stringify(legacyLedger()));
  assert.equal(JSON.parse(localStore.exportBackupJson()).chitGroups.length, 1);

  // A migrated ledger is never purged again (a real account may reuse a number later).
  const registered = localStore.register({ name: 'New', phone: '9848011111', pin: '1234', role: 'organizer', city: '' }).user;
  assert.equal(localStore.login('9848011111', '1234').user.id, registered.id);
});

test('SQLite database drops legacy demo data once and keeps real entries', async () => {
  const previous = process.cwd();
  const temp = mkdtempSync(join(tmpdir(), 'rare-mint-legacy-'));
  process.chdir(temp);
  const { initDatabase, purgeLegacyDemoDataOnce, db } = await import('../server/db');
  try {
    initDatabase();
    const ledger = legacyLedger();
    for (const u of ledger.users) {
      db.prepare('INSERT INTO users (id, name, phone, pin, role) VALUES (?, ?, ?, ?, ?)').run(u.id, u.name, u.phone, u.pin, u.role);
    }
    for (const g of ledger.chitGroups) {
      db.prepare(`INSERT INTO chit_groups (id, code, name, chit_type, face_value, duration_months, total_slots, start_date, base_installment, organizer_id)
        VALUES (?, ?, ?, 'FIXED_TABLE', 40000, 4, 4, '2026-06-10', 10000, ?)`).run(g.id, g.code, g.name, g.organizerId);
    }
    for (const s of ledger.slots) {
      db.prepare('INSERT INTO member_slots (id, chit_group_id, user_id, ticket_number, joined_date) VALUES (?, ?, ?, ?, ?)')
        .run(s.id, s.chitGroupId, s.userId, s.ticketNumber, s.joinedDate);
    }
    for (const s of ledger.schedules) {
      db.prepare(`INSERT INTO chit_schedules (id, chit_group_id, month_number, chit_date, non_prized_installment, chit_value, prized_installment, is_auction_completed, winner_member_slot_id, payout_reference)
        VALUES (?, ?, 1, '2026-06-10', 10000, 40000, 10000, ?, ?, ?)`).run(s.id, s.chitGroupId, s.winnerMemberSlotId ? 1 : 0, s.winnerMemberSlotId, s.payoutReference);
    }
    for (const p of ledger.payments) {
      db.prepare(`INSERT INTO payments (id, receipt_number, chit_group_id, member_slot_id, month_number, amount_paid, paid_date, payment_method, signed_by_name, signature_hash)
        VALUES (?, ?, ?, ?, 1, 10000, '2026-06-10', 'UPI', 'Foreman', 'x')`).run(p.id, p.receiptNumber, p.chitGroupId, p.memberSlotId);
    }

    // Already-migrated databases are left alone.
    purgeLegacyDemoDataOnce();
    assert.equal((db.prepare('SELECT count(*) AS n FROM users').get() as { n: number }).n, 6);

    db.exec('PRAGMA user_version = 0');
    purgeLegacyDemoDataOnce();
    const ids = (table: string) => (db.prepare(`SELECT id FROM ${table} ORDER BY id`).all() as Array<{ id: number }>).map((r) => r.id);
    assert.deepEqual(ids('users'), [4, 5, 6]);
    assert.deepEqual(ids('chit_groups'), [2]);
    assert.deepEqual(ids('member_slots'), [3, 5]);
    assert.deepEqual(ids('payments'), [2]);
    assert.deepEqual(ids('chit_schedules'), [2]);
    const sched = db.prepare('SELECT winner_member_slot_id AS w, is_auction_completed AS c FROM chit_schedules').get() as { w: number | null; c: number };
    assert.deepEqual({ ...sched }, { w: null, c: 0 });
    assert.equal((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, 1);
  } finally {
    db.close();
    process.chdir(previous);
    rmSync(temp, { recursive: true, force: true });
  }
});
