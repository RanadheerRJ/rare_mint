import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileCheck2,
  MessageCircle,
  Search,
} from 'lucide-react';
import { DueItem, PaymentRecord } from '../types';
import {
  buildDueReminderWhatsAppText,
  buildWhatsAppLink,
  formatIndianDate,
  formatPassbookAmount,
} from '../utils/format';

interface DuesAndReceiptsViewProps {
  isOrganizer: boolean;
  dues: DueItem[];
  receipts: PaymentRecord[];
  onOpenReceipt: (receipt: PaymentRecord) => void;
  onOpenGroup: (groupId: number) => void;
}

export const DuesAndReceiptsView: React.FC<DuesAndReceiptsViewProps> = ({
  isOrganizer,
  dues,
  receipts,
  onOpenReceipt,
  onOpenGroup,
}) => {
  const [subTab, setSubTab] = useState<'dues' | 'receipts'>('dues');
  const [search, setSearch] = useState('');

  const filteredDues = dues.filter((d) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      d.memberName.toLowerCase().includes(q) ||
      d.chitName.toLowerCase().includes(q) ||
      d.chitCode.toLowerCase().includes(q)
    );
  });

  const filteredReceipts = receipts.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (r.memberName || '').toLowerCase().includes(q) ||
      r.receiptNumber.toLowerCase().includes(q) ||
      (r.chitCode || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#14201C]">
            Dues Reminders & Official Receipts
          </h1>
          <p className="text-sm text-[#55655E]">
            {isOrganizer
              ? 'Send 1-tap WhatsApp installment reminders and issue printable signed passbook receipts'
              : 'Track upcoming monthly dues and download your signed passbook receipts'}
          </p>
        </div>
      </div>

      {/* Sub-tabs + Search */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#0B3B2E]/12 bg-white p-3.5">
        <div className="flex gap-2">
          <button
            onClick={() => setSubTab('dues')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition ${
              subTab === 'dues'
                ? 'bg-[#0B3B2E] text-white'
                : 'bg-[#FAF8F4] text-[#55655E] hover:text-[#14201C]'
            }`}
          >
            <AlertCircle className="h-4 w-4" />
            Pending Dues ({dues.length})
          </button>
          <button
            onClick={() => setSubTab('receipts')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition ${
              subTab === 'receipts'
                ? 'bg-[#0B3B2E] text-white'
                : 'bg-[#FAF8F4] text-[#55655E] hover:text-[#14201C]'
            }`}
          >
            <FileCheck2 className="h-4 w-4" />
            Signed Receipts ({receipts.length})
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-[#55655E]" />
          <input
            type="text"
            placeholder="Search member, receipt # or code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-[#0B3B2E]/15 bg-[#FAF8F4] py-1.5 pr-3 pl-9 text-xs font-medium focus:border-[#0B3B2E] focus:outline-none"
          />
        </div>
      </div>

      {subTab === 'dues' ? (
        <div className="overflow-hidden rounded-2xl border border-[#0B3B2E]/15 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#0B3B2E]/15 bg-[#FAF8F4] text-[11px] font-bold tracking-wider text-[#55655E] uppercase">
                  <th className="px-4 py-3">Subscriber & Ticket</th>
                  <th className="px-4 py-3">Chit Group</th>
                  <th className="px-4 py-3">Due Date</th>
                  <th className="px-4 py-3 text-right">Amount Payable</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0B3B2E]/10">
                {filteredDues.map((d) => {
                  const waUrl = buildWhatsAppLink(
                    d.memberPhone,
                    buildDueReminderWhatsAppText(d)
                  );
                  return (
                    <tr key={`${d.memberSlotId}-${d.monthNumber}`} className="hover:bg-[#FAF8F4]/70">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[#14201C]">
                          {d.memberName} ·{' '}
                          <span className="text-[#0B3B2E]">Ticket #{d.ticketNumber}</span>
                        </p>
                        <p className="text-xs text-[#55655E]">
                          {d.isPrizedSubscriber ? 'Prized Subscriber' : 'Non-Prized Subscriber'}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-[#14201C]">{d.chitName}</p>
                        <p className="text-xs text-[#55655E]">
                          {d.chitCode} · Month {d.monthNumber}
                        </p>
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                            d.isOverdue
                              ? 'bg-red-100 text-red-800'
                              : 'bg-amber-100 text-amber-900'
                          }`}
                        >
                          {d.isOverdue
                            ? `Overdue · ${formatIndianDate(d.dueDate)}`
                            : `Due ${formatIndianDate(d.dueDate)}`}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-[#0B3B2E] tabular-nums">
                        {formatPassbookAmount(d.amountDue)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => onOpenGroup(d.chitGroupId)}
                            className="rounded-lg bg-[#0B3B2E] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#135341]"
                          >
                            {isOrganizer ? 'Collect' : 'Pay Now'}
                          </button>
                          {isOrganizer && (
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                              WhatsApp
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredDues.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-sm text-[#55655E]">
                      No pending dues match your filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#0B3B2E]/15 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#0B3B2E]/15 bg-[#FAF8F4] text-[11px] font-bold tracking-wider text-[#55655E] uppercase">
                  <th className="px-4 py-3">Receipt No.</th>
                  <th className="px-4 py-3">Subscriber & Chit</th>
                  <th className="px-4 py-3">Paid Date & Mode</th>
                  <th className="px-4 py-3 text-right">Amount Paid</th>
                  <th className="px-4 py-3 text-center">Passbook Stamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0B3B2E]/10">
                {filteredReceipts.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => onOpenReceipt(r)}
                    className="cursor-pointer transition hover:bg-[#FAF8F4]"
                  >
                    <td className="px-4 py-3 font-mono text-xs font-bold text-[#0B3B2E]">
                      {r.receiptNumber}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[#14201C]">
                        {r.memberName} · Ticket #{r.ticketNumber}
                      </p>
                      <p className="text-xs text-[#55655E]">
                        {r.chitName} · Month {r.monthNumber}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#55655E] tabular-nums">
                      <p className="font-medium text-[#14201C]">{formatIndianDate(r.paidDate)}</p>
                      <p>{r.paymentMethod.replace('_', ' ')}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-[#0B3B2E] tabular-nums">
                      {formatPassbookAmount(r.amountPaid)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-800/20 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-900">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
                        View & Share
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
