import type { Db } from './util';

/**
 * Runs `fn` inside a single SQLite transaction. Multi-row writes (create chit
 * + schedule, receipt sequence + payment insert, void + audit) must use this.
 */
export function createTransactionRunner(db: Db) {
  return function runInTransaction<T>(fn: () => T): T {
    db.exec('BEGIN');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };
}

export type TransactionRunner = <T>(fn: () => T) => T;
