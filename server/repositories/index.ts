import { db } from '../db';
import { createSqliteRepositories, createTransactionRunner } from './sqlite';
import type { TransactionRunner } from './sqlite';
import type { Repositories } from './types';

/**
 * Application data-access layer. Everything above this module talks to the
 * `Repositories` interfaces; swapping SQLite for Supabase means implementing
 * those interfaces and changing only this wiring.
 */
export const repositories: Repositories = createSqliteRepositories(db);
export const runInTransaction: TransactionRunner = createTransactionRunner(db);

export * from './types';
