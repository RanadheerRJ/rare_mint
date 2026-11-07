import type { Db, Row } from './util';
import { buildSetClause, toBool, toNullableNumber, toNullableText, toNumber, toText } from './util';
import type {
  ChitCreateInput,
  ChitGroupRow,
  ChitUpdateInput,
  ChitsRepository,
  ScheduleCreateRow,
  ScheduleRowData,
} from '../types';
import type { ChitType } from '../../../src/types';

function mapChit(row: Row): ChitGroupRow {
  return {
    id: toNumber(row.id),
    code: toText(row.code),
    name: toText(row.name),
    chitType: toText(row.chit_type) as ChitType,
    faceValue: toNumber(row.face_value),
    durationMonths: toNumber(row.duration_months),
    totalSlots: toNumber(row.total_slots),
    currentMonth: toNumber(row.current_month),
    startDate: toText(row.start_date),
    dueDayOfMonth: toNumber(row.due_day_of_month),
    baseInstallment: toNumber(row.base_installment),
    foremanCommissionPct: Number(row.foreman_commission_pct),
    maxBidPct: Number(row.max_bid_pct),
    organizerId: toNumber(row.organizer_id),
    status: toText(row.status) as 'ACTIVE' | 'COMPLETED',
    notes: toText(row.notes),
    createdAt: toText(row.created_at),
  };
}

function mapSchedule(row: Row): ScheduleRowData {
  return {
    id: toNumber(row.id),
    chitGroupId: toNumber(row.chit_group_id),
    monthNumber: toNumber(row.month_number),
    chitDate: toText(row.chit_date),
    nonPrizedInstallment: toNumber(row.non_prized_installment),
    chitValue: toNumber(row.chit_value),
    prizedInstallment: toNumber(row.prized_installment),
    bidDiscount: toNullableNumber(row.bid_discount),
    dividendPerMember: toNullableNumber(row.dividend_per_member),
    foremanCommission: toNullableNumber(row.foreman_commission),
    isAuctionCompleted: toBool(row.is_auction_completed),
    winnerMemberSlotId: toNullableNumber(row.winner_member_slot_id),
    payoutDate: toNullableText(row.payout_date),
    payoutReference: toNullableText(row.payout_reference),
  };
}

