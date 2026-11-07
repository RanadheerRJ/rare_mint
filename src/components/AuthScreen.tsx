import React, { useState } from 'react';
import { Lock, Phone, ShieldCheck, UserCheck } from 'lucide-react';
import { User } from '../types';
import { api } from '../api/client';

interface AuthScreenProps {
  onAuthenticated: (user: User) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'organizer' | 'member'>('organizer');
  const [city, setCity] = useState('Hyderabad');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'login') {
        const { user } = await api.login(phone, pin);
        onAuthenticated(user);
      } else {
        const { user } = await api.register({ name, phone, pin, role, city });
        onAuthenticated(user);
      }
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


        </div>

        {/* Right Sign-in / Register Card */}
        <div className="lg:col-span-6 rounded-2xl border border-[#0B3B2E]/15 bg-white p-6 shadow-lg">
          <div className="mb-5 flex rounded-xl bg-[#FAF8F4] p-1">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`flex-1 rounded-lg py-2 text-xs font-bold transition ${
                mode === 'login' ? 'bg-[#0B3B2E] text-white' : 'text-[#55655E]'
              }`}
            >
              Sign In with Mobile & PIN
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              className={`flex-1 rounded-lg py-2 text-xs font-bold transition ${
                mode === 'register' ? 'bg-[#0B3B2E] text-white' : 'text-[#55655E]'
              }`}
            >
              Create Account
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-800">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-[#55655E]">Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Full name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#0B3B2E]/20 bg-[#FAF8F4] px-3.5 py-2.5 text-sm font-medium focus:border-[#0B3B2E] focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRole('member')}
                    className={`flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-bold ${
                      role === 'member'
                        ? 'border-[#0B3B2E] bg-emerald-50 text-[#0B3B2E]'
                        : 'border-[#0B3B2E]/15 text-[#55655E]'
                    }`}
                  >
                    <UserCheck className="h-4 w-4" />
                    Chit Subscriber
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole('organizer')}
                    className={`flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-bold ${
                      role === 'organizer'
                        ? 'border-[#0B3B2E] bg-emerald-50 text-[#0B3B2E]'
                        : 'border-[#0B3B2E]/15 text-[#55655E]'
                    }`}
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Chit Organizer
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#55655E]">City / Branch</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#0B3B2E]/20 bg-[#FAF8F4] px-3.5 py-2 text-sm focus:border-[#0B3B2E] focus:outline-none"
                  />
                </div>
              </>
            )}

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
              {loading
                ? 'Opening Passbook…'
                : mode === 'login'
                  ? 'Sign In to Rare Mint'
                  : 'Register & Open Passbook'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
