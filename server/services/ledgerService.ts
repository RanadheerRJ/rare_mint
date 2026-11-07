import type { AuthUser } from '../auth/types';
import { hashPin } from '../auth/passwords';
import type {
  ChitGroupRow,
  ChitUpdateInput,
  PaymentRow,
  Repositories,
  ScheduleCreateRow,
  ScheduleRowData,
  SlotRow,
  UserRecord,
} from '../repositories/types';
import type { TransactionRunner } from '../repositories/sqlite/transaction';
import {
  addMonthsToDate,
  computeAuctionLift,
  formatReceiptNumber,
  getMemberPayableForMonth,
} from '../../src/utils/chitFinance';
import { daysBetween, getTodayIST } from '../../src/utils/dates';
import type {
  ChitGroupDetail,
  ChitGroupSummary,
  ChitType,
  DueItem,
  MemberSlot,
  PaymentMethod,
  PaymentRecord,
  ScheduleRow,
  User,
} from '../../src/types';
import { makeSignatureHash } from './signature';
import { sqliteUtcNow } from './time';
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  optionalDate,
  optionalIntInRange,
  optionalNumberInRange,
  optionalPositiveInt,
  optionalText,
  requireDate,
  requireIntInRange,
  requireNumberInRange,
  requirePaymentMethod,
  requirePhone,
  requirePin,
  requirePositiveInt,
  requireText,
} from './validation';

/** Percentage fields are numbers in [0, 100]. */
const requireNumberPct = (value: unknown, field: string): number =>
  requireNumberInRange(value, field, 0, 100);

function toMemberSlot(row: SlotRow): MemberSlot {
  return {
    id: row.id,
    chitGroupId: row.chitGroupId,
    userId: row.userId,
    ticketNumber: row.ticketNumber,
    memberName: row.memberName,
    memberPhone: row.memberPhone,
    joinedDate: row.joinedDate,
    prizedMonth: row.prizedMonth,
    prizedAmount: row.prizedAmount,
    payoutDate: row.payoutDate,
  };
}

function toPaymentRecord(row: PaymentRow): PaymentRecord {
  return {
    id: row.id,
    receiptNumber: row.receiptNumber,
    chitGroupId: row.chitGroupId,
    chitName: row.chitName,
    chitCode: row.chitCode,
    memberSlotId: row.memberSlotId,
    ticketNumber: row.ticketNumber,
    memberName: row.memberName,
    memberPhone: row.memberPhone,
    monthNumber: row.monthNumber,
    amountPaid: row.amountPaid,
    paidDate: row.paidDate,
    paymentMethod: row.paymentMethod,
    referenceNote: row.referenceNote,
    signedByName: row.signedByName,
    signatureHash: row.signatureHash,
    status: row.status,
    voidReason: row.voidReason,
    voidedAt: row.voidedAt,
    createdAt: row.createdAt,
  };
}

function toPublicUser(user: UserRecord): User {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    role: user.role,
    city: user.city,
    createdAt: user.createdAt,
    isActive: user.isActive,
  };
}

export class LedgerService {
  constructor(
    private readonly repos: Repositories,
    private readonly tx: TransactionRunner
  ) {}

  // ---------------------------------------------------------------- reads

  listChits(user: AuthUser): { groups: ChitGroupSummary[]; today: string } {
    this.assertLedgerAccess(user);
    const chits =
      user.role === 'member'
        ? this.repos.chits.listByMember(user.id)
        : this.repos.chits.listByOrganizer(user.id);
    return { groups: chits.map((c) => this.buildSummary(c, user)), today: getTodayIST() };
  }

  getChitDetail(user: AuthUser, chitId: number): ChitGroupDetail {
    const chit = this.repos.chits.findById(chitId);
    if (!chit) throw notFound('Chit group not found.');
    if (user.role === 'organizer' && chit.organizerId === user.id) {
      // owner view
    } else if (user.role === 'member' && this.repos.slots.listByChitAndUser(chitId, user.id).length > 0) {
      // member view (own rows only, enforced below)
    } else if (user.role === 'member') {
      throw forbidden('You are not enrolled in this chit group.');
    } else {
      throw forbidden('Only the chit owner can view this chit group.');
    }

    const summary = this.buildSummary(chit, user);
    const isMemberView = user.role === 'member';
    const allSlots = this.repos.slots.listByChit(chitId);
    const visibleSlots = isMemberView ? allSlots.filter((s) => s.userId === user.id) : allSlots;

    const scheduleRows = this.repos.chits.listSchedules(chitId);
    const slotById = new Map(allSlots.map((s) => [s.id, s]));
    const schedule: ScheduleRow[] = scheduleRows.map((r) => {
      const winner = r.winnerMemberSlotId !== null ? slotById.get(r.winnerMemberSlotId) : undefined;
      return {
        id: r.id,
        chitGroupId: r.chitGroupId,
        monthNumber: r.monthNumber,
        chitDate: r.chitDate,
        nonPrizedInstallment: r.nonPrizedInstallment,
        chitValue: r.chitValue,
        prizedInstallment: r.prizedInstallment,
        bidDiscount: r.bidDiscount,
        dividendPerMember: r.dividendPerMember,
        foremanCommission: r.foremanCommission,
        isAuctionCompleted: r.isAuctionCompleted,
        winnerMemberSlotId: r.winnerMemberSlotId,
        winnerName: winner ? winner.memberName : null,
        winnerTicketNumber: winner ? winner.ticketNumber : null,
        payoutDate: r.payoutDate,
        payoutReference: r.payoutReference,
      };
    });

    const visibleSlotIds = new Set(visibleSlots.map((s) => s.id));
    const payments = this.repos.payments
      .listByChit(chitId)
      .filter((p) => !isMemberView || visibleSlotIds.has(p.memberSlotId))
      .map(toPaymentRecord);

    return {
      ...summary,
      schedule,
      slots: visibleSlots.map(toMemberSlot),
      payments,
    };
  }

