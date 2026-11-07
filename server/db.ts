import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { LEGACY_DEMO_PHONES, isLegacyDemoUser } from '../src/utils/legacyDemo';
import { hashPin } from './auth/passwords';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'rare_mint.sqlite');
export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

function columnNames(table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name);
}

function tableExists(table: string): boolean {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(table) as { name: string } | undefined;
  return Boolean(row);
}

/**
 * Creates every table at its current (v2) shape when missing. Existing
 * databases keep their old shape and are upgraded by the migrations below.
 */
function createSchemaIfNotExists(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      pin_hash TEXT NOT NULL,
      pin_salt TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('developer', 'organizer', 'member')),
      city TEXT NOT NULL DEFAULT 'Hyderabad',
      is_active INTEGER NOT NULL DEFAULT 1,
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
      status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED', 'VOID')),
      void_reason TEXT NOT NULL DEFAULT '',
      voided_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);

    CREATE TABLE IF NOT EXISTS login_locks (
      phone TEXT PRIMARY KEY,
      failed_count INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id INTEGER,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id INTEGER,
      before_json TEXT,
      after_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS app_counters (
      name TEXT PRIMARY KEY,
      value INTEGER NOT NULL DEFAULT 0
    );
  `);
}

/** Schema version from which the database is known to be free of legacy demo data. */
const DEMO_PURGED_USER_VERSION = 1;

/** Schema version with hashed PINs, sessions, audit log and role/is_active columns. */
const AUTH_SCHEMA_USER_VERSION = 2;

function readUserVersion(): number {
  return (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
}

/**
 * Earlier builds seeded a demo organizer, 20 members, two chit groups and their
 * payments into fresh databases. Remove those records once, keeping real data.
 */
export function purgeLegacyDemoDataOnce(): void {
  const version = readUserVersion();
  if (version >= DEMO_PURGED_USER_VERSION) return;

  // Databases created at the v2 shape never carried demo data (plaintext PINs
  // no longer exist to identify it), so they are simply marked as purged.
  if (!columnNames('users').includes('pin')) {
    db.exec(`PRAGMA user_version = ${DEMO_PURGED_USER_VERSION}`);
    return;
  }

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

/**
 * Keeps AUTOINCREMENT sequences correct after a table rebuild, in case the
 * rename did not carry over sqlite_sequence.
 */
function fixSequence(table: string): void {
  db.exec(
    `INSERT OR REPLACE INTO sqlite_sequence (name, seq)
     SELECT '${table}', COALESCE(MAX(id), 0) FROM ${table}`
  );
}

/**
 * Rebuilds `users` with hashed PINs, the developer role and is_active. Each
 * legacy plaintext PIN is hashed once with a fresh per-user salt.
 */
function rebuildUsersForAuthSchema(): void {
  db.exec(`
    CREATE TABLE users_v2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      pin_hash TEXT NOT NULL,
      pin_salt TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('developer', 'organizer', 'member')),
      city TEXT NOT NULL DEFAULT 'Hyderabad',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  const rows = db.prepare('SELECT * FROM users').all() as Array<Record<string, unknown>>;
  const insert = db.prepare(
    `INSERT INTO users_v2 (id, name, phone, pin_hash, pin_salt, role, city, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
  );
  for (const row of rows) {
    const { hash, salt } = hashPin(String(row.pin ?? ''));
    insert.run(
      Number(row.id),
      String(row.name),
      String(row.phone),
      hash,
      salt,
      String(row.role),
      String(row.city || 'Hyderabad'),
      String(row.created_at)
    );
  }
  db.exec('DROP TABLE users;');
  db.exec('ALTER TABLE users_v2 RENAME TO users;');
  fixSequence('users');
}

/**
 * Rebuilds `payments` with a POSTED/VOID status and a partial unique index so a
 * voided payment no longer blocks re-recording the same month.
 */
function rebuildPaymentsForAuthSchema(): void {
  db.exec(`
    CREATE TABLE payments_v2 (
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
      status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED', 'VOID')),
      void_reason TEXT NOT NULL DEFAULT '',
      voided_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO payments_v2
      (id, receipt_number, chit_group_id, member_slot_id, month_number, amount_paid, paid_date,
       payment_method, reference_note, signed_by_name, signature_hash, created_at)
    SELECT id, receipt_number, chit_group_id, member_slot_id, month_number, amount_paid, paid_date,
           payment_method, reference_note, signed_by_name, signature_hash, created_at
    FROM payments;
    DROP TABLE payments;
    ALTER TABLE payments_v2 RENAME TO payments;
  `);
  fixSequence('payments');
}

/**
 * One-time v1 -> v2 migration: hash plaintext PINs, add the developer role and
 * is_active to users, add POSTED/VOID status to payments. The users and
 * payments tables are rebuilt inside a transaction (SQLite cannot alter a
 * CHECK constraint), then PRAGMA user_version is bumped.
 */
export function migrateToAuthSchema(): void {
  if (readUserVersion() >= AUTH_SCHEMA_USER_VERSION) return;

  const usersNeedRebuild = tableExists('users') && columnNames('users').includes('pin');
  const paymentsNeedRebuild = tableExists('payments') && !columnNames('payments').includes('status');

  // Table rebuilds drop and recreate tables referenced by foreign keys, so FK
  // enforcement is paused for the duration of the migration transaction.
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.exec('BEGIN');
    try {
      if (usersNeedRebuild) rebuildUsersForAuthSchema();
      if (paymentsNeedRebuild) rebuildPaymentsForAuthSchema();
      // Fresh databases land here too, so the partial unique index always ends
      // up in place exactly once the payments table has its status column.
      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS payments_open_month_idx
          ON payments (member_slot_id, month_number) WHERE status = 'POSTED';
      `);
      db.exec(`PRAGMA user_version = ${AUTH_SCHEMA_USER_VERSION}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

export function initDatabase(): void {
  createSchemaIfNotExists();
  purgeLegacyDemoDataOnce();
  migrateToAuthSchema();
}
