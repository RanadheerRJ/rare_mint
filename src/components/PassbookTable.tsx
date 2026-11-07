import React from 'react';
import {
  Award,
  CheckCircle2,
  Clock,
  FileCheck2,
  Printer,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { ChitGroupDetail, MemberSlot, PaymentRecord } from '../types';
import { getMemberPayableForMonth } from '../utils/chitFinance';
import { formatIndianDate, formatPassbookAmount, formatShortDate } from '../utils/format';

interface PassbookTableProps {
  group: ChitGroupDetail;
  selectedSlot: MemberSlot | null;
  onSelectSlot?: (slotId: number | null) => void;
  isOrganizer: boolean;
  onOpenReceipt: (receipt: PaymentRecord) => void;
  onQuickRecordPayment?: (slot: MemberSlot, monthNumber: number, expectedAmount: number) => void;
}

export const PassbookTable: React.FC<PassbookTableProps> = ({
  group,
  selectedSlot,
  onSelectSlot,
  isOrganizer,
  onOpenReceipt,
  onQuickRecordPayment,
}) => {
  // Map payments for the selected slot by monthNumber
  const slotPaymentsByMonth = new Map<number, PaymentRecord>();
  if (selectedSlot) {
    for (const p of group.payments) {
      if (p.memberSlotId === selectedSlot.id) {
        slotPaymentsByMonth.set(p.monthNumber, p);
      }
    }
  }

  const totalPaidBySlot = selectedSlot
    ? Array.from(slotPaymentsByMonth.values()).reduce((acc, p) => acc + p.amountPaid, 0)
    : 0;

  const totalScheduledNonPrized = group.schedule.reduce(
    (sum, r) => sum + r.nonPrizedInstallment,
    0
  );

  return (
    <div className="space-y-4">
      {/* Slot Picker Bar (when Organizer or Member with multiple tickets views the passbook) */}
      {group.slots.length > 0 && onSelectSlot && (
        <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#0B3B2E]/12 bg-white p-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold tracking-wider text-[#55655E] uppercase">
              Passbook View:
            </span>
            {isOrganizer && (
              <button
                onClick={() => onSelectSlot(null)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  selectedSlot === null
                    ? 'bg-[#0B3B2E] text-white'
                    : 'bg-[#FAF8F4] text-[#14201C] hover:bg-[#EFECE4]'
                }`}
              >
                Master Group Card
              </button>
            )}
            <select
              value={selectedSlot?.id || ''}
              onChange={(e) => {
                const val = e.target.value;
                onSelectSlot(val ? Number(val) : null);
              }}
              className="rounded-lg border border-[#0B3B2E]/20 bg-[#FAF8F4] px-3 py-1.5 text-xs font-semibold text-[#14201C] focus:border-[#0B3B2E] focus:outline-none"
            >
              {isOrganizer && <option value="">Select Subscriber Ticket (#1–#{group.totalSlots})…</option>}
              {group.slots.map((s) => (
                <option key={s.id} value={s.id}>
                  Ticket #{s.ticketNumber} — {s.memberName}{' '}
                  {s.prizedMonth ? `(Prized M${s.prizedMonth})` : '(Non-Prized)'}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#0B3B2E]/20 bg-[#FAF8F4] px-3 py-1.5 text-xs font-semibold text-[#0B3B2E] transition hover:bg-[#EFECE4]"
          >
            <Printer className="h-3.5 w-3.5" />
            Print Passbook Card
          </button>
        </div>
      )}

      {/* Physical-Style Passbook Sheet */}
      <div className="passbook-sheet print-only-card overflow-hidden rounded-2xl border-2 border-[#0B3B2E]/25">
        {/* Passbook Top Foil Header */}
        <div className="border-b-2 border-[#0B3B2E]/20 bg-[#0B3B2E] px-5 py-4 text-white">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-[#D4A437]/20 px-2 py-0.5 text-[11px] font-bold tracking-wider text-[#F2CA6B] uppercase">
                  {group.code}
                </span>
                <span className="rounded bg-white/15 px-2 py-0.5 text-[11px] font-medium text-white/90">
                  {group.chitType === 'FIXED_TABLE'
                    ? 'Fixed-Schedule Passbook Chit'
                    : `Monthly Auction Chit (${group.foremanCommissionPct}% Comm)`}
                </span>
              </div>
              <h3 className="mt-1.5 text-lg font-bold tracking-tight sm:text-xl">{group.name}</h3>
              <p className="text-xs text-white/75">
                Foreman: {group.organizerName} · Face Value:{' '}
                <strong className="text-white">{formatPassbookAmount(group.faceValue)}</strong> ·{' '}
                {group.durationMonths} Months
              </p>
            </div>

            {selectedSlot ? (
              <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-right">
                <p className="text-[11px] tracking-wider text-white/75 uppercase">
                  Subscriber Passbook · Ticket #{selectedSlot.ticketNumber}
                </p>
                <p className="text-base font-bold text-white">{selectedSlot.memberName}</p>
                <div className="mt-1 flex items-center justify-end gap-2 text-xs">
                  {selectedSlot.prizedMonth ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#D4A437] px-2.5 py-0.5 font-bold text-[#14201C]">
                      <Award className="h-3.5 w-3.5" />
                      Prized in Month {selectedSlot.prizedMonth}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/25 px-2.5 py-0.5 font-semibold text-emerald-200">
                      <UserCheck className="h-3.5 w-3.5" />
                      Non-Prized Subscriber
                    </span>
                  )}
                  <span className="text-white/85 tabular-nums">
                    Paid: <strong>{formatPassbookAmount(totalPaidBySlot)}</strong>
                  </span>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-right">
                <p className="text-[11px] tracking-wider text-white/75 uppercase">
                  Active Collection Cycle
                </p>
                <p className="text-base font-bold text-[#F2CA6B]">
                  Month {group.currentMonth} of {group.durationMonths}
                </p>
                <p className="text-xs text-white/80 tabular-nums">
                  Non-Prized Total: {formatPassbookAmount(totalScheduledNonPrized)}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Authentic Ledger Table matching the Physical Chit Card */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b-2 border-[#0B3B2E]/25 bg-[#F2EDE1] text-[11px] font-bold tracking-wider text-[#14201C] uppercase">
                <th className="border-r border-[#0B3B2E]/15 px-3 py-3 text-center w-14">S.No.</th>
                <th className="border-r border-[#0B3B2E]/15 px-3.5 py-3">Chit Date</th>
                <th className="border-r border-[#0B3B2E]/15 px-3.5 py-3 text-right">
                  {group.chitType === 'FIXED_TABLE' ? 'Non-Prized Members' : 'Net Installment'}
                </th>
                <th className="border-r border-[#0B3B2E]/15 px-3.5 py-3 text-right">Chit Value</th>
                <th className="border-r border-[#0B3B2E]/15 px-3.5 py-3 text-right">
                  {group.chitType === 'FIXED_TABLE' ? 'Prized Members' : 'Monthly Dividend'}
                </th>
                {selectedSlot ? (
                  <>
                    <th className="border-r border-[#0B3B2E]/15 px-3.5 py-3 text-right">
                      Your Payable
                    </th>
                    <th className="border-r border-[#0B3B2E]/15 px-3.5 py-3 text-center">
                      Paid Date
                    </th>
                    <th className="px-3.5 py-3 text-center">Signature / Receipt</th>
                  </>
                ) : (
                  <>
                    <th className="border-r border-[#0B3B2E]/15 px-3.5 py-3">
                      Monthly Winner (Lifted By)
                    </th>
                    <th className="px-3.5 py-3 text-center">Payout Date</th>
                  </>
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-[#0B3B2E]/15">
              {group.schedule.map((row) => {
                const isCurrentMonth = row.monthNumber === group.currentMonth;
                const isBonusValue = row.chitValue > group.faceValue;
                const payment = selectedSlot
                  ? slotPaymentsByMonth.get(row.monthNumber)
                  : undefined;

                const isPrizedForThisRow =
                  selectedSlot !== null &&
                  selectedSlot.prizedMonth !== null &&
                  selectedSlot.prizedMonth < row.monthNumber;

                const didLiftThisExactMonth =
                  selectedSlot !== null && selectedSlot.prizedMonth === row.monthNumber;

                const memberExpected = selectedSlot
                  ? getMemberPayableForMonth(group.chitType, row, selectedSlot.prizedMonth)
                  : row.nonPrizedInstallment;

                return (
                  <tr
                    key={row.monthNumber}
                    className={`transition ${
                      didLiftThisExactMonth
                        ? 'bg-[#FDF4DC]'
                        : isCurrentMonth
                          ? 'bg-emerald-50/80'
                          : 'hover:bg-[#F7F4EC]/80'
                    }`}
                  >
                    {/* S.No. */}
                    <td className="border-r border-[#0B3B2E]/15 px-3 py-2.5 text-center font-bold text-[#14201C] tabular-nums">
                      <div className="inline-flex items-center justify-center gap-1">
                        <span
                          className={
                            isCurrentMonth
                              ? 'flex h-6 w-6 items-center justify-center rounded-full bg-[#0B3B2E] text-xs text-white'
                              : ''
                          }
                        >
                          {row.monthNumber}
                        </span>
                      </div>
                    </td>

                    {/* Chit Date */}
                    <td className="border-r border-[#0B3B2E]/15 px-3.5 py-2.5 font-medium text-[#2E3D37] tabular-nums">
                      <div className="flex items-center gap-1.5">
                        <span>{formatShortDate(row.chitDate)}</span>
                        {isCurrentMonth && (
                          <span className="rounded bg-[#0B3B2E]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#0B3B2E]">
                            ACTIVE
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Non-Prized Installment */}
                    <td
                      className={`border-r border-[#0B3B2E]/15 px-3.5 py-2.5 text-right font-semibold tabular-nums ${
                        selectedSlot && isPrizedForThisRow
                          ? 'text-[#55655E]/50 line-through decoration-[#55655E]/40'
                          : 'text-[#14201C]'
                      }`}
                    >
                      {formatPassbookAmount(row.nonPrizedInstallment, false, true)}
                      {group.chitType === 'AUCTION' && !row.isAuctionCompleted && (
                        <span className="block text-[10px] font-normal text-[#55655E]">
                          Base (Pre-bid)
                        </span>
                      )}
                    </td>

                    {/* Chit Value */}
                    <td className="border-r border-[#0B3B2E]/15 px-3.5 py-2.5 text-right font-bold text-[#0B3B2E] tabular-nums">
                      <div className="inline-flex items-center justify-end gap-1">
                        {isBonusValue && (
                          <Sparkles className="h-3.5 w-3.5 text-[#B8860B]" aria-label="Bonus Payout" />
                        )}
                        <span className={isBonusValue ? 'text-[#9A6B00]' : ''}>
                          {formatPassbookAmount(row.chitValue, false, true)}
                        </span>
                      </div>
                      {group.chitType === 'AUCTION' && row.bidDiscount !== null && (
                        <span className="block text-[10px] font-normal text-[#55655E]">
                          Bid: {formatPassbookAmount(row.bidDiscount, true, false)}
                        </span>
                      )}
                    </td>

                    {/* Prized Installment (or Dividend in Auction) */}
                    <td
                      className={`border-r border-[#0B3B2E]/15 px-3.5 py-2.5 text-right font-semibold tabular-nums ${
                        group.chitType === 'FIXED_TABLE'
                          ? selectedSlot && isPrizedForThisRow
                            ? 'text-[#9A6B00] font-bold'
                            : 'text-[#2E3D37]'
                          : 'text-emerald-800'
                      }`}
                    >
                      {group.chitType === 'FIXED_TABLE'
                        ? formatPassbookAmount(row.prizedInstallment, false, true)
                        : row.dividendPerMember !== null
                          ? `+${formatPassbookAmount(row.dividendPerMember, true, false)}`
                          : '—'}
                    </td>

                    {selectedSlot ? (
                      <>
                        {/* Member's Exact Payable */}
                        <td className="border-r border-[#0B3B2E]/15 px-3.5 py-2.5 text-right font-bold tabular-nums">
                          <span
                            className={
                              isPrizedForThisRow ? 'text-[#9A6B00]' : 'text-[#0B3B2E]'
                            }
                          >
                            {formatPassbookAmount(memberExpected)}
                          </span>
                          {didLiftThisExactMonth && (
                            <span className="block text-[10px] font-bold text-[#9A6B00]">
                              Lifted {formatPassbookAmount(row.chitValue)}
                            </span>
                          )}
                        </td>

                        {/* Paid Date */}
                        <td className="border-r border-[#0B3B2E]/15 px-3.5 py-2.5 text-center text-xs tabular-nums">
                          {payment ? (
                            <span className="font-semibold text-emerald-800">
                              {formatShortDate(payment.paidDate)}
                            </span>
                          ) : row.monthNumber <= group.currentMonth ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-900">
                              <Clock className="h-3 w-3" />
                              Due
                            </span>
                          ) : (
                            <span className="text-[#55655E]/50">—</span>
                          )}
                        </td>

                        {/* Signature / Action */}
                        <td className="px-3.5 py-2.5 text-center">
                          {payment ? (
                            <button
                              onClick={() => onOpenReceipt(payment)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-800/20 bg-emerald-50/90 px-2.5 py-1 text-xs font-semibold text-emerald-950 transition hover:bg-emerald-100"
                              title="View Signed Official Receipt"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
                              <span className="signature-stamp">{payment.signedByName.split(' ')[0]}</span>
                              <FileCheck2 className="h-3 w-3 opacity-65" />
                            </button>
                          ) : row.monthNumber <= group.currentMonth && onQuickRecordPayment ? (
                            <button
                              onClick={() =>
                                onQuickRecordPayment(selectedSlot, row.monthNumber, memberExpected)
                              }
                              className="no-print rounded-lg bg-[#0B3B2E] px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-[#135341]"
                            >
                              {isOrganizer ? 'Sign & Collect' : 'Pay Installment'}
                            </button>
                          ) : (
                            <span className="text-xs text-[#55655E]/40">—</span>
                          )}
                        </td>
                      </>
                    ) : (
                      <>
                        {/* Master Group Winner Column */}
                        <td className="border-r border-[#0B3B2E]/15 px-3.5 py-2.5 text-xs">
                          {row.winnerName ? (
                            <div className="flex items-center gap-1.5 font-semibold text-[#14201C]">
                              <Award className="h-3.5 w-3.5 text-[#B8860B]" />
                              <span>
                                #{row.winnerTicketNumber} · {row.winnerName}
                              </span>
                            </div>
                          ) : row.monthNumber === group.currentMonth ? (
                            <span className="text-amber-800 font-medium">Allotment Open</span>
                          ) : (
                            <span className="text-[#55655E]/50">Upcoming</span>
                          )}
                        </td>
                        <td className="px-3.5 py-2.5 text-center text-xs text-[#55655E] tabular-nums">
                          {row.payoutDate ? formatIndianDate(row.payoutDate) : '—'}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Passbook Footer Legend */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#0B3B2E]/15 bg-[#F4EFE4]/70 px-5 py-3 text-xs text-[#55655E]">
          <span>
            {group.chitType === 'FIXED_TABLE'
              ? 'Rule: Subscribers pay the Non-Prized column up to the month they lift the chit, and the Prized column from the following month onwards.'
              : 'Rule: Monthly bid discount minus Foreman commission is shared equally among all tickets as monthly dividend.'}
          </span>
          <span className="font-semibold text-[#0B3B2E]">
            Rare Mint Digital Passbook Ledger
          </span>
        </div>
      </div>
    </div>
  );
};