  getDues(user: AuthUser): { dues: DueItem[]; today: string } {
    this.assertLedgerAccess(user);
    const today = getTodayIST();
    const isMemberView = user.role === 'member';
    const chits = (
      isMemberView ? this.repos.chits.listByMember(user.id) : this.repos.chits.listByOrganizer(user.id)
    ).filter((c) => c.status === 'ACTIVE');

    const dues: DueItem[] = [];
    for (const chit of chits) {
      const schedules = this.repos.chits
        .listSchedules(chit.id)
        .filter((s) => s.monthNumber <= chit.currentMonth);
      const allSlots = this.repos.slots.listByChit(chit.id);
      const slots = isMemberView ? allSlots.filter((s) => s.userId === user.id) : allSlots;
      // Partial payments: a month stays due while its POSTED receipts sum to
      // less than the payable amount; amountDue is the remaining balance.
      const paidSumBySlotMonth = new Map<string, number>();
      for (const p of this.repos.payments.listByChit(chit.id)) {
        if (p.status !== 'POSTED') continue;
        const key = `${p.memberSlotId}:${p.monthNumber}`;
        paidSumBySlotMonth.set(key, (paidSumBySlotMonth.get(key) ?? 0) + p.amountPaid);
      }
      const organizer = this.repos.users.findById(chit.organizerId);

      for (const sched of schedules) {
        const dueDate = sched.chitDate;
        const diffDays = daysBetween(today, dueDate);
        for (const slot of slots) {
          const expectedAmount = getMemberPayableForMonth(
            chit.chitType,
            {
              monthNumber: sched.monthNumber,
              nonPrizedInstallment: sched.nonPrizedInstallment,
              prizedInstallment: sched.prizedInstallment,
            },
            slot.prizedMonth
          );
          const paidSum = paidSumBySlotMonth.get(`${slot.id}:${sched.monthNumber}`) ?? 0;
          if (paidSum >= expectedAmount) continue;
          const isPrized = slot.prizedMonth !== null && slot.prizedMonth < sched.monthNumber;
          dues.push({
            chitGroupId: chit.id,
            chitCode: chit.code,
            chitName: chit.name,
            chitType: chit.chitType,
            monthNumber: sched.monthNumber,
            dueDate,
            isOverdue: diffDays < 0,
            daysUntilDue: diffDays,
            memberSlotId: slot.id,
            ticketNumber: slot.ticketNumber,
            memberName: slot.memberName,
            memberPhone: slot.memberPhone,
            isPrizedSubscriber: isPrized,
            amountDue: expectedAmount - paidSum,
            amountPaid: paidSum,
            organizerName: organizer?.name ?? 'Foreman',
          });
        }
      }
    }

    dues.sort((a, b) => a.daysUntilDue - b.daysUntilDue || a.ticketNumber - b.ticketNumber);
    return { dues, today };
  }

  getReceipts(user: AuthUser): { receipts: PaymentRecord[] } {
    this.assertLedgerAccess(user);
    const rows =
      user.role === 'member'
        ? this.repos.payments.listByUser(user.id)
        : this.repos.payments.listByOrganizer(user.id);
    return { receipts: rows.map(toPaymentRecord) };
  }

  listMembers(user: AuthUser): User[] {
    if (user.role !== 'organizer') {
      throw forbidden('Only chit owners have a member directory.');
    }
    return this.repos.users.listMembersEnrolledWithOwner(user.id).map(toPublicUser);
  }

  // ---------------------------------------------------------------- chits

  createChit(
    user: AuthUser,
    payload: Record<string, unknown>
  ): ChitGroupSummary {
    this.assertOwner(user);
    const name = requireText(payload.name, 'Group name');
    const chitType = this.parseChitType(payload.chitType);
    const faceValue = requirePositiveInt(payload.faceValue, 'Face value');
    const durationMonths = requireIntInRange(payload.durationMonths, 'Duration', 1, 120);
    const startDate = requireDate(payload.startDate, 'Start date');
    const dueDayOfMonth = requireIntInRange(
      payload.dueDayOfMonth ?? Number(startDate.split('-')[2]),
      'Due day',
      1,
      31
    );
    const baseInstallment = requirePositiveInt(
      payload.baseInstallment ?? Math.round(faceValue / durationMonths),
      'Base installment'
    );
    const foremanCommissionPct = requireNumberPct(payload.foremanCommissionPct ?? 5, 'Foreman commission');
    const maxBidPct = requireNumberPct(
      payload.maxBidPct ?? (chitType === 'AUCTION' ? 35 : 0),
      'Max bid'
    );
    const notes = optionalText(payload.notes, 'Notes');

    let code = optionalText(payload.code, 'Code', 24).toUpperCase();
    if (!code) {
      code = `RM-${Math.round(faceValue / 1000)}K-${durationMonths}M-${Math.floor(100 + Math.random() * 900)}`;
    }
    const existing = this.repos.chits.findByCode(code);
    if (existing) throw conflict(`Chit code ${code} already exists. Please choose a unique code.`);

    // The create UI sends `schedule: []` for AUCTION chits (the month table is
    // generated at auction-settle time); treat an empty list as "derive the
    // standard schedule" here so chit creation does not fail with "Schedule is
    // missing month 1". updateChit's schedule replacement keeps its strict
    // row-per-month validation.
    const scheduleInput =
      Array.isArray(payload.schedule) && payload.schedule.length === 0 ? undefined : payload.schedule;
    const schedule = this.parseScheduleInput(scheduleInput, {
      durationMonths,
      startDate,
      dueDayOfMonth,
      baseInstallment,
      faceValue,
    });

    return this.tx(() => {
      const chit = this.repos.chits.insert({
        code,
        name,
        chitType,
        faceValue,
        durationMonths,
        totalSlots: durationMonths,
        startDate,
        dueDayOfMonth,
        baseInstallment,
        foremanCommissionPct,
        maxBidPct,
        organizerId: user.id,
        notes,
      });
      this.repos.chits.insertSchedules(chit.id, schedule);
      this.repos.audit.insert({
        actorId: user.id,
        action: 'chit.create',
        entity: 'chit_group',
        entityId: chit.id,
        before: null,
        after: { code, name, chitType, faceValue, durationMonths },
      });
      return this.buildSummary(chit, user);
    });
  }

