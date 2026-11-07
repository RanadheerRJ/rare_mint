import type { ChitType, PaymentMethod } from '../../src/types';

/**
 * Repository contracts. All SQL lives in the sqlite implementations; a future
 * Supabase/Postgres backend implements these same interfaces without touching
 * routes, services or UI.
 */

export type UserRole = 'developer' | 'organizer' | 'member';

export interface UserRecord {
  id: number;
  name: string;
  phone: string;
  role: UserRole;
  city: string;
  isActive: boolean;
  createdAt: string;
  /** scrypt hash; never leaves the server. */
  pinHash: string;
  /** per-user scrypt salt; never leaves the server. */
  pinSalt: string;
}

export interface SessionRecord {
  id: number;
  userId: number;
  /** SHA-256 of the bearer token; the raw token is never stored. */
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
}

export interface LoginLockRecord {
  phone: string;
  failedCount: number;
  lockedUntil: string | null;
  updatedAt: string;
}

export interface ChitGroupRow {
  id: number;
  code: string;
  name: string;
  chitType: ChitType;
  faceValue: number;
  durationMonths: number;
  totalSlots: number;
  currentMonth: number;
  startDate: string;
  dueDayOfMonth: number;
  baseInstallment: number;
  foremanCommissionPct: number;
  maxBidPct: number;
  organizerId: number;
  status: 'ACTIVE' | 'COMPLETED';
  notes: string;
  createdAt: string;
}

export interface ScheduleRowData {
  id: number;
  chitGroupId: number;
  monthNumber: number;
  chitDate: string;
  nonPrizedInstallment: number;
  chitValue: number;
  prizedInstallment: number;
  bidDiscount: number | null;
  dividendPerMember: number | null;
  foremanCommission: number | null;
  isAuctionCompleted: boolean;
  winnerMemberSlotId: number | null;
  payoutDate: string | null;
  payoutReference: string | null;
}

export interface SlotRow {
  id: number;
  chitGroupId: number;
  userId: number;
  ticketNumber: number;
  joinedDate: string;
  prizedMonth: number | null;
  prizedAmount: number | null;
  payoutDate: string | null;
  memberName: string;
  memberPhone: string;
}

export interface PaymentRow {
  id: number;
  receiptNumber: string;
  chitGroupId: number;
  memberSlotId: number;
  monthNumber: number;
  amountPaid: number;
  paidDate: string;
  paymentMethod: PaymentMethod;
  referenceNote: string;
  signedByName: string;
  signatureHash: string;
  status: 'POSTED' | 'VOID';
  voidReason: string;
  voidedAt: string | null;
  createdAt: string;
  // joined fields
  ticketNumber: number;
  memberName: string;
  memberPhone: string;
  chitName: string;
  chitCode: string;
}

export interface OwnerSummary {
  id: number;
  name: string;
  phone: string;
  city: string;
  isActive: boolean;
  createdAt: string;
  chitCount: number;
}

export interface AuditEntry {
  actorId: number | null;
  action: string;
  entity: string;
  entityId: number | null;
  before: unknown | null;
  after: unknown | null;
}

export interface UsersRepository {
  findById(id: number): UserRecord | null;
  findByPhone(phone: string): UserRecord | null;
  insert(input: {
    name: string;
    phone: string;
    pinHash: string;
    pinSalt: string;
    role: UserRole;
    city: string;
  }): UserRecord;
  /** Seed/refresh the platform developer from env; never reachable from the UI. */
  upsertDeveloper(input: { name: string; phone: string; pinHash: string; pinSalt: string }): UserRecord;
  updateProfile(id: number, input: { name?: string; city?: string; phone?: string }): void;
  updatePin(id: number, pinHash: string, pinSalt: string): void;
  setActive(id: number, isActive: boolean): void;
  deleteById(id: number): void;
  listOwners(): OwnerSummary[];
  listMembersEnrolledWithOwner(ownerId: number): UserRecord[];
  countByRole(role: UserRole): number;
}

export interface SessionsRepository {
  insert(userId: number, tokenHash: string, expiresAt: string): SessionRecord;
  findByTokenHash(tokenHash: string): SessionRecord | null;
  deleteByTokenHash(tokenHash: string): void;
  deleteExpired(): void;
}

export interface LoginLocksRepository {
  findByPhone(phone: string): LoginLockRecord | null;
  upsert(phone: string, failedCount: number, lockedUntil: string | null): void;
  clear(phone: string): void;
}

