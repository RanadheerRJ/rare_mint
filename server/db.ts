import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { LEGACY_DEMO_PHONES, isLegacyDemoUser } from '../src/utils/legacyDemo';

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
      pin TEXT NOT NULL,
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

  purgeLegacyDemoDataOnce();
}

/** Schema version from which the database is known to be free of legacy demo data. */
const DEMO_PURGED_USER_VERSION = 1;

/**
 * Earlier builds seeded a demo organizer, 20 members, two chit groups and their
 * payments into fresh databases. Remove those records once, keeping real data.
 */
export function purgeLegacyDemoDataOnce(): void {
  const { user_version: version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  if (version >= DEMO_PURGED_USER_VERSION) return;

  const phones = [...LEGACY_DEMO_PHONES];
  const candidates = db
    .prepare(`SELECT id, phone, pin FROM users WHERE phone IN (${phones.map(() => '?').join(',')})`)
    .all(...phones) as Array<{ id: number; phone: string; pin: string }>;
  const demoUserIds = candidates.filter(isLegacyDemoUser).map((u) => u.id);

  db.exec('BEGIN');
  try {
    if (demoUserIds.length > 0) {
      db.exec('CREATE TEMP TABLE IF NOT EXISTS legacy_demo_users (id INTEGER PRIMARY KEY)');
      db.exec('CREATE TEMP TABLE IF NOT EXISTS legacy_demo_groups (id INTEGER PRIMARY KEY)');
      db.exec('CREATE TEMP TABLE IF NOT EXISTS legacy_demo_slots (id INTEGER PRIMARY KEY, user_id INTEGER)');
      db.exec('DELETE FROM legacy_demo_users; DELETE FROM legacy_demo_groups; DELETE FROM legacy_demo_slots;');
      const insertUser = db.prepare('INSERT INTO legacy_demo_users (id) VALUES (?)');
      for (const id of demoUserIds) insertUser.run(id);

      db.exec(`
        INSERT INTO legacy_demo_groups (id)
          SELECT id FROM chit_groups WHERE organizer_id IN (SELECT id FROM legacy_demo_users);
        INSERT INTO legacy_demo_slots (id, user_id)
          SELECT id, user_id FROM member_slots
          WHERE chit_group_id IN (SELECT id FROM legacy_demo_groups)
             OR user_id IN (SELECT id FROM legacy_demo_users);

        DELETE FROM payments
          WHERE chit_group_id IN (SELECT id FROM legacy_demo_groups)
             OR member_slot_id IN (SELECT id FROM legacy_demo_slots);
        UPDATE chit_schedules
          SET bid_discount = NULL, dividend_per_member = NULL, foreman_commission = NULL,
              is_auction_completed = 0, winner_member_slot_id = NULL,
              payout_date = NULL, payout_reference = NULL
          WHERE winner_member_slot_id IN (SELECT id FROM legacy_demo_slots);
        DELETE FROM chit_schedules WHERE chit_group_id IN (SELECT id FROM legacy_demo_groups);
        DELETE FROM member_slots WHERE id IN (SELECT id FROM legacy_demo_slots);
        DELETE FROM chit_groups WHERE id IN (SELECT id FROM legacy_demo_groups);

        -- Members that only existed inside removed demo groups.
        DELETE FROM users
          WHERE id IN (SELECT id FROM legacy_demo_users)
             OR (role = 'member'
                 AND id IN (SELECT user_id FROM legacy_demo_slots)
                 AND id NOT IN (SELECT user_id FROM member_slots));

        DROP TABLE legacy_demo_users;
        DROP TABLE legacy_demo_groups;
        DROP TABLE legacy_demo_slots;
      `);
    }
    db.exec(`PRAGMA user_version = ${DEMO_PURGED_USER_VERSION}`);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