  updateChit(user: AuthUser, chitId: number, payload: Record<string, unknown>): ChitGroupSummary {
    const chit = this.requireOwnedChit(user, chitId);
    const paymentCount = this.repos.payments.countByChit(chitId);
    const schedules = this.repos.chits.listSchedules(chitId);
    const hasSettledMonth = schedules.some((s) => s.isAuctionCompleted);
    const hasPayments = paymentCount > 0;

    const name = payload.name === undefined ? undefined : requireText(payload.name, 'Group name');
    const notes = payload.notes === undefined ? undefined : optionalText(payload.notes, 'Notes');
    const dueDayOfMonth = optionalIntInRange(payload.dueDayOfMonth, 'Due day', 1, 31);
    const startDate = optionalDate(payload.startDate, 'Start date');
    const foremanCommissionPct =
      payload.foremanCommissionPct === undefined
        ? undefined
        : requireNumberPct(payload.foremanCommissionPct, 'Foreman commission');
    const maxBidPct =
      payload.maxBidPct === undefined ? undefined : requireNumberPct(payload.maxBidPct, 'Max bid');
    const faceValue = optionalPositiveInt(payload.faceValue, 'Face value');
    const durationMonths = optionalIntInRange(payload.durationMonths, 'Duration', 1, 120);
    const chitType = payload.chitType === undefined ? undefined : this.parseChitType(payload.chitType);

    let status: 'ACTIVE' | 'COMPLETED' | undefined;
    if (payload.status !== undefined) {
      if (payload.status !== 'ACTIVE' && payload.status !== 'COMPLETED') {
        throw badRequest('Status must be ACTIVE or COMPLETED.');
      }
      status = payload.status;
    }

    const structureChanged = faceValue !== undefined || durationMonths !== undefined || chitType !== undefined;
    if (structureChanged && hasPayments) {
      throw conflict(
        'Face value, duration and chit type cannot be changed once payments exist. ' +
          'Mark the chit COMPLETED instead.'
      );
    }
    if (structureChanged && hasSettledMonth) {
      throw conflict(
        'Face value, duration and chit type cannot be changed once a month has been settled.'
      );
    }

    const wantsScheduleReplace = payload.schedule !== undefined;
    if (wantsScheduleReplace && (hasPayments || hasSettledMonth)) {
      throw conflict('The schedule cannot be replaced once payments or settled months exist.');
    }

    const nextDuration = durationMonths ?? chit.durationMonths;
    const nextStartDate = startDate ?? chit.startDate;
    const nextDueDay = dueDayOfMonth ?? chit.dueDayOfMonth;
    const nextFace = faceValue ?? chit.faceValue;
    const nextBase = structureChanged ? Math.round(nextFace / nextDuration) : chit.baseInstallment;

    const scheduleRows = wantsScheduleReplace
      ? this.parseScheduleInput(payload.schedule, {
          durationMonths: nextDuration,
          startDate: nextStartDate,
          dueDayOfMonth: nextDueDay,
          baseInstallment: nextBase,
          faceValue: nextFace,
        })
      : null;

    const anyUpdate =
      name !== undefined ||
      notes !== undefined ||
      dueDayOfMonth !== undefined ||
      startDate !== undefined ||
      foremanCommissionPct !== undefined ||
      maxBidPct !== undefined ||
      structureChanged ||
      status !== undefined ||
      wantsScheduleReplace;
    if (!anyUpdate) {
      throw badRequest('Nothing to update.');
    }

    const before: Record<string, unknown> = {
      name: chit.name,
      notes: chit.notes,
      dueDayOfMonth: chit.dueDayOfMonth,
      startDate: chit.startDate,
      foremanCommissionPct: chit.foremanCommissionPct,
      maxBidPct: chit.maxBidPct,
      faceValue: chit.faceValue,
      durationMonths: chit.durationMonths,
      chitType: chit.chitType,
      status: chit.status,
    };

    return this.tx(() => {
      const update: ChitUpdateInput = {
        name,
        notes,
        dueDayOfMonth,
        startDate,
        foremanCommissionPct,
        maxBidPct,
        faceValue,
        durationMonths,
        chitType,
        baseInstallment: structureChanged ? nextBase : undefined,
        status,
      };
      this.repos.chits.update(chitId, update);

      if (scheduleRows) {
        this.repos.chits.deleteSchedules(chitId);
        this.repos.chits.insertSchedules(chitId, scheduleRows);
      } else if (structureChanged) {
        this.repos.chits.deleteSchedules(chitId);
        this.repos.chits.insertSchedules(
          chitId,
          this.defaultSchedule(nextDuration, nextStartDate, nextDueDay, nextBase, nextFace)
        );
      } else if (startDate !== undefined || dueDayOfMonth !== undefined) {
        // Shift due dates for unsettled months only; settled months keep history.
        for (const row of schedules) {
          if (row.isAuctionCompleted) continue;
          this.repos.chits.updateScheduleDate(
            row.id,
            addMonthsToDate(nextStartDate, row.monthNumber - 1, nextDueDay)
          );
        }
      }

      this.repos.audit.insert({
        actorId: user.id,
        action: 'chit.update',
        entity: 'chit_group',
        entityId: chitId,
        before,
        after: { ...before, ...update },
      });

      const updated = this.repos.chits.findById(chitId)!;
      return this.buildSummary(updated, user);
    });
  }

