import type { Db, Row } from './util';
import { toNumber, toText } from './util';
import type { LoginLockRecord, LoginLocksRepository, SessionRecord, SessionsRepository } from '../types';

function mapSession(row: Row): SessionRecord {
  return {
    id: toNumber(row.id),
    userId: toNumber(row.user_id),
    tokenHash: toText(row.token_hash),
    expiresAt: toText(row.expires_at),
    createdAt: toText(row.created_at),
  };
}

export function createSqliteSessionsRepository(db: Db): SessionsRepository {
  return {
    insert(userId, tokenHash, expiresAt) {
      const result = db
        .prepare('INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)')
        .run(userId, tokenHash, expiresAt);
      const row = db
        .prepare('SELECT * FROM sessions WHERE id = ?')
        .get(Number(result.lastInsertRowid)) as Row;
      return mapSession(row);
    },

    findByTokenHash(tokenHash) {
      const row = db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(tokenHash) as Row | undefined;
      return row ? mapSession(row) : null;
    },

    deleteByTokenHash(tokenHash) {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    },

    deleteExpired() {
      db.prepare(`DELETE FROM sessions WHERE expires_at <= datetime('now')`).run();
    },
  };
}

function mapLock(row: Row): LoginLockRecord {
  return {
    phone: toText(row.phone),
    failedCount: toNumber(row.failed_count),
    lockedUntil: row.locked_until === null || row.locked_until === undefined ? null : toText(row.locked_until),
    updatedAt: toText(row.updated_at),
  };
}

export function createSqliteLoginLocksRepository(db: Db): LoginLocksRepository {
  return {
    findByPhone(phone) {
      const row = db.prepare('SELECT * FROM login_locks WHERE phone = ?').get(phone) as Row | undefined;
      return row ? mapLock(row) : null;
    },

    upsert(phone, failedCount, lockedUntil) {
      db.prepare(
        `INSERT INTO login_locks (phone, failed_count, locked_until, updated_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(phone) DO UPDATE SET
           failed_count = excluded.failed_count,
           locked_until = excluded.locked_until,
           updated_at = excluded.updated_at`
      ).run(phone, failedCount, lockedUntil);
    },

    clear(phone) {
      db.prepare('DELETE FROM login_locks WHERE phone = ?').run(phone);
    },
  };
}
