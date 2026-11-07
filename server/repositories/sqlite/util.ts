import type { DatabaseSync, SQLInputValue } from 'node:sqlite';

/** node:sqlite rows (null-prototype) as plain records. */
export type Row = Record<string, unknown>;

export function toNumber(value: unknown, fallback = 0): number {
  return value === null || value === undefined ? fallback : Number(value);
}

export function toNullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

export function toText(value: unknown, fallback = ''): string {
  return value === null || value === undefined ? fallback : String(value);
}

export function toNullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

export function toBool(value: unknown): boolean {
  return Number(value) === 1;
}

/** Builds `SET a = ?, b = ?` from the provided fields; returns null when empty. */
export function buildSetClause(
  fields: Record<string, SQLInputValue | undefined>
): { sql: string; values: SQLInputValue[] } | null {
  const keys = Object.keys(fields).filter((k) => fields[k] !== undefined);
  if (keys.length === 0) return null;
  return {
    sql: keys.map((k) => `${k} = ?`).join(', '),
    values: keys.map((k) => fields[k] as SQLInputValue),
  };
}

export type Db = DatabaseSync;
