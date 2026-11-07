import { test } from 'node:test';
import assert from 'node:assert/strict';

// Static deployments (GitHub Pages) have no /api: every ledger call must go to
// the browser ledger. Regression: the invite-only rework dropped the static
// gates from the ledger methods, so creating a chit POSTed to ./api/chits and
// static hosts answered 405 ("The string did not match the expected pattern"
// on Safari, "The server returned an unexpected error … (HTTP 405)" later).

const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    get length() {
      return storage.size;
    },
    key: (i: number) => Array.from(storage.keys())[i] ?? null,
  },
});

let fetchCalls = 0;
(globalThis as { window?: unknown }).window = { location: { hostname: 'demo.github.io' } };
(globalThis as { fetch?: unknown }).fetch = () => {
  fetchCalls += 1;
  throw new Error('fetch must never be called in static mode');
};

const { api } = await import('../src/api/client');
const { setDemoModeEnabled } = await import('../src/api/localStore');

test('static mode: ledger works in the browser with no network calls', async () => {
  setDemoModeEnabled(true);

  // Sign in (static registration is demo-gated; the signed-in user scopes reads).
  const { user } = await api.register({
    name: 'Static Owner',
    phone: '9800000001',
    pin: '1234',
    role: 'organizer',
    city: 'Hyderabad',
  });
  assert.equal(user.role, 'organizer');

  // Creating a chit must hit the browser ledger, never ./api/chits.
  const { group } = await api.createChit({
    name: 'Static Chit',
    code: 'STATIC-1',
    chitType: 'FIXED_TABLE',
    faceValue: 40000,
    durationMonths: 4,
    startDate: '2026-11-10',
    dueDayOfMonth: 10,
    baseInstallment: 10000,
    foremanCommissionPct: 5,
    maxBidPct: 0,
    notes: '',
    schedule: [1, 2, 3, 4].map((monthNumber) => ({
      monthNumber,
      nonPrizedInstallment: 10000,
      chitValue: 40000,
      prizedInstallment: 10000,
    })),
  });
  assert.equal(group.code, 'STATIC-1');

  // Reads are scoped by the signed-in user.
  const chits = await api.getChits();
  assert.equal(chits.groups.length, 1);
  const detail = await api.getChitDetail(group.id);
  assert.equal(detail.group.schedule.length, 4);

  // Enrollment and payment collection work offline.
  const { slot } = await api.enrollSlot(group.id, {
    ticketNumber: 1,
    newMemberName: 'Static Member',
    newMemberPhone: '9800000002',
    newMemberPin: '4321',
  });
  const { payment } = await api.recordPayment(group.id, {
    memberSlotId: slot.id,
    monthNumber: 1,
    paymentMethod: 'UPI',
  });
  assert.match(String(payment.receiptNumber), /^RM-\d{4}-\d+$/);

  const dues = await api.getDues();
  assert.ok(Array.isArray(dues.dues));
  const receipts = await api.getReceipts();
  assert.equal(receipts.receipts.length, 1);

  // Lifts and month changes work offline too.
  assert.equal((await api.recordLift(group.id, { monthNumber: 1, winnerMemberSlotId: slot.id })).ok, true);
  assert.equal((await api.setCurrentMonth(group.id, 2)).currentMonth, 2);

  assert.equal(fetchCalls, 0, 'no ledger call may touch the network in static mode');
});

test('static mode: server-only actions fail with a clear message, not a 405', async () => {
  setDemoModeEnabled(true);
  await api.register({ name: 'Static Owner 2', phone: '9800000003', pin: '1234', role: 'organizer', city: '' });

  await assert.rejects(() => api.updateChit(1, { name: 'x' }), /needs the Rare Mint server/);
  await assert.rejects(() => api.deleteChit(1), /needs the Rare Mint server/);
  await assert.rejects(() => api.updateSlot(1, 1, { memberName: 'x' }), /needs the Rare Mint server/);
  await assert.rejects(() => api.removeSlot(1, 1), /needs the Rare Mint server/);
  await assert.rejects(() => api.updatePayment(1, 1, { amountPaid: 1 }), /needs the Rare Mint server/);
  await assert.rejects(() => api.voidPayment(1, 1, 'mistake'), /needs the Rare Mint server/);
  await assert.rejects(() => api.updateMember(1, { name: 'x' }), /needs the Rare Mint server/);
  await assert.rejects(() => api.resetMemberPin(1, '1234'), /needs the Rare Mint server/);
  await assert.rejects(() => api.devListOwners(), /needs the Rare Mint server/);
  await assert.rejects(() => api.devStats(), /needs the Rare Mint server/);

  assert.equal(fetchCalls, 0, 'server-only rejections must not touch the network either');
});
