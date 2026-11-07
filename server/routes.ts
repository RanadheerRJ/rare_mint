import { Router, Request, Response } from 'express';
import { db, makeSignatureHash } from './db';
import { addMonthsToDate, getMemberPayableForMonth } from '../src/utils/chitFinance';
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
} from '../src/types';

export const apiRouter = Router();

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

function mapUserRow(row: Record<string, unknown>): User {
  return {
    id: Number(row.id),
    name: String(row.name),
    phone: String(row.phone),
    role: row.role as 'organizer' | 'member',
    city: String(row.city || 'Hyderabad'),
    createdAt: String(row.created_at),
  };
}

function buildChitSummary(groupRow: Record<string, unknown>, viewerUser?: User | null): ChitGroupSummary {
  const groupId = Number(groupRow.id);
  const chitType = groupRow.chit_type as ChitType;
  const currentMonth = Number(groupRow.current_month);

  const slots = db
    .prepare(
      `SELECT ms.*, u.name as member_name, u.phone as member_phone
       FROM member_slots ms
       JOIN users u ON u.id = ms.user_id
       WHERE ms.chit_group_id = ?
       ORDER BY ms.ticket_number ASC`
    )
    .all(groupId) as Array<Record<string, unknown>>;

  const currentSched = db
    .prepare(
      `SELECT * FROM chit_schedules WHERE chit_group_id = ? AND month_number = ?`
    )
    .get(groupId, currentMonth) as Record<string, unknown> | undefined;

  const currentPayments = db
    .prepare(
      `SELECT member_slot_id, amount_paid FROM payments WHERE chit_group_id = ? AND month_number = ?`
    )
    .all(groupId, currentMonth) as Array<{ member_slot_id: number; amount_paid: number }>;

  const paidBySlot = new Map<number, number>();
  for (const p of currentPayments) {
    paidBySlot.set(Number(p.member_slot_id), Number(p.amount_paid));
  }

  let currentMonthTarget = 0;
  let currentMonthCollected = 0;
  let currentMonthPaidCount = 0;

  if (currentSched) {
    const schedInfo = {
      monthNumber: currentMonth,
      nonPrizedInstallment: Number(currentSched.non_prized_installment),
      prizedInstallment: Number(currentSched.prized_installment),
    };
    for (const s of slots) {
      const slotId = Number(s.id);
      const prizedMonth = s.prized_month !== null ? Number(s.prized_month) : null;
      const expected = getMemberPayableForMonth(chitType, schedInfo, prizedMonth);
      currentMonthTarget += expected;
      if (paidBySlot.has(slotId)) {
        currentMonthCollected += paidBySlot.get(slotId)!;
        currentMonthPaidCount += 1;
      }
    }
  }

  let mySlots: ChitGroupSummary['mySlots'] = undefined;
  if (viewerUser) {
    const userSlots = slots.filter((s) => Number(s.user_id) === viewerUser.id);
    if (userSlots.length > 0) {
      mySlots = userSlots.map((s) => {
        const slotId = Number(s.id);
        const prizedMonth = s.prized_month !== null ? Number(s.prized_month) : null;
        const prizedAmount = s.prized_amount !== null ? Number(s.prized_amount) : null;
        const due = currentSched
          ? getMemberPayableForMonth(
              chitType,
              {
                monthNumber: currentMonth,
                nonPrizedInstallment: Number(currentSched.non_prized_installment),
                prizedInstallment: Number(currentSched.prized_installment),
              },
              prizedMonth
            )
          : 0;
        const totalRow = db
          .prepare(`SELECT COALESCE(SUM(amount_paid), 0) as total FROM payments WHERE member_slot_id = ?`)
          .get(slotId) as { total: number };

        return {
          slotId,
          ticketNumber: Number(s.ticket_number),
          prizedMonth,
          prizedAmount,
          currentMonthDue: due,
          currentMonthPaid: paidBySlot.has(slotId),
          totalPaidSoFar: Number(totalRow.total),
        };
      });
    }
  }

  return {
    id: groupId,
    code: String(groupRow.code),
    name: String(groupRow.name),
    chitType,
    faceValue: Number(groupRow.face_value),
    durationMonths: Number(groupRow.duration_months),
    totalSlots: Number(groupRow.total_slots),
    enrolledSlots: slots.length,
    currentMonth,
    startDate: String(groupRow.start_date),
    dueDayOfMonth: Number(groupRow.due_day_of_month),
    baseInstallment: Number(groupRow.base_installment),
    foremanCommissionPct: Number(groupRow.foreman_commission_pct),
    maxBidPct: Number(groupRow.max_bid_pct),
    organizerId: Number(groupRow.organizer_id),
    organizerName: String(groupRow.organizer_name || 'Foreman'),
    organizerPhone: String(groupRow.organizer_phone || ''),
    status: groupRow.status as 'ACTIVE' | 'COMPLETED',
    notes: String(groupRow.notes || ''),
    currentMonthTarget,
    currentMonthCollected,
    currentMonthPaidCount,
    nextChitDate: currentSched ? String(currentSched.chit_date) : String(groupRow.start_date),
    mySlots,
  };
}

