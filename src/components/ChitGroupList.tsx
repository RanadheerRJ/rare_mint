import React, { useState } from 'react';
import { ArrowRight, BookOpen, PlusCircle, Search } from 'lucide-react';
import { ChitGroupSummary } from '../types';
import { formatIndianDate, formatPassbookAmount } from '../utils/format';

interface ChitGroupListProps {
  groups: ChitGroupSummary[];
  isOrganizer: boolean;
  onOpenGroup: (groupId: number) => void;
  onOpenCreateModal: () => void;
}

export const ChitGroupList: React.FC<ChitGroupListProps> = ({
  groups,
  isOrganizer,
  onOpenGroup,
  onOpenCreateModal,
}) => {
  const [filterType, setFilterType] = useState<'ALL' | 'FIXED_TABLE' | 'AUCTION'>('ALL');
  const [query, setQuery] = useState('');

  const filtered = groups.filter((g) => {
    if (filterType !== 'ALL' && g.chitType !== filterType) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      return g.name.toLowerCase().includes(q) || g.code.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#14201C]">
            {isOrganizer ? 'Chit Passbook Groups' : 'Your Enrolled Chit Groups'}
          </h1>
          <p className="text-sm text-[#55655E]">
            Fixed-schedule passbooks & monthly dividend auction groups
          </p>
        </div>

        {isOrganizer && (
          <button
            onClick={onOpenCreateModal}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0B3B2E] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#135341]"
          >
            <PlusCircle className="h-4 w-4" />
            New Chit Group
          </button>
        )}
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#0B3B2E]/12 bg-white p-3.5">
        <div className="flex gap-1.5">
          {[
            { id: 'ALL', label: 'All Types' },
            { id: 'FIXED_TABLE', label: 'Fixed-Table (Passbook)' },
            { id: 'AUCTION', label: 'Monthly Auction' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterType(tab.id as 'ALL' | 'FIXED_TABLE' | 'AUCTION')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                filterType === tab.id
                  ? 'bg-[#0B3B2E] text-white'
                  : 'bg-[#FAF8F4] text-[#55655E] hover:text-[#14201C]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-[#55655E]" />
          <input
            type="text"
            placeholder="Search group or code…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-xl border border-[#0B3B2E]/15 bg-[#FAF8F4] py-1.5 pr-3 pl-9 text-xs font-medium focus:border-[#0B3B2E] focus:outline-none"
          />
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {filtered.map((g) => {
          const pct =
            g.currentMonthTarget > 0
              ? Math.round((g.currentMonthCollected / g.currentMonthTarget) * 100)
              : 0;
          const mySlot = g.mySlots?.[0];

          return (
            <div
              key={g.id}
              onClick={() => onOpenGroup(g.id)}
              className="group cursor-pointer rounded-2xl border border-[#0B3B2E]/15 bg-white p-5 transition hover:border-[#0B3B2E] hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-[#0B3B2E]/10 px-2 py-0.5 font-mono text-[11px] font-bold text-[#0B3B2E]">
                      {g.code}
                    </span>
                    <span className="rounded bg-[#F4EFE4] px-2 py-0.5 text-[11px] font-bold text-[#7A5400]">
                      {g.chitType === 'FIXED_TABLE' ? 'FIXED PASSBOOK' : 'AUCTION CHIT'}
                    </span>
                    {mySlot && (
                      <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                        Ticket #{mySlot.ticketNumber}
                      </span>
                    )}
                  </div>
                  <h3 className="mt-2 text-lg font-bold text-[#14201C] group-hover:text-[#0B3B2E]">
                    {g.name}
                  </h3>
                  <p className="mt-0.5 text-xs text-[#55655E]">
                    {g.durationMonths} Months · {g.enrolledSlots}/{g.totalSlots} Subscribers · Next Date{' '}
                    {formatIndianDate(g.nextChitDate)}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-xl font-bold text-[#0B3B2E] tabular-nums">
                    {formatPassbookAmount(g.faceValue)}
                  </p>
                  <p className="text-xs font-semibold text-[#55655E]">
                    Month {g.currentMonth}/{g.durationMonths}
                  </p>
                </div>
              </div>

              {g.notes && (
                <p className="mt-3 line-clamp-2 rounded-xl bg-[#FAF8F4] p-3 text-xs text-[#55655E]">
                  {g.notes}
                </p>
              )}

              <div className="mt-4">
                <div className="flex justify-between text-xs font-medium text-[#55655E]">
                  <span>Month {g.currentMonth} Collection</span>
                  <span className="font-bold text-[#0B3B2E] tabular-nums">
                    {formatPassbookAmount(g.currentMonthCollected)} /{' '}
                    {formatPassbookAmount(g.currentMonthTarget)}
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[#EFECE4]">
                  <div
                    className="h-full rounded-full bg-[#0B3B2E]"
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-[#0B3B2E]/10 pt-3 text-xs font-bold text-[#0B3B2E]">
                <span className="inline-flex items-center gap-1.5">
                  <BookOpen className="h-4 w-4" />
                  Open Digital Passbook & Ledger
                </span>
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
