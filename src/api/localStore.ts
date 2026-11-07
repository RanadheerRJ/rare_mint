import {
  ChitGroupDetail,
  ChitGroupSummary,
  ChitType,
  DueItem,
  MemberSlot,
  PaymentMethod,
  PaymentRecord,
  ScheduleRow,
  User,
} from '../types';
import {
  addMonthsToDate,
  getMemberPayableForMonth,
} from '../utils/chitFinance';
import { purgeLegacyDemoData } from '../utils/legacyDemo';

const STORAGE_KEY = 'rm_static_ledger_v1';
/** Version 2+ ledgers have been cleaned of the demo data seeded by early builds. */
const LEDGER_VERSION = 2;

/**
 * Static/demo mode has no server, so the invite-only owner flow cannot work
 * there. Public self-registration is disabled unless this explicit demo flag
 * is set; the real invite-only features need the server.
 */
const DEMO_MODE_KEY = 'rm_demo_mode';

export function isDemoModeEnabled(): boolean {
  try {
    return localStorage.getItem(DEMO_MODE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setDemoModeEnabled(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(DEMO_MODE_KEY, '1');
    else localStorage.removeItem(DEMO_MODE_KEY);
  } catch {
    // Ignore storage errors
  }
}

interface StoredUser extends User {
  pin: string;
}

interface StoredChitGroup {
  id: number;
  code: string;
  name: string;
  chitType: ChitType;
  faceValue: number;
  durationMonths: number;
  totalSlots: number;
  currentMonth: number;
  startDate: string;
  dueDayOfMonth: number;
  baseInstallment: number;
  foremanCommissionPct: number;
  maxBidPct: number;
  organizerId: number;
  status: 'ACTIVE' | 'COMPLETED';
  notes: string;
  createdAt: string;
}

interface LedgerState {
  version: number;
  users: StoredUser[];
  chitGroups: StoredChitGroup[];
  schedules: ScheduleRow[];
  slots: MemberSlot[];
  payments: PaymentRecord[];
}

function getTodayIST(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function daysBetween(fromDateStr: string, toDateStr: string): number {
  const [y1, m1, d1] = fromDateStr.split('-').map(Number);
  const [y2, m2, d2] = toDateStr.split('-').map(Number);
  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((t2 - t1) / (1000 * 60 * 60 * 24));
}

function computeSimpleSig(receiptNo: string, slotId: number, month: number, amount: number): string {
  const str = `${receiptNo}:${slotId}:${month}:${amount}:RAREMINT`;
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hex = (h >>> 0).toString(16).toUpperCase().padStart(8, '0');
  return `RM-SIG-${hex}`;
}

function createEmptyState(): LedgerState {
  return { version: LEDGER_VERSION, users: [], chitGroups: [], schedules: [], slots: [], payments: [] };
}

function needsMigration(state: LedgerState): boolean {
  return !(Number(state.version) >= LEDGER_VERSION);
}

function migrateLedger(state: LedgerState): void {
  state.schedules = Array.isArray(state.schedules) ? state.schedules : [];
  state.slots = Array.isArray(state.slots) ? state.slots : [];
  state.payments = Array.isArray(state.payments) ? state.payments : [];
  purgeLegacyDemoData(state);
  state.version = LEDGER_VERSION;
}

function readState(): LedgerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LedgerState;
      if (parsed && Array.isArray(parsed.users) && Array.isArray(parsed.chitGroups)) {
        if (needsMigration(parsed)) {
          migrateLedger(parsed);
          saveState(parsed);
        }
        return parsed;
      }
    }
  } catch {
    // Fall back to empty ledger
  }
  const empty = createEmptyState();
  saveState(empty);
  return empty;
}

function saveState(state: LedgerState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}

function toPublicUser(u: StoredUser): User {
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    role: u.role,
    city: u.city,
    createdAt: u.createdAt,
    isActive: u.isActive ?? true,
  };
}

