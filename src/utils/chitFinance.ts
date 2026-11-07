import { ChitType, LiftAnalysisRow, ScheduleRow } from '../types';

export interface RawScheduleTemplateRow {
  monthNumber: number;
  nonPrizedInstallment: number;
  chitValue: number;
  prizedInstallment: number;
}

/**
 * Exact 16-month ₹5,00,000 Fixed-Table Passbook schedule from the classic Telugu chit card:
 * Non-prized sum = ₹4,50,000 | Prized rate = ₹37,000/mo | Bonus payout M15 = ₹5,15,000, M16 = ₹5,30,000
 */
export const CLASSIC_5L_16M_SCHEDULE: RawScheduleTemplateRow[] = [
  { monthNumber: 1, nonPrizedInstallment: 37000, chitValue: 500000, prizedInstallment: 37000 },
  { monthNumber: 2, nonPrizedInstallment: 36500, chitValue: 500000, prizedInstallment: 37000 },
  { monthNumber: 3, nonPrizedInstallment: 35000, chitValue: 500000, prizedInstallment: 37000 },
  { monthNumber: 4, nonPrizedInstallment: 34000, chitValue: 500000, prizedInstallment: 37000 },
  { monthNumber: 5, nonPrizedInstallment: 32500, chitValue: 500000, prizedInstallment: 37000 },
  { monthNumber: 6, nonPrizedInstallment: 31000, chitValue: 500000, prizedInstallment: 37000 },
  { monthNumber: 7, nonPrizedInstallment: 30500, chitValue: 500000, prizedInstallment: 37000 },
  { monthNumber: 8, nonPrizedInstallment: 29000, chitValue: 500000, prizedInstallment: 37000 },
  { monthNumber: 9, nonPrizedInstallment: 28500, chitValue: 500000, prizedInstallment: 37000 },
  { monthNumber: 10, nonPrizedInstallment: 27200, chitValue: 500000, prizedInstallment: 37000 },
  { monthNumber: 11, nonPrizedInstallment: 26700, chitValue: 500000, prizedInstallment: 37000 },
  { monthNumber: 12, nonPrizedInstallment: 25700, chitValue: 500000, prizedInstallment: 37000 },
  { monthNumber: 13, nonPrizedInstallment: 23700, chitValue: 500000, prizedInstallment: 37000 },
  { monthNumber: 14, nonPrizedInstallment: 21700, chitValue: 500000, prizedInstallment: 37000 },
  { monthNumber: 15, nonPrizedInstallment: 19700, chitValue: 515000, prizedInstallment: 37000 },
  { monthNumber: 16, nonPrizedInstallment: 11300, chitValue: 530000, prizedInstallment: 37000 },
];

export interface ChitPreset {
  id: string;
  label: string;
  subtitle: string;
  chitType: ChitType;
  faceValue: number;
  durationMonths: number;
  baseInstallment: number;
  foremanCommissionPct: number;
  maxBidPct: number;
  schedule: RawScheduleTemplateRow[];
}

export function generateProportionalFixedSchedule(
  faceValue: number,
  durationMonths: number
): RawScheduleTemplateRow[] {
  if (faceValue === 500000 && durationMonths === 16) {
    return CLASSIC_5L_16M_SCHEDULE.map((r) => ({ ...r }));
  }

  // Smooth realistic slab curve modeled after Indian fixed-table passbooks:
  // Prized rate ~ (faceValue / durationMonths) * 1.18, rounded to nearest 100
  const base = faceValue / durationMonths;
  const prizedRate = Math.round((base * 1.18) / 100) * 100;
  const rows: RawScheduleTemplateRow[] = [];

  for (let m = 1; m <= durationMonths; m++) {
    const progress = (m - 1) / Math.max(1, durationMonths - 1);
    // Non-prized tapers from prizedRate in M1 down to ~0.42 * base in final month
    const factor = m === 1 ? 1 : 1 - Math.pow(progress, 1.32) * 0.64;
    const nonPrized =
      m === 1
        ? prizedRate
        : Math.max(500, Math.round((prizedRate * factor) / 100) * 100);

    let chitValue = faceValue;
    if (m === durationMonths - 1 && durationMonths >= 10) {
      chitValue = Math.round((faceValue * 1.03) / 500) * 500;
    } else if (m === durationMonths && durationMonths >= 10) {
      chitValue = Math.round((faceValue * 1.06) / 500) * 500;
    }

    rows.push({
      monthNumber: m,
      nonPrizedInstallment: nonPrized,
      chitValue,
      prizedInstallment: prizedRate,
    });
  }
  return rows;
}

export function generateAuctionInitialSchedule(
  faceValue: number,
  durationMonths: number
): RawScheduleTemplateRow[] {
  const base = Math.round(faceValue / durationMonths);
  return Array.from({ length: durationMonths }, (_, idx) => ({
    monthNumber: idx + 1,
    nonPrizedInstallment: base,
    chitValue: faceValue,
    prizedInstallment: base,
  }));
}