  deleteChit(user: AuthUser, chitId: number): void {
    const chit = this.requireOwnedChit(user, chitId);
    const paymentCount = this.repos.payments.countByChit(chitId);
    if (paymentCount > 0) {
      throw conflict(
        'This chit group has payments recorded and cannot be deleted. Mark it COMPLETED instead.'
      );
    }
    this.tx(() => {
      this.repos.audit.insert({
        actorId: user.id,
        action: 'chit.delete',
        entity: 'chit_group',
        entityId: chitId,
        before: { code: chit.code, name: chit.name, faceValue: chit.faceValue, status: chit.status },
        after: null,
      });
      this.repos.chits.deleteById(chitId);
    });
  }

  // ---------------------------------------------------------------- slots

  addSlot(
    user: AuthUser,
    chitId: number,
    payload: Record<string, unknown>
  ): MemberSlot {
    const chit = this.requireOwnedChit(user, chitId);
    const ticketNumber = requireIntInRange(payload.ticketNumber, 'Ticket number', 1, chit.totalSlots);

    const taken = this.repos.slots.listByChit(chitId).some((s) => s.ticketNumber === ticketNumber);
    if (taken) throw conflict(`Ticket #${ticketNumber} is already assigned in this chit group.`);

    return this.tx(() => {
      let targetUserId: number;
      if (payload.userId !== undefined && payload.userId !== null && payload.userId !== '') {
        targetUserId = requirePositiveInt(payload.userId, 'Member');
        const member = this.repos.users.findById(targetUserId);
        if (!member || member.role !== 'member') throw notFound('Member not found.');
        if (!this.repos.slots.isMemberEnrolledWithOwner(targetUserId, user.id)) {
          throw notFound('Select one of your existing members or create a new subscriber.');
        }
      } else {
        const newMemberName = requireText(payload.newMemberName, 'Subscriber name');
        const newMemberPhone = requirePhone(payload.newMemberPhone, 'Subscriber phone');
        const newMemberCity = optionalText(payload.newMemberCity, 'City') || 'Hyderabad';
        const newMemberPin = requirePin(payload.newMemberPin, 'Subscriber PIN');
        if (this.repos.users.findByPhone(newMemberPhone)) {
          throw conflict(
            'A user with this phone already exists. Select them from your existing directory.'
          );
        }
        const { hash, salt } = hashPin(newMemberPin);
        const created = this.repos.users.insert({
          name: newMemberName,
          phone: newMemberPhone,
          pinHash: hash,
          pinSalt: salt,
          role: 'member',
          city: newMemberCity,
        });
        targetUserId = created.id;
      }

      const slot = this.repos.slots.insert({
        chitGroupId: chitId,
        userId: targetUserId,
        ticketNumber,
        joinedDate: getTodayIST(),
      });
      this.repos.audit.insert({
        actorId: user.id,
        action: 'slot.create',
        entity: 'member_slot',
        entityId: slot.id,
        before: null,
        after: { chitGroupId: chitId, userId: targetUserId, ticketNumber },
      });
      return toMemberSlot(slot);
    });
  }

