import React, { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Calculator,
  DatabaseBackup,
  Download,
  FileCheck2,
  LayoutDashboard,
  LogOut,
  Upload,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { User } from '../types';
import { StorageBackendMode, api } from '../api/client';
import { HardRefreshButton } from './HardRefreshButton';

export type NavTab = 'overview' | 'groups' | 'calculator' | 'dues';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface LayoutProps {
  user: User;
  activeTab: NavTab;
  dueBadgeCount: number;
  onSelectTab: (tab: NavTab) => void;
  onLogout: () => void;
  onDataImported?: () => void;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({
  user,
  activeTab,
  dueBadgeCount,
  onSelectTab,
  onLogout,
  onDataImported,
  children,
}) => {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [backendMode, setBackendMode] = useState<StorageBackendMode>('static');
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallTip, setShowInstallTip] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    api.getStorageMode().then(setBackendMode);


    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
    } else {
      setShowInstallTip(true);
    }
  };

  const handleExportBackup = () => {
    const json = api.exportBackupJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rare-mint-ledger-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      api.importBackupJson(text);
      setShowBackupModal(false);
      onDataImported?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to import backup JSON.');
    } finally {
      e.target.value = '';
    }
  };

  const navItems: Array<{
    id: NavTab;
    label: string;
    icon: typeof LayoutDashboard;
    badge?: number;
  }> = user.role === 'developer'
    ? [{ id: 'overview', label: 'Platform Admin', icon: LayoutDashboard }]
    : [
        { id: 'overview', label: 'Overview', icon: LayoutDashboard },
        { id: 'groups', label: 'Passbooks', icon: BookOpen },
        { id: 'calculator', label: 'Lift ROI', icon: Calculator },
        {
          id: 'dues',
          label: 'Dues & Receipts',
          icon: FileCheck2,
          badge: dueBadgeCount > 0 ? dueBadgeCount : undefined,
        },
      ];

  return (
    <div className="min-h-screen bg-[#FAF8F4] text-[#14201C] flex flex-col lg:flex-row">
      {/* Desktop Left Sidebar */}
      <aside className="no-print hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-[#0B3B2E] text-white">
        <div className="flex items-center gap-3 px-6 py-5 border-b border-white/12">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#D4A437] bg-[#135341] text-lg font-bold text-[#F2CA6B]">
            ₹
          </div>
          <div>
            <p className="text-[10px] font-bold tracking-[0.2em] text-[#D4A437] uppercase">
              Rare Mint
            </p>
            <p className="text-sm font-bold tracking-tight">Chit Passbook PWA</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1.5 px-3.5 py-5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${
                  active
                    ? 'bg-[#D4A437] text-[#14201C] font-bold'
                    : 'text-white/80 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon className="h-4 w-4" />
                  {item.label}
                </span>
                {item.badge !== undefined && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                      active ? 'bg-[#0B3B2E] text-white' : 'bg-[#D4A437] text-[#14201C]'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="space-y-2.5 border-t border-white/12 p-4">
          <button
            onClick={handleInstallClick}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#D4A437]/50 bg-[#135341] px-3 py-2 text-xs font-bold text-[#F2CA6B] transition hover:bg-[#196650]"
          >
            <Download className="h-3.5 w-3.5" />
            Install Rare Mint App
          </button>

          {backendMode === 'static' && <button
            onClick={() => setShowBackupModal(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/8 px-3 py-2 text-xs font-semibold text-white/90 transition hover:bg-white/15"
          >
            <DatabaseBackup className="h-3.5 w-3.5" />
            Export / Restore Ledger
          </button>}

          <HardRefreshButton variant="sidebar" />

          <div className="rounded-xl bg-white/8 p-3">
            <p className="text-xs font-bold text-white">{user.name}</p>
            <p className="text-[11px] text-white/70 capitalize">
              {user.role === 'organizer'
                ? 'Organizer / Foreman'
                : user.role === 'developer'
                  ? 'Platform Developer'
                  : 'Chit Subscriber'}{' '}
              · +91 {user.phone}
            </p>
            <button
              onClick={onLogout}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#F2CA6B] hover:underline"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-h-screen">
        {/* Top Header */}
        <header className="no-print sticky top-0 z-30 border-b border-[#0B3B2E]/12 bg-[#FAF8F4]/95 px-4 py-3 backdrop-blur-md sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 lg:hidden">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0B3B2E] text-sm font-bold text-[#F2CA6B]">
                ₹
              </div>
              <div>
                <p className="text-sm font-bold leading-none text-[#0B3B2E]">Rare Mint</p>
                <p className="text-[10px] font-semibold text-[#55655E] capitalize">
                  {user.role} Portal
                </p>
              </div>
            </div>

            {/* Online/Offline & Storage Sync Pill */}
            <div className="hidden lg:flex items-center gap-2">
              {isOnline ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-900">
                  <Wifi className="h-3.5 w-3.5" />
                  {backendMode === 'server'
                    ? 'Live Server DB Synced'
                    : 'PWA Local Ledger Active'}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
                  <WifiOff className="h-3.5 w-3.5" />
                  Offline Passbook Mode
                </span>
              )}
            </div>

            {/* Right Controls: Quick Role Switcher + Mobile Actions */}
            <div className="flex items-center gap-2">


              {backendMode === 'static' && <button
                onClick={() => setShowBackupModal(true)}
                className="lg:hidden rounded-lg border border-[#0B3B2E]/20 bg-white p-1.5 text-[#0B3B2E]"
                title="Backup / Restore JSON"
              >
                <DatabaseBackup className="h-4 w-4" />
              </button>}

              <HardRefreshButton variant="icon" />

              <button
                onClick={handleInstallClick}
                className="lg:hidden rounded-lg border border-[#0B3B2E]/20 bg-white p-1.5 text-[#0B3B2E]"
                title="Install PWA"
              >
                <Download className="h-4 w-4" />
              </button>

              <button
                onClick={onLogout}
                className="lg:hidden rounded-lg border border-[#0B3B2E]/20 bg-white p-1.5 text-[#55655E]"
                title="Sign Out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Main Workspace */}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 pb-24 sm:px-6 lg:pb-10">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Tab Bar */}
      <nav className="no-print fixed right-0 bottom-0 left-0 z-30 flex items-center justify-around border-t border-[#0B3B2E]/15 bg-white/95 px-2 py-2 backdrop-blur-md lg:hidden">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`relative flex flex-col items-center gap-0.5 rounded-xl px-3 py-1 text-[11px] font-bold transition ${
                active ? 'text-[#0B3B2E]' : 'text-[#55655E]'
              }`}
            >
              <Icon className={`h-5 w-5 ${active ? 'stroke-[2.5]' : ''}`} />
              <span>{item.label}</span>
              {item.badge !== undefined && (
                <span className="absolute top-0.5 right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#D4A437] px-1 text-[10px] font-bold text-[#14201C]">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* PWA Install Guidance Modal */}
      {showInstallTip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl border border-[#0B3B2E]/20 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <h3 className="text-base font-bold text-[#0B3B2E]">Install Rare Mint PWA</h3>
              <button
                onClick={() => setShowInstallTip(false)}
                className="rounded-lg p-1 text-[#55655E] hover:bg-[#FAF8F4]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[#55655E]">
              Add <strong>Rare Mint</strong> to your phone or desktop home screen for instant
              full-screen access and offline passbook browsing:
            </p>
            <ul className="mt-3 space-y-2 rounded-xl bg-[#FAF8F4] p-3.5 text-xs text-[#14201C]">
              <li>
                <strong>Android / Chrome:</strong> Tap browser menu <strong>⋮</strong> →{' '}
                <strong>Install App</strong> or <strong>Add to Home screen</strong>.
              </li>
              <li>
                <strong>iPhone / Safari:</strong> Tap <strong>Share</strong> icon →{' '}
                <strong>Add to Home Screen</strong>.
              </li>
            </ul>
            <button
              onClick={() => setShowInstallTip(false)}
              className="mt-4 w-full rounded-xl bg-[#0B3B2E] py-2 text-xs font-bold text-white"
            >
              Got It
            </button>
          </div>
        </div>
      )}

      {/* Backup / Export / Restore Modal */}
      {showBackupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-[#0B3B2E]/20 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-[#0B3B2E]">
                  Ledger Backup & Portable Sync
                </h3>
                <p className="mt-0.5 text-xs text-[#55655E]">
                  Export your complete chit groups, member tickets, and signed receipts as JSON or restore on any device.
                </p>
              </div>
              <button
                onClick={() => setShowBackupModal(false)}
                className="rounded-lg p-1 text-[#55655E] hover:bg-[#FAF8F4]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2.5">
              <button
                onClick={handleExportBackup}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0B3B2E] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#135341]"
              >
                <Download className="h-4 w-4" />
                Download Ledger Backup (.json)
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                onChange={handleImportFile}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#0B3B2E]/20 bg-[#FAF8F4] px-4 py-2.5 text-xs font-bold text-[#14201C] hover:bg-[#EFECE4]"
              >
                <Upload className="h-4 w-4" />
                Restore Ledger from JSON File
              </button>


            </div>
          </div>
        </div>
      )}
    </div>
  );
};