export interface ChitCreateInput {
  code: string;
  name: string;
  chitType: ChitType;
  faceValue: number;
  durationMonths: number;
  totalSlots: number;
  startDate: string;
  dueDayOfMonth: number;
  baseInstallment: number;
  foremanCommissionPct: number;
  maxBidPct: number;
  organizerId: number;
  notes: string;
}

export interface ChitUpdateInput {
  name?: string;
  notes?: string;
  dueDayOfMonth?: number;
  startDate?: string;
  foremanCommissionPct?: number;
  maxBidPct?: number;
  faceValue?: number;
  durationMonths?: number;
  totalSlots?: number;
  chitType?: ChitType;
  baseInstallment?: number;
  status?: 'ACTIVE' | 'COMPLETED';
  currentMonth?: number;
}

export interface ScheduleCreateRow {
  monthNumber: number;
  chitDate: string;
  nonPrizedInstallment: number;
  chitValue: number;
  prizedInstallment: number;
}

export interface ChitsRepository {
  findById(id: number): ChitGroupRow | null;
  listByOrganizer(organizerId: number): ChitGroupRow[];
  listByMember(userId: number): ChitGroupRow[];
  insert(input: ChitCreateInput): ChitGroupRow;
  update(id: number, input: ChitUpdateInput): void;
  deleteById(id: number): void;
  countAll(): number;
  countByOrganizer(organizerId: number): number;

  // schedule rows (part of the chit aggregate)
  listSchedules(chitGroupId: number): ScheduleRowData[];
  findSchedule(chitGroupId: number, monthNumber: number): ScheduleRowData | null;
  insertSchedules(chitGroupId: number, rows: ScheduleCreateRow[]): void;
  deleteSchedules(chitGroupId: number): void;
  updateScheduleDate(id: number, chitDate: string): void;
  updateScheduleLift(
    id: number,
    input: {
      nonPrizedInstallment: number;
      prizedInstallment: number;
      chitValue: number;
      bidDiscount: number;
      dividendPerMember: number;
      foremanCommission: number;
      winnerMemberSlotId: number;
      payoutDate: string;
      payoutReference: string;
    }
  ): void;
  markScheduleLifted(
    id: number,
    input: { winnerMemberSlotId: number; payoutDate: string; payoutReference: string }
  ): void;
  clearScheduleWinner(id: number): void;
}

export interface SlotsRepository {
  findById(id: number): SlotRow | null;
  listByChit(chitGroupId: number): SlotRow[];
  listByChitAndUser(chitGroupId: number, userId: number): SlotRow[];
  insert(input: { chitGroupId: number; userId: number; ticketNumber: number; joinedDate: string }): SlotRow;
  updateTicketNumber(id: number, ticketNumber: number): void;
  updatePrized(id: number, input: { prizedMonth: number; prizedAmount: number; payoutDate: string }): void;
  clearPrized(id: number): void;
  deleteById(id: number): void;
  /** True when the member holds at least one ticket in one of the owner's chits. */
  isMemberEnrolledWithOwner(userId: number, ownerId: number): boolean;
}

export interface PaymentInsertInput {
  receiptNumber: string;
  chitGroupId: number;
  memberSlotId: number;
  monthNumber: number;
  amountPaid: number;
  paidDate: string;
  paymentMethod: PaymentMethod;
  referenceNote: string;
  signedByName: string;
  signatureHash: string;
}

export interface PaymentUpdateInput {
  amountPaid?: number;
  paidDate?: string;
  paymentMethod?: PaymentMethod;
  referenceNote?: string;
  signatureHash?: string;
}

export interface PaymentsRepository {
  findById(id: number): PaymentRow | null;
  listByChit(chitGroupId: number): PaymentRow[];
  listByUser(userId: number): PaymentRow[];
  listByOrganizer(organizerId: number): PaymentRow[];
  insert(input: PaymentInsertInput): PaymentRow;
  update(id: number, input: PaymentUpdateInput): void;
  void(id: number, reason: string, voidedAt: string): void;
  /** Counts every payment row (including voided ones) for the given chit. */
  countByChit(chitGroupId: number): number;
  countBySlot(memberSlotId: number): number;
  findOpenBySlotAndMonth(memberSlotId: number, monthNumber: number): PaymentRow | null;
  /** Increments and returns the global receipt sequence; call inside a transaction. */
  nextReceiptSequence(): number;
}

export interface AuditRepository {
  insert(entry: AuditEntry): void;
}

export interface Repositories {
  users: UsersRepository;
  sessions: SessionsRepository;
  loginLocks: LoginLocksRepository;
  chits: ChitsRepository;
  slots: SlotsRepository;
  payments: PaymentsRepository;
  audit: AuditRepository;
}