export function createSqliteChitsRepository(db: Db): ChitsRepository {
  return {
    findById(id) {
      const row = db.prepare('SELECT * FROM chit_groups WHERE id = ?').get(id) as Row | undefined;
      return row ? mapChit(row) : null;
    },

    findByCode(code) {
      const row = db.prepare('SELECT * FROM chit_groups WHERE code = ?').get(code) as Row | undefined;
      return row ? mapChit(row) : null;
    },

    listByOrganizer(organizerId) {
      const rows = db
        .prepare('SELECT * FROM chit_groups WHERE organizer_id = ? ORDER BY id ASC')
        .all(organizerId) as Row[];
      return rows.map(mapChit);
    },

    listByMember(userId) {
      const rows = db
        .prepare(
          `SELECT DISTINCT cg.*
           FROM chit_groups cg
           JOIN member_slots ms ON ms.chit_group_id = cg.id
           WHERE ms.user_id = ?
           ORDER BY cg.id ASC`
        )
        .all(userId) as Row[];
      return rows.map(mapChit);
    },

    insert(input: ChitCreateInput) {
      const result = db
        .prepare(
          `INSERT INTO chit_groups
             (code, name, chit_type, face_value, duration_months, total_slots, current_month,
              start_date, due_day_of_month, base_installment, foreman_commission_pct, max_bid_pct,
              organizer_id, status, notes)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)`
        )
        .run(
          input.code,
          input.name,
          input.chitType,
          input.faceValue,
          input.durationMonths,
          input.totalSlots,
          input.startDate,
          input.dueDayOfMonth,
          input.baseInstallment,
          input.foremanCommissionPct,
          input.maxBidPct,
          input.organizerId,
          input.notes
        );
      const row = db
        .prepare('SELECT * FROM chit_groups WHERE id = ?')
        .get(Number(result.lastInsertRowid)) as Row;
      return mapChit(row);
    },

    update(id, input: ChitUpdateInput) {
      const set = buildSetClause({
        name: input.name,
        notes: input.notes,
        due_day_of_month: input.dueDayOfMonth,
        start_date: input.startDate,
        foreman_commission_pct: input.foremanCommissionPct,
        max_bid_pct: input.maxBidPct,
        face_value: input.faceValue,
        duration_months: input.durationMonths,
        total_slots: input.totalSlots,
        chit_type: input.chitType,
        base_installment: input.baseInstallment,
        status: input.status,
        current_month: input.currentMonth,
      });
      if (!set) return;
      db.prepare(`UPDATE chit_groups SET ${set.sql} WHERE id = ?`).run(...set.values, id);
    },

    deleteById(id) {
      db.prepare('DELETE FROM chit_groups WHERE id = ?').run(id);
    },

    countAll() {
      const row = db.prepare('SELECT COUNT(*) AS c FROM chit_groups').get() as Row;
      return toNumber(row.c);
    },

    countByOrganizer(organizerId) {
      const row = db.prepare('SELECT COUNT(*) AS c FROM chit_groups WHERE organizer_id = ?').get(organizerId) as Row;
      return toNumber(row.c);
    },

    listSchedules(chitGroupId) {
      const rows = db
        .prepare('SELECT * FROM chit_schedules WHERE chit_group_id = ? ORDER BY month_number ASC')
        .all(chitGroupId) as Row[];
      return rows.map(mapSchedule);
    },

    findSchedule(chitGroupId, monthNumber) {
      const row = db
        .prepare('SELECT * FROM chit_schedules WHERE chit_group_id = ? AND month_number = ?')
        .get(chitGroupId, monthNumber) as Row | undefined;
      return row ? mapSchedule(row) : null;
    },

    insertSchedules(chitGroupId, rows: ScheduleCreateRow[]) {
      const insert = db.prepare(
        `INSERT INTO chit_schedules
           (chit_group_id, month_number, chit_date, non_prized_installment, chit_value, prized_installment, is_auction_completed)
         VALUES (?, ?, ?, ?, ?, ?, 0)`
      );
      for (const row of rows) {
        insert.run(
          chitGroupId,
          row.monthNumber,
          row.chitDate,
          row.nonPrizedInstallment,
          row.chitValue,
          row.prizedInstallment
        );
      }
    },

    deleteSchedules(chitGroupId) {
      db.prepare('DELETE FROM chit_schedules WHERE chit_group_id = ?').run(chitGroupId);
    },

    updateScheduleDate(id, chitDate) {
      db.prepare('UPDATE chit_schedules SET chit_date = ? WHERE id = ?').run(chitDate, id);
    },

    updateScheduleLift(id, input) {
      db.prepare(
        `UPDATE chit_schedules
         SET non_prized_installment = ?, prized_installment = ?, chit_value = ?,
             bid_discount = ?, dividend_per_member = ?, foreman_commission = ?,
             is_auction_completed = 1, winner_member_slot_id = ?, payout_date = ?, payout_reference = ?
         WHERE id = ?`
      ).run(
        input.nonPrizedInstallment,
        input.prizedInstallment,
        input.chitValue,
        input.bidDiscount,
        input.dividendPerMember,
        input.foremanCommission,
        input.winnerMemberSlotId,
        input.payoutDate,
        input.payoutReference,
        id
      );
    },

    markScheduleLifted(id, input) {
      db.prepare(
        `UPDATE chit_schedules
         SET is_auction_completed = 1, winner_member_slot_id = ?, payout_date = ?, payout_reference = ?
         WHERE id = ?`
      ).run(input.winnerMemberSlotId, input.payoutDate, input.payoutReference, id);
    },

    clearScheduleWinner(id) {
      db.prepare(
        `UPDATE chit_schedules
         SET bid_discount = NULL, dividend_per_member = NULL, foreman_commission = NULL,
             is_auction_completed = 0, winner_member_slot_id = NULL, payout_date = NULL, payout_reference = NULL
         WHERE id = ?`
      ).run(id);
    },
  };
}
