import React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  MessageCircle,
  PlusCircle,
  TrendingUp,
  Users,
} from 'lucide-react';
import { ChitGroupSummary, DueItem, PaymentRecord, User } from '../types';
import {
  buildDueReminderWhatsAppText,
  buildWhatsAppLink,
  formatCompactINR,
  formatIndianDate,
  formatPassbookAmount,
} from '../utils/format';

interface OrganizerDashboardProps {
  user: User;
  groups: ChitGroupSummary[];
  dues: DueItem[];
  recentReceipts: PaymentRecord[];
  onOpenGroup: (groupId: number) => void;
  onOpenCreateModal: () => void;
  onOpenReceipt: (receipt: PaymentRecord) => void;
  onNavigateTab: (tab: 'overview' | 'groups' | 'calculator' | 'dues') => void;
}

export const OrganizerDashboard: React.FC<OrganizerDashboardProps> = ({
  user,
  groups,
  dues,
  recentReceipts,
  onOpenGroup,
  onOpenCreateModal,
  onOpenReceipt,
  onNavigateTab,
}) => {
  const totalCorpus = groups.reduce((s, g) => s + g.faceValue, 0);
  const totalMonthTarget = groups.reduce((s, g) => s + g.currentMonthTarget, 0);
  const totalMonthCollected = groups.reduce((s, g) => s + g.currentMonthCollected, 0);
  const collectionPct =
    totalMonthTarget > 0 ? Math.round((totalMonthCollected / totalMonthTarget) * 100) : 0;

  const overdueList = dues.filter((d) => d.isOverdue);
  const totalPendingAmount = dues.reduce((s, d) => s + d.amountDue, 0);

  return (
    <div className="space-y-6">
      {/* Top Executive Hero Card */}
      <div className="relative overflow-hidden rounded-2xl bg-[#0B3B2E] p-6 text-white shadow-md">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[0.16em] text-[#D4A437] uppercase">
              Foreman Treasury Desk · {user.city}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
              Namaste, {user.name}
            </h1>
            <p className="mt-1 text-sm text-white/80">
              Managing {groups.length} active chit groups ({formatCompactINR(totalCorpus)} total chit value)
            </p>
          </div>

          <button
            onClick={onOpenCreateModal}
            className="inline-flex items-center gap-2 rounded-xl bg-[#D4A437] px-4 py-2.5 text-sm font-bold text-[#14201C] shadow-xs transition hover:bg-[#E1B449]"
          >
            <PlusCircle className="h-4 w-4" />
            New Chit Group
          </button>
        </div>

        {/* Monthly Collection Progress Bar */}
        <div className="mt-6 rounded-xl border border-white/15 bg-white/10 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <span className="text-xs font-medium text-white/75">
                Current Cycle Collection Progress
              </span>
              <p className="text-xl font-bold text-white tabular-nums">
                {formatPassbookAmount(totalMonthCollected)}{' '}
                <span className="text-sm font-normal text-white/70">
                  of {formatPassbookAmount(totalMonthTarget)}
                </span>
              </p>
            </div>
            <span className="rounded-full bg-[#D4A437]/25 px-3 py-0.5 text-xs font-bold text-[#F2CA6B] tabular-nums">
              {collectionPct}% Collected
            </span>
          </div>
          <div className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-black/25">
            <div
              className="h-full rounded-full bg-[#D4A437] transition-all duration-500"
              style={{ width: `${Math.min(100, collectionPct)}%` }}
            />
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#0B3B2E]/15 bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#55655E]">Pending Installments</span>
            <TrendingUp className="h-4 w-4 text-[#0B3B2E]" />
          </div>
          <p className="mt-1.5 text-2xl font-bold text-[#14201C] tabular-nums">
            {formatPassbookAmount(totalPendingAmount)}
          </p>
          <p className="mt-1 text-xs text-[#55655E]">Across {dues.length} unpaid member tickets</p>
        </div>

        <div className="rounded-2xl border border-[#0B3B2E]/15 bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#55655E]">Overdue Tickets</span>
            <AlertTriangle
              className={`h-4 w-4 ${overdueList.length > 0 ? 'text-red-600' : 'text-emerald-600'}`}
            />
          </div>
          <p
            className={`mt-1.5 text-2xl font-bold tabular-nums ${
              overdueList.length > 0 ? 'text-red-700' : 'text-emerald-700'
            }`}
          >
            {overdueList.length}
          </p>
          <p className="mt-1 text-xs text-[#55655E]">
            {overdueList.length > 0
              ? 'Past monthly chit due date — send WhatsApp alert'
              : 'All past due dates settled'}
          </p>
        </div>

        <div className="rounded-2xl border border-[#0B3B2E]/15 bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#55655E]">Active Ticket Slots</span>
            <Users className="h-4 w-4 text-[#0B3B2E]" />
          </div>
          <p className="mt-1.5 text-2xl font-bold text-[#14201C] tabular-nums">
            {groups.reduce((s, g) => s + g.enrolledSlots, 0)} /{' '}
            {groups.reduce((s, g) => s + g.totalSlots, 0)}
          </p>
          <p className="mt-1 text-xs text-[#55655E]">Enrolled subscribers across active groups</p>
        </div>
      </div>

      {/* Active Chit Groups */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-[#14201C]">Active Chit Passbook Groups</h2>
          <button
            onClick={() => onNavigateTab('groups')}
            className="inline-flex items-center gap-1 text-xs font-bold text-[#0B3B2E] hover:underline"
          >
            View All <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {groups.map((g) => {
            const pct =
              g.currentMonthTarget > 0
                ? Math.round((g.currentMonthCollected / g.currentMonthTarget) * 100)
                : 0;
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
                      <span className="rounded bg-[#F4EFE4] px-2 py-0.5 text-[11px] font-semibold text-[#7A5400]">
                        {g.chitType === 'FIXED_TABLE' ? 'Fixed Passbook' : 'Monthly Auction'}
                      </span>
                    </div>
                    <h3 className="mt-2 text-base font-bold text-[#14201C] group-hover:text-[#0B3B2E]">
                      {g.name}
                    </h3>
                  </div>
                  <p className="text-right text-lg font-bold text-[#0B3B2E] tabular-nums">
                    {formatPassbookAmount(g.faceValue)}
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between text-xs text-[#55655E]">
                  <span>
                    Month <strong>{g.currentMonth}</strong> of {g.durationMonths} · Due{' '}
                    {formatIndianDate(g.nextChitDate)}
                  </span>
                  <span className="font-bold text-[#0B3B2E] tabular-nums">
                    {g.currentMonthPaidCount}/{g.enrolledSlots} Paid ({pct}%)
                  </span>
                </div>

                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#EFECE4]">
                  <div
                    className="h-full rounded-full bg-[#0B3B2E]"
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-[#0B3B2E]/10 pt-3 text-xs font-semibold text-[#0B3B2E]">
                  <span className="inline-flex items-center gap-1.5">
                    <BookOpen className="h-3.5 w-3.5" />
                    Open Passbook, Collections & Winner Desk
                  </span>
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Priority Dues & Recent Signed Receipts */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Pending & Overdue Reminders */}
        <div className="rounded-2xl border border-[#0B3B2E]/15 bg-white overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#0B3B2E]/10 px-5 py-3.5">
            <h3 className="text-sm font-bold text-[#14201C]">
              Priority Collection Reminders ({dues.length})
            </h3>
            <button
              onClick={() => onNavigateTab('dues')}
              className="text-xs font-bold text-[#0B3B2E] hover:underline"
            >
              Full Dues Ledger
            </button>
          </div>
          <div className="divide-y divide-[#0B3B2E]/10">
            {dues.slice(0, 5).map((d) => {
              const waUrl = buildWhatsAppLink(d.memberPhone, buildDueReminderWhatsAppText(d));
              return (
                <div
                  key={`${d.memberSlotId}-${d.monthNumber}`}
                  className="flex items-center justify-between gap-3 px-5 py-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-[#14201C]">{d.memberName}</span>
                      <span className="text-xs text-[#55655E]">
                        #{d.ticketNumber} · {d.chitCode}
                      </span>
                    </div>
                    <p className="text-xs text-[#55655E]">
                      Month {d.monthNumber} ·{' '}
                      <span className={d.isOverdue ? 'font-bold text-red-700' : ''}>
                        {d.isOverdue
                          ? `Overdue (${formatIndianDate(d.dueDate)})`
                          : `Due ${formatIndianDate(d.dueDate)}`}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-[#0B3B2E] tabular-nums">
                      {formatPassbookAmount(d.amountDue)}
                    </span>
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Send WhatsApp Due Reminder"
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      Remind
                    </a>
                  </div>
                </div>
              );
            })}
            {dues.length === 0 && (
              <div className="p-6 text-center text-xs text-[#55655E]">
                All current installments have been collected!
              </div>
            )}
          </div>
        </div>

        {/* Recent Signed Receipts */}
        <div className="rounded-2xl border border-[#0B3B2E]/15 bg-white overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#0B3B2E]/10 px-5 py-3.5">
            <h3 className="text-sm font-bold text-[#14201C]">Recent Signed Passbook Receipts</h3>
            <button
              onClick={() => onNavigateTab('dues')}
              className="text-xs font-bold text-[#0B3B2E] hover:underline"
            >
              All Receipts
            </button>
          </div>
          <div className="divide-y divide-[#0B3B2E]/10">
            {recentReceipts.slice(0, 5).map((r) => (
              <button
                key={r.id}
                onClick={() => onOpenReceipt(r)}
                className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition hover:bg-[#FAF8F4]"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
                    <span className="text-sm font-semibold text-[#14201C]">{r.memberName}</span>
                    <span className="font-mono text-xs text-[#55655E]">{r.receiptNumber}</span>
                  </div>
                  <p className="text-xs text-[#55655E]">
                    {r.chitCode} · Ticket #{r.ticketNumber} · Month {r.monthNumber} ({r.paymentMethod})
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
    </div>
  );
};