apiRouter.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true, today: getTodayIST() });
});

apiRouter.post('/auth/login', (req: Request, res: Response) => {
  const { phone, pin } = req.body as { phone?: string; pin?: string };
  const cleanPhone = (phone || '').replace(/\D/g, '').slice(-10);
  if (!cleanPhone || !pin) {
    res.status(400).json({ error: 'Please enter a valid 10-digit mobile number and PIN.' });
    return;
  }

  const row = db
    .prepare('SELECT * FROM users WHERE phone = ? AND pin = ?')
    .get(cleanPhone, String(pin).trim()) as Record<string, unknown> | undefined;

  if (!row) {
    res.status(401).json({ error: 'Invalid mobile number or PIN.' });
    return;
  }

  res.json({ user: mapUserRow(row) });
});

apiRouter.post('/auth/register', (req: Request, res: Response) => {
  const { name, phone, pin, role, city } = req.body as {
    name?: string;
    phone?: string;
    pin?: string;
    role?: string;
    city?: string;
  };

  const cleanPhone = (phone || '').replace(/\D/g, '').slice(-10);
  if (!name?.trim() || cleanPhone.length !== 10 || !/^\d{4}$/.test(pin || '')) {
    res.status(400).json({ error: 'Name, 10-digit mobile number, and 4-digit PIN are required.' });
    return;
  }

  const existing = db.prepare('SELECT id FROM users WHERE phone = ?').get(cleanPhone);
  if (existing) {
    res.status(409).json({ error: 'An account with this mobile number already exists. Please sign in.' });
    return;
  }

  const validRole = role === 'organizer' ? 'organizer' : 'member';
  const result = db
    .prepare('INSERT INTO users (name, phone, pin, role, city) VALUES (?, ?, ?, ?, ?)')
    .run(name.trim(), cleanPhone, pin!.trim(), validRole, (city || 'Hyderabad').trim());

  const newUser = db
    .prepare('SELECT * FROM users WHERE id = ?')
    .get(Number(result.lastInsertRowid)) as Record<string, unknown>;

  res.status(201).json({ user: mapUserRow(newUser) });
});

apiRouter.get('/users/members', (_req: Request, res: Response) => {
  const rows = db
    .prepare(`SELECT * FROM users WHERE role = 'member' ORDER BY name ASC`)
    .all() as Array<Record<string, unknown>>;
  res.json({ members: rows.map(mapUserRow) });
});

apiRouter.get('/chits', (req: Request, res: Response) => {
  const userId = Number(req.query.userId || 0);
  const includeAll = req.query.includeAll === '1';

  let viewer: User | null = null;
  if (userId) {
    const uRow = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as
      | Record<string, unknown>
      | undefined;
    if (uRow) viewer = mapUserRow(uRow);
  }

  let groupRows: Array<Record<string, unknown>>;
  if (viewer && viewer.role === 'member' && !includeAll) {
    groupRows = db
      .prepare(
        `SELECT DISTINCT cg.*, u.name as organizer_name, u.phone as organizer_phone
         FROM chit_groups cg
         JOIN users u ON u.id = cg.organizer_id
         JOIN member_slots ms ON ms.chit_group_id = cg.id
         WHERE ms.user_id = ?
         ORDER BY cg.id ASC`
      )
      .all(viewer.id) as Array<Record<string, unknown>>;
  } else if (viewer?.role === 'organizer') {
    groupRows = db.prepare(`SELECT cg.*, u.name as organizer_name, u.phone as organizer_phone FROM chit_groups cg JOIN users u ON u.id = cg.organizer_id WHERE cg.organizer_id = ? ORDER BY cg.id ASC`).all(viewer.id) as Array<Record<string, unknown>>;
  } else {
    groupRows = db
      .prepare(
        `SELECT cg.*, u.name as organizer_name, u.phone as organizer_phone
         FROM chit_groups cg
         JOIN users u ON u.id = cg.organizer_id
         ORDER BY cg.id ASC`
      )
      .all() as Array<Record<string, unknown>>;
  }

  const groups = groupRows.map((r) => buildChitSummary(r, viewer));
  res.json({ groups, today: getTodayIST() });
});