function buildSummary(state: LedgerState, g: StoredChitGroup, viewer?: User | null): ChitGroupSummary {
  const organizer = state.users.find((u) => u.id === g.organizerId);
  const groupSlots = state.slots
    .filter((s) => s.chitGroupId === g.id)
    .sort((a, b) => a.ticketNumber - b.ticketNumber);
  const currentSched = state.schedules.find(
    (s) => s.chitGroupId === g.id && s.monthNumber === g.currentMonth
  );
  const currentPayments = state.payments.filter(
    (p) => p.chitGroupId === g.id && p.monthNumber === g.currentMonth
  );

  const paidBySlot = new Map<number, number>();
  for (const p of currentPayments) {
    paidBySlot.set(p.memberSlotId, p.amountPaid);
  }

  let currentMonthTarget = 0;
  let currentMonthCollected = 0;
  let currentMonthPaidCount = 0;

  if (currentSched) {
    for (const s of groupSlots) {
      const expected = getMemberPayableForMonth(g.chitType, currentSched, s.prizedMonth);
      currentMonthTarget += expected;
      if (paidBySlot.has(s.id)) {
        currentMonthCollected += paidBySlot.get(s.id)!;
        currentMonthPaidCount += 1;
      }
    }
  }

  let mySlots: ChitGroupSummary['mySlots'] = undefined;
  if (viewer) {
    const userSlots = groupSlots.filter((s) => s.userId === viewer.id);
    if (userSlots.length > 0) {
      mySlots = userSlots.map((s) => {
        const due = currentSched
          ? getMemberPayableForMonth(g.chitType, currentSched, s.prizedMonth)
          : 0;
        const totalPaidSoFar = state.payments
          .filter((p) => p.memberSlotId === s.id)
          .reduce((acc, p) => acc + p.amountPaid, 0);
        return {
          slotId: s.id,
          ticketNumber: s.ticketNumber,
          prizedMonth: s.prizedMonth,
          prizedAmount: s.prizedAmount,
          currentMonthDue: due,
          currentMonthPaid: paidBySlot.has(s.id),
          totalPaidSoFar,
        };
      });
    }
  }

  return {
    ...g,
    enrolledSlots: groupSlots.length,
    organizerName: organizer?.name || 'Foreman',
    organizerPhone: organizer?.phone || '',
    currentMonthTarget,
    currentMonthCollected,
    currentMonthPaidCount,
    nextChitDate: currentSched ? currentSched.chitDate : g.startDate,
    mySlots,
  };
}