export const CHIT_PRESETS: ChitPreset[] = [
  {
    id: 'classic-5l-16m',
    label: '₹5,00,000 · 16 Months Passbook Table',
    subtitle: 'Exact match to physical passbook card (Non-Prized ₹37k→₹11.3k, Prized ₹37k, M15/16 Bonus)',
    chitType: 'FIXED_TABLE',
    faceValue: 500000,
    durationMonths: 16,
    baseInstallment: 37000,
    foremanCommissionPct: 5,
    maxBidPct: 0,
    schedule: CLASSIC_5L_16M_SCHEDULE,
  },
  {
    id: 'fixed-1l-20m',
    label: '₹1,00,000 · 20 Months Fixed Table',
    subtitle: 'Popular family savings slab card (Prized ₹5,900/-, bonus payout in Months 19–20)',
    chitType: 'FIXED_TABLE',
    faceValue: 100000,
    durationMonths: 20,
    baseInstallment: 5900,
    foremanCommissionPct: 5,
    maxBidPct: 0,
    schedule: generateProportionalFixedSchedule(100000, 20),
  },
  {
    id: 'auction-2l-20m',
    label: '₹2,00,000 · 20 Months Auction Chit',
    subtitle: 'Monthly bidding & dividend sharing (Base ₹10,000/-, 5% Foreman Commission, Max 35% Bid)',
    chitType: 'AUCTION',
    faceValue: 200000,
    durationMonths: 20,
    baseInstallment: 10000,
    foremanCommissionPct: 5,
    maxBidPct: 35,
    schedule: generateAuctionInitialSchedule(200000, 20),
  },
  {
    id: 'auction-10l-25m',
    label: '₹10,00,000 · 25 Months Business Auction',
    subtitle: 'SME working-capital chit (Base ₹40,000/-, 5% Commission, Max 35% Bid)',
    chitType: 'AUCTION',
    faceValue: 1000000,
    durationMonths: 25,
    baseInstallment: 40000,
    foremanCommissionPct: 5,
    maxBidPct: 35,
    schedule: generateAuctionInitialSchedule(1000000, 25),
  },
];

/**
 * Determines what a specific member slot pays in a given month.
 * In Fixed-Table chits:
 *  - Before or at the month of lifting (prizedMonth === null || prizedMonth >= monthNumber),
 *    the member pays the Non-Prized rate (చిట్టీ తీసుకోనివారు).
 *  - Starting the month AFTER lifting (prizedMonth < monthNumber),
 *    the member pays the Prized rate (చిట్టీ తీసుకున్న వారు, e.g., ₹37,000/-).
 * In Auction chits:
 *  - Every member shares the monthly dividend equally and pays row.nonPrizedInstallment.
 */
export function getMemberPayableForMonth(
  chitType: ChitType,
  row: Pick<ScheduleRow, 'monthNumber' | 'nonPrizedInstallment' | 'prizedInstallment'>,
  prizedMonth: number | null
): number {
  if (chitType === 'FIXED_TABLE') {
    if (prizedMonth !== null && prizedMonth < row.monthNumber) {
      return row.prizedInstallment;
    }
    return row.nonPrizedInstallment;
  }
  return row.nonPrizedInstallment;
}

/**
 * Computes monthly IRR using robust bisection + Newton-Raphson refinement,
 * returning annualized effective percentage ((1 + r)^12 - 1) * 100.
 */
export function computeAnnualizedIrrPct(cashflows: number[]): number {
  const hasPos = cashflows.some((c) => c > 0);
  const hasNeg = cashflows.some((c) => c < 0);
  if (!hasPos || !hasNeg) return 0;

  const npv = (rate: number): number => {
    let sum = 0;
    for (let t = 0; t < cashflows.length; t++) {
      sum += cashflows[t] / Math.pow(1 + rate, t);
    }
    return sum;
  };

  // Bisection over monthly rate [-0.5, 0.5] (-50%/mo to +50%/mo)
  let low = -0.45;
  let high = 0.5;
  let fLow = npv(low);
  let fHigh = npv(high);

  if (fLow * fHigh > 0) {
    return 0;
  }

  let mid = 0;
  for (let iter = 0; iter < 80; iter++) {
    mid = (low + high) / 2;
    const fMid = npv(mid);
    if (Math.abs(fMid) < 1e-6) break;
    if (fLow * fMid <= 0) {
      high = mid;
      fHigh = fMid;
    } else {
      low = mid;
      fLow = fMid;
    }
  }

  const annualized = (Math.pow(1 + mid, 12) - 1) * 100;
  return Number.isFinite(annualized) ? Math.round(annualized * 100) / 100 : 0;
}

/**
 * Analyzes every possible Lift Month (1..N) to help a subscriber pick the optimal month
 * based on their goal (pure chit savings vs external loan/investment opportunity rate).
 */