  updateSlot(
    user: AuthUser,
    chitId: number,
    slotId: number,
    payload: Record<string, unknown>
  ): MemberSlot {
    const chit = this.requireOwnedChit(user, chitId);
    const slot = this.requireSlotOfChit(chitId, slotId);

    const memberName = payload.memberName === undefined ? undefined : requireText(payload.memberName, 'Member name');
    const city = payload.city === undefined ? undefined : requireText(payload.city, 'City');
    const phone = payload.phone === undefined ? undefined : requirePhone(payload.phone);
    const ticketNumber =
      payload.ticketNumber === undefined
        ? undefined
        : requireIntInRange(payload.ticketNumber, 'Ticket number', 1, chit.totalSlots);

    if (
      memberName === undefined &&
      city === undefined &&
      phone === undefined &&
      ticketNumber === undefined
    ) {
      throw badRequest('Nothing to update. Provide memberName, city, phone or ticketNumber.');
    }

    const member = this.repos.users.findById(slot.userId);
    if (!member) throw notFound('Member not found.');

    if (phone !== undefined && phone !== member.phone) {
      const clash = this.repos.users.findByPhone(phone);
      if (clash && clash.id !== member.id) {
        throw conflict('Another account already uses this mobile number.');
      }
    }
    if (ticketNumber !== undefined && ticketNumber !== slot.ticketNumber) {
      const taken = this.repos.slots
        .listByChit(chitId)
        .some((s) => s.id !== slotId && s.ticketNumber === ticketNumber);
      if (taken) throw conflict(`Ticket #${ticketNumber} is already assigned in this chit group.`);
    }

    return this.tx(() => {
      const before = {
        memberName: member.name,
        city: member.city,
        phone: member.phone,
        ticketNumber: slot.ticketNumber,
      };
      this.repos.users.updateProfile(member.id, { name: memberName, city, phone });
      if (ticketNumber !== undefined) this.repos.slots.updateTicketNumber(slotId, ticketNumber);
      this.repos.audit.insert({
        actorId: user.id,
        action: 'slot.update',
        entity: 'member_slot',
        entityId: slotId,
        before,
        after: {
          memberName: memberName ?? member.name,
          city: city ?? member.city,
          phone: phone ?? member.phone,
          ticketNumber: ticketNumber ?? slot.ticketNumber,
        },
      });
      return toMemberSlot(this.repos.slots.findById(slotId)!);
    });
  }

  removeSlot(user: AuthUser, chitId: number, slotId: number): void {
    this.requireOwnedChit(user, chitId);
    const slot = this.requireSlotOfChit(chitId, slotId);
    const paymentCount = this.repos.payments.countBySlot(slotId);
    if (paymentCount > 0) {
      throw conflict('This ticket has payments recorded and cannot be removed.');
    }
    this.tx(() => {
      this.repos.audit.insert({
        actorId: user.id,
        action: 'slot.delete',
        entity: 'member_slot',
        entityId: slotId,
        before: {
          chitGroupId: chitId,
          userId: slot.userId,
          ticketNumber: slot.ticketNumber,
          memberName: slot.memberName,
        },
        after: null,
      });
      this.repos.slots.deleteById(slotId);
    });
  }

  updateMember(user: AuthUser, memberId: number, payload: Record<string, unknown>): User {
    this.assertOwner(user);
    const member = this.repos.users.findById(memberId);
    if (!member || member.role !== 'member' || !this.repos.slots.isMemberEnrolledWithOwner(memberId, user.id)) {
      throw notFound('Member not found in your directory.');
    }
    const name = payload.name === undefined ? undefined : requireText(payload.name, 'Member name');
    const city = payload.city === undefined ? undefined : requireText(payload.city, 'City');
    const phone = payload.phone === undefined ? undefined : requirePhone(payload.phone);
    if (name === undefined && city === undefined && phone === undefined) {
      throw badRequest('Nothing to update. Provide name, city or phone.');
    }
    if (phone !== undefined && phone !== member.phone) {
      const clash = this.repos.users.findByPhone(phone);
      if (clash && clash.id !== member.id) {
        throw conflict('Another account already uses this mobile number.');
      }
    }
    return this.tx(() => {
      const before = { name: member.name, city: member.city, phone: member.phone };
      this.repos.users.updateProfile(member.id, { name, city, phone });
      this.repos.audit.insert({
        actorId: user.id,
        action: 'member.update',
        entity: 'user',
        entityId: memberId,
        before,
        after: { name: name ?? member.name, city: city ?? member.city, phone: phone ?? member.phone },
      });
      return toPublicUser(this.repos.users.findById(memberId)!);
    });
  }

  resetMemberPin(user: AuthUser, memberId: number, pin: unknown): void {
    this.assertOwner(user);
    const member = this.repos.users.findById(memberId);
    if (!member || member.role !== 'member' || !this.repos.slots.isMemberEnrolledWithOwner(memberId, user.id)) {
      throw notFound('Member not found in your directory.');
    }
    const newPin = requirePin(pin, 'New PIN');
    const { hash, salt } = hashPin(newPin);
    this.tx(() => {
      this.repos.users.updatePin(memberId, hash, salt);
      this.repos.audit.insert({
        actorId: user.id,
        action: 'member.reset-pin',
        entity: 'user',
        entityId: memberId,
        before: null,
        // Never store the PIN itself in the audit trail.
        after: { pin: '***' },
      });
    });
  }

  // ---------------------------------------------------------------- payments

