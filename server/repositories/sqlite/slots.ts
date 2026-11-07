import type { Db, Row } from './util';
import { toNullableNumber, toNullableText, toNumber, toText } from './util';
import type { SlotRow, SlotsRepository } from '../types';

function mapSlot(row: Row): SlotRow {
  return {
    id: toNumber(row.id),
    chitGroupId: toNumber(row.chit_group_id),
    userId: toNumber(row.user_id),
    ticketNumber: toNumber(row.ticket_number),
    joinedDate: toText(row.joined_date),
    prizedMonth: toNullableNumber(row.prized_month),
    prizedAmount: toNullableNumber(row.prized_amount),
    payoutDate: toNullableText(row.payout_date),
    memberName: toText(row.member_name),
    memberPhone: toText(row.member_phone),
  };
}

const SLOT_SELECT = `
  SELECT ms.*, u.name AS member_name, u.phone AS member_phone
  FROM member_slots ms
  JOIN users u ON u.id = ms.user_id
`;

export function createSqliteSlotsRepository(db: Db): SlotsRepository {
  return {
    findById(id) {
      const row = db.prepare(`${SLOT_SELECT} WHERE ms.id = ?`).get(id) as Row | undefined;
      return row ? mapSlot(row) : null;
    },

    listByChit(chitGroupId) {
      const rows = db
        .prepare(`${SLOT_SELECT} WHERE ms.chit_group_id = ? ORDER BY ms.ticket_number ASC`)
        .all(chitGroupId) as Row[];
      return rows.map(mapSlot);
    },

    listByChitAndUser(chitGroupId, userId) {
      const rows = db
        .prepare(
          `${SLOT_SELECT} WHERE ms.chit_group_id = ? AND ms.user_id = ? ORDER BY ms.ticket_number ASC`
        )
        .all(chitGroupId, userId) as Row[];
      return rows.map(mapSlot);
    },

    insert(input) {
      const result = db
        .prepare(
          'INSERT INTO member_slots (chit_group_id, user_id, ticket_number, joined_date) VALUES (?, ?, ?, ?)'
        )
        .run(input.chitGroupId, input.userId, input.ticketNumber, input.joinedDate);
      const row = db
        .prepare(`${SLOT_SELECT} WHERE ms.id = ?`)
        .get(Number(result.lastInsertRowid)) as Row;
      return mapSlot(row);
    },

    updateTicketNumber(id, ticketNumber) {
      db.prepare('UPDATE member_slots SET ticket_number = ? WHERE id = ?').run(ticketNumber, id);
    },

    updatePrized(id, input) {
      db.prepare(
        'UPDATE member_slots SET prized_month = ?, prized_amount = ?, payout_date = ? WHERE id = ?'
      ).run(input.prizedMonth, input.prizedAmount, input.payoutDate, id);
    },

    clearPrized(id) {
      db.prepare(
        'UPDATE member_slots SET prized_month = NULL, prized_amount = NULL, payout_date = NULL WHERE id = ?'
      ).run(id);
    },

    deleteById(id) {
      db.prepare('DELETE FROM member_slots WHERE id = ?').run(id);
    },

    isMemberEnrolledWithOwner(userId, ownerId) {
      const row = db
        .prepare(
          `SELECT 1 AS found
           FROM member_slots ms
           JOIN chit_groups cg ON cg.id = ms.chit_group_id
           WHERE ms.user_id = ? AND cg.organizer_id = ?
           LIMIT 1`
        )
        .get(userId, ownerId) as Row | undefined;
      return Boolean(row);
    },
  };
}
