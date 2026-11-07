import React, { useCallback, useEffect, useState } from 'react';
import { ChitGroupSummary, DueItem, PaymentRecord, User } from './types';
import { api } from './api/client';
import { AuthScreen } from './components/AuthScreen';
import { Layout, NavTab } from './components/Layout';
import { OrganizerDashboard } from './components/OrganizerDashboard';
import { MemberDashboard } from './components/MemberDashboard';
import { ChitGroupList } from './components/ChitGroupList';
import { ChitDetailView } from './components/ChitDetailView';
import { LiftCalculator } from './components/LiftCalculator';
import { DuesAndReceiptsView } from './components/DuesAndReceiptsView';
import { CreateChitModal } from './components/CreateChitModal';
import { ReceiptModal } from './components/ReceiptModal';

const USER_STORAGE_KEY = 'rm_active_user_v1';
const EXPLICIT_SIGNOUT_KEY = 'rm_signed_out_v1';

export const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(() => {
    try {
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

  const refreshData = useCallback(async () => {
    if (!user) return;
    try {
      const [chitsRes, duesRes, receiptsRes] = await Promise.all([
        api.getChits(user.id),
        api.getDues(user.id),
        api.getReceipts(user.id),
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
        onLogout={() => handleSetUser(null)}
        onDataImported={refreshData}
      >
        {selectedGroupId !== null && activeTab === 'groups' ? (
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
          <LiftCalculator userId={user.id} groups={groups} />
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
          organizerId={user.id}
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