  recordPayment(
    user: AuthUser,
    chitId: number,
    payload: Record<string, unknown>
  ): PaymentRecord {
    const chit = this.requireOwnedChit(user, chitId);
    const memberSlotId = requirePositiveInt(payload.memberSlotId, 'Member ticket slot');
    const slot = this.requireSlotOfChit(chitId, memberSlotId);
    const monthNumber = requireIntInRange(payload.monthNumber, 'Month number', 1, chit.durationMonths);

    const schedRow = this.repos.chits.findSchedule(chitId, monthNumber);
    if (!schedRow) throw notFound(`Schedule month ${monthNumber} not found.`);

    const expectedAmount = getMemberPayableForMonth(
      chit.chitType,
      {
        monthNumber,
        nonPrizedInstallment: schedRow.nonPrizedInstallment,
        prizedInstallment: schedRow.prizedInstallment,
      },
      slot.prizedMonth
    );
    // Partial payments: several POSTED receipts may cover one month while their
    // sum stays within the payable amount; the month closes once it is fully paid.
    const paidSoFar = this.repos.payments.sumPostedBySlotAndMonth(memberSlotId, monthNumber);
    const outstanding = expectedAmount - paidSoFar;
    if (outstanding <= 0) {
      throw conflict(`Month ${monthNumber} is already fully paid.`);
    }
    const amountPaid = requirePositiveInt(payload.amountPaid ?? outstanding, 'Amount');
    if (amountPaid > outstanding) {
      throw badRequest(`Amount exceeds the outstanding balance of ${outstanding} for Month ${monthNumber}.`);
    }
    const paidDate = optionalDate(payload.paidDate, 'Payment date') ?? getTodayIST();
    const paymentMethod: PaymentMethod =
      payload.paymentMethod === undefined
        ? 'UPI'
        : requirePaymentMethod(payload.paymentMethod);
    const referenceNote = optionalText(payload.referenceNote, 'Reference note');
    const signer =
      optionalText(payload.signedByName, 'Signed by') ||
      this.repos.users.findById(chit.organizerId)?.name ||
      'Foreman';

    return this.tx(() => {
      const sequence = this.repos.payments.nextReceiptSequence();
      const receiptNumber = formatReceiptNumber(sequence, paidDate);
      const signatureHash = makeSignatureHash(receiptNumber, memberSlotId, monthNumber, amountPaid);
      const payment = this.repos.payments.insert({
        receiptNumber,
        chitGroupId: chitId,
        memberSlotId,
        monthNumber,
        amountPaid,
        paidDate,
        paymentMethod,
        referenceNote,
        signedByName: signer,
        signatureHash,
      });
      this.repos.audit.insert({
        actorId: user.id,
        action: 'payment.create',
        entity: 'payment',
        entityId: payment.id,
        before: null,
        after: { receiptNumber, memberSlotId, monthNumber, amountPaid, paidDate, paymentMethod },
      });
      return toPaymentRecord(payment);
    });
  }

  updatePayment(
    user: AuthUser,
    chitId: number,
    paymentId: number,
    payload: Record<string, unknown>
  ): PaymentRecord {
    this.requireOwnedChit(user, chitId);
    const payment = this.requirePaymentOfChit(chitId, paymentId);
    if (payment.status === 'VOID') throw conflict('A voided payment cannot be edited.');

    const amountPaid = optionalPositiveInt(payload.amountPaid, 'Amount');
    const paidDate = optionalDate(payload.paidDate, 'Payment date');
    const paymentMethod =
      payload.paymentMethod === undefined ? undefined : requirePaymentMethod(payload.paymentMethod);
    const referenceNote =
      payload.referenceNote === undefined ? undefined : optionalText(payload.referenceNote, 'Reference note');

    if (
      amountPaid === undefined &&
      paidDate === undefined &&
      paymentMethod === undefined &&
      referenceNote === undefined
    ) {
      throw badRequest('Nothing to update. Provide amountPaid, paidDate, paymentMethod or referenceNote.');
    }

    return this.tx(() => {
      const nextAmount = amountPaid ?? payment.amountPaid;
      // Signature covers receipt, slot, month and amount: keep it in sync.
      const signatureHash = makeSignatureHash(
        payment.receiptNumber,
        payment.memberSlotId,
        payment.monthNumber,
        nextAmount
      );
      this.repos.payments.update(paymentId, {
        amountPaid,
        paidDate,
        paymentMethod,
        referenceNote,
        signatureHash,
      });
      this.repos.audit.insert({
        actorId: user.id,
        action: 'payment.update',
        entity: 'payment',
        entityId: paymentId,
        before: toPaymentRecord(payment),
        after: toPaymentRecord(this.repos.payments.findById(paymentId)!),
      });
      return toPaymentRecord(this.repos.payments.findById(paymentId)!);
    });
  }

  voidPayment(user: AuthUser, chitId: number, paymentId: number, reason: unknown): PaymentRecord {
    this.requireOwnedChit(user, chitId);
    const payment = this.requirePaymentOfChit(chitId, paymentId);
    if (payment.status === 'VOID') throw conflict('This payment is already voided.');
    const voidReason = requireText(reason, 'Void reason');
    return this.tx(() => {
      this.repos.payments.void(paymentId, voidReason, sqliteUtcNow());
      this.repos.audit.insert({
        actorId: user.id,
        action: 'payment.void',
        entity: 'payment',
        entityId: paymentId,
        before: toPaymentRecord(payment),
        after: toPaymentRecord(this.repos.payments.findById(paymentId)!),
      });
      return toPaymentRecord(this.repos.payments.findById(paymentId)!);
    });
  }

  // ---------------------------------------------------------------- lift & cycle

