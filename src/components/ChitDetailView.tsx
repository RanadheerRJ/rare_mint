import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Award,
  Ban,
  BookOpen,
  Calculator,
  CheckCircle2,
  ChevronRight,
  Gavel,
  KeyRound,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  ChitGroupDetail,
  MemberSlot,
  PaymentMethod,
  PaymentRecord,
  User,
} from '../types';
import { api } from '../api/client';
import { getMemberPayableForMonth } from '../utils/chitFinance';
import {
  buildDueReminderWhatsAppText,
  buildWhatsAppLink,
  formatIndianDate,
  formatPassbookAmount,
} from '../utils/format';
import { PassbookTable } from './PassbookTable';
import { LiftCalculator } from './LiftCalculator';
import { NumberField } from './NumberField';
import {
  ConfirmModal,
  EditChitModal,
  EditMemberModal,
  EditPaymentModal,
  ResetPinModal,
  VoidPaymentModal,
} from './ManageModals';

interface ChitDetailViewProps {
  groupId: number;
  currentUser: User;
  onBack: () => void;
  onOpenReceipt: (receipt: PaymentRecord) => void;
  onDataChanged: () => void;
}

type DetailTab = 'passbook' | 'collections' | 'lifts' | 'calculator';

export const ChitDetailView: React.FC<ChitDetailViewProps> = ({
  groupId,
  currentUser,
  onBack,
  onOpenReceipt,
  onDataChanged,
}) => {
  const [group, setGroup] = useState<ChitGroupDetail | null>(null);
  const isOrganizer = currentUser.role === 'organizer' && group?.organizerId === currentUser.id;
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DetailTab>('passbook');
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null);
  const [collectionMonth, setCollectionMonth] = useState<number>(1);

  // Payment modal state (`amount` is the outstanding prefill; the form accepts a
  // smaller partial payment with the balance collected later)
  const [payModal, setPayModal] = useState<{
    slot: MemberSlot;
    monthNumber: number;
    amount: number;
  } | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState<PaymentMethod>('UPI');
  const [payRef, setPayRef] = useState('');
  const [payBusy, setPayBusy] = useState(false);

  const openPayModal = (slot: MemberSlot, monthNumber: number, amount: number) => {
    setPayModal({ slot, monthNumber, amount });
    setPayAmount(amount);
  };

  // Enroll modal state
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [enrollTicket, setEnrollTicket] = useState<number>(1);
  const [existingMembers, setExistingMembers] = useState<User[]>([]);
  const [enrollMode, setEnrollMode] = useState<'existing' | 'new'>('new');
  const [selectedExistingUserId, setSelectedExistingUserId] = useState<number>(0);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberPhone, setNewMemberPhone] = useState('');
  const [newMemberPin, setNewMemberPin] = useState('');
  const [enrollBusy, setEnrollBusy] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);

  // Lift / Auction form state
  const [liftMonth, setLiftMonth] = useState<number>(1);
  const [liftWinnerSlotId, setLiftWinnerSlotId] = useState<number>(0);
  const [bidDiscount, setBidDiscount] = useState<number>(50000);
  const [payoutRef, setPayoutRef] = useState<string>('');
  const [liftMessage, setLiftMessage] = useState<string | null>(null);
  const [liftError, setLiftError] = useState<string | null>(null);

  // Management state (chit / member / payment CRUD)
  const [showEditChit, setShowEditChit] = useState(false);
  const [editSlot, setEditSlot] = useState<MemberSlot | null>(null);
  const [resetPinSlot, setResetPinSlot] = useState<MemberSlot | null>(null);
  const [editPayment, setEditPayment] = useState<PaymentRecord | null>(null);
  const [voidPayment, setVoidPayment] = useState<PaymentRecord | null>(null);
  const [confirmDeleteChit, setConfirmDeleteChit] = useState(false);
  const [confirmRemoveSlot, setConfirmRemoveSlot] = useState<MemberSlot | null>(null);
  const [manageMenuOpen, setManageMenuOpen] = useState(false);
  const manageMenuRef = useRef<HTMLDivElement | null>(null);
  const [manageBusy, setManageBusy] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const { group: detail } = await api.getChitDetail(groupId);
      setGroup(detail);
      setCollectionMonth(detail.currentMonth);
      setLiftMonth(detail.currentMonth);

      if (currentUser.role !== 'organizer' || detail.organizerId !== currentUser.id) {
        const myFirstSlot = detail.slots.find((s) => s.userId === currentUser.id);
        if (myFirstSlot) setSelectedSlotId(myFirstSlot.id);
      } else {
        setSelectedSlotId((prev) => {
          if (prev && detail.slots.some((s) => s.id === prev)) return prev;
          return detail.slots[0]?.id ?? null;
        });
      }

      const defaultComm = Math.round((detail.faceValue * detail.foremanCommissionPct) / 100);
      setBidDiscount(Math.max(defaultComm, Math.round(detail.faceValue * 0.25)));
    } finally {
      setLoading(false);
    }
  }, [groupId, currentUser.id, currentUser.role]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  // Close the manage dropdown on outside tap / Escape.
  useEffect(() => {
    if (!manageMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (manageMenuRef.current && !manageMenuRef.current.contains(e.target as Node)) {
        setManageMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setManageMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [manageMenuOpen]);

  const selectedSlot = useMemo(
    () => group?.slots.find((s) => s.id === selectedSlotId) || null,
    [group, selectedSlotId]
  );

  const openEnrollDrawer = async (ticketNum: number) => {
    setEnrollTicket(ticketNum);
    setEnrollError(null);
    setShowEnrollModal(true);
    try {
      const { members } = await api.getMembers();
      setExistingMembers(members);
      setSelectedExistingUserId(members[0]?.id ?? 0);
    } catch {
      // Ignore if offline
    }
  };

  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!group || !payModal) return;
    const maxAmount = payModal.amount;
    if (!Number.isInteger(payAmount) || payAmount < 1 || payAmount > maxAmount) {
      alert(`Enter an amount between 1 and ${maxAmount}.`);
      return;
    }
    setPayBusy(true);
    try {
      const { payment } = await api.recordPayment(group.id, {
        memberSlotId: payModal.slot.id,
        monthNumber: payModal.monthNumber,
        amountPaid: payAmount,
        paymentMethod: payMethod,
        referenceNote: payRef || (payMethod === 'UPI' ? 'Instant UPI Verified' : 'Desk Collection'),
        signedByName: group.organizerName,
      });
      setPayModal(null);
      setPayRef('');
      await loadDetail();
      onDataChanged();
      onOpenReceipt(payment);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not record payment');
    } finally {
      setPayBusy(false);
    }
  };

  const handleEnrollSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!group || !isOrganizer || enrollBusy) return;
    setEnrollError(null);
    setEnrollBusy(true);
    try {
      await api.enrollSlot(group.id, {
        ticketNumber: enrollTicket,
        newMemberPin: enrollMode === 'new' ? newMemberPin : undefined,
        userId: enrollMode === 'existing' ? selectedExistingUserId : undefined,
        newMemberName: enrollMode === 'new' ? newMemberName : undefined,
        newMemberPhone: enrollMode === 'new' ? newMemberPhone : undefined,
      });
      setShowEnrollModal(false);
      setNewMemberName('');
      setNewMemberPhone('');
      setNewMemberPin('');
      await loadDetail();
      onDataChanged();
    } catch (err) {
      setEnrollError(err instanceof Error ? err.message : 'Enrollment failed');
    } finally {
      setEnrollBusy(false);
    }
  };

  const handleRecordLift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!group || !liftWinnerSlotId) return;
    setLiftError(null);
    setLiftMessage(null);
    try {
      await api.recordLift(group.id, {
        monthNumber: liftMonth,
        winnerMemberSlotId: liftWinnerSlotId,
        bidDiscount: group.chitType === 'AUCTION' ? bidDiscount : undefined,
        payoutReference: payoutRef || `NEFT-${group.code}-M${liftMonth}`,
      });
      setLiftMessage(`Month ${liftMonth} winner & passbook rates updated.`);
      setPayoutRef('');
      await loadDetail();
      onDataChanged();
    } catch (err) {
      setLiftError(err instanceof Error ? err.message : 'Could not record winner');
    }
  };

  const handleAdvanceMonth = async (nextMonth: number) => {
    if (!group) return;
    await api.setCurrentMonth(group.id, nextMonth);
    await loadDetail();
    onDataChanged();
  };

  const handleDeleteChit = async () => {
    if (!group) return;
    setManageBusy(true);
    setManageError(null);
    try {
      await api.deleteChit(group.id);
      setConfirmDeleteChit(false);
      onDataChanged();
      onBack();
    } catch (err) {
      setManageError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setManageBusy(false);
    }
  };

  const handleMarkCompleted = async () => {
    if (!group) return;
    setManageBusy(true);
    setManageError(null);
    try {
      await api.updateChit(group.id, {
        status: group.status === 'COMPLETED' ? 'ACTIVE' : 'COMPLETED',
      });
      await loadDetail();
      onDataChanged();
    } catch (err) {
      setManageError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setManageBusy(false);
    }
  };

  const handleRemoveSlot = async () => {
    if (!group || !confirmRemoveSlot) return;
    setManageBusy(true);
    setManageError(null);
    try {
      await api.removeSlot(group.id, confirmRemoveSlot.id);
      setConfirmRemoveSlot(null);
      await loadDetail();
      onDataChanged();
    } catch (err) {
      setManageError(err instanceof Error ? err.message : 'Remove failed');
    } finally {
      setManageBusy(false);
    }
  };

  if (loading || !group) {
    return (
      <div className="rounded-2xl border border-[#0B3B2E]/10 bg-white p-10 text-center text-sm text-[#55655E]">
        Loading digital passbook & ledger…
      </div>
    );
  }

  // Compute collection stats for `collectionMonth`
  const activeSchedRow =
    group.schedule.find((r) => r.monthNumber === collectionMonth) || group.schedule[0];
  // A month can carry several POSTED receipts (partial payments); voided ones
  // do not count towards the collected sum.
  const paymentsInMonth = new Map<number, PaymentRecord[]>();
  for (const p of group.payments) {
    if (p.monthNumber !== collectionMonth) continue;
    if ((p.status ?? 'POSTED') !== 'POSTED') continue;
    const list = paymentsInMonth.get(p.memberSlotId) ?? [];
    list.push(p);
    paymentsInMonth.set(p.memberSlotId, list);
  }

  // Shared view-model for the collections member list — rendered as a table on
  // desktop and as stacked cards on mobile so both stay in sync.
  const slotRows = group.slots
    .filter((s) => isOrganizer || s.userId === currentUser.id)
    .map((slot) => {
      const expected = getMemberPayableForMonth(
        group.chitType,
        activeSchedRow,
        slot.prizedMonth
      );
      const paidRecs = paymentsInMonth.get(slot.id) ?? [];
      const paidSum = paidRecs.reduce((s, p) => s + p.amountPaid, 0);
      const outstanding = Math.max(0, expected - paidSum);
      const isFullyPaid = paidRecs.length > 0 && paidSum >= expected;
      const isPrizedAlready =
        slot.prizedMonth !== null && slot.prizedMonth < collectionMonth;
      const reminderUrl = buildWhatsAppLink(
        slot.memberPhone,
        buildDueReminderWhatsAppText({
          chitGroupId: group.id,
          chitCode: group.code,
          chitName: group.name,
          chitType: group.chitType,
          monthNumber: collectionMonth,
          dueDate: activeSchedRow.chitDate,
          isOverdue: false,
          daysUntilDue: 0,
          memberSlotId: slot.id,
          ticketNumber: slot.ticketNumber,
          memberName: slot.memberName,
          memberPhone: slot.memberPhone,
          isPrizedSubscriber: isPrizedAlready,
          amountDue: outstanding,
          organizerName: group.organizerName,
        })
      );
      return {
        slot,
        expected,
        paidRecs,
        paidSum,
        outstanding,
        isFullyPaid,
        isPrizedAlready,
        reminderUrl,
      };
    });

  const takenTickets = new Set(group.slots.map((s) => s.ticketNumber));
  const openTicketNumbers: number[] = [];
  for (let t = 1; t <= group.totalSlots; t++) {
    if (!takenTickets.has(t)) openTicketNumbers.push(t);
  }

  const eligibleNonPrizedSlots = group.slots.filter(
    (s) => s.prizedMonth === null || s.prizedMonth === liftMonth
  );

  // Live Auction preview math
  const auctionPreview = (() => {
    const comm = Math.round((group.faceValue * group.foremanCommissionPct) / 100);
    const disc = Math.max(comm, bidDiscount);
    const divPool = Math.max(0, disc - comm);
    const divPerMember = Math.round(divPool / group.totalSlots);
    const netInstallment = Math.max(0, group.baseInstallment - divPerMember);
    const winnerPayout = group.faceValue - disc;
    return { comm, disc, divPool, divPerMember, netInstallment, winnerPayout };
  })();

  return (
    <div className="space-y-5">
      {manageError && !confirmDeleteChit && !confirmRemoveSlot && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-800">
          {manageError}
          <button type="button" onClick={() => setManageError(null)} className="ml-2 underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Top Breadcrumb + Summary Bar */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#0B3B2E]/15 bg-white px-3.5 py-2 text-xs font-semibold text-[#14201C] transition hover:bg-[#EFECE4]"
          >
            <ArrowLeft className="h-4 w-4" />
            All Chit Groups
          </button>

          {isOrganizer && (
            <div ref={manageMenuRef} className="relative">
              <button
                onClick={() => setManageMenuOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#0B3B2E]/20 bg-white px-3 py-2 text-xs font-semibold text-[#0B3B2E] hover:bg-[#FAF8F4]"
                aria-expanded={manageMenuOpen}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
                Manage
              </button>
              {manageMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setManageMenuOpen(false)} />
                  <div className="absolute left-0 top-full z-50 mt-2 w-56 max-w-[82vw] overflow-hidden rounded-2xl border border-[#0B3B2E]/15 bg-white p-2 shadow-2xl">
                    <button
                      onClick={() => {
                        setManageMenuOpen(false);
                        setShowEditChit(true);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-[#14201C] hover:bg-[#FAF8F4]"
                    >
                      <Pencil className="h-4 w-4 text-[#0B3B2E]" />
                      Edit Chit
                    </button>
                    <button
                      onClick={() => {
                        setManageMenuOpen(false);
                        handleMarkCompleted();
                      }}
                      disabled={manageBusy}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-[#14201C] hover:bg-[#FAF8F4] disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-4 w-4 text-[#0B3B2E]" />
                      {group.status === 'COMPLETED' ? 'Reopen Chit' : 'Mark Completed'}
                    </button>
                    {group.payments.length === 0 ? (
                      <button
                        onClick={() => {
                          setManageMenuOpen(false);
                          setManageError(null);
                          setConfirmDeleteChit(true);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete Chit
                      </button>
                    ) : (
                      <button
                        disabled
                        title="Payments exist — mark the chit COMPLETED instead"
                        className="flex w-full cursor-not-allowed items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-[#55655E]/60"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete Chit
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isOrganizer && openTicketNumbers.length > 0 && (
            <button
              onClick={() => openEnrollDrawer(openTicketNumbers[0])}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0B3B2E] px-4 py-2 text-xs font-bold text-white hover:bg-[#135341]"
            >
              <UserPlus className="h-4 w-4" /> Add Member
            </button>
          )}
          {isOrganizer && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#55655E]">Cycle:</span>
              <select
                value={group.currentMonth}
                onChange={(e) => handleAdvanceMonth(Number(e.target.value))}
                className="rounded-xl border border-[#0B3B2E]/20 bg-white px-3 py-1.5 text-xs font-bold text-[#0B3B2E]"
              >
                {group.schedule.map((r) => (
                  <option key={r.monthNumber} value={r.monthNumber}>
                    Month {r.monthNumber} ({formatIndianDate(r.chitDate)})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="no-print flex flex-wrap gap-1.5 rounded-2xl border border-[#0B3B2E]/12 bg-white p-1.5">
        {[
          { id: 'passbook', label: 'Digital Passbook', short: 'Passbook', icon: BookOpen },
          {
            id: 'collections',
            label: isOrganizer
              ? `Members & Collections (${group.enrolledSlots}/${group.totalSlots})`
              : 'Ticket & Payments',
            short: isOrganizer ? 'Members' : 'Payments',
            icon: Users,
          },
          {
            id: 'lifts',
            label: group.chitType === 'AUCTION' ? 'Monthly Auctions' : 'Monthly Winners',
            short: group.chitType === 'AUCTION' ? 'Auctions' : 'Winners',
            icon: group.chitType === 'AUCTION' ? Gavel : Award,
          },
          { id: 'calculator', label: 'Best Month to Lift', short: 'Lift', icon: Calculator },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as DetailTab)}
              className={`flex flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[10px] font-bold leading-tight transition sm:flex-none sm:flex-row sm:gap-2 sm:px-3.5 sm:py-2.5 sm:text-xs ${
                active
                  ? 'bg-[#0B3B2E] text-white shadow-xs'
                  : 'text-[#55655E] hover:bg-[#FAF8F4] hover:text-[#14201C]'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="block truncate sm:hidden">{tab.short}</span>
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: DIGITAL PASSBOOK */}
      {activeTab === 'passbook' && (
        <PassbookTable
          group={group}
          selectedSlot={selectedSlot}
          onSelectSlot={(id) => setSelectedSlotId(id)}
          isOrganizer={isOrganizer}
          onOpenReceipt={onOpenReceipt}
          onQuickRecordPayment={(slot, monthNum, expected) => {
            if (!isOrganizer && slot.userId !== currentUser.id) return;
            openPayModal(slot, monthNum, expected);
          }}
        />
      )}

      {/* TAB 2: MEMBERS & MONTHLY COLLECTIONS */}
      {activeTab === 'collections' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#0B3B2E]/15 bg-white p-4">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs font-bold tracking-wider text-[#55655E] uppercase">
                Inspect Collection Month:
              </label>
              <select
                value={collectionMonth}
                onChange={(e) => setCollectionMonth(Number(e.target.value))}
                className="rounded-xl border border-[#0B3B2E]/20 bg-[#FAF8F4] px-3.5 py-2 text-sm font-bold text-[#0B3B2E]"
              >
                {group.schedule.map((r) => (
                  <option key={r.monthNumber} value={r.monthNumber}>
                    Month {r.monthNumber} — Due {formatIndianDate(r.chitDate)}
                  </option>
                ))}
              </select>
            </div>

            {isOrganizer && openTicketNumbers.length > 0 && (
              <button
                onClick={() => openEnrollDrawer(openTicketNumbers[0])}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#0B3B2E] px-4 py-2 text-xs font-bold text-white hover:bg-[#135341]"
              >
                <UserPlus className="h-4 w-4" />
                Add Member ({openTicketNumbers.length} Open Slots)
              </button>
            )}
          </div>

          {group.slots.length === 0 && (
            <p className="hidden rounded-xl border border-[#0B3B2E]/15 bg-white p-5 text-sm text-[#55655E] md:block">No members enrolled yet. Use Add Member to assign the first ticket.</p>
          )}
          <div className="overflow-hidden rounded-2xl border border-[#0B3B2E]/15 bg-white">
            {/* Mobile: stacked member cards */}
            <div className="md:hidden divide-y divide-[#0B3B2E]/10">
              {slotRows.length === 0 && (
                <p className="p-5 text-center text-sm text-[#55655E]">
                  No members enrolled yet. Use Add Member to assign the first ticket.
                </p>
              )}
              {slotRows.map(
                ({
                  slot,
                  expected,
                  paidRecs,
                  paidSum,
                  outstanding,
                  isFullyPaid,
                  reminderUrl,
                }) => (
                  <div key={slot.id} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        onClick={() => {
                          setSelectedSlotId(slot.id);
                          setActiveTab('passbook');
                        }}
                        className="text-left"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="rounded bg-[#0B3B2E]/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#0B3B2E]">
                            #{slot.ticketNumber}
                          </span>
                          <span className="font-semibold text-sm text-[#14201C]">
                            {slot.memberName}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-[#55655E] tabular-nums">
                          +91 {slot.memberPhone}
                        </p>
                      </button>
                      {slot.prizedMonth ? (
                        <span className="inline-flex shrink-0 items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">
                          Prized M{slot.prizedMonth}
                        </span>
                      ) : (
                        <span className="inline-flex shrink-0 items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                          Non-Prized
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between rounded-xl bg-[#FAF8F4] px-3 py-2">
                      <span className="text-xs text-[#55655E]">
                        Month {collectionMonth} Payable
                      </span>
                      <span className="text-sm font-bold text-[#0B3B2E] tabular-nums">
                        {formatPassbookAmount(expected)}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {isFullyPaid ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {paidRecs.map((p) => (
                            <button
                              key={p.id}
                              onClick={() => onOpenReceipt(p)}
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-700/25 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-900 hover:bg-emerald-100"
                              title="View Signed Official Receipt"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
                              {p.receiptNumber}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <>
                          {paidRecs.length > 0 && (
                            <span
                              className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-900 tabular-nums"
                              title="Partial payment received — balance outstanding"
                            >
                              {formatPassbookAmount(paidSum)} / {formatPassbookAmount(expected)}
                            </span>
                          )}
                          <button
                            onClick={() =>
                              openPayModal(
                                slot,
                                collectionMonth,
                                paidRecs.length > 0 ? outstanding : expected
                              )
                            }
                            className="rounded-lg bg-[#0B3B2E] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#135341]"
                          >
                            {isOrganizer
                              ? paidRecs.length > 0
                                ? 'Collect Balance'
                                : 'Collect & Sign'
                              : paidRecs.length > 0
                                ? 'Pay Balance'
                                : 'Pay Now'}
                          </button>
                          {isOrganizer && (
                            <a
                              href={reminderUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Send WhatsApp Reminder"
                              className="rounded-lg border border-[#0B3B2E]/20 p-1.5 text-[#0B3B2E] hover:bg-[#FAF8F4]"
                            >
                              <MessageCircle className="h-4 w-4" />
                            </a>
                          )}
                        </>
                      )}
                    </div>

                    {isOrganizer && (
                      <div className="flex items-center justify-end gap-1.5 pt-1">
                        <button
                          onClick={() => setEditSlot(slot)}
                          title="Edit subscriber / ticket"
                          className="rounded-lg border border-[#0B3B2E]/20 p-1.5 text-[#0B3B2E] hover:bg-[#FAF8F4]"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setResetPinSlot(slot)}
                          title="Reset member PIN"
                          className="rounded-lg border border-[#0B3B2E]/20 p-1.5 text-[#0B3B2E] hover:bg-[#FAF8F4]"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                        </button>
                        {group.payments.some((p) => p.memberSlotId === slot.id) ? (
                          <button
                            disabled
                            title="Ticket has payments — it cannot be removed"
                            className="cursor-not-allowed rounded-lg border border-[#0B3B2E]/12 p-1.5 text-[#55655E]/50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <button
                            onClick={() => setConfirmRemoveSlot(slot)}
                            title="Remove ticket"
                            className="rounded-lg border border-red-300 p-1.5 text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              )}
            </div>

            {/* Desktop: data table */}
            <div className="hidden md:block overflow-x-auto rm-scroll-x">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[#0B3B2E]/15 bg-[#FAF8F4] text-[11px] font-bold tracking-wider text-[#55655E] uppercase">
                    <th className="px-4 py-3">Ticket #</th>
                    <th className="px-4 py-3">Subscriber</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Month {collectionMonth} Payable</th>
                    <th className="px-4 py-3 text-center">Collection & Signature</th>
                    {isOrganizer && <th className="px-4 py-3 text-right">Manage</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#0B3B2E]/10">
                  {slotRows.map(
                    ({
                      slot,
                      expected,
                      paidRecs,
                      paidSum,
                      outstanding,
                      isFullyPaid,
                      reminderUrl,
                    }) => (
                      <tr key={slot.id} className="hover:bg-[#FAF8F4]/75">
                          <td className="px-4 py-3 font-bold text-[#0B3B2E] tabular-nums">
                            #{slot.ticketNumber}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => {
                                setSelectedSlotId(slot.id);
                                setActiveTab('passbook');
                              }}
                              className="group text-left"
                            >
                              <p className="font-semibold text-[#14201C] group-hover:text-[#0B3B2E] group-hover:underline">
                                {slot.memberName}
                              </p>
                              <p className="text-xs text-[#55655E] tabular-nums">
                                +91 {slot.memberPhone}
                              </p>
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            {slot.prizedMonth ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900">
                                Prized M{slot.prizedMonth}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                                Non-Prized
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-[#14201C] tabular-nums">
                            {formatPassbookAmount(expected)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {isFullyPaid ? (
                              <div className="flex flex-wrap items-center justify-center gap-1.5">
                                {paidRecs.map((p) => (
                                  <button
                                    key={p.id}
                                    onClick={() => onOpenReceipt(p)}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-700/25 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
                                    title="View Signed Official Receipt"
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
                                    {p.receiptNumber}
                                    <ChevronRight className="h-3.5 w-3.5" />
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <div className="inline-flex flex-wrap items-center justify-center gap-2">
                                {paidRecs.length > 0 && (
                                  <span
                                    className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900 tabular-nums"
                                    title="Partial payment received — balance outstanding"
                                  >
                                    {formatPassbookAmount(paidSum)} / {formatPassbookAmount(expected)}
                                  </span>
                                )}
                                <button
                                  onClick={() =>
                                    openPayModal(
                                      slot,
                                      collectionMonth,
                                      paidRecs.length > 0 ? outstanding : expected
                                    )
                                  }
                                  className="rounded-lg bg-[#0B3B2E] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#135341]"
                                >
                                  {isOrganizer
                                    ? paidRecs.length > 0
                                      ? 'Collect Balance'
                                      : 'Collect & Sign'
                                    : paidRecs.length > 0
                                      ? 'Pay Balance'
                                      : 'Pay Now'}
                                </button>
                                {isOrganizer && (
                                  <a
                                    href={reminderUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Send WhatsApp Reminder"
                                    className="rounded-lg border border-[#0B3B2E]/20 p-1.5 text-[#0B3B2E] hover:bg-[#FAF8F4]"
                                  >
                                    <MessageCircle className="h-4 w-4" />
                                  </a>
                                )}
                              </div>
                            )}
                          </td>
                          {isOrganizer && (
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => setEditSlot(slot)}
                                  title="Edit subscriber / ticket"
                                  className="rounded-lg border border-[#0B3B2E]/20 p-1.5 text-[#0B3B2E] hover:bg-[#FAF8F4]"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => setResetPinSlot(slot)}
                                  title="Reset member PIN"
                                  className="rounded-lg border border-[#0B3B2E]/20 p-1.5 text-[#0B3B2E] hover:bg-[#FAF8F4]"
                                >
                                  <KeyRound className="h-3.5 w-3.5" />
                                </button>
                                {group.payments.some((p) => p.memberSlotId === slot.id) ? (
                                  <button
                                    disabled
                                    title="Ticket has payments — it cannot be removed"
                                    className="cursor-not-allowed rounded-lg border border-[#0B3B2E]/12 p-1.5 text-[#55655E]/50"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => setConfirmRemoveSlot(slot)}
                                    title="Remove ticket"
                                    className="rounded-lg border border-red-300 p-1.5 text-red-700 hover:bg-red-50"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      )
                    )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Payments ledger (organizer only): edit or void any receipt */}
          {isOrganizer && group.payments.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-[#0B3B2E]/15 bg-white">
              <div className="border-b border-[#0B3B2E]/10 px-4 py-3">
                <h3 className="text-sm font-bold text-[#14201C]">Payments Ledger</h3>
                <p className="text-xs text-[#55655E]">
                  Update a receipt or void it with a reason. Every change is written to the audit trail.
                </p>
              </div>
              {/* Mobile: stacked receipt cards */}
              <div className="md:hidden divide-y divide-[#0B3B2E]/10 p-2">
                {group.payments.map((p) => {
                  const isVoid = (p.status ?? 'POSTED') === 'VOID';
                  return (
                    <div
                      key={p.id}
                      className={`space-y-2 rounded-xl p-3 ${
                        isVoid ? 'bg-red-50/40' : 'bg-[#FAF8F4]/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <button
                          onClick={() => onOpenReceipt(p)}
                          className="font-semibold text-[#0B3B2E] tabular-nums underline-offset-2 hover:underline"
                        >
                          {p.receiptNumber}
                        </button>
                        {isVoid ? (
                          <span className="inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-bold text-red-800">
                            VOID
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                            POSTED
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#55655E]">
                        {p.memberName} · Ticket #{p.ticketNumber} · Month {p.monthNumber}
                      </p>
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <span className="text-sm font-bold text-[#14201C] tabular-nums">
                          {formatPassbookAmount(p.amountPaid)}
                        </span>
                        <span className="text-[11px] text-[#55655E]">
                          {formatIndianDate(p.paidDate)} · {p.paymentMethod.replace('_', ' ')}
                        </span>
                      </div>
                      {isVoid && p.voidReason && (
                        <p className="text-[11px] text-red-800">Reason: {p.voidReason}</p>
                      )}
                      <div className="flex items-center justify-end gap-1.5 pt-1">
                        {isVoid ? (
                          <button
                            disabled
                            title="A voided payment cannot be edited"
                            className="cursor-not-allowed rounded-lg border border-[#0B3B2E]/12 p-1.5 text-[#55655E]/50"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => setEditPayment(p)}
                              title="Edit payment"
                              className="rounded-lg border border-[#0B3B2E]/20 p-1.5 text-[#0B3B2E] hover:bg-[#FAF8F4]"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setVoidPayment(p)}
                              title="Void payment"
                              className="rounded-lg border border-red-300 p-1.5 text-red-700 hover:bg-red-50"
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop: data table */}
              <div className="hidden md:block overflow-x-auto rm-scroll-x">
                <table className="w-full min-w-[860px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#0B3B2E]/15 bg-[#FAF8F4] text-[11px] font-bold tracking-wider text-[#55655E] uppercase">
                      <th className="px-4 py-3">Receipt</th>
                      <th className="px-4 py-3">Month</th>
                      <th className="px-4 py-3">Subscriber</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Method</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#0B3B2E]/10">
                    {group.payments.map((p) => {
                      const isVoid = (p.status ?? 'POSTED') === 'VOID';
                      return (
                        <tr key={p.id} className={isVoid ? 'bg-red-50/40' : 'hover:bg-[#FAF8F4]/75'}>
                          <td className="px-4 py-2.5">
                            <button
                              onClick={() => onOpenReceipt(p)}
                              className="font-semibold text-[#0B3B2E] tabular-nums underline-offset-2 hover:underline"
                            >
                              {p.receiptNumber}
                            </button>
                            {isVoid && p.voidReason && (
                              <p className="mt-0.5 text-[11px] text-red-800">Reason: {p.voidReason}</p>
                            )}
                          </td>
                          <td className="px-4 py-2.5 tabular-nums">M{p.monthNumber}</td>
                          <td className="px-4 py-2.5">
                            {p.memberName} <span className="text-xs text-[#55655E]">· #{p.ticketNumber}</span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-bold tabular-nums text-[#14201C]">
                            {formatPassbookAmount(p.amountPaid)}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-[#55655E]">{formatIndianDate(p.paidDate)}</td>
                          <td className="px-4 py-2.5 text-xs text-[#55655E]">{p.paymentMethod}</td>
                          <td className="px-4 py-2.5">
                            {isVoid ? (
                              <span className="inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-800">
                                VOID
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                                POSTED
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center justify-end gap-1.5">
                              {isVoid ? (
                                <button
                                  disabled
                                  title="A voided payment cannot be edited"
                                  className="cursor-not-allowed rounded-lg border border-[#0B3B2E]/12 p-1.5 text-[#55655E]/50"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              ) : (
                                <>
                                  <button
                                    onClick={() => setEditPayment(p)}
                                    title="Edit payment"
                                    className="rounded-lg border border-[#0B3B2E]/20 p-1.5 text-[#0B3B2E] hover:bg-[#FAF8F4]"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setVoidPayment(p)}
                                    title="Void payment"
                                    className="rounded-lg border border-red-300 p-1.5 text-red-700 hover:bg-red-50"
                                  >
                                    <Ban className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: MONTHLY WINNERS / AUCTIONS */}
      {activeTab === 'lifts' && (
        <div className="grid gap-5 lg:grid-cols-3">
          {isOrganizer && (
            <form
              onSubmit={handleRecordLift}
              className="space-y-4 rounded-2xl border border-[#0B3B2E]/15 bg-white p-5 lg:col-span-1"
            >
              <div>
                <p className="text-[11px] font-bold tracking-wider text-[#B8860B] uppercase">
                  Foreman Allotment Desk
                </p>
                <h3 className="text-base font-bold text-[#14201C]">
                  {group.chitType === 'AUCTION'
                    ? 'Record Monthly Auction & Dividend'
                    : 'Assign Monthly Chit Winner'}
                </h3>
              </div>

              {liftMessage && (
                <div className="rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-900">
                  {liftMessage}
                </div>
              )}
              {liftError && (
                <div className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-800">
                  {liftError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#55655E]">Chit Month</label>
                <select
                  value={liftMonth}
                  onChange={(e) => setLiftMonth(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-[#0B3B2E]/20 bg-[#FAF8F4] px-3 py-2 text-sm font-semibold"
                >
                  {group.schedule.map((r) => (
                    <option key={r.monthNumber} value={r.monthNumber}>
                      Month {r.monthNumber} ({formatIndianDate(r.chitDate)}){' '}
                      {r.winnerName ? `— Won by #${r.winnerTicketNumber}` : '— Open'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#55655E]">
                  Winning Non-Prized Ticket
                </label>
                <select
                  required
                  value={liftWinnerSlotId}
                  onChange={(e) => setLiftWinnerSlotId(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-[#0B3B2E]/20 bg-[#FAF8F4] px-3 py-2 text-sm font-semibold"
                >
                  <option value={0}>Select subscriber ticket…</option>
                  {eligibleNonPrizedSlots.map((s) => (
                    <option key={s.id} value={s.id}>
                      Ticket #{s.ticketNumber} — {s.memberName}
                    </option>
                  ))}
                </select>
              </div>

              {group.chitType === 'AUCTION' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-[#55655E]">
                      Winning Bid Discount (₹)
                    </label>
                    <NumberField
                      min={auctionPreview.comm}
                      max={Math.max(auctionPreview.comm, Math.round((group.faceValue * group.maxBidPct) / 100))}
                      value={bidDiscount}
                      onValueChange={setBidDiscount}
                      className="mt-1 w-full rounded-xl border border-[#0B3B2E]/20 bg-[#FAF8F4] px-3 py-2 text-sm font-bold tabular-nums"
                    />
                  </div>

                  <div className="space-y-1.5 rounded-xl bg-[#FAF8F4] p-3.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-[#55655E]">
                        Foreman Commission ({group.foremanCommissionPct}%)
                      </span>
                      <span className="font-semibold tabular-nums">
                        {formatPassbookAmount(auctionPreview.comm)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#55655E]">Dividend per Subscriber</span>
                      <span className="font-bold text-emerald-700 tabular-nums">
                        +{formatPassbookAmount(auctionPreview.divPerMember)}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-[#0B3B2E]/10 pt-1.5">
                      <span className="font-semibold text-[#14201C]">Net Payable / Ticket</span>
                      <span className="font-bold text-[#0B3B2E] tabular-nums">
                        {formatPassbookAmount(auctionPreview.netInstallment)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-semibold text-[#14201C]">Winner Payout</span>
                      <span className="font-bold text-[#9A6B00] tabular-nums">
                        {formatPassbookAmount(auctionPreview.winnerPayout)}
                      </span>
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#55655E]">
                  Payout NEFT / Reference Note
                </label>
                <input
                  type="text"
                  placeholder="Payout reference (optional)"
                  value={payoutRef}
                  onChange={(e) => setPayoutRef(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#0B3B2E]/20 bg-[#FAF8F4] px-3 py-2 text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={!liftWinnerSlotId}
                className="w-full rounded-xl bg-[#0B3B2E] py-2.5 text-sm font-bold text-white transition hover:bg-[#135341] disabled:opacity-45"
              >
                Confirm Month {liftMonth} Winner
              </button>
            </form>
          )}

          <div
            className={`overflow-hidden rounded-2xl border border-[#0B3B2E]/15 bg-white ${
              isOrganizer ? 'lg:col-span-2' : 'lg:col-span-3'
            }`}
          >
            <div className="border-b border-[#0B3B2E]/10 px-5 py-3.5">
              <h3 className="text-sm font-bold text-[#14201C]">
                Monthly Winner & Disbursement Register
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[#0B3B2E]/15 bg-[#FAF8F4] text-[11px] font-bold text-[#55655E] uppercase">
                    <th className="px-4 py-2.5">Month</th>
                    <th className="px-4 py-2.5">Date</th>
                    <th className="px-4 py-2.5">Winner</th>
                    <th className="px-4 py-2.5 text-right">Payout Value</th>
                    {group.chitType === 'AUCTION' && (
                      <th className="px-4 py-2.5 text-right">Dividend / Member</th>
                    )}
                    <th className="px-4 py-2.5">Reference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#0B3B2E]/10">
                  {group.schedule.map((r) => (
                    <tr key={r.monthNumber}>
                      <td className="px-4 py-2.5 font-bold tabular-nums">M{r.monthNumber}</td>
                      <td className="px-4 py-2.5 text-xs text-[#55655E] tabular-nums">
                        {formatIndianDate(r.chitDate)}
                      </td>
                      <td className="px-4 py-2.5">
                        {r.winnerName ? (
                          <span className="font-semibold text-[#0B3B2E]">
                            #{r.winnerTicketNumber} · {r.winnerName}
                          </span>
                        ) : (
                          <span className="text-xs text-[#55655E]">Pending Draw</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold tabular-nums">
                        {formatPassbookAmount(r.chitValue)}
                      </td>
                      {group.chitType === 'AUCTION' && (
                        <td className="px-4 py-2.5 text-right text-xs font-semibold text-emerald-800 tabular-nums">
                          {r.dividendPerMember !== null
                            ? `+${formatPassbookAmount(r.dividendPerMember, true, false)}`
                            : '—'}
                        </td>
                      )}
                      <td className="px-4 py-2.5 font-mono text-xs text-[#55655E]">
                        {r.payoutReference || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: LIFT ROI CALCULATOR */}
      {activeTab === 'calculator' && (
        <LiftCalculator lockedGroup={group} />
      )}

      {/* RECORD PAYMENT MODAL */}
      {payModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs">
          <form
            onSubmit={handleConfirmPayment}
            className="w-full max-w-md space-y-4 rounded-2xl border border-[#0B3B2E]/20 bg-white p-6 shadow-2xl"
          >
            <div>
              <p className="text-[11px] font-bold tracking-wider text-[#B8860B] uppercase">
                Digital Passbook Collection
              </p>
              <h3 className="text-lg font-bold text-[#14201C]">
                {isOrganizer ? 'Record Payment & Sign Passbook' : 'Pay Monthly Installment'}
              </h3>
              <p className="text-xs text-[#55655E]">
                {payModal.slot.memberName} · Ticket #{payModal.slot.ticketNumber} · Month{' '}
                {payModal.monthNumber}
              </p>
            </div>

            <div className="rounded-xl bg-[#FAF8F4] p-4">
              <label className="block text-xs font-semibold text-[#55655E]">
                Amount Being Collected
              </label>
              <input
                type="text"
                inputMode="numeric"
                autoFocus
                value={String(payAmount)}
                onChange={(e) => setPayAmount(Number(e.target.value.replace(/[^0-9]/g, '')))}
                className="mt-1.5 w-full rounded-xl border border-[#0B3B2E]/20 bg-white px-3.5 py-2 text-2xl font-bold text-[#0B3B2E] tabular-nums focus:border-[#0B3B2E] focus:outline-none"
              />
              <p className="mt-1.5 text-xs text-[#55655E]">
                Outstanding this month: <strong>{formatPassbookAmount(payModal.amount)}</strong>.
                Enter a smaller amount to record a partial payment — the balance stays due and can
                be collected later.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#55655E]">Payment Mode</label>
              <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(['UPI', 'CASH', 'BANK_TRANSFER', 'CHEQUE'] as PaymentMethod[]).map((m) => (
                  <button
                    type="button"
                    key={m}
                    onClick={() => setPayMethod(m)}
                    className={`rounded-lg border px-2.5 py-2 text-xs font-bold transition ${
                      payMethod === m
                        ? 'border-[#0B3B2E] bg-[#0B3B2E] text-white'
                        : 'border-[#0B3B2E]/20 bg-white text-[#14201C]'
                    }`}
                  >
                    {m.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#55655E]">
                UTR / Reference Note (Optional)
              </label>
              <input
                type="text"
                placeholder="UPI / UTR reference (optional)"
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#0B3B2E]/20 bg-[#FAF8F4] px-3.5 py-2 text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPayModal(null)}
                className="rounded-xl border border-[#0B3B2E]/20 px-4 py-2 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={payBusy}
                className="rounded-xl bg-[#0B3B2E] px-5 py-2 text-sm font-bold text-white hover:bg-[#135341]"
              >
                {payBusy ? 'Signing…' : 'Confirm & Issue Receipt'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ENROLL MEMBER MODAL */}
      {showEnrollModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs">
          <form
            onSubmit={handleEnrollSubmit}
            className="w-full max-w-md space-y-4 rounded-2xl border border-[#0B3B2E]/20 bg-white p-6 shadow-2xl"
          >
            <h3 className="text-lg font-bold text-[#14201C]">
              Enroll Subscriber to Open Ticket
            </h3>

            {enrollError && (
              <div className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-800">
                {enrollError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[#55655E]">Ticket Number</label>
              <select
                value={enrollTicket}
                onChange={(e) => setEnrollTicket(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-[#0B3B2E]/20 bg-[#FAF8F4] px-3 py-2 text-sm font-bold"
              >
                {openTicketNumbers.map((n) => (
                  <option key={n} value={n}>
                    Ticket #{n}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEnrollMode('new')}
                className={`flex-1 rounded-lg py-2 text-xs font-bold ${
                  enrollMode === 'new'
                    ? 'bg-[#0B3B2E] text-white'
                    : 'bg-[#FAF8F4] text-[#55655E]'
                }`}
              >
                <Plus className="mr-1 inline h-3.5 w-3.5" />
                New Subscriber
              </button>
              <button
                type="button"
                onClick={() => setEnrollMode('existing')}
                className={`flex-1 rounded-lg py-2 text-xs font-bold ${
                  enrollMode === 'existing'
                    ? 'bg-[#0B3B2E] text-white'
                    : 'bg-[#FAF8F4] text-[#55655E]'
                }`}
              >
                Existing Directory
              </button>
            </div>

            {enrollMode === 'new' ? (
              <>
                <div>
                  <label className="block text-xs font-semibold text-[#55655E]">Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Full name"
                    value={newMemberName}
                    onChange={(e) => setNewMemberName(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#0B3B2E]/20 bg-[#FAF8F4] px-3.5 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#55655E]">
                    10-Digit Mobile Number
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="10-digit mobile number"
                    value={newMemberPhone}
                    onChange={(e) => setNewMemberPhone(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#0B3B2E]/20 bg-[#FAF8F4] px-3.5 py-2 text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#55655E]">Member's 4-digit sign-in PIN</label>
                  <input type="password" required inputMode="numeric" pattern="[0-9]{4}" maxLength={4}
                    value={newMemberPin} onChange={(e) => setNewMemberPin(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#0B3B2E]/20 bg-[#FAF8F4] px-3.5 py-2 text-sm" />
                  <p className="mt-1 text-xs text-[#55655E]">Share this PIN privately with the member.</p>
                </div>
              </>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-[#55655E]">
                  Select Member
                </label>
                {existingMembers.length === 0 && <p className="mt-1 text-xs text-[#55655E]">No existing members. Add a new subscriber instead.</p>}
                <select
                  value={selectedExistingUserId}
                  onChange={(e) => setSelectedExistingUserId(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-[#0B3B2E]/20 bg-[#FAF8F4] px-3 py-2 text-sm font-semibold"
                >
                  {existingMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} (+91 {m.phone})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowEnrollModal(false)}
                className="rounded-xl border border-[#0B3B2E]/20 px-4 py-2 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={enrollBusy || (enrollMode === 'existing' && existingMembers.length === 0)}
                className="rounded-xl bg-[#0B3B2E] px-5 py-2 text-sm font-bold text-white hover:bg-[#135341] disabled:opacity-50"
              >
                Assign Ticket #{enrollTicket}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MANAGEMENT MODALS */}
      {showEditChit && group && (
        <EditChitModal
          group={group}
          onClose={() => setShowEditChit(false)}
          onSaved={async () => {
            setShowEditChit(false);
            await loadDetail();
            onDataChanged();
          }}
        />
      )}
      {editSlot && group && (
        <EditMemberModal
          group={group}
          slot={editSlot}
          onClose={() => setEditSlot(null)}
          onSaved={async () => {
            setEditSlot(null);
            await loadDetail();
            onDataChanged();
          }}
        />
      )}
      {resetPinSlot && (
        <ResetPinModal
          memberId={resetPinSlot.userId}
          memberName={resetPinSlot.memberName}
          onClose={() => setResetPinSlot(null)}
          onSaved={() => {
            setResetPinSlot(null);
            setManageError(null);
          }}
        />
      )}
      {editPayment && (
        <EditPaymentModal
          payment={editPayment}
          onClose={() => setEditPayment(null)}
          onSaved={async () => {
            setEditPayment(null);
            await loadDetail();
            onDataChanged();
          }}
        />
      )}
      {voidPayment && (
        <VoidPaymentModal
          payment={voidPayment}
          onClose={() => setVoidPayment(null)}
          onVoided={async () => {
            setVoidPayment(null);
            await loadDetail();
            onDataChanged();
          }}
        />
      )}
      {confirmDeleteChit && group && (
        <ConfirmModal
          title={`Delete ${group.name}?`}
          message={
            <>
              This permanently removes <strong>{group.code}</strong>, its schedule and its enrolled
              tickets. This cannot be undone.
            </>
          }
          confirmLabel="Delete Chit"
          danger
          busy={manageBusy}
          error={manageError}
          onConfirm={handleDeleteChit}
          onClose={() => {
            setConfirmDeleteChit(false);
            setManageError(null);
          }}
        />
      )}
      {confirmRemoveSlot && (
        <ConfirmModal
          title={`Remove Ticket #${confirmRemoveSlot.ticketNumber}?`}
          message={
            <>
              This removes <strong>{confirmRemoveSlot.memberName}</strong>'s ticket from this chit.
              The subscriber account stays available for future enrollment.
            </>
          }
          confirmLabel="Remove Ticket"
          danger
          busy={manageBusy}
          error={manageError}
          onConfirm={handleRemoveSlot}
          onClose={() => {
            setConfirmRemoveSlot(null);
            setManageError(null);
          }}
        />
      )}
    </div>
  );
};