apiRouter.get('/chits/:id', (req: Request, res: Response) => {
  const groupId = Number(req.params.id);
  const userId = Number(req.query.userId || 0);

  let viewer: User | null = null;
  if (userId) {
    const uRow = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as
      | Record<string, unknown>
      | undefined;
    if (uRow) viewer = mapUserRow(uRow);
  }

  const groupRow = db
    .prepare(
      `SELECT cg.*, u.name as organizer_name, u.phone as organizer_phone
       FROM chit_groups cg
       JOIN users u ON u.id = cg.organizer_id
       WHERE cg.id = ?`
    )
    .get(groupId) as Record<string, unknown> | undefined;

  if (!groupRow) {
    res.status(404).json({ error: 'Chit group not found.' });
    return;
  }

  const summary = buildChitSummary(groupRow, viewer);

  const schedRows = db
    .prepare(
      `SELECT cs.*, ms.ticket_number as winner_ticket_number, wu.name as winner_name
       FROM chit_schedules cs
       LEFT JOIN member_slots ms ON ms.id = cs.winner_member_slot_id
       LEFT JOIN users wu ON wu.id = ms.user_id
       WHERE cs.chit_group_id = ?
       ORDER BY cs.month_number ASC`
    )
    .all(groupId) as Array<Record<string, unknown>>;

  const schedule: ScheduleRow[] = schedRows.map((r) => ({
    id: Number(r.id),
    chitGroupId: Number(r.chit_group_id),
    monthNumber: Number(r.month_number),
    chitDate: String(r.chit_date),
    nonPrizedInstallment: Number(r.non_prized_installment),
    chitValue: Number(r.chit_value),
    prizedInstallment: Number(r.prized_installment),
    bidDiscount: r.bid_discount !== null ? Number(r.bid_discount) : null,
    dividendPerMember: r.dividend_per_member !== null ? Number(r.dividend_per_member) : null,
    foremanCommission: r.foreman_commission !== null ? Number(r.foreman_commission) : null,
    isAuctionCompleted: Boolean(r.is_auction_completed),
    winnerMemberSlotId: r.winner_member_slot_id !== null ? Number(r.winner_member_slot_id) : null,
    winnerName: r.winner_name ? String(r.winner_name) : null,
    winnerTicketNumber: r.winner_ticket_number !== null ? Number(r.winner_ticket_number) : null,
    payoutDate: r.payout_date ? String(r.payout_date) : null,
    payoutReference: r.payout_reference ? String(r.payout_reference) : null,
  }));

  const slotRows = db
    .prepare(
      `SELECT ms.*, u.name as member_name, u.phone as member_phone
       FROM member_slots ms
       JOIN users u ON u.id = ms.user_id
       WHERE ms.chit_group_id = ?
       ORDER BY ms.ticket_number ASC`
    )
    .all(groupId) as Array<Record<string, unknown>>;

  const slots: MemberSlot[] = slotRows.map((r) => ({
    id: Number(r.id),
    chitGroupId: Number(r.chit_group_id),
    userId: Number(r.user_id),
    ticketNumber: Number(r.ticket_number),
    memberName: String(r.member_name),
    memberPhone: String(r.member_phone),
    joinedDate: String(r.joined_date),
    prizedMonth: r.prized_month !== null ? Number(r.prized_month) : null,
    prizedAmount: r.prized_amount !== null ? Number(r.prized_amount) : null,
    payoutDate: r.payout_date ? String(r.payout_date) : null,
  }));

  const payRows = db
    .prepare(
      `SELECT p.*, ms.ticket_number, u.name as member_name, u.phone as member_phone,
              cg.name as chit_name, cg.code as chit_code
       FROM payments p
       JOIN member_slots ms ON ms.id = p.member_slot_id
       JOIN users u ON u.id = ms.user_id
       JOIN chit_groups cg ON cg.id = p.chit_group_id
       WHERE p.chit_group_id = ?
       ORDER BY p.month_number DESC, ms.ticket_number ASC`
    )
    .all(groupId) as Array<Record<string, unknown>>;

  const payments: PaymentRecord[] = payRows.map((r) => ({
    id: Number(r.id),
    receiptNumber: String(r.receipt_number),
    chitGroupId: Number(r.chit_group_id),
    chitName: String(r.chit_name),
    chitCode: String(r.chit_code),
    memberSlotId: Number(r.member_slot_id),
    ticketNumber: Number(r.ticket_number),
    memberName: String(r.member_name),
    memberPhone: String(r.member_phone),
    monthNumber: Number(r.month_number),
    amountPaid: Number(r.amount_paid),
    paidDate: String(r.paid_date),
    paymentMethod: r.payment_method as PaymentMethod,
    referenceNote: String(r.reference_note || ''),
    signedByName: String(r.signed_by_name),
    signatureHash: String(r.signature_hash),
    createdAt: String(r.created_at),
  }));

  const detail: ChitGroupDetail = {
    ...summary,
    schedule,
    slots,
    payments,
  };

  res.json({ group: detail });
});

