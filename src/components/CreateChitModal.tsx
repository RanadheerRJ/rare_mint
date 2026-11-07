import React, { useState } from 'react';
import { PlusCircle, Sparkles, Wand2, X } from 'lucide-react';
import { ChitGroupSummary, ChitType } from '../types';
import { api } from '../api/client';
import {
  CHIT_PRESETS,
  RawScheduleTemplateRow,
  generateAuctionInitialSchedule,
  generateProportionalFixedSchedule,
} from '../utils/chitFinance';
import { formatPassbookAmount } from '../utils/format';
import { NumberField } from './NumberField';

const MIN_MONTHS = 2;
const MAX_MONTHS = 60;
const MIN_FACE_VALUE = 1000;
const isValidMonths = (m: number) => Number.isInteger(m) && m >= MIN_MONTHS && m <= MAX_MONTHS;

interface CreateChitModalProps {
  onClose: () => void;
  onCreated: (group: ChitGroupSummary) => void;
}

export const CreateChitModal: React.FC<CreateChitModalProps> = ({ onClose, onCreated }) => {
  const defaultPreset = CHIT_PRESETS[0];
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [chitType, setChitType] = useState<ChitType>(defaultPreset.chitType);
  const [faceValue, setFaceValue] = useState<number>(defaultPreset.faceValue);
  const [durationMonths, setDurationMonths] = useState<number>(defaultPreset.durationMonths);
  const [startDate, setStartDate] = useState<string>(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()));
  const [dueDay, setDueDay] = useState<number>(10);
  const [foremanCommissionPct, setForemanCommissionPct] = useState<number>(5);
  const [maxBidPct, setMaxBidPct] = useState<number>(35);
  const [notes, setNotes] = useState<string>('');
  const [schedule, setSchedule] = useState<RawScheduleTemplateRow[]>(
    defaultPreset.schedule.map((r) => ({ ...r }))
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyPreset = (presetId: string) => {
    const p = CHIT_PRESETS.find((x) => x.id === presetId);
    if (!p) return;
    setChitType(p.chitType);
    setFaceValue(p.faceValue);
    setDurationMonths(p.durationMonths);
    setForemanCommissionPct(p.foremanCommissionPct);
    setMaxBidPct(p.maxBidPct);
    setSchedule(p.schedule.map((r) => ({ ...r })));
    setName(p.label.replace('·', '—'));
    setCode(
      `RM-${Math.round(p.faceValue / 100000)}L-${p.durationMonths}M-${Math.floor(10 + Math.random() * 89)}`
    );
  };

  const regenerateSchedule = (
    nextType: ChitType = chitType,
    nextFace: number = faceValue,
    nextDuration: number = durationMonths
  ) => {
    const clampedMonths = Math.min(MAX_MONTHS, Math.max(MIN_MONTHS, Math.round(nextDuration)));
    if (nextType === 'FIXED_TABLE') {
      setSchedule(generateProportionalFixedSchedule(nextFace, clampedMonths));
    } else {
      setSchedule(generateAuctionInitialSchedule(nextFace, clampedMonths));
    }
  };

  const updateRowField = (
    idx: number,
    field: 'nonPrizedInstallment' | 'chitValue' | 'prizedInstallment',
    val: number
  ) => {
    setSchedule((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [field]: Math.max(0, val) } : r))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isValidMonths(durationMonths)) {
      setError(`Duration must be between ${MIN_MONTHS} and ${MAX_MONTHS} months.`);
      return;
    }
    if (faceValue < MIN_FACE_VALUE) {
      setError(`Chit face value must be at least ${formatPassbookAmount(MIN_FACE_VALUE)}.`);
      return;
    }
    if (dueDay < 1 || dueDay > 28) {
      setError('Monthly due day must be between 1 and 28.');
      return;
    }
    if (schedule.length !== durationMonths) {
      setError('The schedule does not match the duration. Tap Rebuild to recalculate it.');
      return;
    }
    setSubmitting(true);
    try {
      const baseInstallment =
        chitType === 'FIXED_TABLE'
          ? schedule[0]?.prizedInstallment || Math.round(faceValue / durationMonths)
          : Math.round(faceValue / durationMonths);

      const { group } = await api.createChit({
        name,
        code,
        chitType,
        faceValue,
        durationMonths,
        startDate,
        dueDayOfMonth: dueDay,
        baseInstallment,
        foremanCommissionPct,
        maxBidPct: chitType === 'AUCTION' ? maxBidPct : 0,
        notes,
        schedule,
      });
      onCreated(group);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create chit group');
    } finally {
      setSubmitting(false);
    }
  };

  const nonPrizedTotal = schedule.reduce((s, r) => s + r.nonPrizedInstallment, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 sm:p-5 backdrop-blur-xs">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[#0B3B2E]/20 bg-[#FAF8F4] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between bg-[#0B3B2E] px-6 py-4 text-white">
          <div>
            <p className="text-[11px] font-bold tracking-widest text-[#D4A437] uppercase">
              Organizer Desk · New Chit Group
            </p>
            <h2 className="text-lg font-bold">Create Fixed-Table or Monthly Auction Chit</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/75 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 space-y-5 overflow-y-auto p-6">
          {/* Quick Presets */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-[#55655E] uppercase">
              <Sparkles className="h-3.5 w-3.5 text-[#B8860B]" />
              1-Tap Passbook & Auction Templates
            </label>
            <div className="mt-2 grid gap-2.5 sm:grid-cols-2">
              {CHIT_PRESETS.map((preset) => (
                <button
                  type="button"
                  key={preset.id}
                  onClick={() => applyPreset(preset.id)}
                  className="rounded-xl border border-[#0B3B2E]/15 bg-white p-3 text-left transition hover:border-[#0B3B2E] hover:bg-emerald-50/40"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#0B3B2E]">{preset.label}</span>
                    <span className="rounded bg-[#FAF8F4] px-2 py-0.5 text-[10px] font-bold text-[#55655E]">
                      {preset.chitType === 'FIXED_TABLE' ? 'FIXED TABLE' : 'AUCTION'}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-[#55655E]">{preset.subtitle}</p>
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
              {error}
            </div>
          )}

          {/* Core Group Details */}
          <div className="grid gap-4 rounded-2xl border border-[#0B3B2E]/12 bg-white p-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#55655E]">Chit Group Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#0B3B2E]/20 bg-[#FAF8F4] px-3.5 py-2 text-sm font-semibold focus:border-[#0B3B2E] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#55655E]">Passbook Code</label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="mt-1 w-full rounded-xl border border-[#0B3B2E]/20 bg-[#FAF8F4] px-3.5 py-2 font-mono text-sm font-semibold focus:border-[#0B3B2E] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#55655E]">Chit Structure</label>
              <select
                value={chitType}
                onChange={(e) => {
                  const next = e.target.value as ChitType;
                  setChitType(next);
                  regenerateSchedule(next, faceValue, durationMonths);
                }}
                className="mt-1 w-full rounded-xl border border-[#0B3B2E]/20 bg-[#FAF8F4] px-3.5 py-2 text-sm font-semibold focus:border-[#0B3B2E] focus:outline-none"
              >
                <option value="FIXED_TABLE">Fixed-Table Passbook (Slab)</option>
                <option value="AUCTION">Monthly Auction (Dividend)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#55655E]">
                Chit Face Value (₹)
              </label>
              <NumberField
                required
                min={MIN_FACE_VALUE}
                value={faceValue}
                onValueChange={(v) => {
                  setFaceValue(v);
                  if (v >= MIN_FACE_VALUE && isValidMonths(durationMonths)) {
                    regenerateSchedule(chitType, v, durationMonths);
                  }
                }}
                className="mt-1 w-full rounded-xl border border-[#0B3B2E]/20 bg-[#FAF8F4] px-3.5 py-2 text-sm font-semibold tabular-nums focus:border-[#0B3B2E] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#55655E]">
                Duration / Total Tickets
              </label>
              <div className="mt-1 flex gap-2">
                <NumberField
                  required
                  min={MIN_MONTHS}
                  max={MAX_MONTHS}
                  value={durationMonths}
                  onValueChange={(m) => {
                    setDurationMonths(m);
                    if (isValidMonths(m)) regenerateSchedule(chitType, faceValue, m);
                  }}
                  onCommit={(m) => {
                    if (schedule.length !== m) regenerateSchedule(chitType, faceValue, m);
                  }}
                  className="w-full rounded-xl border border-[#0B3B2E]/20 bg-[#FAF8F4] px-3.5 py-2 text-sm font-semibold tabular-nums focus:border-[#0B3B2E] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => regenerateSchedule(chitType, faceValue, durationMonths)}
                  title="Auto-calculate schedule for current Face Value & Months"
                  className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-[#0B3B2E]/20 bg-[#FAF8F4] px-3 py-2 text-xs font-semibold text-[#0B3B2E] hover:bg-[#EFECE4]"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  Rebuild
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#55655E]">First Chit Date</label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  const d = Number(e.target.value.split('-')[2]);
                  if (d) setDueDay(Math.min(28, d));
                }}
                className="mt-1 w-full rounded-xl border border-[#0B3B2E]/20 bg-[#FAF8F4] px-3.5 py-2 text-sm font-semibold focus:border-[#0B3B2E] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#55655E]">
                Monthly Due Day (1–28)
              </label>
              <NumberField
                min={1}
                max={28}
                value={dueDay}
                onValueChange={setDueDay}
                className="mt-1 w-full rounded-xl border border-[#0B3B2E]/20 bg-[#FAF8F4] px-3.5 py-2 text-sm font-semibold tabular-nums focus:border-[#0B3B2E] focus:outline-none"
              />
            </div>

            {chitType === 'AUCTION' && (
              <div>
                <label className="block text-xs font-semibold text-[#55655E]">
                  Foreman Commission (%)
                </label>
                <NumberField
                  allowDecimal
                  min={0}
                  max={20}
                  value={foremanCommissionPct}
                  onValueChange={setForemanCommissionPct}
                  className="mt-1 w-full rounded-xl border border-[#0B3B2E]/20 bg-[#FAF8F4] px-3.5 py-2 text-sm font-semibold tabular-nums focus:border-[#0B3B2E] focus:outline-none"
                />
              </div>
            )}

            {chitType === 'AUCTION' && (
              <div>
                <label className="block text-xs font-semibold text-[#55655E]">
                  Maximum Bid Discount (%)
                </label>
                <NumberField
                  allowDecimal
                  min={0}
                  max={100}
                  value={maxBidPct}
                  onValueChange={setMaxBidPct}
                  className="mt-1 w-full rounded-xl border border-[#0B3B2E]/20 bg-[#FAF8F4] px-3.5 py-2 text-sm font-semibold tabular-nums focus:border-[#0B3B2E] focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* Editable Monthly Schedule Preview */}
          {chitType === 'FIXED_TABLE' && (
            <div className="rounded-2xl border border-[#0B3B2E]/15 bg-white overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#0B3B2E]/10 bg-[#F2EDE1] px-4 py-3">
                <div>
                  <h3 className="text-xs font-bold tracking-wider text-[#14201C] uppercase">
                    Editable Passbook Schedule ({schedule.length} Months)
                  </h3>
                  <p className="text-[11px] text-[#55655E]">
                    Customize any cell to match your physical passbook card.
                  </p>
                </div>
                <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-[#0B3B2E] tabular-nums">
                  Non-Prized Sum: {formatPassbookAmount(nonPrizedTotal)}
                </span>
              </div>

              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-[#FAF8F4] text-[11px] font-bold text-[#55655E] uppercase">
                    <tr>
                      <th className="px-3 py-2 w-14">S.No.</th>
                      <th className="px-3 py-2">Non-Prized (₹)</th>
                      <th className="px-3 py-2">Chit Value (₹)</th>
                      <th className="px-3 py-2">Prized Rate (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#0B3B2E]/10">
                    {schedule.map((row, idx) => (
                      <tr key={row.monthNumber}>
                        <td className="px-3 py-1.5 font-bold tabular-nums">{row.monthNumber}</td>
                        <td className="px-3 py-1.5">
                          <NumberField
                            min={0}
                            aria-label={`Month ${row.monthNumber} nonPrizedInstallment`}
                            value={row.nonPrizedInstallment}
                            onValueChange={(v) => updateRowField(idx, 'nonPrizedInstallment', v)}
                            className="w-28 rounded border border-[#0B3B2E]/20 px-2 py-1 font-semibold tabular-nums"
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <NumberField
                            min={0}
                            aria-label={`Month ${row.monthNumber} chitValue`}
                            value={row.chitValue}
                            onValueChange={(v) => updateRowField(idx, 'chitValue', v)}
                            className="w-32 rounded border border-[#0B3B2E]/20 px-2 py-1 font-semibold tabular-nums"
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <NumberField
                            min={0}
                            aria-label={`Month ${row.monthNumber} prizedInstallment`}
                            value={row.prizedInstallment}
                            onValueChange={(v) => updateRowField(idx, 'prizedInstallment', v)}
                            className="w-28 rounded border border-[#0B3B2E]/20 px-2 py-1 font-semibold tabular-nums"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Footer Submit */}
          <div className="flex items-center justify-end gap-3 border-t border-[#0B3B2E]/10 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[#0B3B2E]/20 bg-white px-4 py-2.5 text-sm font-semibold text-[#14201C] hover:bg-[#EFECE4]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0B3B2E] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#135341] disabled:opacity-50"
            >
              <PlusCircle className="h-4 w-4" />
              {submitting ? 'Creating Group…' : 'Mint New Chit Group'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
