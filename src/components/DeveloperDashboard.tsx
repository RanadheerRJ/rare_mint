import React, { useCallback, useEffect, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { OwnerSummary, PlatformStats, User } from '../types';
import { api } from '../api/client';
import { formatIndianDate } from '../utils/format';

interface DeveloperDashboardProps {
  user: User;
}

interface InviteResult {
  name: string;
  phone: string;
  pin: string;
  city: string;
}

/**
 * Platform admin screen (role=developer only). Manages chit owner accounts and
 * shows platform counts. No chit financial details and no member PINs here.
 */
export const DeveloperDashboard: React.FC<DeveloperDashboardProps> = ({ user }) => {
  const [owners, setOwners] = useState<OwnerSummary[]>([]);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Invite form
  const [inviteName, setInviteName] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [invitePin, setInvitePin] = useState('');
  const [inviteCity, setInviteCity] = useState('Hyderabad');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null);

  // Per-owner actions
  const [editOwner, setEditOwner] = useState<OwnerSummary | null>(null);
  const [editName, setEditName] = useState('');
  const [editCity, setEditCity] = useState('');
  const [resetPinOwner, setResetPinOwner] = useState<OwnerSummary | null>(null);
  const [resetPinValue, setResetPinValue] = useState('');
  const [confirmDeleteOwner, setConfirmDeleteOwner] = useState<OwnerSummary | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [ownersRes, statsRes] = await Promise.all([api.devListOwners(), api.devStats()]);
      setOwners(ownersRes.owners);
      setStats(statsRes.stats);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not load owners');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError(null);
    setInviteBusy(true);
    try {
      await api.devInviteOwner({
        name: inviteName.trim(),
        phone: invitePhone.trim(),
        pin: invitePin.trim(),
        city: inviteCity.trim() || 'Hyderabad',
      });
      setInviteResult({
        name: inviteName.trim(),
        phone: invitePhone.trim(),
        pin: invitePin.trim(),
        city: inviteCity.trim() || 'Hyderabad',
      });
      setInviteName('');
      setInvitePhone('');
      setInvitePin('');
      setInviteCity('Hyderabad');
      await refresh();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Could not invite owner');
    } finally {
      setInviteBusy(false);
    }
  };

  const handleEditOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editOwner) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await api.devUpdateOwner(editOwner.id, { name: editName.trim(), city: editCity.trim() });
      setEditOwner(null);
      setActionNotice('Owner details updated.');
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setActionBusy(false);
    }
  };

  const handleToggleActive = async (owner: OwnerSummary) => {
    setActionBusy(true);
    setActionError(null);
    try {
      await api.devUpdateOwner(owner.id, { isActive: !owner.isActive });
      setActionNotice(`${owner.name} ${owner.isActive ? 'deactivated' : 'reactivated'}.`);
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setActionBusy(false);
    }
  };

  const handleResetPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPinOwner) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await api.devResetOwnerPin(resetPinOwner.id, resetPinValue.trim());
      setResetPinOwner(null);
      setResetPinValue('');
      setActionNotice('PIN reset. Share the new PIN with the owner privately.');
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'PIN reset failed');
    } finally {
      setActionBusy(false);
    }
  };

  const handleDeleteOwner = async () => {
    if (!confirmDeleteOwner) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await api.devDeleteOwner(confirmDeleteOwner.id);
      setConfirmDeleteOwner(null);
      setActionNotice('Owner account deleted.');
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Delete failed');
      setConfirmDeleteOwner(null);
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Platform counts */}
      <div className="rounded-2xl border border-[#0B3B2E]/15 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold tracking-[0.2em] text-[#B8860B] uppercase">
              Platform Admin
            </p>
            <h2 className="text-lg font-bold tracking-tight text-[#0B3B2E]">
              Welcome, {user.name}
            </h2>
            <p className="mt-1 text-xs text-[#55655E]">
              Invite chit owners, manage their accounts, and monitor platform counts. Chit finances stay
              with their owners.
            </p>
          </div>
          <div className="flex gap-3">
            {[
              { label: 'Owners', value: stats?.owners },
              { label: 'Chits', value: stats?.chits },
              { label: 'Members', value: stats?.members },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-[#0B3B2E]/12 bg-[#FAF8F4] px-4 py-2.5 text-center">
                <p className="text-lg font-bold tabular-nums text-[#0B3B2E]">{loading ? '—' : s.value ?? 0}</p>
                <p className="text-[10px] font-bold tracking-wider text-[#55655E] uppercase">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Invite owner */}
      <div className="rounded-2xl border border-[#0B3B2E]/15 bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-[#0B3B2E]" />
          <h3 className="text-sm font-bold text-[#14201C]">Invite Chit Owner</h3>
        </div>

        {inviteResult && (
          <div className="mb-4 rounded-xl border border-emerald-700/25 bg-emerald-50 p-4 text-xs text-emerald-900">
            <p className="flex items-center gap-1.5 font-bold">
              <CheckCircle2 className="h-4 w-4" /> Owner account created for {inviteResult.name}.
            </p>
            <p className="mt-2 rounded-lg bg-white/70 p-2.5 font-semibold leading-relaxed tabular-nums">
              +91 {inviteResult.phone} · PIN {inviteResult.pin} · {inviteResult.city}
            </p>
            <p className="mt-2 font-bold">Share these credentials privately with the owner.</p>
            <button
              type="button"
              onClick={() => setInviteResult(null)}
              className="mt-2 text-xs font-semibold underline"
            >
              Dismiss
            </button>
          </div>
        )}

        <form onSubmit={handleInvite} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="block text-xs font-semibold text-[#55655E]">Full Name</label>
            <input
              type="text"
              required
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[#0B3B2E]/20 bg-[#FAF8F4] px-3.5 py-2.5 text-sm focus:border-[#0B3B2E] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#55655E]">10-Digit Mobile</label>
            <input
              type="tel"
              required
              pattern="[0-9]{10}"
              maxLength={10}
              value={invitePhone}
              onChange={(e) => setInvitePhone(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[#0B3B2E]/20 bg-[#FAF8F4] px-3.5 py-2.5 text-sm font-semibold tabular-nums focus:border-[#0B3B2E] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#55655E]">4-Digit PIN</label>
            <input
              type="password"
              required
              pattern="[0-9]{4}"
              maxLength={4}
              inputMode="numeric"
              value={invitePin}
              onChange={(e) => setInvitePin(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[#0B3B2E]/20 bg-[#FAF8F4] px-3.5 py-2.5 text-sm font-semibold focus:border-[#0B3B2E] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#55655E]">City</label>
            <input
              type="text"
              value={inviteCity}
              onChange={(e) => setInviteCity(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[#0B3B2E]/20 bg-[#FAF8F4] px-3.5 py-2.5 text-sm focus:border-[#0B3B2E] focus:outline-none"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={inviteBusy}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#0B3B2E] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#135341] disabled:opacity-50"
            >
              {inviteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Invite Owner
            </button>
          </div>
        </form>
        {inviteError && (
          <p className="mt-3 rounded-xl border border-red-300 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-800">
            {inviteError}
          </p>
        )}
      </div>

      {/* Owners list */}
      <div className="rounded-2xl border border-[#0B3B2E]/15 bg-white">
        <div className="flex items-center gap-2 border-b border-[#0B3B2E]/10 px-5 py-4">
          <ShieldCheck className="h-4 w-4 text-[#0B3B2E]" />
          <h3 className="text-sm font-bold text-[#14201C]">Chit Owners</h3>
        </div>

        {actionNotice && (
          <p className="mx-5 mt-4 rounded-xl bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-900">
            {actionNotice}
          </p>
        )}
        {actionError && (
          <p className="mx-5 mt-4 rounded-xl border border-red-300 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-800">
            {actionError}
          </p>
        )}

        {loading ? (
          <p className="px-5 py-8 text-center text-sm text-[#55655E]">Loading owners…</p>
        ) : owners.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-[#55655E]">
            No chit owners yet. Use the invite form above to create the first owner account.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#0B3B2E]/10 bg-[#FAF8F4] text-[11px] font-bold tracking-wider text-[#55655E] uppercase">
                  <th className="px-5 py-3">Owner</th>
                  <th className="px-5 py-3">Mobile</th>
                  <th className="px-5 py-3">City</th>
                  <th className="px-5 py-3 text-center">Chits</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Created</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0B3B2E]/10">
                {owners.map((owner) => (
                  <tr key={owner.id} className="hover:bg-[#FAF8F4]/75">
                    <td className="px-5 py-3 font-semibold text-[#14201C]">{owner.name}</td>
                    <td className="px-5 py-3 tabular-nums text-[#14201C]">+91 {owner.phone}</td>
                    <td className="px-5 py-3 text-[#55655E]">{owner.city}</td>
                    <td className="px-5 py-3 text-center font-bold tabular-nums text-[#0B3B2E]">
                      {owner.chitCount}
                    </td>
                    <td className="px-5 py-3">
                      {owner.isActive ? (
                        <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-800">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs text-[#55655E]">{formatIndianDate(owner.createdAt.slice(0, 10))}</td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditOwner(owner);
                            setEditName(owner.name);
                            setEditCity(owner.city);
                            setActionError(null);
                          }}
                          className="rounded-lg border border-[#0B3B2E]/20 p-1.5 text-[#0B3B2E] hover:bg-[#FAF8F4]"
                          title="Edit name / city"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setResetPinOwner(owner);
                            setResetPinValue('');
                            setActionError(null);
                          }}
                          className="rounded-lg border border-[#0B3B2E]/20 p-1.5 text-[#0B3B2E] hover:bg-[#FAF8F4]"
                          title="Reset PIN"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(owner)}
                          disabled={actionBusy}
                          className={`rounded-lg border p-1.5 ${
                            owner.isActive
                              ? 'border-amber-300 text-amber-700 hover:bg-amber-50'
                              : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                          }`}
                          title={owner.isActive ? 'Deactivate' : 'Reactivate'}
                        >
                          {owner.isActive ? <Ban className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmDeleteOwner(owner);
                            setActionError(null);
                          }}
                          className="rounded-lg border border-red-300 p-1.5 text-red-700 hover:bg-red-50"
                          title="Delete owner"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit owner modal */}
      {editOwner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs">
          <form
            onSubmit={handleEditOwner}
            className="w-full max-w-md rounded-2xl border border-[#0B3B2E]/15 bg-white p-6 shadow-xl"
          >
            <h3 className="text-base font-bold text-[#14201C]">Edit Owner</h3>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#55655E]">Full Name</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#0B3B2E]/20 bg-[#FAF8F4] px-3.5 py-2.5 text-sm focus:border-[#0B3B2E] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#55655E]">City</label>
                <input
                  type="text"
                  required
                  value={editCity}
                  onChange={(e) => setEditCity(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#0B3B2E]/20 bg-[#FAF8F4] px-3.5 py-2.5 text-sm focus:border-[#0B3B2E] focus:outline-none"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditOwner(null)}
                className="rounded-xl border border-[#0B3B2E]/20 px-4 py-2 text-sm font-semibold text-[#55655E] hover:bg-[#FAF8F4]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionBusy}
                className="rounded-xl bg-[#0B3B2E] px-4 py-2 text-sm font-bold text-white hover:bg-[#135341] disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Reset PIN modal */}
      {resetPinOwner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs">
          <form
            onSubmit={handleResetPin}
            className="w-full max-w-md rounded-2xl border border-[#0B3B2E]/15 bg-white p-6 shadow-xl"
          >
            <h3 className="text-base font-bold text-[#14201C]">Reset PIN for {resetPinOwner.name}</h3>
            <p className="mt-1 text-xs text-[#55655E]">
              Set a new 4-digit PIN and share it with the owner privately.
            </p>
            <div className="mt-4">
              <label className="block text-xs font-semibold text-[#55655E]">New 4-Digit PIN</label>
              <input
                type="password"
                required
                pattern="[0-9]{4}"
                maxLength={4}
                inputMode="numeric"
                value={resetPinValue}
                onChange={(e) => setResetPinValue(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#0B3B2E]/20 bg-[#FAF8F4] px-3.5 py-2.5 text-sm font-semibold focus:border-[#0B3B2E] focus:outline-none"
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setResetPinOwner(null)}
                className="rounded-xl border border-[#0B3B2E]/20 px-4 py-2 text-sm font-semibold text-[#55655E] hover:bg-[#FAF8F4]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionBusy}
                className="rounded-xl bg-[#0B3B2E] px-4 py-2 text-sm font-bold text-white hover:bg-[#135341] disabled:opacity-50"
              >
                Reset PIN
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete owner confirm modal */}
      {confirmDeleteOwner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-[#0B3B2E]/15 bg-white p-6 shadow-xl">
            <h3 className="text-base font-bold text-[#14201C]">Delete {confirmDeleteOwner.name}?</h3>
            {confirmDeleteOwner.chitCount > 0 ? (
              <p className="mt-2 text-sm leading-relaxed text-red-800">
                This owner has {confirmDeleteOwner.chitCount} chit group(s) and{' '}
                <strong>cannot be deleted</strong>. Remove or complete their chits first.
              </p>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-[#55655E]">
                This permanently removes the owner account. This cannot be undone.
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteOwner(null)}
                className="rounded-xl border border-[#0B3B2E]/20 px-4 py-2 text-sm font-semibold text-[#55655E] hover:bg-[#FAF8F4]"
              >
                {confirmDeleteOwner.chitCount > 0 ? 'Close' : 'Cancel'}
              </button>
              {confirmDeleteOwner.chitCount === 0 && (
                <button
                  type="button"
                  onClick={handleDeleteOwner}
                  disabled={actionBusy}
                  className="rounded-xl bg-red-700 px-4 py-2 text-sm font-bold text-white hover:bg-red-800 disabled:opacity-50"
                >
                  Delete Owner
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
