import React, { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { ChitGroupDetail, MemberSlot, PaymentMethod, PaymentRecord } from '../types';
import { api } from '../api/client';

const inputClass =
  'mt-1 w-full rounded-xl border border-[#0B3B2E]/20 bg-[#FAF8F4] px-3.5 py-2.5 text-sm focus:border-[#0B3B2E] focus:outline-none';
const labelClass = 'block text-xs font-semibold text-[#55655E]';
const primaryBtn =
  'rounded-xl bg-[#0B3B2E] px-4 py-2 text-sm font-bold text-white hover:bg-[#135341] disabled:opacity-50';
const secondaryBtn =
  'rounded-xl border border-[#0B3B2E]/20 px-4 py-2 text-sm font-semibold text-[#55655E] hover:bg-[#FAF8F4]';

function ModalShell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#0B3B2E]/15 bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-[#14201C]">{title}</h3>
            {subtitle && <p className="mt-1 text-xs text-[#55655E]">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-[#55655E] hover:bg-[#FAF8F4]"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="mt-3 rounded-xl border border-red-300 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-800">
      {message}
    </p>
  );
}

/** Generic confirm dialog with optional danger styling. */
export const ConfirmModal: React.FC<{
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}> = ({ title, message, confirmLabel, danger, busy, error, onConfirm, onClose }) => (
  <ModalShell title={title} onClose={onClose}>
    <div className="mt-3 text-sm leading-relaxed text-[#55655E]">{message}</div>
    <ErrorNote message={error ?? null} />
    <div className="mt-5 flex justify-end gap-2">
      <button type="button" onClick={onClose} className={secondaryBtn}>
        Cancel
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={busy}
        className={
          danger
            ? 'rounded-xl bg-red-700 px-4 py-2 text-sm font-bold text-white hover:bg-red-800 disabled:opacity-50'
            : primaryBtn
        }
      >
        {busy ? <Loader2 className="inline h-4 w-4 animate-spin" /> : confirmLabel}
      </button>
    </div>
  </ModalShell>
);

/** Edit chit group settings; structurally-locked fields are disabled once payments exist. */
export const EditChitModal: React.FC<{
  group: ChitGroupDetail;
  onClose: () => void;
  onSaved: () => void;
}> = ({ group, onClose, onSaved }) => {
  const hasPayments = group.payments.length > 0;
  const hasSettled = group.schedule.some((s) => s.isAuctionCompleted);
  const structureLocked = hasPayments || hasSettled;

  const [name, setName] = useState(group.name);
  const [notes, setNotes] = useState(group.notes);
  const [dueDay, setDueDay] = useState(String(group.dueDayOfMonth));
  const [startDate, setStartDate] = useState(group.startDate);
  const [commission, setCommission] = useState(String(group.foremanCommissionPct));
  const [maxBid, setMaxBid] = useState(String(group.maxBidPct));
  const [faceValue, setFaceValue] = useState(String(group.faceValue));
  const [duration, setDuration] = useState(String(group.durationMonths));
  const [chitType, setChitType] = useState(group.chitType);
  const [status, setStatus] = useState(group.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.updateChit(group.id, {
        name: name.trim(),
        notes,
        dueDayOfMonth: Number(dueDay),
        startDate,
        foremanCommissionPct: Number(commission),
        maxBidPct: Number(maxBid),
        faceValue: structureLocked ? undefined : Number(faceValue),
        durationMonths: structureLocked ? undefined : Number(duration),
        chitType: structureLocked ? undefined : chitType,
        status,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell title="Edit Chit Group" subtitle={group.code} onClose={onClose}>
      <form onSubmit={handleSave} className="mt-4 space-y-3">
        <div>
          <label className={labelClass}>Group Name</label>
          <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Start Date</label>
            <input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Due Day of Month</label>
            <input
              type="number"
              min={1}
              max={31}
              required
              value={dueDay}
              onChange={(e) => setDueDay(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Foreman Commission %</label>
            <input
              type="number"
              min={0}
              max={100}
              step="0.5"
              required
              value={commission}
              onChange={(e) => setCommission(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Max Bid %</label>
            <input
              type="number"
              min={0}
              max={100}
              step="0.5"
              required
              value={maxBid}
              onChange={(e) => setMaxBid(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        {structureLocked && (
          <p className="flex items-start gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {hasPayments
              ? 'Face value, duration and chit type are locked because payments exist.'
              : 'Face value, duration and chit type are locked because a month has been settled.'}
          </p>
        )}
        <div className={`grid grid-cols-3 gap-3 ${structureLocked ? 'opacity-50' : ''}`}>
          <div>
            <label className={labelClass}>Face Value</label>
            <input
              type="number"
              min={1}
              required
              disabled={structureLocked}
              value={faceValue}
              onChange={(e) => setFaceValue(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Duration (months)</label>
            <input
              type="number"
              min={1}
              required
              disabled={structureLocked}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Chit Type</label>
            <select
              disabled={structureLocked}
              value={chitType}
              onChange={(e) => setChitType(e.target.value as 'FIXED_TABLE' | 'AUCTION')}
              className={inputClass}
            >
              <option value="FIXED_TABLE">Fixed Table</option>
              <option value="AUCTION">Auction</option>
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass}>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as 'ACTIVE' | 'COMPLETED')} className={inputClass}>
            <option value="ACTIVE">ACTIVE</option>
            <option value="COMPLETED">COMPLETED</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputClass} />
        </div>

        <ErrorNote message={error} />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={secondaryBtn}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={primaryBtn}>
            {busy ? <Loader2 className="inline h-4 w-4 animate-spin" /> : 'Save Changes'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
};

/** Edit a ticket: member name/city/phone and ticket number reassignment. */
export const EditMemberModal: React.FC<{
  group: ChitGroupDetail;
  slot: MemberSlot;
  onClose: () => void;
  onSaved: () => void;
}> = ({ group, slot, onClose, onSaved }) => {
  const [name, setName] = useState(slot.memberName);
  const [phone, setPhone] = useState(slot.memberPhone);
  const [city, setCity] = useState('');
  const [ticket, setTicket] = useState(String(slot.ticketNumber));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.updateSlot(group.id, slot.id, {
        memberName: name.trim(),
        phone: phone.trim(),
        city: city.trim() || undefined,
        ticketNumber: Number(ticket),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      title={`Edit Ticket #${slot.ticketNumber}`}
      subtitle={`Subscriber: ${slot.memberName}`}
      onClose={onClose}
    >
      <form onSubmit={handleSave} className="mt-4 space-y-3">
        <div>
          <label className={labelClass}>Subscriber Name</label>
          <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>10-Digit Mobile</label>
            <input
              type="tel"
              required
              pattern="[0-9]{10}"
              maxLength={10}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>City (optional)</label>
            <input type="text" value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} />
          </div>
        </div>
        <div>
          <label className={labelClass}>Ticket Number (1–{group.totalSlots})</label>
          <input
            type="number"
            min={1}
            max={group.totalSlots}
            required
            value={ticket}
            onChange={(e) => setTicket(e.target.value)}
            className={inputClass}
          />
        </div>
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={secondaryBtn}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={primaryBtn}>
            {busy ? <Loader2 className="inline h-4 w-4 animate-spin" /> : 'Save Changes'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
};

/** Reset a member's PIN (organizer supplies the new PIN and shares it privately). */
export const ResetPinModal: React.FC<{
  memberName: string;
  memberId: number;
  onClose: () => void;
  onSaved: () => void;
}> = ({ memberName, memberId, onClose, onSaved }) => {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.resetMemberPin(memberId, pin.trim());
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PIN reset failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      title={`Reset PIN for ${memberName}`}
      subtitle="Set a new 4-digit PIN and share it privately with the subscriber."
      onClose={onClose}
    >
      <form onSubmit={handleSave} className="mt-4 space-y-3">
        <div>
          <label className={labelClass}>New 4-Digit PIN</label>
          <input
            type="password"
            required
            pattern="[0-9]{4}"
            maxLength={4}
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className={inputClass}
          />
        </div>
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={secondaryBtn}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={primaryBtn}>
            {busy ? <Loader2 className="inline h-4 w-4 animate-spin" /> : 'Reset PIN'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
};

/** Edit a posted payment (amount, method, date, note). */
export const EditPaymentModal: React.FC<{
  payment: PaymentRecord;
  onClose: () => void;
  onSaved: () => void;
}> = ({ payment, onClose, onSaved }) => {
  const [amount, setAmount] = useState(String(payment.amountPaid));
  const [method, setMethod] = useState<PaymentMethod>(payment.paymentMethod);
  const [paidDate, setPaidDate] = useState(payment.paidDate);
  const [note, setNote] = useState(payment.referenceNote);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.updatePayment(payment.chitGroupId, payment.id, {
        amountPaid: Number(amount),
        paymentMethod: method,
        paidDate,
        referenceNote: note,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      title={`Edit Receipt ${payment.receiptNumber}`}
      subtitle={`Month ${payment.monthNumber} · Ticket #${payment.ticketNumber ?? '—'} · ${payment.memberName ?? ''}`}
      onClose={onClose}
    >
      <form onSubmit={handleSave} className="mt-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Amount (₹)</label>
            <input
              type="number"
              min={1}
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              className={inputClass}
            >
              <option value="UPI">UPI</option>
              <option value="CASH">CASH</option>
              <option value="BANK_TRANSFER">BANK TRANSFER</option>
              <option value="CHEQUE">CHEQUE</option>
            </select>
          </div>
        </div>
        <div>
          <label className={labelClass}>Paid Date</label>
          <input
            type="date"
            required
            value={paidDate}
            onChange={(e) => setPaidDate(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Reference Note</label>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
        </div>
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={secondaryBtn}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={primaryBtn}>
            {busy ? <Loader2 className="inline h-4 w-4 animate-spin" /> : 'Save Changes'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
};

/** Void a payment; a reason is required and kept in the audit trail. */
export const VoidPaymentModal: React.FC<{
  payment: PaymentRecord;
  onClose: () => void;
  onVoided: () => void;
}> = ({ payment, onClose, onVoided }) => {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleVoid = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.voidPayment(payment.chitGroupId, payment.id, reason.trim());
      onVoided();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Void failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      title={`Void Receipt ${payment.receiptNumber}?`}
      subtitle="The payment stays on record as VOID and the reason is written to the audit trail."
      onClose={onClose}
    >
      <form onSubmit={handleVoid} className="mt-4 space-y-3">
        <div className="rounded-xl bg-[#FAF8F4] p-3 text-xs font-semibold text-[#14201C]">
          ₹{payment.amountPaid.toLocaleString('en-IN')} · Month {payment.monthNumber} ·{' '}
          {payment.memberName ?? ''}
        </div>
        <div>
          <label className={labelClass}>Reason (required)</label>
          <textarea
            required
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Entered twice by mistake"
            className={inputClass}
          />
        </div>
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={secondaryBtn}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-red-700 px-4 py-2 text-sm font-bold text-white hover:bg-red-800 disabled:opacity-50"
          >
            {busy ? <Loader2 className="inline h-4 w-4 animate-spin" /> : 'Void Payment'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
};
