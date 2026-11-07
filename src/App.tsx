import React, { useCallback, useEffect, useState } from 'react';
import { ChitGroupSummary, DueItem, PaymentRecord, User } from './types';
import { api } from './api/client';
import { AuthScreen } from './components/AuthScreen';
import { Layout, NavTab } from './components/Layout';
import { OrganizerDashboard } from './components/OrganizerDashboard';
import { MemberDashboard } from './components/MemberDashboard';
import { DeveloperDashboard } from './components/DeveloperDashboard';
import { ChitGroupList } from './components/ChitGroupList';
import { ChitDetailView } from './components/ChitDetailView';
import { LiftCalculator } from './components/LiftCalculator';
import { DuesAndReceiptsView } from './components/DuesAndReceiptsView';
import { CreateChitModal } from './components/CreateChitModal';
import { ReceiptModal } from './components/ReceiptModal';
import { LEGACY_DEMO_PHONES } from './utils/legacyDemo';

const USER_STORAGE_KEY = 'rm_active_user_v1';
const EXPLICIT_SIGNOUT_KEY = 'rm_signed_out_v1';
const LEGACY_CLEANUP_KEY = 'rm_legacy_demo_cleanup_v1';
const API_CACHE_PREFIX = 'rm_cache_v1:';

/**
 * One-time removal of client state left behind by early builds, which signed
 * visitors in as a seeded demo organizer and cached demo API responses.
 */
function cleanupLegacyClientState(): void {
  if (localStorage.getItem(LEGACY_CLEANUP_KEY) === '1') return;
  try {
    const saved = localStorage.getItem(USER_STORAGE_KEY);
    const savedUser = saved ? (JSON.parse(saved) as Partial<User>) : null;
    if (savedUser && LEGACY_DEMO_PHONES.has(String(savedUser.phone ?? ''))) {
      localStorage.removeItem(USER_STORAGE_KEY);
    }
  } catch {
    localStorage.removeItem(USER_STORAGE_KEY);
  }
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key?.startsWith(API_CACHE_PREFIX)) localStorage.removeItem(key);
  }
  localStorage.setItem(LEGACY_CLEANUP_KEY, '1');
}

export const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(() => {
    try {
      cleanupLegacyClientState();
      const saved = localStorage.getItem(USER_STORAGE_KEY);
      return saved ? JSON.parse(saved) as User : null;
    } catch {
      return null;
    }
  });

  const [activeTab, setActiveTab] = useState<NavTab>(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('tab');
    if (t === 'groups' || t === 'calculator' || t === 'dues') return t;
    return 'overview';
  });

  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [groups, setGroups] = useState<ChitGroupSummary[]>([]);
  const [dues, setDues] = useState<DueItem[]>([]);
  const [receipts, setReceipts] = useState<PaymentRecord[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeReceipt, setActiveReceipt] = useState<PaymentRecord | null>(null);

  const handleSetUser = (nextUser: User | null) => {
    setUser(nextUser);
    setSelectedGroupId(null);
    setGroups([]);
    setDues([]);
    setReceipts([]);
    if (nextUser) {
      localStorage.removeItem(EXPLICIT_SIGNOUT_KEY);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(nextUser));
    } else {
      localStorage.setItem(EXPLICIT_SIGNOUT_KEY, '1');
      localStorage.removeItem(USER_STORAGE_KEY);
    }
  };

  const handleLogout = async () => {
    await api.logout();
    handleSetUser(null);
  };

  // Validate the stored session against the server when one exists.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mode = await api.getStorageMode();
      if (mode !== 'server' || cancelled) return;
      const result = await api.me();
      if (cancelled) return;
      if (result) handleSetUser(result.user);
      else handleSetUser(null);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshData = useCallback(async () => {
    if (!user) return;
    if (user.role === 'developer') {
      setGroups([]);
      setDues([]);
      setReceipts([]);
      return;
    }
    try {
      const [chitsRes, duesRes, receiptsRes] = await Promise.all([
        api.getChits(),
        api.getDues(),
        api.getReceipts(),
      ]);
      setGroups(chitsRes.groups);
      setDues(duesRes.dues);
      setReceipts(receiptsRes.receipts);
    } catch {
      // Handled gracefully by local ledger / cache
    }
  }, [user]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  if (!user) {
    return <AuthScreen onAuthenticated={handleSetUser} />;
  }

  const isOrganizer = user.role === 'organizer';
  const isDeveloper = user.role === 'developer';

  const handleOpenGroup = (groupId: number) => {
    setSelectedGroupId(groupId);
    setActiveTab('groups');
  };

  const handleTabSelect = (tab: NavTab) => {
    setActiveTab(tab);
    if (tab !== 'groups') {
      setSelectedGroupId(null);
    }
  };

  return (
    <>
      <Layout
        user={user}
        activeTab={activeTab}
        dueBadgeCount={dues.length}
        onSelectTab={handleTabSelect}
        onLogout={handleLogout}
        onDataImported={refreshData}
      >
        {isDeveloper ? (
          <DeveloperDashboard user={user} />
        ) : selectedGroupId !== null && activeTab === 'groups' ? (
          <ChitDetailView
            groupId={selectedGroupId}
            currentUser={user}
            onBack={() => setSelectedGroupId(null)}
            onOpenReceipt={(r) => setActiveReceipt(r)}
            onDataChanged={refreshData}
          />
        ) : activeTab === 'overview' ? (
          isOrganizer ? (
            <OrganizerDashboard
              user={user}
              groups={groups}
              dues={dues}
              recentReceipts={receipts}
              onOpenGroup={handleOpenGroup}
              onOpenCreateModal={() => setShowCreateModal(true)}
              onOpenReceipt={(r) => setActiveReceipt(r)}
              onNavigateTab={handleTabSelect}
            />
          ) : (
            <MemberDashboard
              user={user}
              groups={groups}
              dues={dues}
              receipts={receipts}
              onOpenGroup={handleOpenGroup}
              onOpenReceipt={(r) => setActiveReceipt(r)}
              onNavigateTab={handleTabSelect}
            />
          )
        ) : activeTab === 'groups' ? (
          <ChitGroupList
            groups={groups}
            isOrganizer={isOrganizer}
            onOpenGroup={handleOpenGroup}
            onOpenCreateModal={() => setShowCreateModal(true)}
          />
        ) : activeTab === 'calculator' ? (
          <LiftCalculator groups={groups} />
        ) : (
          <DuesAndReceiptsView
            isOrganizer={isOrganizer}
            dues={dues}
            receipts={receipts}
            onOpenReceipt={(r) => setActiveReceipt(r)}
            onOpenGroup={handleOpenGroup}
          />
        )}
      </Layout>

      {showCreateModal && isOrganizer && (
        <CreateChitModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(created) => {
            setShowCreateModal(false);
            refreshData();
            handleOpenGroup(created.id);
          }}
        />
      )}

      <ReceiptModal receipt={activeReceipt} onClose={() => setActiveReceipt(null)} />
    </>
  );
};
