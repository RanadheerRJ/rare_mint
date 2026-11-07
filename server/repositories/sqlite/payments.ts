import type { Db, Row } from './util';
import { buildSetClause, toNullableText, toNumber, toText } from './util';
import type {
  PaymentInsertInput,
  PaymentRow,
  PaymentUpdateInput,
  PaymentsRepository,
} from '../types';
import type { PaymentMethod } from '../../../src/types';

function mapPayment(row: Row): PaymentRow {
  return {
    id: toNumber(row.id),
    receiptNumber: toText(row.receipt_number),
    chitGroupId: toNumber(row.chit_group_id),
    memberSlotId: toNumber(row.member_slot_id),
    monthNumber: toNumber(row.month_number),
    amountPaid: toNumber(row.amount_paid),
    paidDate: toText(row.paid_date),
    paymentMethod: toText(row.payment_method) as PaymentMethod,
    referenceNote: toText(row.reference_note),
    signedByName: toText(row.signed_by_name),
    signatureHash: toText(row.signature_hash),
    status: toText(row.status, 'POSTED') as 'POSTED' | 'VOID',
    voidReason: toText(row.void_reason),
    voidedAt: toNullableText(row.voided_at),
    createdAt: toText(row.created_at),
    ticketNumber: toNumber(row.ticket_number),
    memberName: toText(row.member_name),
    memberPhone: toText(row.member_phone),
    chitName: toText(row.chit_name),
    chitCode: toText(row.chit_code),
  };
}

const PAYMENT_SELECT = `
  SELECT p.*, ms.ticket_number, u.name AS member_name, u.phone AS member_phone,
         cg.name AS chit_name, cg.code AS chit_code
  FROM payments p
  JOIN member_slots ms ON ms.id = p.member_slot_id
  JOIN users u ON u.id = ms.user_id
  JOIN chit_groups cg ON cg.id = p.chit_group_id
`;

export function createSqlitePaymentsRepository(db: Db): PaymentsRepository {
  return {
    findById(id) {
      const row = db.prepare(`${PAYMENT_SELECT} WHERE p.id = ?`).get(id) as Row | undefined;
      return row ? mapPayment(row) : null;
    },

    listByChit(chitGroupId) {
      const rows = db
        .prepare(`${PAYMENT_SELECT} WHERE p.chit_group_id = ? ORDER BY p.month_number DESC, ms.ticket_number ASC`)
        .all(chitGroupId) as Row[];
      return rows.map(mapPayment);
    },

    listByUser(userId) {
      const rows = db
        .prepare(`${PAYMENT_SELECT} WHERE ms.user_id = ? ORDER BY p.paid_date DESC, p.id DESC`)
        .all(userId) as Row[];
      return rows.map(mapPayment);
    },

    listByOrganizer(organizerId) {
      const rows = db
        .prepare(
          `${PAYMENT_SELECT} WHERE cg.organizer_id = ? ORDER BY p.paid_date DESC, p.id DESC LIMIT 150`
        )
        .all(organizerId) as Row[];
      return rows.map(mapPayment);
    },

    insert(input: PaymentInsertInput) {
      const result = db
        .prepare(
          `INSERT INTO payments
             (receipt_number, chit_group_id, member_slot_id, month_number, amount_paid, paid_date,
              payment_method, reference_note, signed_by_name, signature_hash)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.receiptNumber,
          input.chitGroupId,
          input.memberSlotId,
          input.monthNumber,
          input.amountPaid,
          input.paidDate,
          input.paymentMethod,
          input.referenceNote,
          input.signedByName,
          input.signatureHash
        );
      const row = db
        .prepare(`${PAYMENT_SELECT} WHERE p.id = ?`)
        .get(Number(result.lastInsertRowid)) as Row;
      return mapPayment(row);
    },

    update(id, input: PaymentUpdateInput) {
      const set = buildSetClause({
        amount_paid: input.amountPaid,
        paid_date: input.paidDate,
        payment_method: input.paymentMethod,
        reference_note: input.referenceNote,
        signature_hash: input.signatureHash,
      });
      if (!set) return;
      db.prepare(`UPDATE payments SET ${set.sql} WHERE id = ?`).run(...set.values, id);
    },

    void(id, reason, voidedAt) {
      db.prepare(
        `UPDATE payments SET status = 'VOID', void_reason = ?, voided_at = ? WHERE id = ?`
      ).run(reason, voidedAt, id);
    },

    countByChit(chitGroupId) {
      const row = db.prepare('SELECT COUNT(*) AS c FROM payments WHERE chit_group_id = ?').get(chitGroupId) as Row;
      return toNumber(row.c);
    },

    countBySlot(memberSlotId) {
      const row = db.prepare('SELECT COUNT(*) AS c FROM payments WHERE member_slot_id = ?').get(memberSlotId) as Row;
      return toNumber(row.c);
    },

    sumPostedBySlotAndMonth(memberSlotId, monthNumber) {
      const row = db
        .prepare(
          `SELECT COALESCE(SUM(amount_paid), 0) AS s FROM payments
           WHERE member_slot_id = ? AND month_number = ? AND status = 'POSTED'`
        )
        .get(memberSlotId, monthNumber) as Row;
      return toNumber(row.s);
    },

    nextReceiptSequence() {
      db.prepare(
        `INSERT INTO app_counters (name, value) VALUES ('receipt_seq', 0) ON CONFLICT(name) DO NOTHING`
      ).run();
      db.prepare(`UPDATE app_counters SET value = value + 1 WHERE name = 'receipt_seq'`).run();
      const row = db.prepare(`SELECT value FROM app_counters WHERE name = 'receipt_seq'`).get() as Row;
      return toNumber(row.value);
    },
  };
}
