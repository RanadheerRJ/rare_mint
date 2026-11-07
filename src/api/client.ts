import {
  ChitGroupDetail,
  ChitGroupSummary,
  ChitType,
  DueItem,
  MemberSlot,
  OwnerSummary,
  PaymentMethod,
  PaymentRecord,
  PlatformStats,
  User,
} from '../types';
import { isDemoModeEnabled, localStore } from './localStore';

const CACHE_PREFIX = 'rm_cache_v1:';
const TOKEN_STORAGE_KEY = 'rm_session_token_v1';

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

let sessionToken: string | null = null;
try {
  sessionToken = localStorage.getItem(TOKEN_STORAGE_KEY);
} catch {
  sessionToken = null;
}

export function getSessionToken(): string | null {
  return sessionToken;
}

function setSessionToken(token: string | null): void {
  sessionToken = token;
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

/** Clears cached API responses (used when the acting user changes). */
export function clearApiCache(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(CACHE_PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage errors
  }
}

class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const isGet = !options?.method || options.method.toUpperCase() === 'GET';
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
        ...(options?.headers || {}),
      },
    });
    const data = await res.json();
    if (!res.ok) {
      throw new HttpError(data?.error || `Request failed (${res.status})`, res.status);
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
    if (err instanceof HttpError) throw err;
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
  clearApiCache,

  login: async (phone: string, pin: string): Promise<{ user: User }> => {
    if ((await getStorageMode()) === 'static') return localStore.login(phone, pin);
    const result = await requestJson<{ token: string; user: User }>('./api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone, pin }),
    });
    clearApiCache();
    setSessionToken(result.token);
    return { user: result.user };
  },

  logout: async (): Promise<void> => {
    try {
      if ((await getStorageMode()) === 'server' && sessionToken) {
        await requestJson<{ ok: boolean }>('./api/auth/logout', { method: 'POST' });
      }
    } catch {
      // Logout is best-effort; clear local state regardless.
    } finally {
      setSessionToken(null);
      clearApiCache();
    }
  },

  /** Validates the stored session token; null when absent, expired or invalid. */
  me: async (): Promise<{ user: User } | null> => {
    if ((await getStorageMode()) !== 'server') return null;
    if (!sessionToken) return null;
    try {
      return await requestJson<{ user: User }>('./api/auth/me');
    } catch (err) {
      // Only a rejected session signs the user out; offline keeps the session.
      if (err instanceof HttpError && (err.status === 401 || err.status === 403)) {
        setSessionToken(null);
        return null;
      }
      return null;
    }
  },

  /**
   * Static/demo-mode account creation. Server mode never allows it — accounts
   * are invite-only (owners from the developer, members from their owner).
   */
  register: async (payload: {
    name: string;
    phone: string;
    pin: string;
    role: 'organizer' | 'member';
    city: string;
  }): Promise<{ user: User }> => {
    if ((await getStorageMode()) !== 'static') {
      throw new Error('Self-registration is disabled. Ask the platform developer for an owner invite.');
    }
    return localStore.register(payload);
  },

  /** Demo-mode check for static builds. */
  isDemoRegistrationEnabled: (): boolean => isDemoModeEnabled(),

  // ------------------------------------------------------------- developer

  devListOwners: async (): Promise<{ owners: OwnerSummary[] }> =>
    requestJson<{ owners: OwnerSummary[] }>('./api/dev/owners'),

  devInviteOwner: async (payload: {
    name: string;
    phone: string;
    pin: string;
    city: string;
  }): Promise<{ owner: OwnerSummary }> =>
    requestJson<{ owner: OwnerSummary }>('./api/dev/owners', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  devUpdateOwner: async (
    ownerId: number,
    payload: { name?: string; city?: string; isActive?: boolean }
  ): Promise<{ owner: OwnerSummary }> =>
    requestJson<{ owner: OwnerSummary }>(`./api/dev/owners/${ownerId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  devResetOwnerPin: async (ownerId: number, pin: string): Promise<{ ok: boolean }> =>
    requestJson<{ ok: boolean }>(`./api/dev/owners/${ownerId}/reset-pin`, {
      method: 'POST',
      body: JSON.stringify({ pin }),
    }),

  devDeleteOwner: async (ownerId: number): Promise<{ ok: boolean }> =>
    requestJson<{ ok: boolean }>(`./api/dev/owners/${ownerId}`, { method: 'DELETE' }),

  devStats: async (): Promise<{ stats: PlatformStats }> =>
    requestJson<{ stats: PlatformStats }>('./api/dev/stats'),

  // ------------------------------------------------------------- members

  getMembers: async (): Promise<{ members: User[] }> =>
    requestJson<{ members: User[] }>('./api/users/members'),

  updateMember: async (
    memberId: number,
    payload: { name?: string; city?: string; phone?: string }
  ): Promise<{ member: User }> =>
    requestJson<{ member: User }>(`./api/members/${memberId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  resetMemberPin: async (memberId: number, pin: string): Promise<{ ok: boolean }> =>
    requestJson<{ ok: boolean }>(`./api/members/${memberId}/reset-pin`, {
      method: 'POST',
      body: JSON.stringify({ pin }),
    }),

  // ------------------------------------------------------------- chits

  getChits: async (): Promise<{ groups: ChitGroupSummary[]; today: string }> =>
    requestJson<{ groups: ChitGroupSummary[]; today: string }>('./api/chits'),

  getChitDetail: async (groupId: number): Promise<{ group: ChitGroupDetail }> =>
    requestJson<{ group: ChitGroupDetail }>(`./api/chits/${groupId}`),

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
    notes: string;
    schedule: Array<{
      monthNumber: number;
      nonPrizedInstallment: number;
      chitValue: number;
      prizedInstallment: number;
    }>;
  }): Promise<{ group: ChitGroupSummary }> =>
    requestJson<{ group: ChitGroupSummary }>('./api/chits', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateChit: async (
    groupId: number,
    payload: {
      name?: string;
      notes?: string;
      dueDayOfMonth?: number;
      startDate?: string;
      foremanCommissionPct?: number;
      maxBidPct?: number;
      faceValue?: number;
      durationMonths?: number;
      chitType?: ChitType;
      status?: 'ACTIVE' | 'COMPLETED';
    }
  ): Promise<{ group: ChitGroupSummary }> =>
    requestJson<{ group: ChitGroupSummary }>(`./api/chits/${groupId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteChit: async (groupId: number): Promise<{ ok: boolean }> =>
    requestJson<{ ok: boolean }>(`./api/chits/${groupId}`, { method: 'DELETE' }),

  enrollSlot: async (
    groupId: number,
    payload: {
      ticketNumber: number;
      newMemberPin?: string;
      userId?: number;
      newMemberName?: string;
      newMemberPhone?: string;
      newMemberCity?: string;
    }
  ): Promise<{ slot: MemberSlot }> =>
    requestJson<{ slot: MemberSlot }>(`./api/chits/${groupId}/slots`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateSlot: async (
    groupId: number,
    slotId: number,
    payload: {
      memberName?: string;
      city?: string;
      phone?: string;
      ticketNumber?: number;
    }
  ): Promise<{ slot: MemberSlot }> =>
    requestJson<{ slot: MemberSlot }>(`./api/chits/${groupId}/slots/${slotId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  removeSlot: async (groupId: number, slotId: number): Promise<{ ok: boolean }> =>
    requestJson<{ ok: boolean }>(`./api/chits/${groupId}/slots/${slotId}`, { method: 'DELETE' }),

  // ------------------------------------------------------------- payments

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
  ): Promise<{ payment: PaymentRecord }> =>
    requestJson<{ payment: PaymentRecord }>(`./api/chits/${groupId}/payments`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updatePayment: async (
    groupId: number,
    paymentId: number,
    payload: {
      amountPaid?: number;
      paidDate?: string;
      paymentMethod?: PaymentMethod;
      referenceNote?: string;
    }
  ): Promise<{ payment: PaymentRecord }> =>
    requestJson<{ payment: PaymentRecord }>(`./api/chits/${groupId}/payments/${paymentId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  voidPayment: async (groupId: number, paymentId: number, reason: string): Promise<{ payment: PaymentRecord }> =>
    requestJson<{ payment: PaymentRecord }>(`./api/chits/${groupId}/payments/${paymentId}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason }),
    }),

  // ------------------------------------------------------------- lift & cycle

  recordLift: async (
    groupId: number,
    payload: {
      monthNumber: number;
      winnerMemberSlotId: number;
      bidDiscount?: number;
      payoutDate?: string;
      payoutReference?: string;
    }
  ): Promise<{ ok: boolean }> =>
    requestJson<{ ok: boolean }>(`./api/chits/${groupId}/lift`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  setCurrentMonth: async (
    groupId: number,
    currentMonth: number
  ): Promise<{ ok: boolean; currentMonth: number }> =>
    requestJson<{ ok: boolean; currentMonth: number }>(`./api/chits/${groupId}/current-month`, {
      method: 'POST',
      body: JSON.stringify({ currentMonth }),
    }),

  // ------------------------------------------------------------- dues & receipts

  getDues: async (): Promise<{ dues: DueItem[]; today: string }> =>
    requestJson<{ dues: DueItem[]; today: string }>('./api/dues'),

  getReceipts: async (): Promise<{ receipts: PaymentRecord[] }> =>
    requestJson<{ receipts: PaymentRecord[] }>('./api/receipts'),

  exportBackupJson: () => localStore.exportBackupJson(),
  importBackupJson: (raw: string) => localStore.importBackupJson(raw),
};
