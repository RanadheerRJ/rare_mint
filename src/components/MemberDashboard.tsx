import React from 'react';
import {
  ArrowRight,
  Award,
  BookOpen,
  Calculator,
  CalendarClock,
  CheckCircle2,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { ChitGroupSummary, DueItem, PaymentRecord, User } from '../types';
import { formatIndianDate, formatPassbookAmount } from '../utils/format';

interface MemberDashboardProps {
  user: User;
  groups: ChitGroupSummary[];
  dues: DueItem[];
  receipts: PaymentRecord[];
  onOpenGroup: (groupId: number) => void;
  onOpenReceipt: (receipt: PaymentRecord) => void;
  onNavigateTab: (tab: 'overview' | 'groups' | 'calculator' | 'dues') => void;
}

export const MemberDashboard: React.FC<MemberDashboardProps> = ({
  user,
  groups,
  dues,
  receipts,
  onOpenGroup,
  onOpenReceipt,
  onNavigateTab,
}) => {
  const totalContributed = groups.reduce(
    (sum, g) =>
      sum + (g.mySlots ? g.mySlots.reduce((acc, s) => acc + s.totalPaidSoFar, 0) : 0),
    0
  );

  const totalChitValueJoined = groups.reduce(
    (sum, g) => sum + g.faceValue * (g.mySlots?.length || 1),
    0
  );

  const totalDueNow = dues.reduce((sum, d) => sum + d.amountDue, 0);

  return (
    <div className="space-y-6">
      {/* Subscriber Wealth Card */}
      <div className="rounded-2xl bg-[#0B3B2E] p-6 text-white shadow-md">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[0.16em] text-[#D4A437] uppercase">
              Subscriber Digital Passbook · {user.city}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
              Welcome, {user.name}
            </h1>
            <p className="mt-1 text-sm text-white/80">
              Enrolled in {groups.length} active chit{groups.length === 1 ? '' : 's'} · Combined Face Value{' '}
              <strong className="text-white">{formatPassbookAmount(totalChitValueJoined)}</strong>
            </p>
          </div>

          <button
            onClick={() => onNavigateTab('calculator')}
            className="inline-flex items-center gap-2 rounded-xl bg-[#D4A437] px-4 py-2.5 text-sm font-bold text-[#14201C] transition hover:bg-[#E1B449]"
          >
            <Calculator className="h-4 w-4" />
            Best Month to Lift
          </button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/15 bg-white/10 p-3.5">
            <div className="flex items-center gap-1.5 text-xs text-white/75">
              <Wallet className="h-3.5 w-3.5 text-[#F2CA6B]" />
              Total Paid & Signed
            </div>
            <p className="mt-1 text-xl font-bold text-white tabular-nums">
              {formatPassbookAmount(totalContributed)}
            </p>
          </div>

          <div className="rounded-xl border border-white/15 bg-white/10 p-3.5">
            <div className="flex items-center gap-1.5 text-xs text-white/75">
              <CalendarClock className="h-3.5 w-3.5 text-[#F2CA6B]" />
              Current Pending Dues
            </div>
            <p className="mt-1 text-xl font-bold text-[#F2CA6B] tabular-nums">
              {formatPassbookAmount(totalDueNow)}
            </p>
          </div>

          <div className="rounded-xl border border-white/15 bg-white/10 p-3.5">
            <div className="flex items-center gap-1.5 text-xs text-white/75">
              <ShieldCheck className="h-3.5 w-3.5 text-[#F2CA6B]" />
              Official Receipts
            </div>
            <p className="mt-1 text-xl font-bold text-white tabular-nums">
              {receipts.length} Signed
            </p>
          </div>
        </div>
      </div>

      {/* Upcoming Due Alert Banner */}
      {dues.length > 0 && (
        <div className="rounded-2xl border border-amber-400/50 bg-[#FFF8E6] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold tracking-wider text-amber-900 uppercase">
                Installment Due Reminder
              </p>
              <p className="mt-0.5 text-sm font-bold text-[#14201C]">
                {dues[0].chitName} · Month {dues[0].monthNumber} (Ticket #{dues[0].ticketNumber}) —{' '}
                <span className="text-[#0B3B2E] tabular-nums">
                  {formatPassbookAmount(dues[0].amountDue)}
                </span>
              </p>
              <p className="text-xs text-[#55655E]">
                Due Date: {formatIndianDate(dues[0].dueDate)} ·{' '}
                {dues[0].isPrizedSubscriber
                  ? 'Prized Subscriber Rate'
                  : 'Non-Prized Subscriber Rate'}
              </p>
            </div>
            <button
              onClick={() => onOpenGroup(dues[0].chitGroupId)}
              className="rounded-xl bg-[#0B3B2E] px-4 py-2 text-xs font-bold text-white hover:bg-[#135341]"
            >
              Open Passbook & Pay
            </button>
          </div>
        </div>
      )}

      {/* Joined Passbooks */}
      <div>
        <h2 className="mb-3 text-base font-bold text-[#14201C]">Your Digital Chit Passbooks</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {groups.map((g) => {
            const slot = g.mySlots?.[0];
            return (
              <div
                key={g.id}
                onClick={() => onOpenGroup(g.id)}
                className="group cursor-pointer rounded-2xl border border-[#0B3B2E]/15 bg-white p-5 transition hover:border-[#0B3B2E] hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-[#0B3B2E]/10 px-2 py-0.5 font-mono text-[11px] font-bold text-[#0B3B2E]">
                        {g.code}
                      </span>
                      {slot && (
                        <span className="rounded bg-[#FAF8F4] px-2 py-0.5 text-[11px] font-bold text-[#14201C]">
                          Ticket #{slot.ticketNumber}
                        </span>
                      )}
                    </div>
                    <h3 className="mt-2 text-base font-bold text-[#14201C] group-hover:text-[#0B3B2E]">
                      {g.name}
                    </h3>
                    <p className="text-xs text-[#55655E]">Foreman: {g.organizerName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-[#0B3B2E] tabular-nums">
                      {formatPassbookAmount(g.faceValue)}
                    </p>
                    <p className="text-[11px] text-[#55655E]">
                      Month {g.currentMonth}/{g.durationMonths}
                    </p>
                  </div>
                </div>

                {slot && (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#FAF8F4] px-3.5 py-2.5 text-xs">
                    {slot.prizedMonth ? (
                      <span className="inline-flex items-center gap-1 font-bold text-[#9A6B00]">
                        <Award className="h-4 w-4" />
                        Lifted in Month {slot.prizedMonth} (
                        {formatPassbookAmount(slot.prizedAmount || g.faceValue)})
                      </span>
                    ) : (
                      <span className="font-semibold text-emerald-800">
                        Non-Prized · Eligible to Lift
                      </span>
                    )}

                    <span className="font-bold text-[#14201C] tabular-nums">
                      Paid: {formatPassbookAmount(slot.totalPaidSoFar)}
                    </span>
                  </div>
                )}

                <div className="mt-4 flex items-center justify-between border-t border-[#0B3B2E]/10 pt-3 text-xs font-semibold text-[#0B3B2E]">
                  <span className="inline-flex items-center gap-1.5">
                    <BookOpen className="h-3.5 w-3.5" />
                    Inspect Full 16/20-Month Passbook Card
                  </span>
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Signed Receipts */}
      <div className="rounded-2xl border border-[#0B3B2E]/15 bg-white overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#0B3B2E]/10 px-5 py-3.5">
          <h3 className="text-sm font-bold text-[#14201C]">Your Official Signed Receipts</h3>
          <button
            onClick={() => onNavigateTab('dues')}
            className="text-xs font-bold text-[#0B3B2E] hover:underline"
          >
            View All ({receipts.length})
          </button>
        </div>
        <div className="divide-y divide-[#0B3B2E]/10">
          {receipts.slice(0, 5).map((r) => (
            <button
              key={r.id}
              onClick={() => onOpenReceipt(r)}
              className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition hover:bg-[#FAF8F4]"
            >
              <div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                  <span className="text-sm font-semibold text-[#14201C]">
                    {r.chitName} · Month {r.monthNumber}
                  </span>
                </div>
                <p className="text-xs text-[#55655E]">
                  {r.receiptNumber} · Signed by {r.signedByName} ({r.paymentMethod})
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-[#0B3B2E] tabular-nums">
                  {formatPassbookAmount(r.amountPaid)}
                </p>
                <p className="text-[11px] text-[#55655E]">{formatIndianDate(r.paidDate)}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