apiRouter.post('/chits', (req: Request, res: Response) => {
  const {
    name,
    code,
    chitType,
    faceValue,
    durationMonths,
    startDate,
    dueDayOfMonth,
    baseInstallment,
    foremanCommissionPct,
    maxBidPct,
    organizerId,
    notes,
    schedule,
  } = req.body as {
    name?: string;
    code?: string;
    chitType?: ChitType;
    faceValue?: number;
    durationMonths?: number;
    startDate?: string;
    dueDayOfMonth?: number;
    baseInstallment?: number;
    foremanCommissionPct?: number;
    maxBidPct?: number;
    organizerId?: number;
    notes?: string;
    schedule?: Array<{
      monthNumber: number;
      chitDate?: string;
      nonPrizedInstallment: number;
      chitValue: number;
      prizedInstallment: number;
    }>;
  };

  if (!name?.trim() || !faceValue || !durationMonths || !startDate || !organizerId) {
    res.status(400).json({ error: 'Group name, face value, duration, start date, and organizer are required.' });
    return;
  }

  const finalCode =
    (code || '').trim().toUpperCase() ||
    `RM-${Math.round(faceValue / 1000)}K-${durationMonths}M-${Math.floor(100 + Math.random() * 900)}`;

  const existingCode = db.prepare('SELECT id FROM chit_groups WHERE code = ?').get(finalCode);
  if (existingCode) {
    res.status(409).json({ error: `Chit code ${finalCode} already exists. Please choose a unique code.` });
    return;
  }

  const validType: ChitType = chitType === 'AUCTION' ? 'AUCTION' : 'FIXED_TABLE';
  const dueDay = Number(dueDayOfMonth || Number(startDate.split('-')[2]) || 10);
  const baseInst = Number(baseInstallment || Math.round(faceValue / durationMonths));

  const groupRes = db
    .prepare(
      `INSERT INTO chit_groups
        (code, name, chit_type, face_value, duration_months, total_slots, current_month,
         start_date, due_day_of_month, base_installment, foreman_commission_pct, max_bid_pct,
         organizer_id, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)`
    )
    .run(
      finalCode,
      name.trim(),
      validType,
      Number(faceValue),
      Number(durationMonths),
      Number(durationMonths),
      startDate,
      dueDay,
      baseInst,
      Number(foremanCommissionPct ?? 5),
      Number(maxBidPct ?? (validType === 'AUCTION' ? 35 : 0)),
      Number(organizerId),
      (notes || '').trim()
    );

  const newGroupId = Number(groupRes.lastInsertRowid);

  const insertSched = db.prepare(
    `INSERT INTO chit_schedules
      (chit_group_id, month_number, chit_date, non_prized_installment, chit_value, prized_installment, is_auction_completed)
     VALUES (?, ?, ?, ?, ?, ?, 0)`
  );

  for (let m = 1; m <= Number(durationMonths); m++) {
    const provided = schedule?.find((s) => Number(s.monthNumber) === m);
    const rowDate = provided?.chitDate || addMonthsToDate(startDate, m - 1, dueDay);
    insertSched.run(
      newGroupId,
      m,
      rowDate,
      Number(provided?.nonPrizedInstallment ?? baseInst),
      Number(provided?.chitValue ?? faceValue),
      Number(provided?.prizedInstallment ?? baseInst)
    );
  }

  const createdRow = db
    .prepare(
      `SELECT cg.*, u.name as organizer_name, u.phone as organizer_phone
       FROM chit_groups cg
       JOIN users u ON u.id = cg.organizer_id
       WHERE cg.id = ?`
    )
    .get(newGroupId) as Record<string, unknown>;

  res.status(201).json({ group: buildChitSummary(createdRow) });
});

