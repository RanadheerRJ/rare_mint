/**
 * Identifiers of the demo records that earlier builds of Rare Mint seeded
 * automatically (one organizer, 20 members, two chit groups). They are kept
 * here only so existing ledgers/databases can be cleaned up; nothing is ever
 * seeded from this list.
 */
export const LEGACY_DEMO_PIN = '1234';

export const LEGACY_DEMO_PHONES: ReadonlySet<string> = new Set([
  '9848011111', // former demo organizer
  '9848022222',
  '9848033333',
  '9848044444',
  '9848055555',
  '9848066666',
  '9848077777',
  '9848088888',
  '9848099999',
  '9849011223',
  '9849022334',
  '9849033445',
  '9849044556',
  '9849055667',
  '9849066778',
  '9849077889',
  '9849088990',
  '9849099101',
  '9849010203',
  '9849020304',
  '9849030405',
]);

export const LEGACY_DEMO_CHIT_CODES: ReadonlySet<string> = new Set(['RM-5L-16M', 'RM-2L-20M']);

/** A record is treated as legacy demo data only if both phone and seed PIN match. */
export function isLegacyDemoUser(user: { phone: string; pin?: string | null }): boolean {
  return LEGACY_DEMO_PHONES.has(user.phone) && String(user.pin ?? '') === LEGACY_DEMO_PIN;
}

interface PurgeableLedger {
  users: Array<{ id: number; phone: string; pin?: string; role: string }>;
  chitGroups: Array<{ id: number; organizerId: number }>;
  schedules: Array<{ chitGroupId: number; winnerMemberSlotId: number | null }>;
  slots: Array<{ id: number; chitGroupId: number; userId: number }>;
  payments: Array<{ chitGroupId: number; memberSlotId: number }>;
}

export interface PurgeResult {
  users: number;
  chitGroups: number;
  slots: number;
  payments: number;
}

/**
 * Removes legacy demo users, every chit group they organised (with schedules,
 * tickets and payments), any tickets they held in other groups, and members
 * that only existed inside removed demo groups. Mutates `state` in place.
 */
export function purgeLegacyDemoData(state: PurgeableLedger): PurgeResult {
  const demoUserIds = new Set(state.users.filter(isLegacyDemoUser).map((u) => u.id));
  const result: PurgeResult = { users: 0, chitGroups: 0, slots: 0, payments: 0 };
  if (demoUserIds.size === 0) return result;

  const removedGroupIds = new Set(
    state.chitGroups.filter((g) => demoUserIds.has(g.organizerId)).map((g) => g.id)
  );
  const removedSlots = state.slots.filter(
    (s) => removedGroupIds.has(s.chitGroupId) || demoUserIds.has(s.userId)
  );
  const removedSlotIds = new Set(removedSlots.map((s) => s.id));

  const remainingSlots = state.slots.filter((s) => !removedSlotIds.has(s.id));
  const usersWithRemainingSlots = new Set(remainingSlots.map((s) => s.userId));
  const orphanedMemberIds = new Set(
    removedSlots
      .map((s) => s.userId)
      .filter((id) => !demoUserIds.has(id) && !usersWithRemainingSlots.has(id))
  );
  // Members are only orphaned if they never organised anything themselves.
  const removedUserIds = new Set([
    ...demoUserIds,
    ...[...orphanedMemberIds].filter((id) =>
      state.users.some((u) => u.id === id && u.role === 'member')
    ),
  ]);

  const paymentsBefore = state.payments.length;
  state.payments = state.payments.filter(
    (p) => !removedGroupIds.has(p.chitGroupId) && !removedSlotIds.has(p.memberSlotId)
  );
  state.schedules = state.schedules.filter((s) => !removedGroupIds.has(s.chitGroupId));
  for (const sched of state.schedules) {
    if (sched.winnerMemberSlotId !== null && removedSlotIds.has(sched.winnerMemberSlotId)) {
      Object.assign(sched, {
        bidDiscount: null,
        dividendPerMember: null,
        foremanCommission: null,
        isAuctionCompleted: false,
        winnerMemberSlotId: null,
        winnerName: null,
        winnerTicketNumber: null,
        payoutDate: null,
        payoutReference: null,
      });
    }
  }
  state.slots = remainingSlots;
  const groupsBefore = state.chitGroups.length;
  state.chitGroups = state.chitGroups.filter((g) => !removedGroupIds.has(g.id));
  const usersBefore = state.users.length;
  state.users = state.users.filter((u) => !removedUserIds.has(u.id));

  result.users = usersBefore - state.users.length;
  result.chitGroups = groupsBefore - state.chitGroups.length;
  result.slots = removedSlotIds.size;
  result.payments = paymentsBefore - state.payments.length;
  return result;
}