  recordLift(
    user: AuthUser,
    chitId: number,
    payload: Record<string, unknown>
  ): void {
    const chit = this.requireOwnedChit(user, chitId);
    const monthNumber = requireIntInRange(payload.monthNumber, 'Month number', 1, chit.durationMonths);
    const winnerMemberSlotId = requirePositiveInt(payload.winnerMemberSlotId, 'Winning member ticket');
    const winner = this.requireSlotOfChit(chitId, winnerMemberSlotId);

    if (winner.prizedMonth !== null && winner.prizedMonth !== monthNumber) {
      throw conflict(
        `Ticket #${winner.ticketNumber} already lifted the chit in Month ${winner.prizedMonth}.`
      );
    }
    const schedRow = this.repos.chits.findSchedule(chitId, monthNumber);
    if (!schedRow) throw notFound(`Schedule month ${monthNumber} not found.`);

    const payoutDate = optionalDate(payload.payoutDate, 'Payout date') ?? getTodayIST();
    const payoutReference =
      optionalText(payload.payoutReference, 'Payout reference') || `PAYOUT-M${monthNumber}`;
    const bidDiscount = optionalPositiveInt(payload.bidDiscount, 'Bid discount');

    this.tx(() => {
      // If another ticket was previously set as winner for this month, clear it.
      if (
        schedRow.winnerMemberSlotId !== null &&
        schedRow.winnerMemberSlotId !== winnerMemberSlotId
      ) {
        this.repos.slots.clearPrized(schedRow.winnerMemberSlotId);
      }

      const before = { schedule: schedRow, winnerSlot: winner };
      if (chit.chitType === 'AUCTION') {
        const lift = computeAuctionLift({
          faceValue: chit.faceValue,
          totalSlots: chit.totalSlots,
          baseInstallment: chit.baseInstallment,
          foremanCommissionPct: chit.foremanCommissionPct,
          bidDiscount: bidDiscount ?? undefined,
        });
        this.repos.chits.updateScheduleLift(schedRow.id, {
          nonPrizedInstallment: lift.netInstallment,
          prizedInstallment: lift.netInstallment,
          chitValue: lift.winnerPayout,
          bidDiscount: lift.bidDiscount,
          dividendPerMember: lift.dividendPerMember,
          foremanCommission: lift.foremanCommission,
          winnerMemberSlotId,
          payoutDate,
          payoutReference,
        });
        this.repos.slots.updatePrized(winnerMemberSlotId, {
          prizedMonth: monthNumber,
          prizedAmount: lift.winnerPayout,
          payoutDate,
        });
      } else {
        this.repos.chits.markScheduleLifted(schedRow.id, {
          winnerMemberSlotId,
          payoutDate,
          payoutReference,
        });
        this.repos.slots.updatePrized(winnerMemberSlotId, {
          prizedMonth: monthNumber,
          prizedAmount: schedRow.chitValue,
          payoutDate,
        });
      }
      this.repos.audit.insert({
        actorId: user.id,
        action: 'lift.record',
        entity: 'chit_schedule',
        entityId: schedRow.id,
        before,
        after: {
          monthNumber,
          winnerMemberSlotId,
          payoutDate,
          payoutReference,
          chitType: chit.chitType,
        },
      });
    });
  }

  setCurrentMonth(user: AuthUser, chitId: number, currentMonth: unknown): number {
    const chit = this.requireOwnedChit(user, chitId);
    const month = requireIntInRange(currentMonth, 'Current month', 1, chit.durationMonths);
    this.tx(() => {
      this.repos.chits.update(chitId, { currentMonth: month });
      this.repos.audit.insert({
        actorId: user.id,
        action: 'chit.set-current-month',
        entity: 'chit_group',
        entityId: chitId,
        before: { currentMonth: chit.currentMonth },
        after: { currentMonth: month },
      });
    });
    return month;
  }

  // ---------------------------------------------------------------- helpers

  private assertLedgerAccess(user: AuthUser): void {
    if (user.role === 'developer') {
      throw forbidden('Developer accounts have no chit ledger access.');
    }
  }

  private assertOwner(user: AuthUser): void {
    if (user.role !== 'organizer') {
      throw forbidden('Only chit owners can do this.');
    }
  }

  private requireOwnedChit(user: AuthUser, chitId: number): ChitGroupRow {
    this.assertOwner(user);
    const chit = this.repos.chits.findById(chitId);
    if (!chit) throw notFound('Chit group not found.');
    if (chit.organizerId !== user.id) throw forbidden('Only the chit owner can do this.');
    return chit;
  }

  private requireSlotOfChit(chitId: number, slotId: number): SlotRow {
    const slot = this.repos.slots.findById(slotId);
    if (!slot || slot.chitGroupId !== chitId) throw notFound('Member ticket slot not found in this chit group.');
    return slot;
  }

  private requirePaymentOfChit(chitId: number, paymentId: number): PaymentRow {
    const payment = this.repos.payments.findById(paymentId);
    if (!payment || payment.chitGroupId !== chitId) throw notFound('Payment not found in this chit group.');
    return payment;
  }

  private parseChitType(value: unknown): ChitType {
    if (value === 'AUCTION') return 'AUCTION';
    if (value === 'FIXED_TABLE' || value === undefined || value === null) return 'FIXED_TABLE';
    throw badRequest('Chit type must be FIXED_TABLE or AUCTION.');
  }

  private defaultSchedule(
    durationMonths: number,
    startDate: string,
    dueDayOfMonth: number,
    baseInstallment: number,
    faceValue: number
  ): ScheduleCreateRow[] {
    const rows: ScheduleCreateRow[] = [];
    for (let m = 1; m <= durationMonths; m++) {
      rows.push({
        monthNumber: m,
        chitDate: addMonthsToDate(startDate, m - 1, dueDayOfMonth),
        nonPrizedInstallment: baseInstallment,
        chitValue: faceValue,
        prizedInstallment: baseInstallment,
      });
    }
    return rows;
  }