apiRouter.post('/chits/:id/slots', (req: Request, res: Response) => {
  const groupId = Number(req.params.id);
  const { ticketNumber, userId, newMemberName, newMemberPhone, newMemberCity, newMemberPin, organizerId } = req.body as {
    ticketNumber?: number;
    organizerId?: number;
    newMemberPin?: string;
    userId?: number;
    newMemberName?: string;
    newMemberPhone?: string;
    newMemberCity?: string;
  };

  const groupRow = db.prepare('SELECT * FROM chit_groups WHERE id = ?').get(groupId) as
    | Record<string, unknown>
    | undefined;
  if (!groupRow) {
    res.status(404).json({ error: 'Chit group not found.' });
    return;
  }

  const owner = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'organizer'").get(Number(organizerId || 0));
  if (!owner || Number(groupRow.organizer_id) !== Number(organizerId)) {
    res.status(403).json({ error: 'Only the chit owner can add members.' });
    return;
  }
  const tNum = Number(ticketNumber);
  if (!Number.isInteger(tNum) || tNum < 1 || tNum > Number(groupRow.total_slots)) {
    res.status(400).json({ error: `Ticket number must be between 1 and ${groupRow.total_slots}.` });
    return;
  }

  const taken = db
    .prepare('SELECT id FROM member_slots WHERE chit_group_id = ? AND ticket_number = ?')
    .get(groupId, tNum);
  if (taken) {
    res.status(409).json({ error: `Ticket #${tNum} is already assigned in this chit group.` });
    return;
  }

  let targetUserId = Number(userId || 0);
  if (!targetUserId) {
    const cleanPhone = (newMemberPhone || '').replace(/\D/g, '').slice(-10);
    if (!newMemberName?.trim() || cleanPhone.length !== 10) {
      res.status(400).json({ error: 'Select an existing member or enter name and 10-digit phone number.' });
      return;
    }

    const existingUser = db.prepare('SELECT id FROM users WHERE phone = ?').get(cleanPhone) as
      | { id: number }
      | undefined;
    if (existingUser) {
      res.status(409).json({ error: 'A user with this phone already exists. Select them from the existing directory.' });
      return;
    } else {
      if (!/^\d{4}$/.test(newMemberPin || '')) {
        res.status(400).json({ error: 'Enter a 4-digit PIN for the new member.' });
        return;
      }
      const uRes = db
        .prepare('INSERT INTO users (name, phone, pin, role, city) VALUES (?, ?, ?, ?, ?)')
        .run(
          newMemberName.trim(),
          cleanPhone,
          newMemberPin!,
          'member',
          (newMemberCity || 'Hyderabad').trim()
        );
      targetUserId = Number(uRes.lastInsertRowid);
    }
  }

  const targetMember = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'member'").get(targetUserId);
  if (!targetMember) {
    res.status(404).json({ error: 'Member not found.' });
    return;
  }

  const slotRes = db
    .prepare(
      `INSERT INTO member_slots (chit_group_id, user_id, ticket_number, joined_date)
       VALUES (?, ?, ?, ?)`
    )
    .run(groupId, targetUserId, tNum, getTodayIST());

  const slotRow = db
    .prepare(
      `SELECT ms.*, u.name as member_name, u.phone as member_phone
       FROM member_slots ms
       JOIN users u ON u.id = ms.user_id
       WHERE ms.id = ?`
    )
    .get(Number(slotRes.lastInsertRowid)) as Record<string, unknown>;

  res.status(201).json({
    slot: {
      id: Number(slotRow.id),
      chitGroupId: Number(slotRow.chit_group_id),
      userId: Number(slotRow.user_id),
      ticketNumber: Number(slotRow.ticket_number),
      memberName: String(slotRow.member_name),
      memberPhone: String(slotRow.member_phone),
      joinedDate: String(slotRow.joined_date),
      prizedMonth: null,
      prizedAmount: null,
      payoutDate: null,
    },
  });
});

