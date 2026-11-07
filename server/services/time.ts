/** SQLite-compatible UTC timestamp helpers. */
export function sqliteUtc(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

export function sqliteUtcNow(): string {
  return sqliteUtc(new Date());
}
