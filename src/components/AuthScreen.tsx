import React, { useState } from 'react';
import { Lock, Phone } from 'lucide-react';
import { User } from '../types';
import { api } from '../api/client';
import { HardRefreshButton } from './HardRefreshButton';

interface AuthScreenProps {
  onAuthenticated: (user: User) => void;
}

/**
 * Invite-only sign-in. There is no self-registration: owners are invited by
 * the platform developer and members are added by their chit owner.
 */
export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { user } = await api.login(phone, pin);
      onAuthenticated(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F4] flex flex-col justify-center px-4 py-10">
      <div className="mx-auto w-full max-w-4xl grid gap-6 lg:grid-cols-12 items-center">
        {/* Left Brand Showcase */}
        <div className="lg:col-span-6 space-y-5">
          <div className="inline-flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-[#D4A437] bg-[#0B3B2E] text-xl font-bold text-[#FAF8F4] shadow-md">
              ₹
            </div>
            <div>
              <span className="text-[11px] font-bold tracking-[0.2em] text-[#B8860B] uppercase">
                Rare Mint PWA
              </span>
              <h1 className="text-2xl font-bold tracking-tight text-[#0B3B2E]">
                Chit Fund Finance & Passbook
              </h1>
            </div>
          </div>

          <p className="text-sm leading-relaxed text-[#2E3D37]">
            Built for both <strong>Chit Organizers (Foremen)</strong> and <strong>Subscribers</strong>.
            Manage fixed passbook schedules and monthly dividend auctions, calculate the optimal month to lift, and share signed receipts.
          </p>

          <p className="rounded-xl border border-[#0B3B2E]/15 bg-white/70 px-3.5 py-2.5 text-xs leading-relaxed text-[#55655E]">
            <strong className="text-[#0B3B2E]">Invite-only access.</strong> Chit owners are invited by the
            platform developer, and subscribers are added by their chit owner. Use the mobile number and
            PIN you were given.
          </p>
        </div>

        {/* Right Sign-in Card */}
        <div className="lg:col-span-6 rounded-2xl border border-[#0B3B2E]/15 bg-white p-6 shadow-lg">
          <div className="mb-5">
            <h2 className="text-sm font-bold tracking-tight text-[#0B3B2E]">Sign In with Mobile & PIN</h2>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-800">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#55655E]">
                10-Digit Mobile Number
              </label>
              <div className="relative mt-1">
                <Phone className="pointer-events-none absolute top-3 left-3.5 h-4 w-4 text-[#55655E]" />
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-xl border border-[#0B3B2E]/20 bg-[#FAF8F4] py-2.5 pr-3.5 pl-10 text-sm font-semibold tabular-nums focus:border-[#0B3B2E] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#55655E]">4-Digit Passbook PIN</label>
              <div className="relative mt-1">
                <Lock className="pointer-events-none absolute top-3 left-3.5 h-4 w-4 text-[#55655E]" />
                <input
                  type="password"
                  required
                  maxLength={4}
                  minLength={4}
                  pattern="[0-9]{4}"
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className="w-full rounded-xl border border-[#0B3B2E]/20 bg-[#FAF8F4] py-2.5 pr-3.5 pl-10 text-sm font-semibold focus:border-[#0B3B2E] focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[#0B3B2E] py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#135341] disabled:opacity-50"
            >
              {loading ? 'Opening Passbook…' : 'Sign In to Rare Mint'}
            </button>
          </form>

          <div className="mt-5 border-t border-[#0B3B2E]/10 pt-4">
            <HardRefreshButton variant="link" />
          </div>
        </div>
      </div>
    </div>
  );
};
