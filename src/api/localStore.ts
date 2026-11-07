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
  CLASSIC_5L_16M_SCHEDULE,
  addMonthsToDate,
  getMemberPayableForMonth,
} from '../utils/chitFinance';

const STORAGE_KEY = 'rm_static_ledger_v1';

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

function createSeedState(): LedgerState {
  const now = '2026-11-07 09:00:00';
  const users: StoredUser[] = [
    {
      id: 1,
      name: 'Rajeshwar Rao',
      phone: '9848011111',
      pin: '1234',
      role: 'organizer',
      city: 'Hyderabad',
      createdAt: now,
    },
  ];

  const memberSeeds = [
    { name: 'Arjun Varma', phone: '9848022222', city: 'Jubilee Hills, Hyderabad' },
    { name: 'Ananya Sharma', phone: '9848033333', city: 'Banjara Hills, Hyderabad' },
    { name: 'Srinivas Reddy', phone: '9848044444', city: 'Madhapur, Hyderabad' },
    { name: 'Lakshmi Narayana', phone: '9848055555', city: 'Kukatpally, Hyderabad' },
    { name: 'Divya Teja', phone: '9848066666', city: 'Gachibowli, Hyderabad' },
    { name: 'Venkatesh Babu', phone: '9848077777', city: 'Kondapur, Hyderabad' },
    { name: 'Kavitha Rao', phone: '9848088888', city: 'Begumpet, Hyderabad' },
    { name: 'Ramesh Chandra', phone: '9848099999', city: 'Ameerpet, Hyderabad' },
    { name: 'Prakash Verma', phone: '9849011223', city: 'Manikonda, Hyderabad' },
    { name: 'Swathi Priya', phone: '9849022334', city: 'Miyapur, Hyderabad' },
    { name: 'Mahesh Goud', phone: '9849033445', city: 'Secunderabad' },
    { name: 'Harish Kumar', phone: '9849044556', city: 'Nallagandla, Hyderabad' },
    { name: 'Padmavathi Devi', phone: '9849055667', city: 'Dilsukhnagar, Hyderabad' },
    { name: 'Kiran Kumar', phone: '9849066778', city: 'Hitech City, Hyderabad' },
    { name: 'Bhavani Prasad', phone: '9849077889', city: 'Uppal, Hyderabad' },
    { name: 'Nikhil Chowdary', phone: '9849088990', city: 'Kompally, Hyderabad' },
    { name: 'Deepika Reddy', phone: '9849099101', city: 'Sainikpuri, Hyderabad' },
    { name: 'Suresh Nair', phone: '9849010203', city: 'Tolichowki, Hyderabad' },
    { name: 'Meenakshi Iyer', phone: '9849020304', city: 'Somajiguda, Hyderabad' },
    { name: 'Naveen Chary', phone: '9849030405', city: 'LB Nagar, Hyderabad' },
  ];

  memberSeeds.forEach((m, idx) => {
    users.push({
      id: idx + 2,
      name: m.name,
      phone: m.phone,
      pin: '1234',
      role: 'member',
      city: m.city,
      createdAt: now,
    });
  });

  const chitGroups: StoredChitGroup[] = [
    {
      id: 1,
      code: 'RM-5L-16M',
      name: 'Jubilee Hills ₹5,00,000 Classic Slab Chit',
      chitType: 'FIXED_TABLE',
      faceValue: 500000,
      durationMonths: 16,
      totalSlots: 16,
      currentMonth: 6,
      startDate: '2026-06-10',
      dueDayOfMonth: 10,
      baseInstallment: 37000,
      foremanCommissionPct: 5,
      maxBidPct: 0,
      organizerId: 1,
      status: 'ACTIVE',
      notes:
        'Fixed passbook schedule: Non-Prized tapers from ₹37,000/- to ₹11,300/- (Total ₹4,50,000/-); Prized members pay fixed ₹37,000/-; Month 15 & 16 bonus payouts ₹5,15,000/- and ₹5,30,000/-.',
      createdAt: now,
    },
    {
      id: 2,
      code: 'RM-2L-20M',
      name: 'Madhapur ₹2,00,000 Monthly Dividend Auction Chit',
      chitType: 'AUCTION',
      faceValue: 200000,
      durationMonths: 20,
      totalSlots: 20,
      currentMonth: 4,
      startDate: '2026-08-05',
      dueDayOfMonth: 5,
      baseInstallment: 10000,
      foremanCommissionPct: 5,
      maxBidPct: 35,
      organizerId: 1,
      status: 'ACTIVE',
      notes:
        'Monthly bidding on the 5th of every month. 5% Foreman commission (₹10,000/-); excess bid discount is distributed equally among all 20 subscribers as monthly dividend.',
      createdAt: now,
    },
  ];

  const slots: MemberSlot[] = [];
  const schedules: ScheduleRow[] = [];
  const payments: PaymentRecord[] = [];

  // Group 1 Slots & Schedules
  const g1WinnersByTicket: Record<number, { month: number; date: string }> = {
    3: { month: 1, date: '2026-06-12' },
    7: { month: 2, date: '2026-07-12' },
    11: { month: 3, date: '2026-08-12' },
    2: { month: 4, date: '2026-09-12' },
    9: { month: 5, date: '2026-10-12' },
  };

  let nextSlotId = 1;
  const g1SlotByTicket: Record<number, MemberSlot> = {};
  for (let t = 1; t <= 16; t++) {
    const member = users[t]; // users[1]..users[16]
    const win = g1WinnersByTicket[t];
    const slot: MemberSlot = {
      id: nextSlotId++,
      chitGroupId: 1,
      userId: member.id,
      ticketNumber: t,
      memberName: member.name,
      memberPhone: member.phone,
      joinedDate: '2026-06-01',
      prizedMonth: win ? win.month : null,
      prizedAmount: win ? 500000 : null,
      payoutDate: win ? win.date : null,
    };
    slots.push(slot);
    g1SlotByTicket[t] = slot;
  }

  const g1WinnerTicketByMonth: Record<number, number> = {
    1: 3,
    2: 7,
    3: 11,
    4: 2,
    5: 9,
  };

  let nextSchedId = 1;
  for (const row of CLASSIC_5L_16M_SCHEDULE) {
    const chitDate = addMonthsToDate('2026-06-10', row.monthNumber - 1, 10);
    const winTicket = g1WinnerTicketByMonth[row.monthNumber];
    const winSlot = winTicket ? g1SlotByTicket[winTicket] : null;
    schedules.push({
      id: nextSchedId++,
      chitGroupId: 1,
      monthNumber: row.monthNumber,
      chitDate,
      nonPrizedInstallment: row.nonPrizedInstallment,
      chitValue: row.chitValue,
      prizedInstallment: row.prizedInstallment,
      bidDiscount: null,
      dividendPerMember: null,
      foremanCommission: null,
      isAuctionCompleted: Boolean(winSlot),
      winnerMemberSlotId: winSlot ? winSlot.id : null,
      winnerName: winSlot ? winSlot.memberName : null,
      winnerTicketNumber: winSlot ? winSlot.ticketNumber : null,
      payoutDate: winTicket ? g1WinnersByTicket[winTicket].date : null,
      payoutReference: winTicket ? `NEFT-RM5L-M0${row.monthNumber}` : null,
    });
  }

  let nextPayId = 1;
  let receiptSeq = 1001;
  const methods: PaymentMethod[] = ['UPI', 'BANK_TRANSFER', 'CASH', 'UPI'];

  for (let m = 1; m <= 6; m++) {
    const schedRow = CLASSIC_5L_16M_SCHEDULE[m - 1];
    const baseDate = addMonthsToDate('2026-06-10', m - 1, 8);
    for (let t = 1; t <= 16; t++) {
      if (m === 6 && [1, 2, 5, 8, 12, 14, 16].includes(t)) continue;
      const slot = g1SlotByTicket[t];
      const amount = getMemberPayableForMonth('FIXED_TABLE', schedRow, slot.prizedMonth);
      const receiptNo = `RM-2026-${receiptSeq++}`;
      const method = methods[(t + m) % methods.length];
      payments.push({
        id: nextPayId++,
        receiptNumber: receiptNo,
        chitGroupId: 1,
        chitName: chitGroups[0].name,
        chitCode: chitGroups[0].code,
        memberSlotId: slot.id,
        ticketNumber: slot.ticketNumber,
        memberName: slot.memberName,
        memberPhone: slot.memberPhone,
        monthNumber: m,
        amountPaid: amount,
        paidDate: m === 6 ? '2026-11-06' : baseDate,
        paymentMethod: method,
        referenceNote: method === 'UPI' ? `UPI/${420000 + receiptSeq}` : 'Verified at Chit Desk',
        signedByName: 'Rajeshwar Rao',
        signatureHash: computeSimpleSig(receiptNo, slot.id, m, amount),
        createdAt: now,
      });
    }
  }

  // Group 2 Slots & Schedules
  const g2Auctions: Record<
    number,
    { ticket: number; bid: number; div: number; net: number; payout: number; date: string }
  > = {
    1: { ticket: 6, bid: 66000, div: 2800, net: 7200, payout: 134000, date: '2026-08-06' },
    2: { ticket: 14, bid: 62000, div: 2600, net: 7400, payout: 138000, date: '2026-09-06' },
    3: { ticket: 19, bid: 58000, div: 2400, net: 7600, payout: 142000, date: '2026-10-06' },
    4: { ticket: 10, bid: 54000, div: 2200, net: 7800, payout: 146000, date: '2026-11-05' },
  };
  const g2WinnersByTicket: Record<number, { month: number; payout: number; date: string }> = {
    6: { month: 1, payout: 134000, date: '2026-08-06' },
    14: { month: 2, payout: 138000, date: '2026-09-06' },
    19: { month: 3, payout: 142000, date: '2026-10-06' },
    10: { month: 4, payout: 146000, date: '2026-11-05' },
  };

  const g2SlotByTicket: Record<number, MemberSlot> = {};
  for (let t = 1; t <= 20; t++) {
    const member = users[t];
    const win = g2WinnersByTicket[t];
    const slot: MemberSlot = {
      id: nextSlotId++,
      chitGroupId: 2,
      userId: member.id,
      ticketNumber: t,
      memberName: member.name,
      memberPhone: member.phone,
      joinedDate: '2026-08-01',
      prizedMonth: win ? win.month : null,
      prizedAmount: win ? win.payout : null,
      payoutDate: win ? win.date : null,
    };
    slots.push(slot);
    g2SlotByTicket[t] = slot;
  }

  for (let m = 1; m <= 20; m++) {
    const chitDate = addMonthsToDate('2026-08-05', m - 1, 5);
    const auc = g2Auctions[m];
    const winSlot = auc ? g2SlotByTicket[auc.ticket] : null;
    schedules.push({
      id: nextSchedId++,
      chitGroupId: 2,
      monthNumber: m,
      chitDate,
      nonPrizedInstallment: auc ? auc.net : 10000,
      chitValue: auc ? auc.payout : 200000,
      prizedInstallment: auc ? auc.net : 10000,
      bidDiscount: auc ? auc.bid : null,
      dividendPerMember: auc ? auc.div : null,
      foremanCommission: auc ? 10000 : null,
      isAuctionCompleted: Boolean(auc),
      winnerMemberSlotId: winSlot ? winSlot.id : null,
      winnerName: winSlot ? winSlot.memberName : null,
      winnerTicketNumber: winSlot ? winSlot.ticketNumber : null,
      payoutDate: auc ? auc.date : null,
      payoutReference: auc ? `IMPS-RM2L-M0${m}` : null,
    });
  }

  for (let m = 1; m <= 4; m++) {
    const auc = g2Auctions[m];
    const paidDate = addMonthsToDate('2026-08-05', m - 1, 4);
    for (let t = 1; t <= 20; t++) {
      if (m === 4 && [4, 8, 15, 18].includes(t)) continue;
      const slot = g2SlotByTicket[t];
      const receiptNo = `RM-2026-${receiptSeq++}`;
      const method = methods[(t + m + 1) % methods.length];
      payments.push({
        id: nextPayId++,
        receiptNumber: receiptNo,
        chitGroupId: 2,
        chitName: chitGroups[1].name,
        chitCode: chitGroups[1].code,
        memberSlotId: slot.id,
        ticketNumber: slot.ticketNumber,
        memberName: slot.memberName,
        memberPhone: slot.memberPhone,
        monthNumber: m,
        amountPaid: auc.net,
        paidDate: m === 4 ? '2026-11-05' : paidDate,
        paymentMethod: method,
        referenceNote: method === 'UPI' ? `UPI/${710000 + receiptSeq}` : 'Auction Desk Collection',
        signedByName: 'Rajeshwar Rao',
        signatureHash: computeSimpleSig(receiptNo, slot.id, m, auc.net),
        createdAt: now,
      });
    }
  }

  return {
    version: 1,
    users,
    chitGroups,
    schedules,
    slots,
    payments,
  };
}

