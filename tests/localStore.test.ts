import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localStore, setDemoModeEnabled } from '../src/api/localStore';

const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
} });

test('empty ledger and owner enrollment lifecycle', () => {
  storage.clear();
  const empty = JSON.parse(localStore.exportBackupJson());
  assert.deepEqual([empty.users, empty.chitGroups, empty.slots, empty.payments], [[], [], [], []]);
  // Static-mode registration is invite-only unless the demo flag is set.
  assert.throws(
    () => localStore.register({name:'Owner', phone:'9000000001', pin:'4567', role:'organizer', city:''}),
    /invite-only|disabled/i
  );
  setDemoModeEnabled(true);
  const owner = localStore.register({name:'Owner', phone:'9000000001', pin:'4567', role:'organizer', city:''}).user;
  const other = localStore.register({name:'Other', phone:'9000000002', pin:'4567', role:'organizer', city:''}).user;
  const group = localStore.createChit({name:'Group', code:'TEST', chitType:'AUCTION', faceValue:40000, durationMonths:4, startDate:'2026-11-10', dueDayOfMonth:10, baseInstallment:10000, foremanCommissionPct:5, maxBidPct:35, organizerId:owner.id, notes:'', schedule:[]}).group;
  const member = {ticketNumber:1, organizerId:owner.id, newMemberName:'Member', newMemberPhone:'9000000003', newMemberPin:'5678'};
  assert.throws(() => localStore.enrollSlot(group.id, {...member, organizerId:other.id}), /owner/);
  assert.throws(() => localStore.enrollSlot(group.id, {...member, ticketNumber:5}), /between/);
  assert.throws(() => localStore.enrollSlot(group.id, {...member, newMemberPin:'1'}), /PIN/);
  assert.equal(localStore.getMembers().members.length, 0);
  const slot = localStore.enrollSlot(group.id, member).slot;
  assert.equal(localStore.login('9000000003', '5678').user.id, slot.userId);
  assert.throws(() => localStore.enrollSlot(group.id, member), /already assigned/);
  assert.throws(() => localStore.enrollSlot(group.id, {...member, ticketNumber:2}), /already exists/);
  localStore.enrollSlot(group.id, {ticketNumber:2, organizerId:owner.id, userId:slot.userId});
  assert.equal(localStore.getChitDetail(group.id, owner.id).group.slots.length, 2);
  assert.equal(localStore.getChits(other.id).groups.length, 0);
  assert.equal(localStore.getChits(slot.userId).groups.length, 1);
  assert.equal(localStore.getDues(owner.id).dues.length, 2);
  assert.equal(localStore.getDues(other.id).dues.length, 0);
  assert.equal(localStore.getDues(slot.userId).dues.length, 2);
});
