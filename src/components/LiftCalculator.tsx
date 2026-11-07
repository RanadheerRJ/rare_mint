import React, { useEffect, useMemo, useState } from 'react';
import {
  Calculator,
  CheckCircle2,
  Info,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { ChitGroupDetail, ChitGroupSummary } from '../types';
import { api } from '../api/client';
import {
  analyzeLiftMonths,
} from '../utils/chitFinance';
import { formatPassbookAmount, formatShortDate } from '../utils/format';

interface LiftCalculatorProps {
  groups?: ChitGroupSummary[];
  lockedGroup?: ChitGroupDetail | null;
}

export const LiftCalculator: React.FC<LiftCalculatorProps> = ({
  groups = [],
  lockedGroup = null,
}) => {
  const [selectedSource, setSelectedSource] = useState<string>(
    lockedGroup
      ? `group:${lockedGroup.id}`
      : groups.length > 0
        ? `group:${groups[0].id}`
        : ''
  );
  const [loadedGroup, setLoadedGroup] = useState<ChitGroupDetail | null>(lockedGroup);
  const [selectedMonth, setSelectedMonth] = useState<number>(6);
  const [externalRatePct, setExternalRatePct] = useState<number>(12);

  useEffect(() => {
    if (!lockedGroup && !selectedSource && groups.length) setSelectedSource(`group:${groups[0].id}`);
  }, [groups, lockedGroup, selectedSource]);

  useEffect(() => {
    if (lockedGroup) {
      setLoadedGroup(lockedGroup);
      setSelectedSource(`group:${lockedGroup.id}`);
      setSelectedMonth(lockedGroup.currentMonth || 1);
      return;
    }

    if (selectedSource.startsWith('group:')) {
      const id = Number(selectedSource.split(':')[1]);
      api
        .getChitDetail(id)
        .then(({ group }) => {
          setLoadedGroup(group);
          setSelectedMonth((prev) =>
            prev > group.durationMonths ? group.currentMonth : prev || group.currentMonth
          );
        })
        .catch(() => {
          setLoadedGroup(null);
        });
    } else {
      setLoadedGroup(null);
    }
  }, [selectedSource, lockedGroup]);

  const activeConfig = useMemo(() => {
    if (lockedGroup) {
      return {
        title: lockedGroup.name,
        chitType: lockedGroup.chitType,
        faceValue: lockedGroup.faceValue,
        schedule: lockedGroup.schedule,
      };
    }
    if (selectedSource.startsWith('group:') && loadedGroup) {
      return {
        title: loadedGroup.name,
        chitType: loadedGroup.chitType,
        faceValue: loadedGroup.faceValue,
        schedule: loadedGroup.schedule,
      };
    }

    return null;
  }, [lockedGroup, selectedSource, loadedGroup]);

  const analysisRows = useMemo(
    () =>
      activeConfig ? analyzeLiftMonths(activeConfig.chitType, activeConfig.schedule, externalRatePct) : [],
    [activeConfig, externalRatePct]
  );

  const clampedMonth = Math.min(Math.max(1, selectedMonth), analysisRows.length || 1);
  const currentRow = analysisRows[clampedMonth - 1] || analysisRows[0];
  const bestOverallRow =
    analysisRows.find((r) => r.tag === 'BEST_OVERALL') || analysisRows[analysisRows.length - 1];
  const bestSaverRow = analysisRows[analysisRows.length - 1];

  const maxAbsBenefit = Math.max(
    1,
    ...analysisRows.map((r) => Math.abs(r.netGainOrCost))
  );

  if (!currentRow || !activeConfig) return (
    <div className="rounded-2xl border border-[#0B3B2E]/15 bg-white p-6 text-sm text-[#55655E]">
      {groups.length === 0 && !lockedGroup ? 'No chits to analyze yet. Create or join a chit first.' : 'Loading chit analysis…'}
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Header & Source Picker */}
      <div className="rounded-2xl border border-[#0B3B2E]/15 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#0B3B2E]/10 px-3 py-1 text-xs font-bold text-[#0B3B2E]">
              <Calculator className="h-3.5 w-3.5" />
              Smart Lift ROI & Borrowing Cost Analyzer
            </div>
            <h2 className="mt-2 text-xl font-bold tracking-tight text-[#14201C]">
              Which Month Should You Lift the Chit?
            </h2>
            <p className="mt-0.5 text-sm text-[#55655E]">
              Compare direct passbook profit, effective annualized IRR, and external loan/FD opportunity value across every month.
            </p>
          </div>

          {!lockedGroup && (
            <div className="w-full sm:w-auto">
              <label className="block text-[11px] font-bold tracking-wider text-[#55655E] uppercase">
                Analyze Chit
              </label>
              <select
                value={selectedSource}
                onChange={(e) => {
                  setSelectedSource(e.target.value);
                  setSelectedMonth(6);
                }}
                className="mt-1 w-full rounded-xl border border-[#0B3B2E]/20 bg-[#FAF8F4] px-3.5 py-2 text-sm font-semibold text-[#14201C] focus:border-[#0B3B2E] focus:outline-none sm:w-80"
              >
                {groups.length > 0 && (
                  <optgroup label="Active Chit Groups">
                    {groups.map((g) => (
                      <option key={g.id} value={`group:${g.id}`}>
                        {g.code} — {g.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          )}
        </div>

        {/* Interactive Sliders */}
        <div className="mt-5 grid gap-5 border-t border-[#0B3B2E]/10 pt-5 md:grid-cols-2">
          {/* Month Slider */}
          <div className="rounded-xl bg-[#FAF8F4] p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold tracking-wider text-[#55655E] uppercase">
                Simulate Lifting In
              </span>
              <span className="rounded-lg bg-[#0B3B2E] px-2.5 py-1 text-xs font-bold text-white tabular-nums">
                Month {clampedMonth} of {analysisRows.length} ({formatShortDate(currentRow.chitDate)})
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={analysisRows.length}
              value={clampedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="mt-3 h-2 w-full cursor-pointer accent-[#0B3B2E]"
            />
            <div className="mt-1.5 flex justify-between text-[11px] font-medium text-[#55655E]">
              <span>Month 1 (Early Borrower)</span>
              <span>Month {Math.ceil(analysisRows.length / 2)} (Mid)</span>
              <span>Month {analysisRows.length} (Max Saver)</span>
            </div>
          </div>

          {/* Opportunity Rate Slider */}
          <div className="rounded-xl bg-[#FAF8F4] p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold tracking-wider text-[#55655E] uppercase">
                Your Alternative Rate (Loan Saved / FD Return)
              </span>
              <span className="rounded-lg bg-[#D4A437]/25 px-2.5 py-1 text-xs font-bold text-[#7A5400] tabular-nums">
                {externalRatePct}% p.a.
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={24}
              step={0.5}
              value={externalRatePct}
              onChange={(e) => setExternalRatePct(Number(e.target.value))}
              className="mt-3 h-2 w-full cursor-pointer accent-[#B8860B]"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[
                { label: '0% Cash Idle', val: 0 },
                { label: '7.5% Bank FD', val: 7.5 },
                { label: '11% Gold Loan', val: 11 },
                { label: '16% Personal Loan', val: 16 },
                { label: '21% Business Credit', val: 21 },
              ].map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => setExternalRatePct(preset.val)}
                  className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition ${
                    externalRatePct === preset.val
                      ? 'bg-[#0B3B2E] text-white'
                      : 'bg-white text-[#55655E] border border-[#0B3B2E]/15 hover:bg-[#EFECE4]'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 4 Key Metrics for Selected Month */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-[#0B3B2E]/15 bg-white p-4">
          <p className="text-xs font-semibold text-[#55655E]">
            Chit Payout (Month {currentRow.monthNumber})
          </p>
          <p className="mt-1 text-2xl font-bold text-[#0B3B2E] tabular-nums">
            {formatPassbookAmount(currentRow.payoutValue)}
          </p>
          <p className="mt-1 text-xs text-[#55655E]">
            Received on {formatShortDate(currentRow.chitDate)}
          </p>
        </div>

        <div className="rounded-2xl border border-[#0B3B2E]/15 bg-white p-4">
          <p className="text-xs font-semibold text-[#55655E]">
            Total Paid Across {analysisRows.length} Months
          </p>
          <p className="mt-1 text-2xl font-bold text-[#14201C] tabular-nums">
            {formatPassbookAmount(currentRow.totalPaid)}
          </p>
          <p className="mt-1 text-xs text-[#55655E] tabular-nums">
            Pre/At Lift: {formatPassbookAmount(currentRow.paidBeforeOrAtLift, true, false)} · Post:{' '}
            {formatPassbookAmount(currentRow.paidAfterLift, true, false)}
          </p>
        </div>

        <div className="rounded-2xl border border-[#0B3B2E]/15 bg-white p-4">
          <p className="text-xs font-semibold text-[#55655E]">Direct Passbook Profit / Cost</p>
          <div className="mt-1 flex items-center gap-1.5">
            {currentRow.netGainOrCost >= 0 ? (
              <TrendingUp className="h-5 w-5 text-emerald-700" />
            ) : (
              <TrendingDown className="h-5 w-5 text-amber-700" />
            )}
            <p
              className={`text-2xl font-bold tabular-nums ${
                currentRow.netGainOrCost >= 0 ? 'text-emerald-700' : 'text-amber-800'
              }`}
            >
              {currentRow.netGainOrCost >= 0 ? '+' : ''}
              {formatPassbookAmount(currentRow.netGainOrCost)}
            </p>
          </div>
          <p className="mt-1 text-xs text-[#55655E]">
            {currentRow.netGainOrCost >= 0
              ? 'Pure passbook profit over installments'
              : 'Net interest cost for early liquidity'}
          </p>
        </div>

        <div className="rounded-2xl border border-[#0B3B2E]/15 bg-[#0B3B2E] p-4 text-white">
          <p className="text-xs font-semibold text-white/75">
            Effective IRR & Opportunity Value
          </p>
          <p className="mt-1 text-2xl font-bold text-[#F2CA6B] tabular-nums">
            {currentRow.netGainOrCost >= 0
              ? `+${Math.abs(currentRow.annualizedIrrPct).toFixed(1)}% Return`
              : `${Math.abs(currentRow.annualizedIrrPct).toFixed(1)}% Cost`}
          </p>
          <p className="mt-1 text-xs text-white/80 tabular-nums">
            At {externalRatePct}% rate:{' '}
            <strong className="text-white">
              {currentRow.reinvestedMaturityBenefit >= 0 ? '+' : ''}
              {formatPassbookAmount(currentRow.reinvestedMaturityBenefit, true, false)}
            </strong>{' '}
            net at end
          </p>
        </div>
      </div>

      {/* Recommendation Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#D4A437]/45 bg-[#FAF4E4] px-5 py-3.5 text-sm">
        <div className="flex items-start gap-2.5">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-[#9A6B00]" />
          <div>
            <p className="font-bold text-[#14201C]">
              Optimal Lift Recommendation at {externalRatePct}% Opportunity Rate:{' '}
              <span className="text-[#0B3B2E]">Month {bestOverallRow.monthNumber}</span>
            </p>
            <p className="text-xs text-[#55655E]">
              {bestOverallRow.monthNumber === bestSaverRow.monthNumber
                ? `Waiting until Month ${bestSaverRow.monthNumber} yields the maximum pure profit of +${formatPassbookAmount(bestSaverRow.netGainOrCost)} (${Math.abs(bestSaverRow.annualizedIrrPct).toFixed(1)}% annualized return), outperforming a ${externalRatePct}% alternative.`
                : `Because your alternative loan/return rate is ${externalRatePct}% p.a., lifting earlier in Month ${bestOverallRow.monthNumber} (where borrowing cost is ${Math.abs(bestOverallRow.annualizedIrrPct).toFixed(1)}% p.a.) creates a net maturity advantage of ${bestOverallRow.reinvestedMaturityBenefit >= 0 ? '+' : ''}${formatPassbookAmount(bestOverallRow.reinvestedMaturityBenefit)}!`}
            </p>
          </div>
        </div>
        <button
          onClick={() => setSelectedMonth(bestOverallRow.monthNumber)}
          className="rounded-xl bg-[#0B3B2E] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#135341]"
        >
          Jump to Month {bestOverallRow.monthNumber}
        </button>
      </div>

      {/* Visual Profit / Cost Curve + Full Month Table */}
      <div className="overflow-hidden rounded-2xl border border-[#0B3B2E]/15 bg-white">
        <div className="border-b border-[#0B3B2E]/10 px-5 py-3.5 flex items-center justify-between">
          <h3 className="text-sm font-bold text-[#14201C]">
            Month-by-Month Lift Comparison ({activeConfig.title})
          </h3>
          <span className="inline-flex items-center gap-1 text-xs text-[#55655E]">
            <Info className="h-3.5 w-3.5" />
            Click any row to inspect
          </span>
        </div>

        <div className="overflow-x-auto rm-scroll-x">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#0B3B2E]/15 bg-[#FAF8F4] text-[11px] font-bold tracking-wider text-[#55655E] uppercase">
                <th className="px-4 py-3">Lift Month</th>
                <th className="px-4 py-3 text-right">Total Paid</th>
                <th className="px-4 py-3 text-right">Chit Payout</th>
                <th className="px-4 py-3 text-right">Direct Gain / Cost</th>
                <th className="px-4 py-3 w-44">Visual Margin</th>
                <th className="px-4 py-3 text-right">IRR (% p.a.)</th>
                <th className="px-4 py-3 text-right">Net @ {externalRatePct}% Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#0B3B2E]/10">
              {analysisRows.map((row) => {
                const isSelected = row.monthNumber === clampedMonth;
                const barPct = Math.max(6, Math.round((Math.abs(row.netGainOrCost) / maxAbsBenefit) * 100));
                const isGain = row.netGainOrCost >= 0;

                return (
                  <tr
                    key={row.monthNumber}
                    onClick={() => setSelectedMonth(row.monthNumber)}
                    className={`cursor-pointer transition ${
                      isSelected ? 'bg-emerald-50/90 font-semibold' : 'hover:bg-[#FAF8F4]'
                    }`}
                  >
                    <td className="px-4 py-2.5 tabular-nums">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                            isSelected
                              ? 'bg-[#0B3B2E] text-white'
                              : 'bg-[#FAF8F4] text-[#14201C]'
                          }`}
                        >
                          {row.monthNumber}
                        </span>
                        <span className="text-xs text-[#55655E]">
                          {formatShortDate(row.chitDate)}
                        </span>
                        {row.monthNumber === bestOverallRow.monthNumber && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-[#0B3B2E] px-1.5 py-0.5 text-[10px] font-bold text-[#F2CA6B]">
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            BEST
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-2.5 text-right text-[#2E3D37] tabular-nums">
                      {formatPassbookAmount(row.totalPaid, true, false)}
                    </td>

                    <td className="px-4 py-2.5 text-right font-semibold text-[#0B3B2E] tabular-nums">
                      {formatPassbookAmount(row.payoutValue, true, false)}
                    </td>

                    <td
                      className={`px-4 py-2.5 text-right font-bold tabular-nums ${
                        isGain ? 'text-emerald-700' : 'text-amber-800'
                      }`}
                    >
                      {isGain ? '+' : ''}
                      {formatPassbookAmount(row.netGainOrCost, true, false)}
                    </td>

                    <td className="px-4 py-2.5">
                      <div className="h-2 w-full overflow-hidden rounded-full bg-[#EFECE4]">
                        <div
                          className={`h-full rounded-full ${
                            isGain ? 'bg-emerald-600' : 'bg-amber-500'
                          }`}
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                    </td>

                    <td className="px-4 py-2.5 text-right text-xs font-semibold tabular-nums">
                      <span className={isGain ? 'text-emerald-800' : 'text-[#55655E]'}>
                        {isGain
                          ? `+${Math.abs(row.annualizedIrrPct).toFixed(1)}%`
                          : `${Math.abs(row.annualizedIrrPct).toFixed(1)}% cost`}
                      </span>
                    </td>

                    <td
                      className={`px-4 py-2.5 text-right text-xs font-bold tabular-nums ${
                        row.reinvestedMaturityBenefit >= 0
                          ? 'text-emerald-800'
                          : 'text-[#55655E]'
                      }`}
                    >
                      {row.reinvestedMaturityBenefit >= 0 ? '+' : ''}
                      {formatPassbookAmount(row.reinvestedMaturityBenefit, true, false)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
