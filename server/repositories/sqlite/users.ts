import type { Db, Row } from './util';
import { buildSetClause, toBool, toNumber, toText } from './util';
import type { OwnerSummary, UserRecord, UserRole, UsersRepository } from '../types';

function mapUser(row: Row): UserRecord {
  return {
    id: toNumber(row.id),
    name: toText(row.name),
    phone: toText(row.phone),
    role: toText(row.role) as UserRole,
    city: toText(row.city, 'Hyderabad'),
    isActive: toBool(row.is_active),
    createdAt: toText(row.created_at),
    pinHash: toText(row.pin_hash),
    pinSalt: toText(row.pin_salt),
  };
}

export function createSqliteUsersRepository(db: Db): UsersRepository {
  return {
    findById(id) {
      const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Row | undefined;
      return row ? mapUser(row) : null;
    },

    findByPhone(phone) {
      const row = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone) as Row | undefined;
      return row ? mapUser(row) : null;
    },

    insert(input) {
      const result = db
        .prepare(
          `INSERT INTO users (name, phone, pin_hash, pin_salt, role, city)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(input.name, input.phone, input.pinHash, input.pinSalt, input.role, input.city);
      const row = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(result.lastInsertRowid)) as Row;
      return mapUser(row);
    },

    upsertDeveloper(input) {
      const existing = db.prepare('SELECT id FROM users WHERE phone = ?').get(input.phone) as Row | undefined;
      if (existing) {
        db.prepare(
          `UPDATE users SET name = ?, role = 'developer', is_active = 1, pin_hash = ?, pin_salt = ? WHERE id = ?`
        ).run(input.name, input.pinHash, input.pinSalt, toNumber(existing.id));
        const row = db.prepare('SELECT * FROM users WHERE id = ?').get(toNumber(existing.id)) as Row;
        return mapUser(row);
      }
      return this.insert({
        name: input.name,
        phone: input.phone,
        pinHash: input.pinHash,
        pinSalt: input.pinSalt,
        role: 'developer',
        city: 'Hyderabad',
      });
    },

    updateProfile(id, input) {
      const set = buildSetClause({
        name: input.name,
        city: input.city,
        phone: input.phone,
      });
      if (!set) return;
      db.prepare(`UPDATE users SET ${set.sql} WHERE id = ?`).run(...set.values, id);
    },

    updatePin(id, pinHash, pinSalt) {
      db.prepare('UPDATE users SET pin_hash = ?, pin_salt = ? WHERE id = ?').run(pinHash, pinSalt, id);
    },

    setActive(id, isActive) {
      db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(isActive ? 1 : 0, id);
    },

    deleteById(id) {
      db.prepare('DELETE FROM users WHERE id = ?').run(id);
    },

    listOwners() {
      const rows = db
        .prepare(
          `SELECT u.*, (SELECT COUNT(*) FROM chit_groups cg WHERE cg.organizer_id = u.id) AS chit_count
           FROM users u
           WHERE u.role = 'organizer'
           ORDER BY u.created_at DESC, u.id DESC`
        )
        .all() as Row[];
      return rows.map(
        (row): OwnerSummary => ({
          id: toNumber(row.id),
          name: toText(row.name),
          phone: toText(row.phone),
          city: toText(row.city, 'Hyderabad'),
          isActive: toBool(row.is_active),
          createdAt: toText(row.created_at),
          chitCount: toNumber(row.chit_count),
        })
      );
    },

    listMembersEnrolledWithOwner(ownerId) {
      const rows = db
        .prepare(
          `SELECT DISTINCT u.*
           FROM users u
           JOIN member_slots ms ON ms.user_id = u.id
           JOIN chit_groups cg ON cg.id = ms.chit_group_id
           WHERE cg.organizer_id = ? AND u.role = 'member'
           ORDER BY u.name ASC`
        )
        .all(ownerId) as Row[];
      return rows.map(mapUser);
    },

    countByRole(role) {
      const row = db.prepare('SELECT COUNT(*) AS c FROM users WHERE role = ?').get(role) as Row;
      return toNumber(row.c);
    },
  };
}