export const localStore = {
  login(phone: string, pin: string): { user: User } {
    const state = readState();
    const cleanPhone = (phone || '').replace(/\D/g, '').slice(-10);
    const found = state.users.find((u) => u.phone === cleanPhone && u.pin === String(pin).trim());
    if (!found) {
      throw new Error('Invalid mobile number or PIN.');
    }
    return { user: toPublicUser(found) };
  },

  register(payload: {
    name: string;
    phone: string;
    pin: string;
    role: 'organizer' | 'member';
    city: string;
  }): { user: User } {
    if (!isDemoModeEnabled()) {
      throw new Error(
        'Self-registration is disabled. Accounts are invite-only — ask the platform developer for an owner invite.'
      );
    }
    const state = readState();
    const cleanPhone = (payload.phone || '').replace(/\D/g, '').slice(-10);
    if (!payload.name?.trim() || cleanPhone.length !== 10 || !/^\d{4}$/.test(payload.pin || '')) {
      throw new Error('Name, 10-digit mobile number, and 4-digit PIN are required.');
    }
    if (state.users.some((u) => u.phone === cleanPhone)) {
      throw new Error('An account with this mobile number already exists. Please sign in.');
    }
    const nextId = Math.max(0, ...state.users.map((u) => u.id)) + 1;
    const newUser: StoredUser = {
      id: nextId,
      name: payload.name.trim(),
      phone: cleanPhone,
      pin: payload.pin.trim(),
      role: payload.role === 'organizer' ? 'organizer' : 'member',
      city: (payload.city || 'Hyderabad').trim(),
      createdAt: getTodayIST(),
      isActive: true,
    };
    state.users.push(newUser);
    saveState(state);
    return { user: toPublicUser(newUser) };
  },

  getMembers(): { members: User[] } {
    const state = readState();
    const members = state.users
      .filter((u) => u.role === 'member')
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(toPublicUser);
    return { members };
  },

  getChits(userId: number, includeAll = false): { groups: ChitGroupSummary[]; today: string } {
    const state = readState();
    const viewer = state.users.find((u) => u.id === userId);
    const viewerPub = viewer ? toPublicUser(viewer) : null;

    let list = state.chitGroups;
    if (viewerPub?.role === 'organizer') list = list.filter((g) => g.organizerId === viewerPub.id);
    if (viewerPub && viewerPub.role === 'member' && !includeAll) {
      const joinedGroupIds = new Set(
        state.slots.filter((s) => s.userId === viewerPub.id).map((s) => s.chitGroupId)
      );
      list = list.filter((g) => joinedGroupIds.has(g.id));
    }

    return {
      groups: list.map((g) => buildSummary(state, g, viewerPub)),
      today: getTodayIST(),
    };
  },

  getChitDetail(groupId: number, userId: number): { group: ChitGroupDetail } {
    const state = readState();
    const g = state.chitGroups.find((x) => x.id === groupId);
    if (!g) throw new Error('Chit group not found.');
    const viewer = state.users.find((u) => u.id === userId);
    const summary = buildSummary(state, g, viewer ? toPublicUser(viewer) : null);

    const schedule = state.schedules
      .filter((s) => s.chitGroupId === groupId)
      .sort((a, b) => a.monthNumber - b.monthNumber);

    const slots = state.slots
      .filter((s) => s.chitGroupId === groupId)
      .sort((a, b) => a.ticketNumber - b.ticketNumber);

    const payments = state.payments
      .filter((p) => p.chitGroupId === groupId)
      .sort((a, b) => b.monthNumber - a.monthNumber || (a.ticketNumber || 0) - (b.ticketNumber || 0));

    return {
      group: {
        ...summary,
        schedule,
        slots,
        payments,
      },
    };
  },

  createChit(payload: {
    name: string;
    code?: string;
    chitType: ChitType;
    faceValue: number;
    durationMonths: number;
    startDate: string;
    dueDayOfMonth: number;
    baseInstallment: number;
    foremanCommissionPct: number;
    maxBidPct: number;
    organizerId: number;
    notes: string;
    schedule: Array<{
      monthNumber: number;
      nonPrizedInstallment: number;
      chitValue: number;
      prizedInstallment: number;
    }>;
  }): { group: ChitGroupSummary } {
    const state = readState();
    const finalCode =
      (payload.code || '').trim().toUpperCase() ||
      `RM-${Math.round(payload.faceValue / 1000)}K-${payload.durationMonths}M-${Math.floor(100 + Math.random() * 900)}`;

    if (state.chitGroups.some((g) => g.code === finalCode)) {
      throw new Error(`Chit code ${finalCode} already exists. Choose a unique code.`);
    }

    const nextGroupId = Math.max(0, ...state.chitGroups.map((g) => g.id)) + 1;
    const dueDay = Number(payload.dueDayOfMonth || 10);
    const newGroup: StoredChitGroup = {
      id: nextGroupId,
      code: finalCode,
      name: payload.name.trim(),
      chitType: payload.chitType,
      faceValue: Number(payload.faceValue),
      durationMonths: Number(payload.durationMonths),
      totalSlots: Number(payload.durationMonths),
      currentMonth: 1,
      startDate: payload.startDate,
      dueDayOfMonth: dueDay,
      baseInstallment: Number(payload.baseInstallment),
      foremanCommissionPct: Number(payload.foremanCommissionPct ?? 5),
      maxBidPct: Number(payload.maxBidPct ?? (payload.chitType === 'AUCTION' ? 35 : 0)),
      organizerId: Number(payload.organizerId),
      status: 'ACTIVE',
      notes: (payload.notes || '').trim(),
      createdAt: getTodayIST(),
    };
    state.chitGroups.push(newGroup);

    let nextSchedId = Math.max(0, ...state.schedules.map((s) => s.id)) + 1;
    for (let m = 1; m <= newGroup.durationMonths; m++) {
      const provided = payload.schedule?.find((s) => Number(s.monthNumber) === m);
      state.schedules.push({
        id: nextSchedId++,
        chitGroupId: nextGroupId,
        monthNumber: m,
        chitDate: addMonthsToDate(payload.startDate, m - 1, dueDay),
        nonPrizedInstallment: Number(provided?.nonPrizedInstallment ?? newGroup.baseInstallment),
        chitValue: Number(provided?.chitValue ?? newGroup.faceValue),
        prizedInstallment: Number(provided?.prizedInstallment ?? newGroup.baseInstallment),
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

    saveState(state);
    return { group: buildSummary(state, newGroup) };
  },

  enrollSlot(
    groupId: number,
    payload: {
      ticketNumber: number;
      organizerId: number;
      newMemberPin?: string;
      userId?: number;
      newMemberName?: string;
      newMemberPhone?: string;
      newMemberCity?: string;
    }
  ): { slot: MemberSlot } {
    const state = readState();
    const g = state.chitGroups.find((x) => x.id === groupId);
    if (!g) throw new Error('Chit group not found.');

    if (g.organizerId !== Number(payload.organizerId) || !state.users.some((u) => u.id === payload.organizerId && u.role === 'organizer')) {
      throw new Error('Only the chit owner can add members.');
    }
    const tNum = Number(payload.ticketNumber);
    if (!Number.isInteger(tNum) || tNum < 1 || tNum > g.totalSlots) throw new Error(`Ticket number must be between 1 and ${g.totalSlots}.`);
    if (state.slots.some((s) => s.chitGroupId === groupId && s.ticketNumber === tNum)) {
      throw new Error(`Ticket #${tNum} is already assigned.`);
    }

    let targetUser: StoredUser | undefined;
    if (payload.userId) {
      targetUser = state.users.find((u) => u.id === Number(payload.userId));
    } else {
      const cleanPhone = (payload.newMemberPhone || '').replace(/\D/g, '').slice(-10);
      if (!payload.newMemberName?.trim() || cleanPhone.length !== 10) {
        throw new Error('Enter subscriber name and valid 10-digit mobile number.');
      }
      targetUser = state.users.find((u) => u.phone === cleanPhone);
      if (targetUser) throw new Error('A user with this phone already exists. Select them from the existing directory.');
      if (!/^\d{4}$/.test(payload.newMemberPin || '')) throw new Error('Enter a 4-digit PIN for the new member.');
      if (!targetUser) {
        const nextUserId = Math.max(0, ...state.users.map((u) => u.id)) + 1;
        targetUser = {
          id: nextUserId,
          name: payload.newMemberName.trim(),
          phone: cleanPhone,
          pin: payload.newMemberPin!,
          role: 'member',
          city: (payload.newMemberCity || 'Hyderabad').trim(),
          createdAt: getTodayIST(),
          isActive: true,
        };
        state.users.push(targetUser);
      }
    }

    if (!targetUser || targetUser.role !== 'member') throw new Error('Member not found.');

    const nextSlotId = Math.max(0, ...state.slots.map((s) => s.id)) + 1;
    const newSlot: MemberSlot = {
      id: nextSlotId,
      chitGroupId: groupId,
      userId: targetUser.id,
      ticketNumber: tNum,
      memberName: targetUser.name,
      memberPhone: targetUser.phone,
      joinedDate: getTodayIST(),
      prizedMonth: null,
      prizedAmount: null,
      payoutDate: null,
    };
    state.slots.push(newSlot);
    saveState(state);
    return { slot: newSlot };
  },

  recordPayment(
    groupId: number,
    payload: {
      memberSlotId: number;
      monthNumber: number;
      amountPaid?: number;
      paidDate?: string;
      paymentMethod: PaymentMethod;
      referenceNote?: string;
      signedByName?: string;
    }
  ): { payment: PaymentRecord } {
    const state = readState();
    const g = state.chitGroups.find((x) => x.id === groupId);
    if (!g) throw new Error('Chit group not found.');
    const slot = state.slots.find(
      (s) => s.id === Number(payload.memberSlotId) && s.chitGroupId === groupId
    );
    if (!slot) throw new Error('Member ticket slot not found.');

    const existing = state.payments.find(
      (p) => p.memberSlotId === slot.id && p.monthNumber === Number(payload.monthNumber)
    );
    if (existing) {
      throw new Error(`Month ${payload.monthNumber} is already paid (${existing.receiptNumber}).`);
    }

    const sched = state.schedules.find(
      (s) => s.chitGroupId === groupId && s.monthNumber === Number(payload.monthNumber)
    );
    if (!sched) throw new Error('Schedule month not found.');

    const expected = getMemberPayableForMonth(g.chitType, sched, slot.prizedMonth);
    const finalAmount = Number(payload.amountPaid || expected);
    const nextPayId = Math.max(0, ...state.payments.map((p) => p.id)) + 1;
    const receiptNo = `RM-2026-${1000 + nextPayId}`;
    const organizer = state.users.find((u) => u.id === g.organizerId);
    const signer = (payload.signedByName || organizer?.name || 'Foreman').trim();

    const payment: PaymentRecord = {
      id: nextPayId,
      receiptNumber: receiptNo,
      chitGroupId: groupId,
      chitName: g.name,
      chitCode: g.code,
      memberSlotId: slot.id,
      ticketNumber: slot.ticketNumber,
      memberName: slot.memberName,
      memberPhone: slot.memberPhone,
      monthNumber: Number(payload.monthNumber),
      amountPaid: finalAmount,
      paidDate: payload.paidDate || getTodayIST(),
      paymentMethod: payload.paymentMethod || 'UPI',
      referenceNote: (payload.referenceNote || '').trim(),
      signedByName: signer,
      status: 'POSTED',
      voidReason: '',
      voidedAt: null,
      signatureHash: computeSimpleSig(receiptNo, slot.id, Number(payload.monthNumber), finalAmount),
      createdAt: getTodayIST(),
    };

    state.payments.push(payment);
    saveState(state);
    return { payment };
  },

  recordLift(
    groupId: number,
    payload: {
      monthNumber: number;
      winnerMemberSlotId: number;
      bidDiscount?: number;
      payoutDate?: string;
      payoutReference?: string;
    }
  ): { ok: boolean } {
    const state = readState();
    const g = state.chitGroups.find((x) => x.id === groupId);
    if (!g) throw new Error('Chit group not found.');

    const m = Number(payload.monthNumber);
    const slot = state.slots.find(
      (s) => s.id === Number(payload.winnerMemberSlotId) && s.chitGroupId === groupId
    );
    if (!slot) throw new Error('Selected ticket slot not found.');
    if (slot.prizedMonth !== null && slot.prizedMonth !== m) {
      throw new Error(`Ticket #${slot.ticketNumber} already lifted in Month ${slot.prizedMonth}.`);
    }

    const sched = state.schedules.find((s) => s.chitGroupId === groupId && s.monthNumber === m);
    if (!sched) throw new Error('Schedule month not found.');

    if (sched.winnerMemberSlotId && sched.winnerMemberSlotId !== slot.id) {
      const prevSlot = state.slots.find((s) => s.id === sched.winnerMemberSlotId);
      if (prevSlot) {
        prevSlot.prizedMonth = null;
        prevSlot.prizedAmount = null;
        prevSlot.payoutDate = null;
      }
    }

    const payoutDate = payload.payoutDate || getTodayIST();
    const payoutRef = (payload.payoutReference || `PAYOUT-M${m}`).trim();

    if (g.chitType === 'AUCTION') {
      const comm = Math.round((g.faceValue * g.foremanCommissionPct) / 100);
      const disc = Math.max(comm, Number(payload.bidDiscount || comm));
      const divPool = Math.max(0, disc - comm);
      const divPerMember = Math.round(divPool / g.totalSlots);
      const netPayable = Math.max(0, g.baseInstallment - divPerMember);
      const payoutVal = g.faceValue - disc;

      sched.nonPrizedInstallment = netPayable;
      sched.prizedInstallment = netPayable;
      sched.chitValue = payoutVal;
      sched.bidDiscount = disc;
      sched.dividendPerMember = divPerMember;
      sched.foremanCommission = comm;
      sched.isAuctionCompleted = true;
      sched.winnerMemberSlotId = slot.id;
      sched.winnerName = slot.memberName;
      sched.winnerTicketNumber = slot.ticketNumber;
      sched.payoutDate = payoutDate;
      sched.payoutReference = payoutRef;

      slot.prizedMonth = m;
      slot.prizedAmount = payoutVal;
      slot.payoutDate = payoutDate;
    } else {
      sched.isAuctionCompleted = true;
      sched.winnerMemberSlotId = slot.id;
      sched.winnerName = slot.memberName;
      sched.winnerTicketNumber = slot.ticketNumber;
      sched.payoutDate = payoutDate;
      sched.payoutReference = payoutRef;

      slot.prizedMonth = m;
      slot.prizedAmount = sched.chitValue;
      slot.payoutDate = payoutDate;
    }

    saveState(state);
    return { ok: true };
  },

  setCurrentMonth(groupId: number, currentMonth: number): { ok: boolean; currentMonth: number } {
    const state = readState();
    const g = state.chitGroups.find((x) => x.id === groupId);
    if (!g) throw new Error('Chit group not found.');
    g.currentMonth = Math.min(g.durationMonths, Math.max(1, Number(currentMonth)));
    saveState(state);
    return { ok: true, currentMonth: g.currentMonth };
  },

  getDues(userId: number): { dues: DueItem[]; today: string } {
    const state = readState();
    const today = getTodayIST();
    const viewer = state.users.find((u) => u.id === userId);
    const dues: DueItem[] = [];

    for (const g of state.chitGroups.filter((x) => x.status === 'ACTIVE' && (viewer?.role !== 'organizer' || x.organizerId === viewer.id))) {
      const organizer = state.users.find((u) => u.id === g.organizerId);
      const groupScheds = state.schedules
        .filter((s) => s.chitGroupId === g.id && s.monthNumber <= g.currentMonth)
        .sort((a, b) => a.monthNumber - b.monthNumber);

      const groupSlots = state.slots.filter(
        (s) =>
          s.chitGroupId === g.id &&
          (!viewer || viewer.role === 'organizer' || s.userId === viewer.id)
      );

      const paidSet = new Set(
        state.payments
          .filter((p) => p.chitGroupId === g.id)
          .map((p) => `${p.memberSlotId}:${p.monthNumber}`)
      );

      for (const sched of groupScheds) {
        const diffDays = daysBetween(today, sched.chitDate);
        for (const s of groupSlots) {
          if (paidSet.has(`${s.id}:${sched.monthNumber}`)) continue;
          const isPrized = s.prizedMonth !== null && s.prizedMonth < sched.monthNumber;
          const amountDue = getMemberPayableForMonth(g.chitType, sched, s.prizedMonth);
          dues.push({
            chitGroupId: g.id,
            chitCode: g.code,
            chitName: g.name,
            chitType: g.chitType,
            monthNumber: sched.monthNumber,
            dueDate: sched.chitDate,
            isOverdue: diffDays < 0,
            daysUntilDue: diffDays,
            memberSlotId: s.id,
            ticketNumber: s.ticketNumber,
            memberName: s.memberName,
            memberPhone: s.memberPhone,
            isPrizedSubscriber: isPrized,
            amountDue,
            organizerName: organizer?.name || 'Foreman',
          });
        }
      }
    }

    dues.sort((a, b) => a.daysUntilDue - b.daysUntilDue || a.ticketNumber - b.ticketNumber);
    return { dues, today };
  },

  getReceipts(userId: number): { receipts: PaymentRecord[] } {
    const state = readState();
    const viewer = state.users.find((u) => u.id === userId);
    let list = state.payments;

    if (viewer?.role === 'organizer') {
      const ownedIds = new Set(state.chitGroups.filter((g) => g.organizerId === viewer.id).map((g) => g.id));
      list = list.filter((p) => ownedIds.has(p.chitGroupId));
    }
    if (viewer && viewer.role === 'member') {
      const mySlotIds = new Set(
        state.slots.filter((s) => s.userId === viewer.id).map((s) => s.id)
      );
      list = list.filter((p) => mySlotIds.has(p.memberSlotId));
    }

    const sorted = [...list].sort(
      (a, b) => b.paidDate.localeCompare(a.paidDate) || b.id - a.id
    );
    return { receipts: sorted.slice(0, 150) };
  },

  exportBackupJson(): string {
    return JSON.stringify(readState(), null, 2);
  },

  importBackupJson(rawJson: string): void {
    const parsed = JSON.parse(rawJson) as LedgerState;
    if (!parsed || !Array.isArray(parsed.users) || !Array.isArray(parsed.chitGroups)) {
      throw new Error('Invalid Rare Mint ledger backup file.');
    }
    if (needsMigration(parsed)) migrateLedger(parsed);
    saveState(parsed);
  },

};