apiRouter.post('/chits/:id/payments', (req: Request, res: Response) => {
  const groupId = Number(req.params.id);
  const { memberSlotId, monthNumber, amountPaid, paidDate, paymentMethod, referenceNote, signedByName } =
    req.body as {
      memberSlotId?: number;
      monthNumber?: number;
      amountPaid?: number;
      paidDate?: string;
      paymentMethod?: PaymentMethod;
      referenceNote?: string;
      signedByName?: string;
    };

  if (!memberSlotId || !monthNumber) {
    res.status(400).json({ error: 'Member ticket slot and month number are required.' });
    return;
  }

  const groupRow = db
    .prepare(
      `SELECT cg.*, u.name as organizer_name
       FROM chit_groups cg
       JOIN users u ON u.id = cg.organizer_id
       WHERE cg.id = ?`
    )
    .get(groupId) as Record<string, unknown> | undefined;

  if (!groupRow) {
    res.status(404).json({ error: 'Chit group not found.' });
    return;
  }

  const slotRow = db
    .prepare('SELECT * FROM member_slots WHERE id = ? AND chit_group_id = ?')
    .get(Number(memberSlotId), groupId) as Record<string, unknown> | undefined;
  if (!slotRow) {
    res.status(404).json({ error: 'Member ticket slot not found in this chit group.' });
    return;
  }

  const duplicate = db
    .prepare('SELECT receipt_number FROM payments WHERE member_slot_id = ? AND month_number = ?')
    .get(Number(memberSlotId), Number(monthNumber)) as { receipt_number: string } | undefined;
  if (duplicate) {
    res
      .status(409)
      .json({ error: `Month ${monthNumber} is already paid under Receipt ${duplicate.receipt_number}.` });
    return;
  }

  const schedRow = db
    .prepare('SELECT * FROM chit_schedules WHERE chit_group_id = ? AND month_number = ?')
    .get(groupId, Number(monthNumber)) as Record<string, unknown> | undefined;
  if (!schedRow) {
    res.status(404).json({ error: `Schedule month ${monthNumber} not found.` });
    return;
  }

  const prizedMonth = slotRow.prized_month !== null ? Number(slotRow.prized_month) : null;
  const expectedAmount = getMemberPayableForMonth(
    groupRow.chit_type as ChitType,
    {
      monthNumber: Number(monthNumber),
      nonPrizedInstallment: Number(schedRow.non_prized_installment),
      prizedInstallment: Number(schedRow.prized_installment),
    },
    prizedMonth
  );

  const finalAmount = Number(amountPaid || expectedAmount);
  const maxIdRow = db.prepare('SELECT COALESCE(MAX(id), 0) as max_id FROM payments').get() as {
    max_id: number;
  };
  const receiptNo = `RM-2026-${1001 + Number(maxIdRow.max_id)}`;
  const finalDate = paidDate || getTodayIST();
  const validMethod: PaymentMethod = ['UPI', 'CASH', 'BANK_TRANSFER', 'CHEQUE'].includes(
    String(paymentMethod)
  )
    ? (paymentMethod as PaymentMethod)
    : 'UPI';
  const signer = (signedByName || String(groupRow.organizer_name)).trim();
  const sigHash = makeSignatureHash(receiptNo, Number(memberSlotId), Number(monthNumber), finalAmount);

  const payRes = db
    .prepare(
      `INSERT INTO payments
        (receipt_number, chit_group_id, member_slot_id, month_number, amount_paid, paid_date,
         payment_method, reference_note, signed_by_name, signature_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      receiptNo,
      groupId,
      Number(memberSlotId),
      Number(monthNumber),
      finalAmount,
      finalDate,
      validMethod,
      (referenceNote || '').trim(),
      signer,
      sigHash
    );

  const fullPay = db
    .prepare(
      `SELECT p.*, ms.ticket_number, u.name as member_name, u.phone as member_phone,
              cg.name as chit_name, cg.code as chit_code
       FROM payments p
       JOIN member_slots ms ON ms.id = p.member_slot_id
       JOIN users u ON u.id = ms.user_id
       JOIN chit_groups cg ON cg.id = p.chit_group_id
       WHERE p.id = ?`
    )
    .get(Number(payRes.lastInsertRowid)) as Record<string, unknown>;

  res.status(201).json({
    payment: {
      id: Number(fullPay.id),
      receiptNumber: String(fullPay.receipt_number),
      chitGroupId: Number(fullPay.chit_group_id),
      chitName: String(fullPay.chit_name),
      chitCode: String(fullPay.chit_code),
      memberSlotId: Number(fullPay.member_slot_id),
      ticketNumber: Number(fullPay.ticket_number),
      memberName: String(fullPay.member_name),
      memberPhone: String(fullPay.member_phone),
      monthNumber: Number(fullPay.month_number),
      amountPaid: Number(fullPay.amount_paid),
      paidDate: String(fullPay.paid_date),
      paymentMethod: fullPay.payment_method as PaymentMethod,
      referenceNote: String(fullPay.reference_note || ''),
      signedByName: String(fullPay.signed_by_name),
      signatureHash: String(fullPay.signature_hash),
      createdAt: String(fullPay.created_at),
    },
  });
});

apiRouter.post('/chits/:id/lift', (req: Request, res: Response) => {
  const groupId = Number(req.params.id);
  const { monthNumber, winnerMemberSlotId, bidDiscount, payoutDate, payoutReference } = req.body as {
    monthNumber?: number;
    winnerMemberSlotId?: number;
    bidDiscount?: number;
    payoutDate?: string;
    payoutReference?: string;
  };

  if (!monthNumber || !winnerMemberSlotId) {
    res.status(400).json({ error: 'Month number and winning member ticket are required.' });
    return;
  }

  const groupRow = db.prepare('SELECT * FROM chit_groups WHERE id = ?').get(groupId) as
    | Record<string, unknown>
    | undefined;
  if (!groupRow) {
    res.status(404).json({ error: 'Chit group not found.' });
    return;
  }

  const slotRow = db
    .prepare('SELECT * FROM member_slots WHERE id = ? AND chit_group_id = ?')
    .get(Number(winnerMemberSlotId), groupId) as Record<string, unknown> | undefined;
  if (!slotRow) {
    res.status(404).json({ error: 'Selected member slot does not belong to this chit group.' });
    return;
  }

  if (slotRow.prized_month !== null && Number(slotRow.prized_month) !== Number(monthNumber)) {
    res.status(409).json({
      error: `Ticket #${slotRow.ticket_number} already lifted the chit in Month ${slotRow.prized_month}.`,
    });
    return;
  }

  const schedRow = db
    .prepare('SELECT * FROM chit_schedules WHERE chit_group_id = ? AND month_number = ?')
    .get(groupId, Number(monthNumber)) as Record<string, unknown> | undefined;
  if (!schedRow) {
    res.status(404).json({ error: `Schedule month ${monthNumber} not found.` });
    return;
  }

  // If another member was previously set as winner for this exact month, clear them first
  if (
    schedRow.winner_member_slot_id !== null &&
    Number(schedRow.winner_member_slot_id) !== Number(winnerMemberSlotId)
  ) {
    db.prepare(
      'UPDATE member_slots SET prized_month = NULL, prized_amount = NULL, payout_date = NULL WHERE id = ?'
    ).run(Number(schedRow.winner_member_slot_id));
  }

  const chitType = groupRow.chit_type as ChitType;
  const finalPayoutDate = payoutDate || getTodayIST();
  const finalRef = (payoutReference || `PAYOUT-M${monthNumber}`).trim();

  if (chitType === 'AUCTION') {
    const faceValue = Number(groupRow.face_value);
    const totalSlots = Number(groupRow.total_slots);
    const baseInst = Number(groupRow.base_installment);
    const commPct = Number(groupRow.foreman_commission_pct);
    const commission = Math.round((faceValue * commPct) / 100);
    const discount = Math.max(commission, Number(bidDiscount || commission));
    const divPool = Math.max(0, discount - commission);
    const divPerMember = Math.round(divPool / totalSlots);
    const netPayable = Math.max(0, baseInst - divPerMember);
    const payoutVal = faceValue - discount;

    db.prepare(
      `UPDATE chit_schedules
       SET non_prized_installment = ?, prized_installment = ?, chit_value = ?,
           bid_discount = ?, dividend_per_member = ?, foreman_commission = ?,
           is_auction_completed = 1, winner_member_slot_id = ?, payout_date = ?, payout_reference = ?
       WHERE chit_group_id = ? AND month_number = ?`
    ).run(
      netPayable,
      netPayable,
      payoutVal,
      discount,
      divPerMember,
      commission,
      Number(winnerMemberSlotId),
      finalPayoutDate,
      finalRef,
      groupId,
      Number(monthNumber)
    );

    db.prepare(
      `UPDATE member_slots SET prized_month = ?, prized_amount = ?, payout_date = ? WHERE id = ?`
    ).run(Number(monthNumber), payoutVal, finalPayoutDate, Number(winnerMemberSlotId));
  } else {
    const payoutVal = Number(schedRow.chit_value);
    db.prepare(
      `UPDATE chit_schedules
       SET is_auction_completed = 1, winner_member_slot_id = ?, payout_date = ?, payout_reference = ?
       WHERE chit_group_id = ? AND month_number = ?`
    ).run(Number(winnerMemberSlotId), finalPayoutDate, finalRef, groupId, Number(monthNumber));

    db.prepare(
      `UPDATE member_slots SET prized_month = ?, prized_amount = ?, payout_date = ? WHERE id = ?`
    ).run(Number(monthNumber), payoutVal, finalPayoutDate, Number(winnerMemberSlotId));
  }

  res.json({ ok: true });
});