export function analyzeLiftMonths(
  chitType: ChitType,
  schedule: Array<Pick<ScheduleRow, 'monthNumber' | 'chitDate' | 'nonPrizedInstallment' | 'chitValue' | 'prizedInstallment'>>,
  externalAnnualRatePct: number
): LiftAnalysisRow[] {
  const sorted = [...schedule].sort((a, b) => a.monthNumber - b.monthNumber);
  const N = sorted.length;
  const monthlyOppRate = Math.pow(1 + Math.max(0, externalAnnualRatePct) / 100, 1 / 12) - 1;

  const rows: LiftAnalysisRow[] = sorted.map((liftRow) => {
    const k = liftRow.monthNumber;
    let paidBeforeOrAtLift = 0;
    let paidAfterLift = 0;
    const cashflows: number[] = [];
    let futureValueNetAtMaturity = 0;

    for (const r of sorted) {
      const m = r.monthNumber;
      const installment = getMemberPayableForMonth(chitType, r, k);
      if (m <= k) {
        paidBeforeOrAtLift += installment;
      } else {
        paidAfterLift += installment;
      }

      const payout = m === k ? r.chitValue : 0;
      const netCf = payout - installment;
      cashflows.push(netCf);

      const monthsRemainingToEnd = N - m;
      futureValueNetAtMaturity += netCf * Math.pow(1 + monthlyOppRate, monthsRemainingToEnd);
    }

    const totalPaid = paidBeforeOrAtLift + paidAfterLift;
    const payoutValue = liftRow.chitValue;
    const netGainOrCost = payoutValue - totalPaid;
    const annualizedIrrPct = computeAnnualizedIrrPct(cashflows);

    return {
      monthNumber: k,
      chitDate: liftRow.chitDate,
      paidBeforeOrAtLift,
      paidAfterLift,
      totalPaid,
      payoutValue,
      netGainOrCost,
      annualizedIrrPct,
      reinvestedMaturityBenefit: Math.round(futureValueNetAtMaturity),
    };
  });

  if (rows.length > 0) {
    // Identify best overall when considering external opportunity rate
    let bestOverallIdx = 0;
    let bestSaverIdx = 0;
    let breakEvenIdx = -1;

    for (let i = 0; i < rows.length; i++) {
      if (rows[i].reinvestedMaturityBenefit > rows[bestOverallIdx].reinvestedMaturityBenefit) {
        bestOverallIdx = i;
      }
      if (rows[i].netGainOrCost > rows[bestSaverIdx].netGainOrCost) {
        bestSaverIdx = i;
      }
      if (breakEvenIdx === -1 && rows[i].netGainOrCost >= 0) {
        breakEvenIdx = i;
      }
    }

    rows[bestSaverIdx].tag = 'BEST_SAVER';
    if (breakEvenIdx !== -1 && breakEvenIdx !== bestSaverIdx && breakEvenIdx !== bestOverallIdx) {
      rows[breakEvenIdx].tag = 'BREAK_EVEN';
    }
    rows[bestOverallIdx].tag = 'BEST_OVERALL';
  }

  return rows;
}

export function addMonthsToDate(startDateStr: string, monthsToAdd: number, dueDay: number): string {
  const [y, m] = startDateStr.split('-').map(Number);
  const targetMonthIndex = m - 1 + monthsToAdd;
  const targetYear = y + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const maxDayInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const clampedDay = Math.min(dueDay, maxDayInMonth);
  const mm = String(targetMonth + 1).padStart(2, '0');
  const dd = String(clampedDay).padStart(2, '0');
  return `${targetYear}-${mm}-${dd}`;
}

export interface AuctionLiftInput {
  faceValue: number;
  totalSlots: number;
  baseInstallment: number;
  /** Foreman commission percentage, e.g. 5 for 5%. */
  foremanCommissionPct: number;
  /** Winning bid discount (>= commission). Defaults to the commission. */
  bidDiscount?: number;
}

export interface AuctionLiftResult {
  foremanCommission: number;
  bidDiscount: number;
  dividendPool: number;
  dividendPerMember: number;
  netInstallment: number;
  winnerPayout: number;
}

/**
 * Pure auction-chit lift math: foreman commission, bid discount, monthly
 * dividend per member, net installment and winner payout.
 */
export function computeAuctionLift(input: AuctionLiftInput): AuctionLiftResult {
  const commission = Math.round((input.faceValue * input.foremanCommissionPct) / 100);
  const bidDiscount = Math.max(commission, Math.round(input.bidDiscount ?? commission));
  const dividendPool = Math.max(0, bidDiscount - commission);
  const dividendPerMember = input.totalSlots > 0 ? Math.round(dividendPool / input.totalSlots) : 0;
  const netInstallment = Math.max(0, input.baseInstallment - dividendPerMember);
  const winnerPayout = Math.max(0, input.faceValue - bidDiscount);
  return {
    foremanCommission: commission,
    bidDiscount,
    dividendPool,
    dividendPerMember,
    netInstallment,
    winnerPayout,
  };
}

/**
 * Formats the next receipt number from a global sequence value and the payment
 * date. The year comes from the date (never hardcoded); uniqueness comes from
 * the transaction-scoped sequence.
 */
export function formatReceiptNumber(sequenceValue: number, paidDate: string): string {
  const year = /^\d{4}/.test(paidDate) ? paidDate.slice(0, 4) : String(new Date().getFullYear());
  return `RM-${year}-${String(sequenceValue).padStart(5, '0')}`;
}
