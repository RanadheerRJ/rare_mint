export type UserRole = 'developer' | 'organizer' | 'member';

export type ChitType = 'FIXED_TABLE' | 'AUCTION';

export type PaymentMethod = 'UPI' | 'CASH' | 'BANK_TRANSFER' | 'CHEQUE';

export interface User {
  id: number;
  name: string;
  phone: string;
  role: UserRole;
  city: string;
  createdAt: string;
  isActive: boolean;
}

/** Developer-dashboard row: an invited chit owner with account state. */
export interface OwnerSummary extends User {
  chitCount: number;
}

export interface PlatformStats {
  owners: number;
  chits: number;
  members: number;
}

export interface ScheduleRow {
  id: number;
  chitGroupId: number;
  monthNumber: number;
  chitDate: string; // YYYY-MM-DD
  nonPrizedInstallment: number; // For FIXED_TABLE: scheduled non-prized rate; For AUCTION: net payable after dividend (or baseInstallment before auction)
  chitValue: number; // Payout amount to winner in this month
  prizedInstallment: number; // For FIXED_TABLE: prized rate (e.g. 37000); For AUCTION: net payable after dividend
  // Auction metadata (populated for AUCTION chits once auctioned, or null)
  bidDiscount: number | null;
  dividendPerMember: number | null;
  foremanCommission: number | null;
  isAuctionCompleted: boolean;
  // Monthly winner info
  winnerMemberSlotId: number | null;
  winnerName?: string | null;
  winnerTicketNumber?: number | null;
  payoutDate: string | null;
  payoutReference: string | null;
}

export interface MemberSlot {
  id: number;
  chitGroupId: number;
  userId: number;
  ticketNumber: number; // 1 .. totalSlots
  memberName: string;
  memberPhone: string;
  joinedDate: string;
  prizedMonth: number | null; // Month number when this slot lifted the chit, or null
  prizedAmount: number | null;
  payoutDate: string | null;
}

export interface PaymentRecord {
  id: number;
  receiptNumber: string;
  chitGroupId: number;
  chitName?: string;
  chitCode?: string;
  memberSlotId: number;
  ticketNumber?: number;
  memberName?: string;
  memberPhone?: string;
  monthNumber: number;
  amountPaid: number;
  paidDate: string; // YYYY-MM-DD
  paymentMethod: PaymentMethod;
  referenceNote: string;
  signedByName: string;
  signatureHash: string;
  status: 'POSTED' | 'VOID';
  voidReason: string;
  voidedAt: string | null;
  createdAt: string;
}

export interface ChitGroupSummary {
  id: number;
  code: string;
  name: string;
  chitType: ChitType;
  faceValue: number;
  durationMonths: number;
  totalSlots: number;
  enrolledSlots: number;
  currentMonth: number;
  startDate: string;
  dueDayOfMonth: number;
  baseInstallment: number;
  foremanCommissionPct: number;
  maxBidPct: number;
  organizerId: number;
  organizerName: string;
  organizerPhone: string;
  status: 'ACTIVE' | 'COMPLETED';
  notes: string;
  // Current month collection stats
  currentMonthTarget: number;
  currentMonthCollected: number;
  currentMonthPaidCount: number;
  nextChitDate: string;
  // Optional member-specific fields when viewed by a member
  mySlots?: Array<{
    slotId: number;
    ticketNumber: number;
    prizedMonth: number | null;
    prizedAmount: number | null;
    currentMonthDue: number;
    currentMonthPaid: boolean;
    totalPaidSoFar: number;
  }>;
}

export interface ChitGroupDetail extends ChitGroupSummary {
  schedule: ScheduleRow[];
  slots: MemberSlot[];
  payments: PaymentRecord[];
}

export interface DueItem {
  chitGroupId: number;
  chitCode: string;
  chitName: string;
  chitType: ChitType;
  monthNumber: number;
  dueDate: string;
  isOverdue: boolean;
  daysUntilDue: number;
  memberSlotId: number;
  ticketNumber: number;
  memberName: string;
  memberPhone: string;
  isPrizedSubscriber: boolean;
  amountDue: number;
  organizerName: string;
}

export interface LiftAnalysisRow {
  monthNumber: number;
  chitDate: string;
  paidBeforeOrAtLift: number;
  paidAfterLift: number;
  totalPaid: number;
  payoutValue: number;
  netGainOrCost: number; // payoutValue - totalPaid
  annualizedIrrPct: number; // Effective annual return/cost %
  reinvestedMaturityBenefit: number; // Net wealth at end of chit if payout earns/saves externalRatePct p.a.
  tag?: 'BEST_OVERALL' | 'BEST_SAVER' | 'BREAK_EVEN' | 'LOW_COST_LOAN';
}
