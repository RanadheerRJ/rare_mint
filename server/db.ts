import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  CLASSIC_5L_16M_SCHEDULE,
  addMonthsToDate,
  getMemberPayableForMonth,
} from '../src/utils/chitFinance';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'rare_mint.sqlite');
export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function makeSignatureHash(receiptNo: string, slotId: number, month: number, amount: number): string {
  const digest = crypto
    .createHash('sha256')
    .update(`${receiptNo}:${slotId}:${month}:${amount}:RAREMINT`)
    .digest('hex')
    .slice(0, 8)
    .toUpperCase();
  return `RM-SIG-${digest}`;
}

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      pin TEXT NOT NULL DEFAULT '1234',
      role TEXT NOT NULL CHECK (role IN ('organizer', 'member')),
      city TEXT NOT NULL DEFAULT 'Hyderabad',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chit_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      chit_type TEXT NOT NULL CHECK (chit_type IN ('FIXED_TABLE', 'AUCTION')),
      face_value INTEGER NOT NULL,
      duration_months INTEGER NOT NULL,
      total_slots INTEGER NOT NULL,
      current_month INTEGER NOT NULL DEFAULT 1,
      start_date TEXT NOT NULL,
      due_day_of_month INTEGER NOT NULL DEFAULT 10,
      base_installment INTEGER NOT NULL,
      foreman_commission_pct REAL NOT NULL DEFAULT 5,
      max_bid_pct REAL NOT NULL DEFAULT 35,
      organizer_id INTEGER NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED')),
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chit_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chit_group_id INTEGER NOT NULL REFERENCES chit_groups(id) ON DELETE CASCADE,
      month_number INTEGER NOT NULL,
      chit_date TEXT NOT NULL,
      non_prized_installment INTEGER NOT NULL,
      chit_value INTEGER NOT NULL,
      prized_installment INTEGER NOT NULL,
      bid_discount INTEGER,
      dividend_per_member INTEGER,
      foreman_commission INTEGER,
      is_auction_completed INTEGER NOT NULL DEFAULT 0,
      winner_member_slot_id INTEGER,
      payout_date TEXT,
      payout_reference TEXT,
      UNIQUE(chit_group_id, month_number)
    );

    CREATE TABLE IF NOT EXISTS member_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chit_group_id INTEGER NOT NULL REFERENCES chit_groups(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      ticket_number INTEGER NOT NULL,
      joined_date TEXT NOT NULL,
      prized_month INTEGER,
      prized_amount INTEGER,
      payout_date TEXT,
      UNIQUE(chit_group_id, ticket_number)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_number TEXT NOT NULL UNIQUE,
      chit_group_id INTEGER NOT NULL REFERENCES chit_groups(id) ON DELETE CASCADE,
      member_slot_id INTEGER NOT NULL REFERENCES member_slots(id) ON DELETE CASCADE,
      month_number INTEGER NOT NULL,
      amount_paid INTEGER NOT NULL,
      paid_date TEXT NOT NULL,
      payment_method TEXT NOT NULL CHECK (payment_method IN ('UPI', 'CASH', 'BANK_TRANSFER', 'CHEQUE')),
      reference_note TEXT NOT NULL DEFAULT '',
      signed_by_name TEXT NOT NULL,
      signature_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(member_slot_id, month_number)
    );
  `);

  const existingCount = db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number };
  if (existingCount.cnt === 0) {
    seedInitialData();
  }
}

function seedInitialData(): void {
  const insertUser = db.prepare(
    'INSERT INTO users (name, phone, pin, role, city) VALUES (?, ?, ?, ?, ?)'
  );

  // 1. Primary Organizer (Foreman)
  const orgRes = insertUser.run('Rajeshwar Rao', '9848011111', '1234', 'organizer', 'Hyderabad');
  const organizerId = Number(orgRes.lastInsertRowid);

  // 2. Subscribers (19 realistic members in Hyderabad/Telangana)
  const memberSeeds = [
    { name: 'Arjun Varma', phone: '9848022222', city: 'Jubilee Hills, Hyderabad' },     // Demo Member 1 (Non-Prized)
    { name: 'Ananya Sharma', phone: '9848033333', city: 'Banjara Hills, Hyderabad' },   // Demo Member 2 (Prized M4)
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
    { name: 'deepika Reddy', phone: '9849099101', city: 'Sainikpuri, Hyderabad' },
    { name: 'Suresh Nair', phone: '9849010203', city: 'Tolichowki, Hyderabad' },
    { name: 'Meenakshi Iyer', phone: '9849020304', city: 'Somajiguda, Hyderabad' },
    { name: 'Naveen Chary', phone: '9849030405', city: 'LB Nagar, Hyderabad' },
  ];

  const memberIds: number[] = [];
  for (const m of memberSeeds) {
    const fixedName = m.name.charAt(0).toUpperCase() + m.name.slice(1);
    const res = insertUser.run(fixedName, m.phone, '1234', 'member', m.city);
    memberIds.push(Number(res.lastInsertRowid));
  }

  // =========================================================================
  // GROUP 1: Exact ₹5,00,000 / 16-Month Fixed-Table Passbook Chit (from Photo)
  // Started 2026-06-10 -> Month 6 due on 2026-11-10 (Today is 2026-11-07)
  // =========================================================================
  const g1Res = db
    .prepare(
      `INSERT INTO chit_groups
        (code, name, chit_type, face_value, duration_months, total_slots, current_month,
         start_date, due_day_of_month, base_installment, foreman_commission_pct, max_bid_pct,
         organizer_id, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      'RM-5L-16M',
      'Jubilee Hills ₹5,00,000 Classic Slab Chit',
      'FIXED_TABLE',
      500000,
      16,
      16,
      6,
      '2026-06-10',
      10,
      37000,
      5,
      0,
      organizerId,
      'ACTIVE',
      'Fixed passbook schedule: Non-Prized tapers from ₹37,000/- to ₹11,300/- (Total ₹4,50,000/-); Prized members pay fixed ₹37,000/-; Month 15 & 16 bonus payouts ₹5,15,000/- and ₹5,30,000/-.'
    );
  const g1Id = Number(g1Res.lastInsertRowid);

  const insertSlot = db.prepare(
    `INSERT INTO member_slots (chit_group_id, user_id, ticket_number, joined_date, prized_month, prized_amount, payout_date)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  // Enroll 16 members into Group 1 (Tickets #1..#16)
  // Winners for Months 1..5:
  // M1 -> Ticket #3 (Srinivas Reddy)
  // M2 -> Ticket #7 (Kavitha Rao)
  // M3 -> Ticket #11 (Mahesh Goud)
  // M4 -> Ticket #2 (Ananya Sharma - Demo Member 2!)
  // M5 -> Ticket #9 (Prakash Verma)
  const g1WinnersByTicket: Record<number, { month: number; date: string }> = {
    3: { month: 1, date: '2026-06-12' },
    7: { month: 2, date: '2026-07-12' },
    11: { month: 3, date: '2026-08-12' },
    2: { month: 4, date: '2026-09-12' },
    9: { month: 5, date: '2026-10-12' },
  };

  const g1SlotIdsByTicket: Record<number, number> = {};
  for (let t = 1; t <= 16; t++) {
    const win = g1WinnersByTicket[t];
    const slotRes = insertSlot.run(
      g1Id,
      memberIds[t - 1],
      t,
      '2026-06-01',
      win ? win.month : null,
      win ? 500000 : null,
      win ? win.date : null
    );
    g1SlotIdsByTicket[t] = Number(slotRes.lastInsertRowid);
  }

  const insertSchedule = db.prepare(
    `INSERT INTO chit_schedules
      (chit_group_id, month_number, chit_date, non_prized_installment, chit_value, prized_installment,
       bid_discount, dividend_per_member, foreman_commission, is_auction_completed,
       winner_member_slot_id, payout_date, payout_reference)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const g1WinnerTicketByMonth: Record<number, number> = {
    1: 3,
    2: 7,
    3: 11,
    4: 2,
    5: 9,
  };

  for (const row of CLASSIC_5L_16M_SCHEDULE) {
    const chitDate = addMonthsToDate('2026-06-10', row.monthNumber - 1, 10);
    const winTicket = g1WinnerTicketByMonth[row.monthNumber];
    const winnerSlotId = winTicket ? g1SlotIdsByTicket[winTicket] : null;
    const payoutDate = winTicket ? g1WinnersByTicket[winTicket].date : null;
    const payoutRef = winTicket ? `NEFT-RM5L-M0${row.monthNumber}` : null;

    insertSchedule.run(
      g1Id,
      row.monthNumber,
      chitDate,
      row.nonPrizedInstallment,
      row.chitValue,
      row.prizedInstallment,
      null,
      null,
      null,
      winnerSlotId ? 1 : 0,
      winnerSlotId,
      payoutDate,
      payoutRef
    );
  }

  // Record payments for Group 1:
  // Months 1..5: All 16 slots paid in full!
  // Month 6 (due 2026-11-10, 3 days away): 9 slots already paid early (Nov 4–7), 7 slots pending (including Arjun Varma Slot #1 and Ananya Sharma Slot #2 so both see live Month 6 action!)
  const insertPayment = db.prepare(
    `INSERT INTO payments
      (receipt_number, chit_group_id, member_slot_id, month_number, amount_paid, paid_date,
       payment_method, reference_note, signed_by_name, signature_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  let receiptSeq = 1001;
  const methods = ['UPI', 'BANK_TRANSFER', 'CASH', 'UPI'] as const;

  for (let m = 1; m <= 6; m++) {
    const schedRow = CLASSIC_5L_16M_SCHEDULE[m - 1];
    const baseDate = addMonthsToDate('2026-06-10', m - 1, 8);
    for (let t = 1; t <= 16; t++) {
      // Leave Tickets 1, 2, 5, 8, 12, 14, 16 unpaid in Month 6 so due reminders & collection progress look realistic
      if (m === 6 && [1, 2, 5, 8, 12, 14, 16].includes(t)) {
        continue;
      }
      const win = g1WinnersByTicket[t];
      const prizedMonth = win ? win.month : null;
      const amount = getMemberPayableForMonth(
        'FIXED_TABLE',
        {
          monthNumber: m,
          nonPrizedInstallment: schedRow.nonPrizedInstallment,
          prizedInstallment: schedRow.prizedInstallment,
        },
        prizedMonth
      );
      const slotId = g1SlotIdsByTicket[t];
      const receiptNo = `RM-2026-${receiptSeq++}`;
      const method = methods[(t + m) % methods.length];
      const paidDate = m === 6 ? '2026-11-06' : baseDate;
      const sigHash = makeSignatureHash(receiptNo, slotId, m, amount);

      insertPayment.run(
        receiptNo,
        g1Id,
        slotId,
        m,
        amount,
        paidDate,
        method,
        method === 'UPI' ? `UPI/${420000 + receiptSeq}` : 'Verified at Chit Desk',
        'Rajeshwar Rao',
        sigHash
      );
    }
  }

  // =========================================================================
  // GROUP 2: ₹2,00,000 / 20-Month Monthly Auction Chit (Madhapur Business Circle)
  // Started 2026-08-05 -> Month 4 due on 2026-11-05 (2 days ago -> remaining unpaid are OVERDUE!)
  // =========================================================================
  const g2Res = db
    .prepare(
      `INSERT INTO chit_groups
        (code, name, chit_type, face_value, duration_months, total_slots, current_month,
         start_date, due_day_of_month, base_installment, foreman_commission_pct, max_bid_pct,
         organizer_id, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      'RM-2L-20M',
      'Madhapur ₹2,00,000 Monthly Dividend Auction Chit',
      'AUCTION',
      200000,
      20,
      20,
      4,
      '2026-08-05',
      5,
      10000,
      5,
      35,
      organizerId,
      'ACTIVE',
      'Monthly bidding on the 5th of every month. 5% Foreman commission (₹10,000/-); excess bid discount is distributed equally among all 20 subscribers as monthly dividend.'
    );
  const g2Id = Number(g2Res.lastInsertRowid);

  // Auctions completed for Months 1..4:
  // M1: Bid ₹66,000 -> Comm ₹10,000 -> DivPool ₹56,000 -> Div ₹2,800 -> Net Payable ₹7,200, Payout ₹1,34,000 (Ticket #6)
  // M2: Bid ₹62,000 -> Comm ₹10,000 -> DivPool ₹52,000 -> Div ₹2,600 -> Net Payable ₹7,400, Payout ₹1,38,000 (Ticket #14)
  // M3: Bid ₹58,000 -> Comm ₹10,000 -> DivPool ₹48,000 -> Div ₹2,400 -> Net Payable ₹7,600, Payout ₹1,42,000 (Ticket #19)
  // M4: Bid ₹54,000 -> Comm ₹10,000 -> DivPool ₹44,000 -> Div ₹2,200 -> Net Payable ₹7,800, Payout ₹1,46,000 (Ticket #10)
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

  const g2SlotIdsByTicket: Record<number, number> = {};
  for (let t = 1; t <= 20; t++) {
    const win = g2WinnersByTicket[t];
    const slotRes = insertSlot.run(
      g2Id,
      memberIds[t - 1],
      t,
      '2026-08-01',
      win ? win.month : null,
      win ? win.payout : null,
      win ? win.date : null
    );
    g2SlotIdsByTicket[t] = Number(slotRes.lastInsertRowid);
  }

  for (let m = 1; m <= 20; m++) {
    const chitDate = addMonthsToDate('2026-08-05', m - 1, 5);
    const auc = g2Auctions[m];
    if (auc) {
      insertSchedule.run(
        g2Id,
        m,
        chitDate,
        auc.net,
        auc.payout,
        auc.net,
        auc.bid,
        auc.div,
        10000,
        1,
        g2SlotIdsByTicket[auc.ticket],
        auc.date,
        `IMPS-RM2L-M0${m}`
      );
    } else {
      insertSchedule.run(
        g2Id,
        m,
        chitDate,
        10000,
        200000,
        10000,
        null,
        null,
        null,
        0,
        null,
        null,
        null
      );
    }
  }

  // Payments for Group 2: Months 1..3 all paid; Month 4 (due 2026-11-05) paid by 16 members, 4 overdue (Tickets 4, 8, 15, 18)
  // Note: Arjun Varma (Ticket #1) already paid Month 4 in RM-2L-20M so he has a fresh Nov 2026 receipt too!
  for (let m = 1; m <= 4; m++) {
    const auc = g2Auctions[m];
    const paidDate = addMonthsToDate('2026-08-05', m - 1, 4);
    for (let t = 1; t <= 20; t++) {
      if (m === 4 && [4, 8, 15, 18].includes(t)) {
        continue;
      }
      const slotId = g2SlotIdsByTicket[t];
      const receiptNo = `RM-2026-${receiptSeq++}`;
      const method = methods[(t + m + 1) % methods.length];
      const sigHash = makeSignatureHash(receiptNo, slotId, m, auc.net);

      insertPayment.run(
        receiptNo,
        g2Id,
        slotId,
        m,
        auc.net,
        m === 4 ? '2026-11-05' : paidDate,
        method,
        method === 'UPI' ? `UPI/${710000 + receiptSeq}` : 'Auction Desk Collection',
        'Rajeshwar Rao',
        sigHash
      );
    }
  }
}