function readState(): LedgerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LedgerState;
      if (parsed && Array.isArray(parsed.users) && Array.isArray(parsed.chitGroups)) {
        return parsed;
      }
    }
  } catch {
    // Fall back to fresh seed
  }
  const seeded = createSeedState();
  saveState(seeded);
  return seeded;
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
  getDefaultOrganizer(): User {
    const state = readState();
    const org = state.users.find((u) => u.role === 'organizer') || state.users[0];
    return toPublicUser(org);
  },

  getDemoAccounts() {
    const state = readState();
    const phones = ['9848011111', '9848022222', '9848033333'];
    const accounts = phones
      .map((phone) => {
        const u = state.users.find((x) => x.phone === phone);
        if (!u) return null;
        let badge = 'Chit Organizer / Foreman';
        if (phone === '9848022222') badge = 'Member · Non-Prized Saver (2 Chits)';
        if (phone === '9848033333') badge = 'Member · Prized in Month 4 (₹5L Lifted)';
        return { ...toPublicUser(u), badge };
      })
      .filter(Boolean) as Array<User & { badge: string }>;
    return { accounts };
  },

  login(phone: string, pin: string): { user: User } {
    const state = readState();
    const cleanPhone = (phone || '').replace(/\D/g, '').slice(-10);
    const found = state.users.find((u) => u.phone === cleanPhone && u.pin === String(pin).trim());
    if (!found) {
      throw new Error('Invalid mobile number or PIN. (Demo accounts use PIN 1234)');
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
    const state = readState();
    const cleanPhone = (payload.phone || '').replace(/\D/g, '').slice(-10);
    if (!payload.name?.trim() || cleanPhone.length !== 10 || !payload.pin?.trim()) {
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
      `RM-${Math.round(payload.faceValue / 1000)}K-${payload.durationMonths}M`;

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
      userId?: number;
      newMemberName?: string;
      newMemberPhone?: string;
      newMemberCity?: string;
    }
  ): { slot: MemberSlot } {
    const state = readState();
    const g = state.chitGroups.find((x) => x.id === groupId);
    if (!g) throw new Error('Chit group not found.');

    const tNum = Number(payload.ticketNumber);
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
      if (!targetUser) {
        const nextUserId = Math.max(0, ...state.users.map((u) => u.id)) + 1;
        targetUser = {
          id: nextUserId,
          name: payload.newMemberName.trim(),
          phone: cleanPhone,
          pin: '1234',
          role: 'member',
          city: (payload.newMemberCity || 'Hyderabad').trim(),
          createdAt: getTodayIST(),
        };
        state.users.push(targetUser);
      }
    }

    if (!targetUser) throw new Error('Member not found.');

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

    for (const g of state.chitGroups.filter((x) => x.status === 'ACTIVE')) {
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
    saveState(parsed);
  },

  resetToDefaultSeed(): void {
    saveState(createSeedState());
  },
};
