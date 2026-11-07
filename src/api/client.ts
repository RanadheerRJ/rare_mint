import {
  ChitGroupDetail,
  ChitGroupSummary,
  ChitType,
  DueItem,
  MemberSlot,
  PaymentMethod,
  PaymentRecord,
  User,
} from '../types';
import { localStore } from './localStore';

const CACHE_PREFIX = 'rm_cache_v1:';

export type StorageBackendMode = 'server' | 'static';

let detectedModePromise: Promise<StorageBackendMode> | null = null;

export function getStorageMode(): Promise<StorageBackendMode> {
  if (detectedModePromise) return detectedModePromise;

  if (typeof window !== 'undefined' && window.location.hostname.endsWith('github.io')) {
    detectedModePromise = Promise.resolve('static');
    return detectedModePromise;
  }

  detectedModePromise = (async () => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 1500);
      const res = await fetch('./api/health', {
        headers: { Accept: 'application/json' },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('application/json')) {
        const body = await res.json();
        if (body?.ok) return 'server';
      }
      return 'static';
    } catch {
      return 'static';
    }
  })();

  return detectedModePromise;
}

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const isGet = !options?.method || options.method.toUpperCase() === 'GET';
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
      },
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || `Request failed (${res.status})`);
    }
    if (isGet) {
      try {
        localStorage.setItem(CACHE_PREFIX + url, JSON.stringify(data));
      } catch {
        // Ignore storage quota errors
      }
    }
    return data as T;
  } catch (err) {
    if (isGet && !navigator.onLine) {
      const cached = localStorage.getItem(CACHE_PREFIX + url);
      if (cached) {
        return JSON.parse(cached) as T;
      }
    }
    throw err;
  }
}

export const api = {
  getStorageMode,

  login: async (phone: string, pin: string): Promise<{ user: User }> => {
    if ((await getStorageMode()) === 'static') return localStore.login(phone, pin);
    return requestJson<{ user: User }>('./api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone, pin }),
    });
  },

  register: async (payload: {
    name: string;
    phone: string;
    pin: string;
    role: 'organizer' | 'member';
    city: string;
  }): Promise<{ user: User }> => {
    if ((await getStorageMode()) === 'static') return localStore.register(payload);
    return requestJson<{ user: User }>('./api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getMembers: async (): Promise<{ members: User[] }> => {
    if ((await getStorageMode()) === 'static') return localStore.getMembers();
    return requestJson<{ members: User[] }>('./api/users/members');
  },

  getChits: async (
    userId: number,
    includeAll = false
  ): Promise<{ groups: ChitGroupSummary[]; today: string }> => {
    if ((await getStorageMode()) === 'static') return localStore.getChits(userId, includeAll);
    return requestJson<{ groups: ChitGroupSummary[]; today: string }>(
      `./api/chits?userId=${userId}${includeAll ? '&includeAll=1' : ''}`
    );
  },

  getChitDetail: async (groupId: number, userId: number): Promise<{ group: ChitGroupDetail }> => {
    if ((await getStorageMode()) === 'static') return localStore.getChitDetail(groupId, userId);
    return requestJson<{ group: ChitGroupDetail }>(`./api/chits/${groupId}?userId=${userId}`);
  },

  createChit: async (payload: {
    name: string;
    code?: string;
    chitType: ChitType;
    faceValue: number;
    durationMonths: number;
    startDate: string;
    dueDayOfMonth: number;
    baseInstallment: number;
    foremanCommissionPct: number;
    maxBidPct: number;
    organizerId: number;
    notes: string;
    schedule: Array<{
      monthNumber: number;
      nonPrizedInstallment: number;
      chitValue: number;
      prizedInstallment: number;
    }>;
  }): Promise<{ group: ChitGroupSummary }> => {
    if ((await getStorageMode()) === 'static') return localStore.createChit(payload);
    return requestJson<{ group: ChitGroupSummary }>('./api/chits', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  enrollSlot: async (
    groupId: number,
    payload: {
      ticketNumber: number;
      organizerId: number;
      newMemberPin?: string;
      userId?: number;
      newMemberName?: string;
      newMemberPhone?: string;
      newMemberCity?: string;
    }
  ): Promise<{ slot: MemberSlot }> => {
    if ((await getStorageMode()) === 'static') return localStore.enrollSlot(groupId, payload);
    return requestJson<{ slot: MemberSlot }>(`./api/chits/${groupId}/slots`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  recordPayment: async (
    groupId: number,
    payload: {
      memberSlotId: number;
      monthNumber: number;
      amountPaid?: number;
      paidDate?: string;
      paymentMethod: PaymentMethod;
      referenceNote?: string;
      signedByName?: string;
    }
  ): Promise<{ payment: PaymentRecord }> => {
    if ((await getStorageMode()) === 'static') return localStore.recordPayment(groupId, payload);
    return requestJson<{ payment: PaymentRecord }>(`./api/chits/${groupId}/payments`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  recordLift: async (
    groupId: number,
    payload: {
      monthNumber: number;
      winnerMemberSlotId: number;
      bidDiscount?: number;
      payoutDate?: string;
      payoutReference?: string;
    }
  ): Promise<{ ok: boolean }> => {
    if ((await getStorageMode()) === 'static') return localStore.recordLift(groupId, payload);
    return requestJson<{ ok: boolean }>(`./api/chits/${groupId}/lift`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  setCurrentMonth: async (
    groupId: number,
    currentMonth: number
  ): Promise<{ ok: boolean; currentMonth: number }> => {
    if ((await getStorageMode()) === 'static') {
      return localStore.setCurrentMonth(groupId, currentMonth);
    }
    return requestJson<{ ok: boolean; currentMonth: number }>(`./api/chits/${groupId}/current-month`, {
      method: 'POST',
      body: JSON.stringify({ currentMonth }),
    });
  },

  getDues: async (userId: number): Promise<{ dues: DueItem[]; today: string }> => {
    if ((await getStorageMode()) === 'static') return localStore.getDues(userId);
    return requestJson<{ dues: DueItem[]; today: string }>(`./api/dues?userId=${userId}`);
  },

  getReceipts: async (userId: number): Promise<{ receipts: PaymentRecord[] }> => {
    if ((await getStorageMode()) === 'static') return localStore.getReceipts(userId);
    return requestJson<{ receipts: PaymentRecord[] }>(`./api/receipts?userId=${userId}`);
  },

  exportBackupJson: () => localStore.exportBackupJson(),
  importBackupJson: (raw: string) => localStore.importBackupJson(raw),
};
