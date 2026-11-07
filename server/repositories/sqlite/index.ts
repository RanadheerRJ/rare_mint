import type { Db } from './util';
import type { Repositories } from '../types';
import { createSqliteUsersRepository } from './users';
import { createSqliteLoginLocksRepository, createSqliteSessionsRepository } from './sessions';
import { createSqliteChitsRepository } from './chits';
import { createSqliteSlotsRepository } from './slots';
import { createSqlitePaymentsRepository } from './payments';
import { createSqliteAuditRepository } from './audit';
import { createTransactionRunner } from './transaction';

export function createSqliteRepositories(db: Db): Repositories {
  return {
    users: createSqliteUsersRepository(db),
    sessions: createSqliteSessionsRepository(db),
    loginLocks: createSqliteLoginLocksRepository(db),
    chits: createSqliteChitsRepository(db),
    slots: createSqliteSlotsRepository(db),
    payments: createSqlitePaymentsRepository(db),
    audit: createSqliteAuditRepository(db),
  };
}

export { createTransactionRunner };
export type { TransactionRunner } from './transaction';