apiRouter.post('/chits/:id/current-month', (req: Request, res: Response) => {
  const groupId = Number(req.params.id);
  const { currentMonth } = req.body as { currentMonth?: number };

  const groupRow = db.prepare('SELECT * FROM chit_groups WHERE id = ?').get(groupId) as
    | Record<string, unknown>
    | undefined;
  if (!groupRow) {
    res.status(404).json({ error: 'Chit group not found.' });
    return;
  }

  const m = Number(currentMonth);
  const duration = Number(groupRow.duration_months);
  if (!m || m < 1 || m > duration) {
    res.status(400).json({ error: `Current month must be between 1 and ${duration}.` });
    return;
  }

  db.prepare('UPDATE chit_groups SET current_month = ? WHERE id = ?').run(m, groupId);
  res.json({ ok: true, currentMonth: m });
});

apiRouter.get('/dues', (req: Request, res: Response) => {
  const userId = Number(req.query.userId || 0);
  const today = getTodayIST();

  let viewer: User | null = null;
  if (userId) {
    const uRow = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as
      | Record<string, unknown>
      | undefined;
    if (uRow) viewer = mapUserRow(uRow);
  }

  const groups = db
    .prepare(
      `SELECT cg.*, u.name as organizer_name
       FROM chit_groups cg
       JOIN users u ON u.id = cg.organizer_id
       WHERE cg.status = 'ACTIVE'
       ORDER BY cg.id ASC`
    )
    .all() as Array<Record<string, unknown>>;

  const dues: DueItem[] = [];

  for (const g of groups) {
    if (viewer?.role === 'organizer' && Number(g.organizer_id) !== viewer.id) continue;
    const groupId = Number(g.id);
    const chitType = g.chit_type as ChitType;
    const currentMonth = Number(g.current_month);

    const schedules = db
      .prepare(
        `SELECT * FROM chit_schedules WHERE chit_group_id = ? AND month_number <= ? ORDER BY month_number ASC`
      )
      .all(groupId, currentMonth) as Array<Record<string, unknown>>;

    const slotsQuery =
      viewer && viewer.role === 'member'
        ? db
            .prepare(
              `SELECT ms.*, u.name as member_name, u.phone as member_phone
               FROM member_slots ms
               JOIN users u ON u.id = ms.user_id
               WHERE ms.chit_group_id = ? AND ms.user_id = ?
               ORDER BY ms.ticket_number ASC`
            )
            .all(groupId, viewer.id)
        : db
            .prepare(
              `SELECT ms.*, u.name as member_name, u.phone as member_phone
               FROM member_slots ms
               JOIN users u ON u.id = ms.user_id
               WHERE ms.chit_group_id = ?
               ORDER BY ms.ticket_number ASC`
            )
            .all(groupId);

    const slots = slotsQuery as Array<Record<string, unknown>>;

    const paidSet = new Set<string>();
    const payments = db
      .prepare(`SELECT member_slot_id, month_number FROM payments WHERE chit_group_id = ?`)
      .all(groupId) as Array<{ member_slot_id: number; month_number: number }>;
    for (const p of payments) {
      paidSet.add(`${p.member_slot_id}:${p.month_number}`);
    }

    for (const sched of schedules) {
      const m = Number(sched.month_number);
      const dueDate = String(sched.chit_date);
      const diffDays = daysBetween(today, dueDate);

      for (const s of slots) {
        const slotId = Number(s.id);
        if (paidSet.has(`${slotId}:${m}`)) continue;

        const prizedMonth = s.prized_month !== null ? Number(s.prized_month) : null;
        const isPrized = prizedMonth !== null && prizedMonth < m;
        const amountDue = getMemberPayableForMonth(
          chitType,
          {
            monthNumber: m,
            nonPrizedInstallment: Number(sched.non_prized_installment),
            prizedInstallment: Number(sched.prized_installment),
          },
          prizedMonth
        );

        dues.push({
          chitGroupId: groupId,
          chitCode: String(g.code),
          chitName: String(g.name),
          chitType,
          monthNumber: m,
          dueDate,
          isOverdue: diffDays < 0,
          daysUntilDue: diffDays,
          memberSlotId: slotId,
          ticketNumber: Number(s.ticket_number),
          memberName: String(s.member_name),
          memberPhone: String(s.member_phone),
          isPrizedSubscriber: isPrized,
          amountDue,
          organizerName: String(g.organizer_name),
        });
      }
    }
  }

  dues.sort((a, b) => a.daysUntilDue - b.daysUntilDue || a.ticketNumber - b.ticketNumber);
  res.json({ dues, today });
});