  private parseScheduleInput(
    value: unknown,
    ctx: {
      durationMonths: number;
      startDate: string;
      dueDayOfMonth: number;
      baseInstallment: number;
      faceValue: number;
    }
  ): ScheduleCreateRow[] {
    if (value === undefined || value === null) {
      return this.defaultSchedule(
        ctx.durationMonths,
        ctx.startDate,
        ctx.dueDayOfMonth,
        ctx.baseInstallment,
        ctx.faceValue
      );
    }
    if (!Array.isArray(value)) throw badRequest('Schedule must be an array of month rows.');
    const rows: ScheduleCreateRow[] = [];
    const seen = new Set<number>();
    for (const raw of value) {
      const entry = (raw ?? {}) as Record<string, unknown>;
      const monthNumber = requireIntInRange(entry.monthNumber, 'Schedule month', 1, ctx.durationMonths);
      if (seen.has(monthNumber)) throw badRequest(`Schedule month ${monthNumber} is duplicated.`);
      seen.add(monthNumber);
      const chitDate =
        optionalDate(entry.chitDate, 'Schedule date') ??
        addMonthsToDate(ctx.startDate, monthNumber - 1, ctx.dueDayOfMonth);
      rows.push({
        monthNumber,
        chitDate,
        nonPrizedInstallment: requirePositiveInt(entry.nonPrizedInstallment, 'Non-prized installment'),
        chitValue: requirePositiveInt(entry.chitValue, 'Chit value'),
        prizedInstallment: requirePositiveInt(entry.prizedInstallment, 'Prized installment'),
      });
    }
    for (let m = 1; m <= ctx.durationMonths; m++) {
      if (!seen.has(m)) throw badRequest(`Schedule is missing month ${m}.`);
    }
    return rows.sort((a, b) => a.monthNumber - b.monthNumber);
  }

  private buildSummary(chit: ChitGroupRow, viewer: AuthUser): ChitGroupSummary {
    const allSlots = this.repos.slots.listByChit(chit.id);
    const isMemberView = viewer.role === 'member';
    // Members only ever see their own rows: every query is filtered by user_id.
    const visibleSlots = isMemberView ? allSlots.filter((s) => s.userId === viewer.id) : allSlots;

    const schedules = this.repos.chits.listSchedules(chit.id);
    const currentSched = schedules.find((s) => s.monthNumber === chit.currentMonth);
    const paidBySlot = new Map<number, number>();
    for (const p of this.repos.payments.listByChit(chit.id)) {
      if (p.status !== 'POSTED' || p.monthNumber !== chit.currentMonth) continue;
      if (isMemberView && !visibleSlots.some((s) => s.id === p.memberSlotId)) continue;
      paidBySlot.set(p.memberSlotId, (paidBySlot.get(p.memberSlotId) ?? 0) + p.amountPaid);
    }

    let currentMonthTarget = 0;
    let currentMonthCollected = 0;
    let currentMonthPaidCount = 0;
    for (const slot of visibleSlots) {
      const expected = currentSched
        ? getMemberPayableForMonth(
            chit.chitType,
            {
              monthNumber: chit.currentMonth,
              nonPrizedInstallment: currentSched.nonPrizedInstallment,
              prizedInstallment: currentSched.prizedInstallment,
            },
            slot.prizedMonth
          )
        : 0;
      const paidSum = paidBySlot.get(slot.id) ?? 0;
      currentMonthTarget += expected;
      currentMonthCollected += paidSum;
      // A ticket counts as paid only once its POSTED receipts cover the month.
      if (currentSched && paidSum >= expected) {
        currentMonthPaidCount += 1;
      }
    }

    const organizer = this.repos.users.findById(chit.organizerId);

    let mySlots: ChitGroupSummary['mySlots'];
    if (isMemberView && visibleSlots.length > 0) {
      mySlots = visibleSlots.map((slot) => {
        const total = this.repos.payments
          .listByChit(chit.id)
          .filter((p) => p.memberSlotId === slot.id && p.status === 'POSTED')
          .reduce((sum, p) => sum + p.amountPaid, 0);
        const expected = currentSched
          ? getMemberPayableForMonth(
              chit.chitType,
              {
                monthNumber: chit.currentMonth,
                nonPrizedInstallment: currentSched.nonPrizedInstallment,
                prizedInstallment: currentSched.prizedInstallment,
              },
              slot.prizedMonth
            )
          : 0;
        const paidSum = paidBySlot.get(slot.id) ?? 0;
        return {
          slotId: slot.id,
          ticketNumber: slot.ticketNumber,
          prizedMonth: slot.prizedMonth,
          prizedAmount: slot.prizedAmount,
          currentMonthDue: currentSched ? Math.max(0, expected - paidSum) : 0,
          currentMonthPaid: currentSched !== undefined && paidSum >= expected,
          totalPaidSoFar: total,
        };
      });
    }

    return {
      id: chit.id,
      code: chit.code,
      name: chit.name,
      chitType: chit.chitType,
      faceValue: chit.faceValue,
      durationMonths: chit.durationMonths,
      totalSlots: chit.totalSlots,
      enrolledSlots: visibleSlots.length,
      currentMonth: chit.currentMonth,
      startDate: chit.startDate,
      dueDayOfMonth: chit.dueDayOfMonth,
      baseInstallment: chit.baseInstallment,
      foremanCommissionPct: chit.foremanCommissionPct,
      maxBidPct: chit.maxBidPct,
      organizerId: chit.organizerId,
      organizerName: organizer?.name ?? 'Foreman',
      organizerPhone: organizer?.phone ?? '',
      status: chit.status,
      notes: chit.notes,
      currentMonthTarget,
      currentMonthCollected,
      currentMonthPaidCount,
      nextChitDate: currentSched ? currentSched.chitDate : chit.startDate,
      mySlots,
    };
  }
}