apiRouter.get('/receipts', (req: Request, res: Response) => {
  const userId = Number(req.query.userId || 0);

  let viewer: User | null = null;
  if (userId) {
    const uRow = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as
      | Record<string, unknown>
      | undefined;
    if (uRow) viewer = mapUserRow(uRow);
  }

  const rows =
    viewer && viewer.role === 'member'
      ? (db
          .prepare(
            `SELECT p.*, ms.ticket_number, u.name as member_name, u.phone as member_phone,
                    cg.name as chit_name, cg.code as chit_code
             FROM payments p
             JOIN member_slots ms ON ms.id = p.member_slot_id
             JOIN users u ON u.id = ms.user_id
             JOIN chit_groups cg ON cg.id = p.chit_group_id
             WHERE ms.user_id = ?
             ORDER BY p.paid_date DESC, p.id DESC`
          )
          .all(viewer.id) as Array<Record<string, unknown>>)
      : viewer?.role === 'organizer'
      ? (db.prepare(`SELECT p.*, ms.ticket_number, u.name as member_name, u.phone as member_phone,
                    cg.name as chit_name, cg.code as chit_code
             FROM payments p JOIN member_slots ms ON ms.id = p.member_slot_id
             JOIN users u ON u.id = ms.user_id JOIN chit_groups cg ON cg.id = p.chit_group_id
             WHERE cg.organizer_id = ? ORDER BY p.paid_date DESC, p.id DESC LIMIT 150`).all(viewer.id) as Array<Record<string, unknown>>)
      : (db
          .prepare(
            `SELECT p.*, ms.ticket_number, u.name as member_name, u.phone as member_phone,
                    cg.name as chit_name, cg.code as chit_code
             FROM payments p
             JOIN member_slots ms ON ms.id = p.member_slot_id
             JOIN users u ON u.id = ms.user_id
             JOIN chit_groups cg ON cg.id = p.chit_group_id
             ORDER BY p.paid_date DESC, p.id DESC
             LIMIT 150`
          )
          .all() as Array<Record<string, unknown>>);

  const receipts: PaymentRecord[] = rows.map((r) => ({
    id: Number(r.id),
    receiptNumber: String(r.receipt_number),
    chitGroupId: Number(r.chit_group_id),
    chitName: String(r.chit_name),
    chitCode: String(r.chit_code),
    memberSlotId: Number(r.member_slot_id),
    ticketNumber: Number(r.ticket_number),
    memberName: String(r.member_name),
    memberPhone: String(r.member_phone),
    monthNumber: Number(r.month_number),
    amountPaid: Number(r.amount_paid),
    paidDate: String(r.paid_date),
    paymentMethod: r.payment_method as PaymentMethod,
    referenceNote: String(r.reference_note || ''),
    signedByName: String(r.signed_by_name),
    signatureHash: String(r.signature_hash),
    createdAt: String(r.created_at),
  }));

  res.json({ receipts });
});
