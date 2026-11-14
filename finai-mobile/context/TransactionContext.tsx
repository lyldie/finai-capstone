// finai-frontend/context/TransactionContext.tsx
import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import { Alert } from '../utils/FinAIAlert';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config';
import { useAuth } from './AuthContext';
import { getSecureItem } from '../utils/secureStorage';
import { useNetworkStatus } from './NetworkStatusContext';
import { isExpectedNetworkError, userFacingError } from '../utils/userFacingError';


export type TransactionType = 'Income' | 'Expense' | 'Transfer' | 'Contribution' | 'Goal Withdrawal';
export type Transaction = { id: string; amount: string; category: string; category_id?: string; note: string; type: TransactionType; account: string; account_id?: string; to_account?: string; to_account_id?: string; date: string; goal_id?: string; client_request_id?: string; pending_sync?: boolean; };
export type Category = { id: string; name: string; type: string; icon: string; };
export type GoalTypePreset = { id: string; name: string; icon?: string };
export type Account = { id: string; name: string; initial_balance: number; current_balance?: number; icon: string; card_color?: string | null; user_id?: string | null; account_role?: 'admin' | 'user'; parent_template_id?: string | null; };
export type Budget = { id: string; category_id: string; category_name?: string; amount: number; available_limit?: number; rollover_enabled?: boolean; budget_kind?: 'fixed' | 'variable'; rollover_in?: number; rollover_out?: number; spent: number; remaining?: number; percentage_used?: number; period_type: 'weekly' | 'monthly' | 'annual'; period_key: string; start_date?: string; end_date?: string; month_year?: string; };
export type AppNotification = { id: string; budget_id?: string | null; bill_id?: string | null; due_date?: string; category_id?: string | null; category_name?: string; period_key?: string; event_type?: 'budget_threshold' | 'spending_spike' | 'bill_due' | 'offline_pending' | string; title?: string; current_amount?: number; baseline_amount?: number; change_amount?: number; change_percent?: number; threshold: number; percentage_used?: number; level: string; message: string; is_read: boolean; created_at: string; advisor_conversation_id?: string; provisional?: boolean };
export type TransactionToastNotice = { id: string; kind: 'success' | 'budget' | 'spending_spike'; title: string; messages: string[]; threshold?: number; percentage_used?: number; level?: string; advisorConversationId?: string };

const transactionRequestError = async (response: Response, fallback: string) => {
  const body = await response.json().catch(() => ({}));
  const detail = typeof body.detail === 'string' ? body.detail : '';
  if (response.status === 409 && /balance/i.test(detail)) return new Error('INSUFFICIENT_BALANCE');
  if (response.status >= 500) return new Error('TRANSACTION_TEMPORARY_FAILURE');
  return new Error(detail || fallback);
};

export type Goal = {
  id: string;
  user_id: string;
  goal_type_id: string;
  target_name: string;
  target_amount: number;
  current_savings: number;
  target_date: string;
  status?: 'active' | 'target_reached' | 'completed';
  target_reached_at?: string | null;
  completed_at?: string | null;
  is_archived?: boolean;
  client_request_id?: string;
};

type TransactionContextType = {
  transactions: Transaction[];
  categories: Category[];
  accounts: Account[];
  budgets: Budget[];
  notifications: AppNotification[];
  transactionToast: TransactionToastNotice | null;
  showTransactionToast: (notice: Omit<TransactionToastNotice, 'id'>) => void;
  clearTransactionToast: () => void;
  goals: Goal[];
  goalTypes: GoalTypePreset[];
  isLoading: boolean;
  isRefreshing: boolean;
  pendingTransactionCount: number;
  pendingChanges: PendingChange[];
  failedPendingChangeCount: number;
  syncPendingTransactions: () => Promise<number>;
  retryPendingChange: (id: string) => Promise<number>;
  discardFailedPendingChange: (id: string) => Promise<number>;
  addTransaction: (amount: string, category: string, note: string, type: TransactionType, account: string, toAccount?: string, date?: string, scheduledBill?: { id: string; periodKey: string }) => Promise<AppNotification[]>;
  updateTransaction: (id: string, amount: string, category: string, note: string, type: TransactionType, account: string, toAccount?: string, date?: string, goalId?: string) => Promise<AppNotification[]>;
  archiveTransaction: (id: string) => Promise<void>;
  updateBudget: (id: string, amount: number, rollover_enabled?: boolean, budget_kind?: 'fixed' | 'variable') => Promise<boolean>;
  setBudget: (category_id: string, amount: number, period_type: Budget['period_type'], rollover_enabled?: boolean, budget_kind?: Budget['budget_kind']) => Promise<boolean>;
  deleteBudget: (id: string) => Promise<void>;
  addGoal: (name: string, target_amount: number, target_date: string, goal_type_id: string) => Promise<boolean>;
  updateGoal: (id: string, name: string, target_amount: number, target_date: string, goal_type_id: string, current_savings?: number) => Promise<boolean>;
  deleteGoal: (id: string) => Promise<void>;
  archiveGoal: (id: string) => Promise<void>;
  completeGoal: (id: string) => Promise<boolean>;
  depositToGoal: (goalId: string, amount: number, account: string) => Promise<'synced' | 'pending' | false>;
  withdrawFromGoal: (goalId: string, amount: number, account: string) => Promise<'synced' | 'pending' | false>;
  getAccountBalance: (name: string) => number;
  totalIncome: number;
  totalExpense: number;
  totalSavings: number;
  balance: number;
  fetchTransactions: (showLoading?: boolean) => Promise<boolean>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  clearAllNotifications: () => Promise<void>;
};

const TransactionContext = createContext<TransactionContextType | undefined>(undefined);

type PendingTransaction = {
  id: string;
  kind?: 'transaction' | 'transaction.update' | 'transaction.archive' | 'budget.set' | 'budget.delete' | 'goal.create' | 'goal.update' | 'goal.deposit' | 'goal.withdraw' | 'goal.archive' | 'goal.delete';
  payload: Record<string, any>;
  transaction?: Transaction;
  localEntityId?: string;
  created_at: string;
  sync_error?: string;
  sync_attempts?: number;
  failed_at?: string;
};
export type PendingChange = { id: string; kind: string; title: string; detail: string; created_at: string; sync_error?: string; localEntityId?: string };
const describePendingChange = (item: PendingTransaction): PendingChange => {
  const kind = item.kind || 'transaction';
  const amount = Number(item.payload?.amount ?? item.transaction?.amount);
  const amountLabel = Number.isFinite(amount) && amount > 0
    ? `₱${amount.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`
    : '';
  const titleByKind: Record<string, string> = {
    transaction: `${item.payload?.type || item.transaction?.type || 'Transaction'}${amountLabel ? ` · ${amountLabel}` : ''}`,
    'transaction.update': `Edit transaction${amountLabel ? ` · ${amountLabel}` : ''}`,
    'transaction.archive': 'Archive transaction',
    'budget.set': `Save ${item.payload?.period_type || ''} budget${amountLabel ? ` · ${amountLabel}` : ''}`.trim(),
    'budget.delete': 'Delete budget',
    'goal.create': `Create goal: ${item.payload?.target_name || 'New goal'}`,
    'goal.update': `Update goal: ${item.payload?.target_name || 'Goal'}`,
    'goal.deposit': `Goal contribution${amountLabel ? ` · ${amountLabel}` : ''}`,
    'goal.withdraw': `Goal withdrawal${amountLabel ? ` · ${amountLabel}` : ''}`,
    'goal.archive': 'Archive goal',
    'goal.delete': 'Delete goal',
  };
  const detail = item.transaction?.note || item.payload?.category || item.payload?.account || item.payload?.target_date || 'Saved on this device';
  return { id: item.id, kind, title: titleByKind[kind] || 'Saved change', detail: String(detail), created_at: item.created_at, sync_error: item.sync_error, localEntityId: item.localEntityId };
};
const pendingTransactionsKey = (userId: string) => `@offline_${userId}_pending_transactions`;
const cachedTransactionsKey = (userId: string) => `@offline_${userId}_transactions`;
const cachedBudgetsKey = (userId: string) => `@offline_${userId}_budgets`;
const cachedGoalsKey = (userId: string) => `@offline_${userId}_goals`;
const cachedGoalTypesKey = (userId: string) => `@offline_${userId}_goal_types`;
const cachedCategoriesKey = (userId: string) => `@offline_${userId}_categories`;
const cachedNotificationsKey = (userId: string) => `@offline_${userId}_notifications`;
const makeClientRequestId = () => `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
const normalizedAlertType = (item: AppNotification) => item.event_type || 'budget_threshold';
const alertMatches = (left: AppNotification, right: AppNotification) => normalizedAlertType(left) === normalizedAlertType(right)
  && left.category_id === right.category_id
  && String(left.period_key || '') === String(right.period_key || '')
  && (normalizedAlertType(left) === 'spending_spike' || Number(left.threshold) === Number(right.threshold));
const isoWeekKey = (dayKey: string) => {
  const day = new Date(`${dayKey}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((day.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
};
const currentBudgetPeriod = (periodType: Budget['period_type']) => {
  const today = getPhDateString();
  const date = new Date(`${today}T00:00:00Z`);
  if (periodType === 'weekly') {
    const start = new Date(date);
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    const thursday = new Date(start);
    thursday.setUTCDate(thursday.getUTCDate() + 3);
    const isoYear = thursday.getUTCFullYear();
    const jan4 = new Date(Date.UTC(isoYear, 0, 4));
    const firstMonday = new Date(jan4);
    firstMonday.setUTCDate(firstMonday.getUTCDate() - ((firstMonday.getUTCDay() + 6) % 7));
    const isoWeek = 1 + Math.round((start.getTime() - firstMonday.getTime()) / (7 * 86400000));
    const key = `${isoYear}-W${String(isoWeek).padStart(2, '0')}`;
    return { period_key: key, start_date: start.toISOString().slice(0, 10), end_date: end.toISOString().slice(0, 10) };
  }
  if (periodType === 'annual') return { period_key: String(date.getUTCFullYear()), start_date: `${date.getUTCFullYear()}-01-01`, end_date: `${date.getUTCFullYear()}-12-31` };
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  return { period_key: `${year}-${String(month + 1).padStart(2, '0')}`, start_date: `${year}-${String(month + 1).padStart(2, '0')}-01`, end_date: new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10) };
};

// Use the backend's Philippine business date even if the phone timezone differs.
const getPhDateString = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
};

export const TransactionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { isOnline } = useNetworkStatus();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const notificationsRef = useRef<AppNotification[]>([]);
  const [transactionToast, setTransactionToast] = useState<TransactionToastNotice | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [archivedGoalSavings, setArchivedGoalSavings] = useState(0);
  const [goalTypes, setGoalTypes] = useState<GoalTypePreset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingTransactionCount, setPendingTransactionCount] = useState(0);
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const activeUserId = useRef<string | null>(null);
  const fetchRequestId = useRef(0);
  const foregroundRequestActive = useRef(false);
  const pendingSyncActive = useRef(false);
  const wasOnline = useRef<boolean | null>(null);
  useEffect(() => { notificationsRef.current = notifications; }, [notifications]);
  const pendingQueueWrite = useRef<Promise<void>>(Promise.resolve());
  const updatePendingQueue = useCallback(async (
    userId: string,
    update: (queue: PendingTransaction[]) => PendingTransaction[],
  ) => {
    const operation = pendingQueueWrite.current.then(async () => {
      const key = pendingTransactionsKey(userId);
      const stored = await AsyncStorage.getItem(key);
      let queue: PendingTransaction[] = [];
      try { queue = stored ? JSON.parse(stored) : []; } catch { queue = []; }
      if (!Array.isArray(queue)) queue = [];
      const nextQueue = update(queue);
      await AsyncStorage.setItem(key, JSON.stringify(nextQueue));
      setPendingTransactionCount(nextQueue.length);
      setPendingChanges(nextQueue.map(describePendingChange));
      return nextQueue;
    });
    pendingQueueWrite.current = operation.then(() => undefined, () => undefined);
    return operation;
  }, []);
  const isPendingQueueEmpty = async (userId: string) => {
    const stored = await AsyncStorage.getItem(pendingTransactionsKey(userId));
    try { return !stored || JSON.parse(stored).length === 0; } catch { return false; }
  };
  const showTransactionToast = useCallback((notice: Omit<TransactionToastNotice, 'id'>) => {
    setTransactionToast({ ...notice, id: `${Date.now()}-${Math.random().toString(36).slice(2)}` });
  }, []);
  const clearTransactionToast = useCallback(() => setTransactionToast(null), []);

  const createOfflineAlerts = useCallback(async (userId: string, expense: Transaction): Promise<AppNotification[]> => {
    if (expense.type !== 'Expense' || expense.goal_id) return [];
    const amount = Number(expense.amount) || 0;
    const category = categories.find((item) => item.id === expense.category_id)
      || categories.find((item) => item.name === expense.category && item.type.toLowerCase() === 'expense');
    const categoryId = expense.category_id || category?.id;
    if (!categoryId) return [];
    const matchesCategory = (item: Transaction) => item.category_id
      ? item.category_id === categoryId
      : item.category === expense.category;
    const now = new Date().toISOString();
    const generated: AppNotification[] = [];
    const currentRows = [...transactions, expense];
    const today = getPhDateString();

    for (const budget of budgets.filter((item) => item.category_id === categoryId && item.start_date && item.end_date && expense.date >= item.start_date && expense.date <= item.end_date)) {
      const limit = Number(budget.available_limit ?? budget.amount) || 0;
      if (limit <= 0) continue;
      const priorSpend = transactions.filter((item) => item.type === 'Expense' && !item.goal_id && matchesCategory(item) && item.date >= String(budget.start_date) && item.date <= String(budget.end_date)).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
      const priorPct = priorSpend / limit * 100;
      const nextPct = (priorSpend + amount) / limit * 100;
      const crossed = [70, 90, 100, 101].filter((threshold) => (threshold === 101 ? nextPct > 100 : nextPct >= threshold) && (threshold === 101 ? priorPct <= 100 : priorPct < threshold));
      const threshold = Math.max(...crossed);
      if (!Number.isFinite(threshold)) continue;
      const periodKey = budget.period_key || (budget.period_type === 'weekly' ? isoWeekKey(String(budget.start_date)) : budget.period_type === 'annual' ? String(budget.start_date).slice(0, 4) : String(budget.start_date).slice(0, 7));
      const notification: AppNotification & { period_key: string } = {
        id: `offline-budget:${budget.id}:${periodKey}:${threshold}`,
        budget_id: budget.id,
        category_id: categoryId,
        category_name: category?.name || expense.category,
        period_key: periodKey,
        event_type: 'budget_threshold',
        title: 'Budget alert · offline estimate',
        threshold,
        percentage_used: Number(nextPct.toFixed(2)),
        level: threshold === 70 ? 'warning' : threshold === 101 ? 'over_budget' : 'critical',
        message: `${category?.name || expense.category} has used about ${Math.round(nextPct)}% of its ${budget.period_type} budget (₱${(priorSpend + amount).toLocaleString('en-PH')} of ₱${limit.toLocaleString('en-PH')}). This offline estimate will be checked after sync.`,
        is_read: false,
        created_at: now,
        provisional: true,
      };
      if (!notifications.some((item) => alertMatches(item, notification))) generated.push(notification);
    }

    if (expense.date === today) {
      const day = new Date(`${today}T00:00:00Z`).getUTCDay();
      const currentStart = new Date(`${today}T00:00:00Z`);
      currentStart.setUTCDate(currentStart.getUTCDate() - ((day + 6) % 7));
      const weekKey = isoWeekKey(today);
      const firstSeen = currentRows.filter((item) => item.type === 'Expense' && !item.goal_id && matchesCategory(item)).map((item) => item.date).sort()[0];
      if (firstSeen) {
        const firstDate = new Date(`${firstSeen}T00:00:00Z`);
        const firstWeek = new Date(firstDate);
        firstWeek.setUTCDate(firstWeek.getUTCDate() - ((firstWeek.getUTCDay() + 6) % 7));
        const elapsedDays = Math.floor((new Date(`${today}T00:00:00Z`).getTime() - currentStart.getTime()) / 86400000);
        const currentWeekSpend = currentRows.filter((item) => item.type === 'Expense' && !item.goal_id && matchesCategory(item) && item.date >= currentStart.toISOString().slice(0, 10) && item.date <= today).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
        const comparable: number[] = [];
        for (const weeksAgo of [1, 2, 3, 4]) {
          const start = new Date(currentStart);
          start.setUTCDate(start.getUTCDate() - 7 * weeksAgo);
          if (start < firstWeek) continue;
          const end = new Date(start);
          end.setUTCDate(end.getUTCDate() + elapsedDays);
          comparable.push(currentRows.filter((item) => item.type === 'Expense' && !item.goal_id && matchesCategory(item) && item.date >= start.toISOString().slice(0, 10) && item.date <= end.toISOString().slice(0, 10)).reduce((sum, item) => sum + (Number(item.amount) || 0), 0));
        }
        if (comparable.length >= 3) {
          const sorted = comparable.sort((a, b) => a - b);
          const baseline = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
          const increase = currentWeekSpend - baseline;
          if (baseline > 0 && increase >= 150 && increase / baseline >= 0.3) {
            const notification: AppNotification & { period_key: string } = {
              id: `offline-spike:${categoryId}:${weekKey}`, category_id: categoryId,
              category_name: category?.name || expense.category, period_key: weekKey,
              event_type: 'spending_spike', title: 'Spending higher than usual · offline estimate',
              threshold: 0, current_amount: Number(currentWeekSpend.toFixed(2)), baseline_amount: Number(baseline.toFixed(2)),
              change_amount: Number(increase.toFixed(2)), change_percent: Number((increase / baseline * 100).toFixed(2)),
              level: 'spending_spike', message: `${category?.name || expense.category} spending is about ${Math.round(increase / baseline * 100)}% higher than your usual spending in recent weeks. This offline estimate will be checked after sync.`,
              is_read: false, created_at: now, provisional: true,
            };
            if (!notifications.some((item) => alertMatches(item, notification))) generated.push(notification);
          }
        }
      }
    }

    if (generated.length) {
      const merged = [...generated, ...notifications.filter((item) => !generated.some((next) => alertMatches(item, next)))];
      setNotifications(merged);
      await AsyncStorage.setItem(cachedNotificationsKey(userId), JSON.stringify(merged));
    }
    return generated;
  }, [budgets, categories, notifications, transactions]);

  // Option for silent refresh (showLoading = false) para iwas flicker sa UI
  const fetchTransactions = useCallback(async (showLoading = true): Promise<boolean> => {
    // A screen-focus refresh must not invalidate the initial load: doing so would
    // leave the shared loading state true because silent refreshes never clear it.
    if (!showLoading && foregroundRequestActive.current) return false;
    let refreshComplete = false;
    const requestId = ++fetchRequestId.current;
    if (showLoading) {
      foregroundRequestActive.current = true;
      setIsRefreshing(true);
      setIsLoading(true);
    }
    try {
      const userId = user?.id;
      if (!userId) {
        activeUserId.current = null;
        setTransactionToast(null);
        setTransactions([]);
        setPendingTransactionCount(0);
        setPendingChanges([]);
        setCategories([]);
        setAccounts([]);
        setBudgets([]);
        setNotifications([]);
        setGoals([]);
        setArchivedGoalSavings(0);
        setGoalTypes([]);
        if (showLoading && requestId === fetchRequestId.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
        return false;
      }
      if (activeUserId.current !== userId) {
        activeUserId.current = userId;
        setPendingTransactionCount(0);
        setPendingChanges([]);
        setTransactionToast(null);
        setTransactions([]);
        setCategories([]);
        setAccounts([]);
        setBudgets([]);
        setNotifications([]);
        setGoals([]);
        setArchivedGoalSavings(0);
      }
      const token = user?.token;
      const authHeaders = { Authorization: `Bearer ${token || ''}` };

      // 1. OFFLINE MODE: I-load muna ang local cache bago mag-fetch sa server
      const transactionCacheKey = `@offline_${userId}_transactions`;
      const budgetCacheKey = cachedBudgetsKey(userId);
      const goalsCacheKey = cachedGoalsKey(userId);
      const accountCacheKey = `@offline_${userId}_accounts`;
      const readCachedArray = async (key: string) => {
        const cached = await AsyncStorage.getItem(key);
        if (!cached) return null;
        try {
          const parsed = JSON.parse(cached);
          return Array.isArray(parsed) ? parsed : null;
        } catch {
          await AsyncStorage.removeItem(key);
          return null;
        }
      };
      const [cachedTrans, cachedBudgets, cachedAccounts, cachedGoals, cachedGoalTypes, cachedCategories, cachedNotifications] = await Promise.all([
        readCachedArray(transactionCacheKey), readCachedArray(budgetCacheKey), readCachedArray(accountCacheKey), readCachedArray(goalsCacheKey), readCachedArray(cachedGoalTypesKey(userId)), readCachedArray(cachedCategoriesKey(userId)), readCachedArray(cachedNotificationsKey(userId)),
      ]);
      if (requestId !== fetchRequestId.current || activeUserId.current !== userId) return false;

      // Offline data is partitioned by authenticated user so another account on the
      // same device can never briefly see the previous user's cached financial records.
      if (cachedTrans) setTransactions(cachedTrans);
      if (cachedBudgets) setBudgets(cachedBudgets);
      if (cachedAccounts) setAccounts(cachedAccounts);
      if (cachedGoals) setGoals(cachedGoals);
      if (cachedGoalTypes) setGoalTypes(cachedGoalTypes);
      if (cachedCategories) setCategories(cachedCategories);
      if (cachedNotifications) setNotifications(cachedNotifications);
      const storedQueue = await AsyncStorage.getItem(pendingTransactionsKey(userId));
      let pendingQueue: PendingTransaction[] = [];
      try {
        const parsedQueue = storedQueue ? JSON.parse(storedQueue) : [];
        pendingQueue = Array.isArray(parsedQueue) ? parsedQueue : [];
      } catch {
        await AsyncStorage.removeItem(pendingTransactionsKey(userId));
      }
      setPendingTransactionCount(pendingQueue.length);
      setPendingChanges(pendingQueue.map(describePendingChange));
      // First render this user's own cached financial data; keep the network sync
      // running in the background so returning users don't wait on every endpoint.
      if (showLoading && cachedTrans !== null) setIsLoading(false);

      // 2. BACKGROUND SYNC: Subukan kunin ang latest sa server nang may safe fallbacks
      const fetchAllTransactions = async () => {
        const all: any[] = [];
        let offset = 0;
        while (true) {
          const response = await fetch(`${API_URL}/get-expenses?user_id=${userId}&limit=500&offset=${offset}`, { headers: authHeaders });
          if (!response.ok) throw new Error(`Could not load transaction history (HTTP ${response.status}).`);
          const page = await response.json();
          if (page.status !== 'Success' || !Array.isArray(page.data)) throw new Error('Invalid transaction history response.');
          all.push(...page.data);
          if (!page.has_more || page.data.length === 0) return { status: 'Success', data: all };
          offset += page.data.length;
        }
      };
      const [transRes, catRes, accRes, budRes, goalsRes, archivedGoalsRes, notificationRes, goalTypesRes] = await Promise.all([
        fetchAllTransactions(),
        fetch(`${API_URL}/api/categories/?user_id=${userId}`, { headers: authHeaders }).then(res => res.ok ? res.json() : null).catch(() => null),
        fetch(`${API_URL}/api/accounts/user/${userId}`, { headers: authHeaders }).then(res => res.ok ? res.json() : null).catch(() => null),
        fetch(`${API_URL}/api/budgets/get-all/${userId}`, { headers: authHeaders }).then(res => res.ok ? res.json() : null).catch(() => null),
        fetch(`${API_URL}/api/goals/?user_id=${userId}`, { headers: authHeaders }).then(res => res.ok ? res.json() : null).catch(() => null),
        fetch(`${API_URL}/api/goals/?user_id=${userId}&archived=true`, { headers: authHeaders }).then(res => res.ok ? res.json() : null).catch(() => null),
        fetch(`${API_URL}/api/notifications/${userId}`, { headers: authHeaders }).then(res => res.ok ? res.json() : null).catch(() => null),
        fetch(`${API_URL}/api/goal-types/`).then(res => res.ok ? res.json() : null).catch(() => null)
      ]);

      if (requestId !== fetchRequestId.current || activeUserId.current !== userId) return false;

      const parsedAccounts = Array.isArray(accRes) ? accRes : Array.isArray(accRes?.data) ? accRes.data : null;
      const formattedAccounts = parsedAccounts
        ? parsedAccounts.map((a: any) => ({ ...a, id: a._id || a.id }))
        : cachedAccounts || [];
      if (parsedAccounts) {
        setAccounts(formattedAccounts);
        await AsyncStorage.setItem(accountCacheKey, JSON.stringify(formattedAccounts)); // Cache
      }

      if (transRes.status === "Success" && Array.isArray(transRes.data)) {
        const formattedTrans = transRes.data.map((i: any) => ({
          id: i._id || i.id,
          amount: i.amount?.toString() || '0',
          category: i.category || 'General',
          category_id: i.category_id ? String(i.category_id) : undefined,
          note: i.title || i.note || i.item_name || i.category || '',
          type: i.type || 'Expense',
          account: i.account || (formattedAccounts[0]?.name || 'Cash'),
          account_id: i.account_id ? String(i.account_id) : undefined,
          to_account: i.to_account || '',
          to_account_id: i.to_account_id ? String(i.to_account_id) : undefined,
          goal_id: i.goal_id ? String(i.goal_id) : undefined,
          client_request_id: i.client_request_id || undefined,
          date: i.date ? i.date.split('T')[0] : getPhDateString() // Ginamit ang PH time helper
        }));
        const serverRequestIds = new Set(formattedTrans.map((item: Transaction) => item.client_request_id).filter(Boolean));
        const stillPending = pendingQueue
          .map((item) => item.transaction)
          .filter((item): item is Transaction => Boolean(item?.client_request_id && !serverRequestIds.has(item.client_request_id)));
        const mergedTransactions = [...formattedTrans, ...stillPending];
        setTransactions(mergedTransactions);
        await AsyncStorage.setItem(transactionCacheKey, JSON.stringify(mergedTransactions)); // Cache, including queued local records
      }

      const parsedBudgets = Array.isArray(budRes) ? budRes : Array.isArray(budRes?.data) ? budRes.data : null;
      let formattedBudgets: Budget[] = parsedBudgets
        ? parsedBudgets.map((b: any) => ({ ...b, id: b._id || b.id }))
        : [...(cachedBudgets || [])];
      const pendingBudgetOps = pendingQueue.filter((item) => item.kind === 'budget.set');
      for (const operation of pendingBudgetOps) {
        const existingLocal = cachedBudgets?.find((b: Budget) => b.id === operation.localEntityId
          || (b.category_id === operation.payload.category_id && b.period_type === operation.payload.period_type));
        if (existingLocal) {
          formattedBudgets = formattedBudgets.filter((b) => !(b.category_id === existingLocal.category_id && b.period_type === existingLocal.period_type && b.period_key === existingLocal.period_key));
          formattedBudgets.push(existingLocal);
        }
      }
      setBudgets(formattedBudgets);
      await AsyncStorage.setItem(budgetCacheKey, JSON.stringify(formattedBudgets)); // Cache

      const parsedCategories = Array.isArray(catRes) ? catRes : Array.isArray(catRes?.data) ? catRes.data : null;
      if (parsedCategories) {
        const formattedCategories = parsedCategories.map((c: any) => ({ ...c, id: c._id || c.id }));
        setCategories(formattedCategories);
        await AsyncStorage.setItem(cachedCategoriesKey(userId), JSON.stringify(formattedCategories));
      }

      const parsedGoals = Array.isArray(goalsRes) ? goalsRes : Array.isArray(goalsRes?.data) ? goalsRes.data : null;
      let formattedGoals: Goal[] = parsedGoals
        ? parsedGoals.map((g: any) => ({ ...g, id: g._id || g.id }))
        : [...(cachedGoals || [])];
      for (const operation of pendingQueue) {
        if (operation.kind === 'goal.create' && operation.localEntityId) {
          const localGoal = cachedGoals?.find((g: Goal) => g.id === operation.localEntityId);
          const serverMatch = localGoal?.client_request_id && formattedGoals.some((g) => g.client_request_id === localGoal.client_request_id);
          if (localGoal && !serverMatch && !formattedGoals.some((g) => g.id === localGoal.id)) formattedGoals.push(localGoal);
        } else if (operation.kind === 'goal.update' && operation.localEntityId) {
          const localGoal = cachedGoals?.find((g: Goal) => g.id === operation.localEntityId);
          if (localGoal) formattedGoals = formattedGoals.map((g) => g.id === localGoal.id ? localGoal : g);
        }
      }
      for (const operation of pendingQueue.filter((item) => item.kind === 'goal.deposit' || item.kind === 'goal.withdraw')) {
        formattedGoals = formattedGoals.map((g) => {
          const localGoal = cachedGoals?.find((local: Goal) => local.id === g.id);
          if (g.id !== operation.localEntityId || !localGoal) return g;
          const localSavings = Number(localGoal.current_savings) || 0;
          const targetReached = localGoal.status === 'target_reached' || localGoal.status === 'completed' || localSavings >= Number(g.target_amount || 0);
          return {
            ...g,
            current_savings: localSavings,
            ...(targetReached ? {
              status: localGoal.status === 'completed' ? 'completed' as const : 'target_reached' as const,
              target_reached_at: localGoal.target_reached_at || new Date().toISOString(),
            } : {}),
          };
        });
      }
      setGoals(formattedGoals);
      await AsyncStorage.setItem(goalsCacheKey, JSON.stringify(formattedGoals));

      const parsedArchivedGoals = Array.isArray(archivedGoalsRes) ? archivedGoalsRes : Array.isArray(archivedGoalsRes?.data) ? archivedGoalsRes.data : null;
      if (parsedArchivedGoals) setArchivedGoalSavings(parsedArchivedGoals.reduce((sum: number, goal: any) => sum + (Number(goal.current_savings) || 0), 0));

      const parsedGoalTypes = Array.isArray(goalTypesRes) ? goalTypesRes : Array.isArray(goalTypesRes?.data) ? goalTypesRes.data : null;
      if (parsedGoalTypes) {
        const formattedGoalTypes = parsedGoalTypes.map((item: any) => ({ ...item, id: item._id || item.id }));
        setGoalTypes(formattedGoalTypes);
        await AsyncStorage.setItem(cachedGoalTypesKey(userId), JSON.stringify(formattedGoalTypes));
      }

      const parsedNotifications = Array.isArray(notificationRes) ? notificationRes : Array.isArray(notificationRes?.data) ? notificationRes.data : null;
      const formattedNotifications = parsedNotifications
        ? parsedNotifications.map((n: any) => ({ ...n, id: n._id || n.id }))
        : [...(cachedNotifications || [])];
      const pendingTransactionChanges = pendingQueue.some((item) => ['transaction', 'transaction.update'].includes(item.kind || 'transaction'));
      const stillUnconfirmed = pendingTransactionChanges
        ? notificationsRef.current.filter((item) => item.provisional && !formattedNotifications.some((serverItem: AppNotification) => alertMatches(item, serverItem)))
        : [];
      const mergedNotifications = [...formattedNotifications, ...stillUnconfirmed];
      setNotifications(mergedNotifications);
      await AsyncStorage.setItem(cachedNotificationsKey(userId), JSON.stringify(mergedNotifications));
      refreshComplete = transRes.status === 'Success' && Array.isArray(transRes.data)
        && Boolean(parsedCategories && parsedAccounts && parsedBudgets && parsedGoals && parsedArchivedGoals && parsedNotifications && parsedGoalTypes);

    } catch (e) {
      if (requestId !== fetchRequestId.current) return false;
      // Keep the cached data available; network interruptions are an expected offline fallback.
      if (!isExpectedNetworkError(e)) console.error('Financial data refresh failed; showing saved data.', e);
    } finally {
      if (showLoading && requestId === fetchRequestId.current) {
        foregroundRequestActive.current = false;
        setIsRefreshing(false);
        setIsLoading(false);
      }
    }
    return refreshComplete;
  }, [user?.id, user?.token]);

  const syncPendingTransactions = useCallback(async () => {
    const userId = user?.id;
    if (!userId) throw new Error('Sign in again before syncing pending changes.');
    if (pendingSyncActive.current) return 0;
    pendingSyncActive.current = true;
    let syncedCount = 0;
    const syncedAlerts: AppNotification[] = [];
    try {
      const stored = await AsyncStorage.getItem(pendingTransactionsKey(userId));
      let queue: PendingTransaction[] = [];
      try { queue = stored ? JSON.parse(stored) : []; } catch { queue = []; }
      if (!Array.isArray(queue)) queue = [];

      while (queue.length > 0) {
        const accountsFor = (item: PendingTransaction) => {
          const kind = item.kind || 'transaction';
          if (!['transaction', 'transaction.update', 'goal.deposit', 'goal.withdraw'].includes(kind)) return [];
          return [item.payload?.account, item.payload?.to_account].filter((value): value is string => typeof value === 'string' && value.length > 0);
        };
        const failedItems = queue.filter((queued) => Boolean(queued.sync_error));
        const item = queue.find((candidate) => {
          if (candidate.sync_error) return false;
          const candidateAccounts = accountsFor(candidate);
          return !failedItems.some((failed) => {
            if (candidate.localEntityId && failed.localEntityId === candidate.localEntityId) return true;
            const failedKind = failed.kind || 'transaction';
            const candidateKind = candidate.kind || 'transaction';
            if (failedKind.startsWith('budget.') && candidateKind.startsWith('budget.')
              && failed.payload?.category_id === candidate.payload?.category_id
              && failed.payload?.period_type === candidate.payload?.period_type) return true;
            if (candidateAccounts.length > 0 && accountsFor(failed).some((account) => candidateAccounts.includes(account))) return true;
            return false;
          });
        });
        // Keep failed changes visible for review, but allow unrelated work to
        // sync. Changes for the same record/payment account stay ordered.
        if (!item) break;
        const recordPermanentFailure = async (message: string) => {
          queue = await updatePendingQueue(userId, (current) => current.map((queued) => queued.id === item.id
            ? { ...queued, sync_error: message, sync_attempts: (queued.sync_attempts || 0) + 1, failed_at: new Date().toISOString() }
            : queued));
        };
        const token = await getSecureItem('user_token');
        const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` };
        let response: Response;
        let body: any = {};
        const kind = item.kind || 'transaction';
        if (kind === 'transaction') {
          response = await fetch(`${API_URL}/add-expense`, { method: 'POST', headers, body: JSON.stringify(item.payload) });
          body = await response.json().catch(() => ({}));
          if (response.ok && Array.isArray(body.notifications)) syncedAlerts.push(...body.notifications);
          if (response.ok && body.id && item.transaction) {
            const serverId = String(body.id);
            setTransactions((current) => current.map((t) => t.client_request_id === item.id ? { ...t, id: serverId, pending_sync: false } : t));
            const cachedTransactions = await AsyncStorage.getItem(cachedTransactionsKey(userId));
            if (cachedTransactions) {
              try { await AsyncStorage.setItem(cachedTransactionsKey(userId), JSON.stringify((JSON.parse(cachedTransactions) as Transaction[]).map((t) => t.client_request_id === item.id ? { ...t, id: serverId, pending_sync: false } : t))); } catch { /* Refresh rebuilds this cache. */ }
            }
            const cached = await AsyncStorage.getItem(cachedTransactionsKey(userId));
            if (cached) {
              try {
                const rows: Transaction[] = JSON.parse(cached);
                await AsyncStorage.setItem(cachedTransactionsKey(userId), JSON.stringify(rows.map((t) => t.client_request_id === item.id ? { ...t, id: serverId, pending_sync: false } : t)));
              } catch { /* The next refresh rebuilds the cache. */ }
            }
          }
        } else if (kind === 'transaction.update') {
          const updateRoute = item.payload?.type === 'Contribution' ? 'update-contribution' : 'update-expense';
          response = await fetch(`${API_URL}/${updateRoute}/${encodeURIComponent(item.localEntityId || '')}`, { method: 'PUT', headers, body: JSON.stringify(item.payload) });
          body = await response.json().catch(() => ({}));
          if (response.ok && Array.isArray(body.notifications)) syncedAlerts.push(...body.notifications);
        } else if (kind === 'transaction.archive') {
          response = await fetch(`${API_URL}/archive-expense/${encodeURIComponent(item.localEntityId || '')}`, { method: 'PATCH', headers });
          body = await response.json().catch(() => ({}));
        } else if (kind === 'budget.set') {
          response = await fetch(`${API_URL}/api/budgets/set-limit`, { method: 'POST', headers, body: JSON.stringify(item.payload) });
          body = await response.json().catch(() => ({}));
          if (response.ok && body.id && item.localEntityId) {
            const serverId = String(body.id);
            setBudgets((current) => current.map((b) => b.id === item.localEntityId ? { ...b, id: serverId } : b));
            const cached = await AsyncStorage.getItem(cachedBudgetsKey(userId));
            if (cached) {
              try { await AsyncStorage.setItem(cachedBudgetsKey(userId), JSON.stringify((JSON.parse(cached) as Budget[]).map((b) => b.id === item.localEntityId ? { ...b, id: serverId } : b))); } catch { /* Refresh rebuilds this cache. */ }
            }
          }
        } else if (kind === 'budget.delete') {
          response = await fetch(`${API_URL}/api/budgets/delete/${encodeURIComponent(item.localEntityId || '')}?user_id=${encodeURIComponent(userId)}`, { method: 'DELETE', headers });
          body = await response.json().catch(() => ({}));
        } else if (kind === 'goal.create') {
          response = await fetch(`${API_URL}/api/goals/`, { method: 'POST', headers, body: JSON.stringify(item.payload) });
          body = await response.json().catch(() => ({}));
          if (response.ok && body.id && item.localEntityId) {
            const serverId = String(body.id);
            setGoals((current) => current.map((g) => g.id === item.localEntityId ? { ...g, id: serverId } : g));
            setTransactions((current) => current.map((t) => t.goal_id === item.localEntityId ? { ...t, goal_id: serverId } : t));
            const cached = await AsyncStorage.getItem(cachedGoalsKey(userId));
            if (cached) {
              try { await AsyncStorage.setItem(cachedGoalsKey(userId), JSON.stringify((JSON.parse(cached) as Goal[]).map((g) => g.id === item.localEntityId ? { ...g, id: serverId } : g))); } catch { /* Refresh rebuilds this cache. */ }
            }
          }
        } else if (kind === 'goal.archive') {
          response = await fetch(`${API_URL}/api/goals/${encodeURIComponent(item.localEntityId || '')}/archive`, { method: 'PATCH', headers });
          body = await response.json().catch(() => ({}));
        } else if (kind === 'goal.delete') {
          response = await fetch(`${API_URL}/api/goals/${encodeURIComponent(item.localEntityId || '')}?user_id=${encodeURIComponent(userId)}`, { method: 'DELETE', headers });
          body = await response.json().catch(() => ({}));
        } else if (kind === 'goal.update') {
          response = await fetch(`${API_URL}/api/goals/${encodeURIComponent(item.localEntityId || '')}`, { method: 'PUT', headers, body: JSON.stringify(item.payload) });
          body = await response.json().catch(() => ({}));
        } else if (kind === 'goal.deposit' || kind === 'goal.withdraw') {
          const endpoint = kind === 'goal.withdraw' ? 'withdraw' : 'deposit';
          response = await fetch(`${API_URL}/api/goals/${encodeURIComponent(item.localEntityId || '')}/${endpoint}`, { method: 'PATCH', headers, body: JSON.stringify(item.payload) });
          body = await response.json().catch(() => ({}));
          if (response.ok && body.id && item.transaction) {
            const serverId = String(body.id);
            setTransactions((current) => current.map((t) => t.client_request_id === item.id ? { ...t, id: serverId, pending_sync: false } : t));
            const cachedTransactions = await AsyncStorage.getItem(cachedTransactionsKey(userId));
            if (cachedTransactions) {
              try { await AsyncStorage.setItem(cachedTransactionsKey(userId), JSON.stringify((JSON.parse(cachedTransactions) as Transaction[]).map((t) => t.client_request_id === item.id ? { ...t, id: serverId, pending_sync: false } : t))); } catch { /* Refresh rebuilds this cache. */ }
            }
          }
        } else {
          await recordPermanentFailure('This saved change type is no longer supported. Review it before discarding it.');
          continue;
        }

        if (!response.ok) {
          const detail = typeof body.detail === 'string' ? body.detail : 'FinAI could not sync a pending change.';
          if (response.status >= 500 || [401, 403, 408, 429].includes(response.status)) {
            throw new Error(response.status === 401 || response.status === 403
              ? 'Your session needs to be verified again before pending changes can sync.'
              : 'Sync paused because the server is temporarily unavailable. Your pending changes remain on this device.');
          }
          const validationMessages = Array.isArray(body.detail)
            ? body.detail.map((entry: any) => typeof entry?.msg === 'string' ? entry.msg : '').filter(Boolean).slice(0, 2).join(' ')
            : '';
          const rejectionMessage = typeof body.detail === 'string'
            ? userFacingError(new Error(body.detail), 'The server rejected this change. Review it on the Transactions page.')
            : validationMessages.length > 0
              ? validationMessages.slice(0, 220)
              : 'The server rejected this change. Review it on the Transactions page.';
          await recordPermanentFailure(rejectionMessage);
          continue;
        }
        if ((kind === 'transaction' || kind === 'budget.set' || kind === 'goal.create') && !body.id) {
          await recordPermanentFailure('The server did not confirm this saved change. Review it before trying again.');
          continue;
        }

        const localGoalId = kind === 'goal.create' ? item.localEntityId : undefined;
        const serverGoalId = kind === 'goal.create' ? String(body.id) : undefined;
        queue = await updatePendingQueue(userId, (current) => current
          .filter((queued) => queued.id !== item.id)
          .map((queued) => localGoalId && queued.localEntityId === localGoalId
            ? { ...queued, localEntityId: serverGoalId }
            : queued));
        syncedCount += 1;
      }
      if (syncedCount > 0) await fetchTransactions(false);
      const verifiedAlerts = syncedAlerts.filter((item) => !notificationsRef.current.some((local) => local.provisional && alertMatches(local, item)));
      const spendingSpikes = verifiedAlerts.filter((item) => item.event_type === 'spending_spike');
      const budgetAlerts = verifiedAlerts.filter((item) => item.event_type === 'budget_threshold');
      if (spendingSpikes.length > 0) {
        showTransactionToast({
          kind: 'spending_spike',
          title: 'Spending higher than usual',
          messages: [...spendingSpikes.map((item) => item.message), ...budgetAlerts.map((item) => item.message)],
        });
      } else if (budgetAlerts.length > 0) {
        const highest = [...budgetAlerts].sort((left, right) => right.threshold - left.threshold)[0];
        const advisorAlert = budgetAlerts.filter((item) => item.threshold >= 90 && item.advisor_conversation_id).sort((left, right) => right.threshold - left.threshold)[0];
        showTransactionToast({
          kind: 'budget',
          title: 'Budget alert',
          threshold: highest.threshold,
          percentage_used: highest.percentage_used,
          level: highest.level,
          messages: budgetAlerts.map((item) => item.message),
          advisorConversationId: advisorAlert?.advisor_conversation_id,
        });
      }
      return syncedCount;
    } finally {
      pendingSyncActive.current = false;
    }
  }, [user?.id, fetchTransactions, showTransactionToast, updatePendingQueue]);

  const retryPendingChange = useCallback(async (id: string) => {
    const userId = user?.id;
    if (!userId) throw new Error('Sign in again before syncing pending changes.');
    await updatePendingQueue(userId, (queue) => queue.map((item) => item.id === id
      ? { ...item, sync_error: undefined, failed_at: undefined }
      : item));
    return syncPendingTransactions();
  }, [user?.id, syncPendingTransactions, updatePendingQueue]);

  const discardFailedPendingChange = useCallback(async (id: string) => {
    const userId = user?.id;
    if (!userId) throw new Error('Sign in again before reviewing pending changes.');
    if (!isOnline) throw new Error('Connect to FinAI before removing a failed change so saved data can refresh safely.');
    let removedCount = 0;
    let removedItems: PendingTransaction[] = [];
    await updatePendingQueue(userId, (current) => {
      const failed = current.find((item) => item.id === id && item.sync_error);
      if (!failed) return current;
      const removeIds = new Set([failed.id]);
      // Removing an unsaved parent also removes its queued child operations,
      // which cannot succeed without that parent record.
      if (failed.kind === 'goal.create' || (failed.kind === 'budget.set' && failed.localEntityId?.startsWith('offline-budget:'))) {
        current.filter((item) => item.localEntityId === failed.localEntityId).forEach((item) => removeIds.add(item.id));
      }
      const next = current.filter((item) => !removeIds.has(item.id));
      removedCount = current.length - next.length;
      removedItems = current.filter((item) => removeIds.has(item.id));
      return next;
    });
    if (removedCount === 0) return 0;
    const refreshed = await fetchTransactions(true);
    if (!refreshed) {
      await updatePendingQueue(userId, (current) => {
        const existingIds = new Set(current.map((item) => item.id));
        return [...removedItems.filter((item) => !existingIds.has(item.id)), ...current]
          .sort((left, right) => left.created_at.localeCompare(right.created_at));
      });
      void fetchTransactions(false);
      throw new Error('FinAI could not refresh your account data, so the saved change was kept on this device. Try again when the connection is stable.');
    }
    return removedCount;
  }, [user?.id, isOnline, updatePendingQueue, fetchTransactions]);

  useEffect(() => {
    fetchTransactions(true);
  }, [fetchTransactions]);

  useEffect(() => {
    void syncPendingTransactions().catch(() => undefined);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncPendingTransactions().catch(() => undefined);
    });
    return () => subscription.remove();
  }, [syncPendingTransactions]);

  useEffect(() => {
    if (isOnline && wasOnline.current === false && user?.id) {
      void fetchTransactions(false);
      void syncPendingTransactions().catch(() => undefined);
    }
    wasOnline.current = isOnline;
  }, [isOnline, user?.id, fetchTransactions, syncPendingTransactions]);

  // Do not expose the previous account's in-memory data during the render before
  // the user-change effect clears it and loads the new account's cache.
  const hasCurrentUserData = Boolean(user?.id && activeUserId.current === user.id);
  const visibleTransactions = hasCurrentUserData ? transactions : [];
  const visibleCategories = hasCurrentUserData ? categories : [];
  const visibleAccounts = hasCurrentUserData ? accounts : [];
  const visibleBudgets = useMemo(() => {
    if (!hasCurrentUserData) return [];
    return budgets.map((budget) => {
      const start = budget.start_date || '';
      const end = budget.end_date || '';
      const spent = transactions.reduce((sum, transaction) => {
        if (transaction.type !== 'Expense' || transaction.goal_id || transaction.date < start || transaction.date > end) return sum;
        if (transaction.category_id && budget.category_id) return sum + (transaction.category_id === budget.category_id ? Number(transaction.amount) || 0 : 0);
        return sum + (transaction.category === budget.category_name ? Number(transaction.amount) || 0 : 0);
      }, 0);
      const limit = Number(budget.available_limit ?? budget.amount) || 0;
      return { ...budget, spent: Number(spent.toFixed(2)), remaining: Math.max(limit - spent, 0), percentage_used: limit > 0 ? Number(((spent / limit) * 100).toFixed(2)) : (spent > 0 ? 100 : 0) };
    });
  }, [budgets, transactions, hasCurrentUserData]);
  const visibleNotifications = hasCurrentUserData ? notifications : [];
  const visibleGoals = hasCurrentUserData ? goals : [];

  const getAccountBalance = useCallback((accountName: string) => {
    if (!hasCurrentUserData) return 0;
    const account = accounts.find((item) => item.name === accountName && item.account_role !== 'admin')
      || accounts.find((item) => item.name === accountName);
    const openingBalance = Number(account?.initial_balance) || 0;

    return transactions.reduce((total, transaction) => {
      const amount = Number.parseFloat(transaction.amount) || 0;
      if (transaction.type === 'Income' && transaction.account === accountName) return total + amount;
      if (transaction.type === 'Expense' && transaction.account === accountName) return total - amount;
      if (transaction.type === 'Contribution' && transaction.account === accountName) return total - amount;
      if (transaction.type === 'Goal Withdrawal' && transaction.account === accountName) return total + amount;
      if (transaction.type === 'Transfer') {
        if (transaction.account === accountName) total -= amount;
        if (transaction.to_account === accountName) total += amount;
      }
      return total;
    }, openingBalance);
  }, [accounts, hasCurrentUserData, transactions]);

  const addTransaction = async (amount: string, category: string, note: string, type: TransactionType, account: string, toAccount?: string, date?: string, scheduledBill?: { id: string; periodKey: string }) => {
    const userId = await AsyncStorage.getItem('user_id');
    if (!userId) throw new Error('Your session has expired. Please log in again.');
    if (scheduledBill) {
      const storedQueue = await AsyncStorage.getItem(pendingTransactionsKey(userId));
      let queue: PendingTransaction[] = [];
      try { queue = storedQueue ? JSON.parse(storedQueue) : []; } catch { queue = []; }
      if (Array.isArray(queue) && queue.some((item) =>
        item.payload?.scheduled_bill_id === scheduledBill.id
        && item.payload?.scheduled_bill_period_key === scheduledBill.periodKey,
      )) {
        throw new Error('BILL_PAYMENT_PENDING');
      }
    }
    const numericAmount = Number.parseFloat(amount) || 0;
    if ((type === 'Expense' || type === 'Transfer') && numericAmount > getAccountBalance(account)) {
      throw new Error('INSUFFICIENT_BALANCE');
    }

    const clientRequestId = makeClientRequestId();
    const payload = { user_id: userId, client_request_id: clientRequestId, amount: parseFloat(amount) || 0, category, title: note, item_name: note, note, type, account, to_account: toAccount || null, date: date || getPhDateString(), ...(scheduledBill ? { scheduled_bill_id: scheduledBill.id, scheduled_bill_period_key: scheduledBill.periodKey } : {}) };

    // FIX: previously this whole block was wrapped in its own try/catch that showed an
    // Alert and then did NOT re-throw -- so a failed save still resolved the promise
    // normally, and two.tsx's handleSave would proceed straight to its own "Success!"
    // alert even though nothing was actually saved. Letting the error propagate here
    // (matching how it worked before the offline-mode changes) means two.tsx's existing
    // try/catch correctly shows a failure message instead of a false success.
    const savedTransaction: Transaction = {
      id: `pending:${clientRequestId}`,
      amount: String(Number(payload.amount)),
      category,
      category_id: categories.find((item) => item.name === category && item.type === type.toLowerCase())?.id,
      note,
      type,
      account,
      account_id: accounts.find((item) => item.name === account)?.id,
      to_account: toAccount || '',
      to_account_id: toAccount ? accounts.find((item) => item.name === toAccount)?.id : undefined,
      date: payload.date,
      client_request_id: clientRequestId,
      pending_sync: false,
    };

    const token = await getSecureItem('user_token');
    let result: any;
    try {
      const res = await fetch(`${API_URL}/add-expense`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` }, body: JSON.stringify(payload) });
      if (!res.ok) {
        if (res.status < 500) {
          const requestError = await transactionRequestError(res, 'Save failed. Please review the transaction and try again.');
          requestError.name = 'ApiRequestError';
          throw requestError;
        }
        const queueItem: PendingTransaction = { id: clientRequestId, payload, transaction: { ...savedTransaction, pending_sync: true }, created_at: new Date().toISOString() };
        await updatePendingQueue(userId, (queue) => [...queue, queueItem]);
        savedTransaction.pending_sync = true;
        result = { id: savedTransaction.id, notifications: [], pending_sync: true };
      } else {
        result = await res.json();
        if (!result?.id) throw new Error('The server did not confirm the saved transaction.');
        savedTransaction.id = String(result.id);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'ApiRequestError') throw error;
      const queueItem: PendingTransaction = { id: clientRequestId, payload, transaction: { ...savedTransaction, pending_sync: true }, created_at: new Date().toISOString() };
      await updatePendingQueue(userId, (queue) => [...queue, queueItem]);
      savedTransaction.pending_sync = true;
      result = { id: savedTransaction.id, notifications: [], pending_sync: true };
    }

    setTransactions((current) => [...current, savedTransaction]);
    try {
      const cachedTransactions = await AsyncStorage.getItem(cachedTransactionsKey(userId));
      const cachedRows: Transaction[] = cachedTransactions ? JSON.parse(cachedTransactions) : [];
      await AsyncStorage.setItem(cachedTransactionsKey(userId), JSON.stringify([...cachedRows, savedTransaction]));
    } catch { /* The server is authoritative for online saves; the next fetch rebuilds this cache. */ }
    if (!result.pending_sync) void fetchTransactions(false); // Refresh shared screens without delaying transaction feedback.
    if (result.pending_sync) {
      const pendingNotice: AppNotification = { id: clientRequestId, event_type: 'offline_pending', threshold: 0, level: 'pending', message: 'Saved on this device. Sync when you are back online.', is_read: false, created_at: new Date().toISOString() };
      const offlineAlerts = await createOfflineAlerts(userId, savedTransaction);
      return [pendingNotice, ...offlineAlerts];
    }
    return Array.isArray(result.notifications) ? result.notifications : [];
  };

  const updateTransaction = async (id: string, amount: string, category: string, note: string, type: TransactionType, account: string, toAccount?: string, date?: string, goalId?: string) => {
    const userId = await AsyncStorage.getItem('user_id');
    if (!userId) throw new Error('Your session has expired. Please log in again.');
    const cached = transactions.find((transaction) => transaction.id === id);
    if (!cached) throw new Error('This transaction is not available on this device. Refresh and try again.');
    if (cached.type === 'Contribution') {
      if (type !== 'Contribution' || !cached.goal_id || goalId !== cached.goal_id) throw new Error('A contribution must stay linked to its original savings goal.');
    } else if (type === 'Contribution') {
      throw new Error('Open a goal contribution to edit it.');
    }
    const payload = { user_id: userId, amount: parseFloat(amount) || 0, category, title: note, item_name: note, note, type, account, to_account: toAccount || null, date: date || getPhDateString(), goal_id: type === 'Contribution' ? goalId : undefined };

    const updatedTransaction: Transaction = {
      id, amount: String(Number(payload.amount)), category,
      category_id: categories.find((item) => item.name === category && item.type === type.toLowerCase())?.id,
      note, type, account, account_id: accounts.find((item) => item.name === account)?.id,
      to_account: toAccount || '', to_account_id: toAccount ? accounts.find((item) => item.name === toAccount)?.id : undefined,
      date: payload.date, goal_id: type === 'Contribution' ? goalId : undefined,
      client_request_id: cached.client_request_id,
    };
    if (!Number.isFinite(payload.amount) || payload.amount <= 0) throw new Error('Enter an amount greater than zero.');
    if (!accounts.some((item) => item.name === account)) throw new Error('This payment account is not available on this device.');
    if (type === 'Transfer') {
      if (!toAccount || !accounts.some((item) => item.name === toAccount)) throw new Error('Choose a destination account saved on this device.');
      if (account === toAccount) throw new Error('Choose two different accounts for a transfer.');
    }
    // The server checks balances for online edits. When offline, mirror the
    // current transaction out of the cached balance before validating its
    // replacement so an edit cannot locally spend the same money twice.
    if (!isOnline && (type === 'Expense' || type === 'Transfer' || type === 'Contribution')) {
      let available = getAccountBalance(account);
      const oldAmount = Number(cached.amount) || 0;
      if (cached.account === account) {
        if (cached.type === 'Income') available -= oldAmount;
        else if (cached.type === 'Expense' || cached.type === 'Contribution' || cached.type === 'Transfer') available += oldAmount;
      }
      if (cached.type === 'Transfer' && cached.to_account === account) available -= oldAmount;
      if (payload.amount > available) throw new Error('This change is more than the available balance saved on this device.');
    }
    const token = await getSecureItem('user_token');
    let result: any = {};
    try {
      if (id.startsWith('pending:') && cached.client_request_id) {
        await updatePendingQueue(userId, (queue) => queue.map((item) => item.id === cached.client_request_id ? { ...item, payload: { ...item.payload, ...payload }, transaction: { ...updatedTransaction, pending_sync: true }, sync_error: undefined, failed_at: undefined } : item));
        updatedTransaction.client_request_id = cached.client_request_id;
        updatedTransaction.pending_sync = true;
      } else {
        const updateRoute = type === 'Contribution' ? 'update-contribution' : 'update-expense';
        const res = await fetch(`${API_URL}/${updateRoute}/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` }, body: JSON.stringify(payload) });
        if (!res.ok && res.status < 500) {
          const requestError = await transactionRequestError(res, 'Update failed. Please review the transaction and try again.');
          requestError.name = 'ApiRequestError';
          throw requestError;
        }
        if (!res.ok) throw new Error('Network unavailable');
        result = await res.json();
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'ApiRequestError') throw error;
      const operationId = `transaction-update:${id}`;
      await updatePendingQueue(userId, (queue) => {
        const pendingCreate = queue.find((item) => item.id === cached.client_request_id && item.kind !== 'transaction.update');
        if (pendingCreate) return queue.map((item) => item.id === pendingCreate.id ? { ...item, payload: { ...item.payload, ...payload }, transaction: { ...updatedTransaction, pending_sync: true } } : item);
        return [...queue.filter((item) => !(item.kind === 'transaction.update' && item.localEntityId === id)), { id: operationId, kind: 'transaction.update', payload, localEntityId: id, created_at: new Date().toISOString() }];
      });
      updatedTransaction.pending_sync = true;
    }
    setTransactions((current) => current.map((transaction) => transaction.id === id ? updatedTransaction : transaction));
    await AsyncStorage.setItem(cachedTransactionsKey(userId), JSON.stringify(transactions.map((transaction) => transaction.id === id ? updatedTransaction : transaction)));
    if (type === 'Contribution' && goalId) {
      const contributionDelta = (Number(payload.amount) || 0) - (Number(cached.amount) || 0);
      const updatedGoals = goals.map((goal) => goal.id === goalId
        ? { ...goal, current_savings: Math.max(0, Number(goal.current_savings || 0) + contributionDelta) }
        : goal);
      setGoals(updatedGoals);
      await AsyncStorage.setItem(cachedGoalsKey(userId), JSON.stringify(updatedGoals));
    }
    if (!updatedTransaction.pending_sync) void fetchTransactions(false);
    return Array.isArray(result.notifications) ? result.notifications : [];
  };

  const archiveTransaction = async (id: string) => {
    const userId = await AsyncStorage.getItem('user_id');
    if (!userId) throw new Error('Your session has expired. Please sign in again.');
    const target = transactions.find((transaction) => transaction.id === id);
    if (!target) return;
    if (id.startsWith('pending:') && target.client_request_id) {
      await updatePendingQueue(userId, (queue) => queue.filter((item) => item.id !== target.client_request_id));
      if (target.goal_id && (target.type === 'Contribution' || target.type === 'Goal Withdrawal')) {
        const amount = Number(target.amount) || 0;
        const delta = target.type === 'Goal Withdrawal' ? amount : -amount;
        const updatedGoals = goals.map((goal) => goal.id === target.goal_id
          ? { ...goal, current_savings: Math.max(0, Number(goal.current_savings || 0) + delta) }
          : goal);
        setGoals(updatedGoals);
        await AsyncStorage.setItem(cachedGoalsKey(userId), JSON.stringify(updatedGoals));
      }
    } else {
      await updatePendingQueue(userId, (queue) => [...queue.filter((item) => !(item.kind === 'transaction.archive' && item.localEntityId === id)), { id: `transaction-archive:${id}`, kind: 'transaction.archive', payload: {}, localEntityId: id, created_at: new Date().toISOString() }]);
    }
    // Reflect the successful archive immediately so balances and totals update
    // without waiting for the full multi-endpoint background refresh.
    setTransactions((current) => current.filter((transaction) => transaction.id !== id));
    const next = transactions.filter((transaction) => transaction.id !== id);
    await AsyncStorage.setItem(cachedTransactionsKey(userId), JSON.stringify(next));
    if (!id.startsWith('pending:')) void syncPendingTransactions().catch(() => undefined);
  };

  const markNotificationRead = async (id: string) => {
    try {
      const token = await getSecureItem('user_token');
      const response = await fetch(`${API_URL}/api/notifications/${id}/read`, { method: 'PATCH', headers: { Authorization: `Bearer ${token || ''}` } });
      if (response.ok) {
        setNotifications((current) => current.map((item) => item.id === id ? { ...item, is_read: true } : item));
      }
    } catch (error) {
      if (!isExpectedNetworkError(error)) console.error('Notification read update failed unexpectedly:', error);
    }
  };

  const markAllNotificationsRead = async () => {
    try {
      const token = await getSecureItem('user_token');
      const response = await fetch(`${API_URL}/api/notifications/mark-all-read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token || ''}` },
      });
      if (!response.ok) throw new Error('Could not mark notifications as read. Please try again.');
      setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
    } catch (error) {
      Alert.alert('Could not update notifications', 'Please check your connection and try again.');
    }
  };

  const clearAllNotifications = async () => {
    try {
      const token = await getSecureItem('user_token');
      const response = await fetch(`${API_URL}/api/notifications/clear-all`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token || ''}` },
      });
      if (!response.ok) throw new Error('Could not clear notifications. Please try again.');
      setNotifications([]);
    } catch (error) {
      Alert.alert('Could not clear notifications', 'Please check your connection and try again.');
    }
  };

  const saveBudgetOfflineFirst = async (
    category_id: string,
    amount: number,
    period_type: Budget['period_type'],
    rollover_enabled = false,
    budget_kind: Budget['budget_kind'] = 'variable',
  ) => {
    const userId = await AsyncStorage.getItem('user_id');
    if (!userId) throw new Error('Your session has expired. Please log in again.');
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a valid budget amount.');
    const category = categories.find((item) => item.id === category_id);
    if (!category) throw new Error('This category is not available on this device. Connect to the internet and refresh categories first.');
    const period = currentBudgetPeriod(period_type);
    const existing = budgets.find((item) => item.category_id === category_id && item.period_type === period_type && item.period_key === period.period_key);
    const localEntityId = existing?.id || `offline-budget:${makeClientRequestId()}`;
    const payload = { user_id: userId, category_id, amount, period_type, rollover_enabled, budget_kind };
    const optimistic: Budget = {
      ...(existing || {} as Budget),
      id: localEntityId, category_id, category_name: category.name, amount, available_limit: amount,
      rollover_enabled, budget_kind, spent: existing?.spent || 0, remaining: Math.max(amount - (existing?.spent || 0), 0),
      percentage_used: amount ? Number((((existing?.spent || 0) / amount) * 100).toFixed(2)) : 0,
      period_type, period_key: period.period_key, start_date: period.start_date, end_date: period.end_date,
    };
    await updatePendingQueue(userId, (queue) => {
      const withoutSuperseded = queue.filter((item) => !(item.kind === 'budget.set' && item.payload.category_id === category_id && item.payload.period_type === period_type));
      return [...withoutSuperseded, { id: `budget:${category_id}:${period_type}`, kind: 'budget.set', payload, localEntityId, created_at: new Date().toISOString() }];
    });
    setBudgets((current) => {
      const withoutCurrentPeriod = current.filter((item) => !(item.category_id === category_id && item.period_type === period_type && item.period_key === period.period_key));
      return [...withoutCurrentPeriod, optimistic];
    });
    const cachedBudgetJson = await AsyncStorage.getItem(cachedBudgetsKey(userId));
    let cachedBudgetRows: Budget[] = [];
    try { cachedBudgetRows = cachedBudgetJson ? JSON.parse(cachedBudgetJson) : budgets; } catch { cachedBudgetRows = budgets; }
    await AsyncStorage.setItem(cachedBudgetsKey(userId), JSON.stringify([
      ...cachedBudgetRows.filter((item) => !(item.category_id === category_id && item.period_type === period_type && item.period_key === period.period_key)),
      optimistic,
    ]));
    try {
      await syncPendingTransactions();
      return await isPendingQueueEmpty(userId);
    } catch {
      return false;
    }
  };

  const setBudget = (category_id: string, amount: number, period_type: Budget['period_type'], rollover_enabled = false, budget_kind: Budget['budget_kind'] = 'variable') =>
    saveBudgetOfflineFirst(category_id, amount, period_type, rollover_enabled, budget_kind);

  const updateBudget = async (id: string, amount: number, rollover_enabled?: boolean, budget_kind?: 'fixed' | 'variable') => {
    const existing = budgets.find((item) => item.id === id);
    if (!existing) throw new Error('This budget is not available on this device. Refresh and try again.');
    return saveBudgetOfflineFirst(existing.category_id, amount, existing.period_type, rollover_enabled ?? existing.rollover_enabled ?? false, budget_kind || existing.budget_kind || 'variable');
  };

  const deleteBudget = async (id: string) => {
    const userId = await AsyncStorage.getItem('user_id');
    if (!userId) throw new Error('Your session has expired. Please sign in again.');
    if (!budgets.some((budget) => budget.id === id)) return;
    await updatePendingQueue(userId, (queue) => {
      if (id.startsWith('offline-budget:')) return queue.filter((item) => !(item.kind === 'budget.set' && item.localEntityId === id));
      return [...queue.filter((item) => !(item.kind === 'budget.delete' && item.localEntityId === id)), { id: `budget-delete:${id}`, kind: 'budget.delete', payload: {}, localEntityId: id, created_at: new Date().toISOString() }];
    });
    const next = budgets.filter((budget) => budget.id !== id);
    setBudgets(next);
    setNotifications((current) => current.filter((notification) => notification.budget_id !== id));
    await AsyncStorage.setItem(cachedBudgetsKey(userId), JSON.stringify(next));
    if (!id.startsWith('offline-budget:')) void syncPendingTransactions().catch(() => undefined);
  };

  const addGoal = async (name: string, target_amount: number, target_date: string, goal_type_id: string) => {
    const userId = await AsyncStorage.getItem('user_id');
    if (!userId) throw new Error('Your session has expired. Please sign in again, then retry.');
    if (!goalTypes.some((item) => item.id === goal_type_id)) throw new Error('Select a goal type that is already saved on this device.');
    const requestId = makeClientRequestId();
    const localId = `offline-goal:${requestId}`;
    const payload = { user_id: userId, client_request_id: requestId, goal_type_id, target_name: name, target_amount, current_savings: 0, target_date };
    const optimistic: Goal = { id: localId, user_id: userId, goal_type_id, target_name: name, target_amount, current_savings: 0, target_date, client_request_id: requestId };
    await updatePendingQueue(userId, (queue) => [...queue, { id: requestId, kind: 'goal.create', payload, localEntityId: localId, created_at: new Date().toISOString() }]);
    setGoals((current) => [...current, optimistic]);
    await AsyncStorage.setItem(cachedGoalsKey(userId), JSON.stringify([...goals, optimistic]));
    try { await syncPendingTransactions(); return await isPendingQueueEmpty(userId); } catch { return false; }
  };

  const updateGoal = async (id: string, name: string, target_amount: number, target_date: string, goal_type_id: string, current_savings = 0) => {
    const userId = await AsyncStorage.getItem('user_id');
    if (!userId) throw new Error('Your session has expired. Please sign in again, then retry.');
    const goal = goals.find((item) => item.id === id);
    if (!goal) throw new Error('This goal is not available on this device.');
    if (!goalTypes.some((item) => item.id === goal_type_id)) throw new Error('Select a goal type that is already saved on this device.');
    const payload = { user_id: userId, goal_type_id, target_name: name, target_amount, current_savings, target_date };
    const optimistic = { ...goal, ...payload };
    await updatePendingQueue(userId, (queue) => {
      const pendingCreate = queue.find((item) => item.kind === 'goal.create' && item.localEntityId === id);
      if (pendingCreate) return queue.map((item) => item === pendingCreate ? { ...item, payload: { ...item.payload, ...payload } } : item);
      const withoutOldUpdate = queue.filter((item) => !(item.kind === 'goal.update' && item.localEntityId === id));
      return [...withoutOldUpdate, { id: `goal-update:${id}`, kind: 'goal.update', payload, localEntityId: id, created_at: new Date().toISOString() }];
    });
    setGoals((current) => current.map((item) => item.id === id ? optimistic : item));
    await AsyncStorage.setItem(cachedGoalsKey(userId), JSON.stringify(goals.map((item) => item.id === id ? optimistic : item)));
    try { await syncPendingTransactions(); return await isPendingQueueEmpty(userId); } catch { return false; }
  };

  const deleteGoal = async (id: string) => {
    const userId = await AsyncStorage.getItem('user_id');
    if (!userId) throw new Error('Your session has expired. Please sign in again.');
    const goal = goals.find((item) => item.id === id);
    if (!goal) return;
    if (goal.current_savings > 0) throw new Error('Withdraw the remaining goal funds before permanently deleting this goal.');
    if (transactions.some((transaction) => transaction.goal_id === id)) throw new Error('This goal has linked transaction history, so it cannot be permanently deleted. Keep it in Archive to preserve its records.');
    await updatePendingQueue(userId, (queue) => {
      if (id.startsWith('offline-goal:')) return queue.filter((item) => item.localEntityId !== id);
      return [...queue.filter((item) => !(item.kind === 'goal.delete' && item.localEntityId === id)), { id: `goal-delete:${id}`, kind: 'goal.delete', payload: {}, localEntityId: id, created_at: new Date().toISOString() }];
    });
    const next = goals.filter((item) => item.id !== id);
    setGoals(next);
    await AsyncStorage.setItem(cachedGoalsKey(userId), JSON.stringify(next));
    if (!id.startsWith('offline-goal:')) void syncPendingTransactions().catch(() => undefined);
  };

  const archiveGoal = async (id: string) => {
    const userId = await AsyncStorage.getItem('user_id');
    if (!userId) throw new Error('Your session has expired. Please sign in again.');
    await updatePendingQueue(userId, (queue) => [...queue.filter((item) => !(item.kind === 'goal.archive' && item.localEntityId === id)), { id: `goal-archive:${id}`, kind: 'goal.archive', payload: {}, localEntityId: id, created_at: new Date().toISOString() }]);
    const next = goals.filter((goal) => goal.id !== id);
    setGoals(next);
    await AsyncStorage.setItem(cachedGoalsKey(userId), JSON.stringify(next));
    if (!id.startsWith('offline-goal:')) void syncPendingTransactions().catch(() => undefined);
  };

  const completeGoal = async (id: string): Promise<boolean> => {
    const token = await getSecureItem('user_token');
    if (!token) throw new Error('Your session has expired. Please sign in again.');
    let response: Response;
    try {
      response = await fetch(`${API_URL}/api/goals/${encodeURIComponent(id)}/complete`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${token}` },
      });
    } catch (error) {
      throw new Error(userFacingError(error, 'Could not mark this goal complete. Check your connection and try again.'));
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'Could not mark this goal complete. Check your connection and try again.');
    const completedAt = typeof body.completed_at === 'string' ? body.completed_at : new Date().toISOString();
    const updatedGoals = goals.map((goal) => goal.id === id ? { ...goal, status: 'completed' as const, completed_at: completedAt } : goal);
    setGoals(updatedGoals);
    const userId = await AsyncStorage.getItem('user_id');
    if (userId) await AsyncStorage.setItem(cachedGoalsKey(userId), JSON.stringify(updatedGoals));
    return true;
  };

  const depositToGoal = async (goalId: string, amount: number, account: string): Promise<'synced' | 'pending' | false> => {
    const currentBalance = getAccountBalance(account);
    if (amount <= 0 || amount > currentBalance) {
      Alert.alert('Insufficient balance', `Your ${account} account has ₱${currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}, which is not enough for this contribution.`);
      return false;
    }
    const userId = await AsyncStorage.getItem('user_id');
    if (!userId) { Alert.alert('Sign-in required', 'Your session has expired. Please sign in again.'); return false; }
    const goal = goals.find((item) => item.id === goalId);
    if (!goal) { Alert.alert('Goal unavailable', 'This goal is not saved on this device. Connect to the internet and refresh your goals.'); return false; }
    if (goal.status === 'target_reached' || goal.status === 'completed' || goal.current_savings >= goal.target_amount) {
      Alert.alert('Target reached', 'This goal no longer accepts contributions. You can withdraw its funds or mark it complete.');
      return false;
    }
    if (!accounts.some((item) => item.name === account)) { Alert.alert('Account unavailable', 'This account is not saved on this device.'); return false; }

    const requestId = makeClientRequestId();
    const contributionDate = getPhDateString();
    const payload = { user_id: userId, client_request_id: requestId, amount, account, date: contributionDate };
    const transaction: Transaction = {
      id: `pending:${requestId}`, amount: String(amount), category: 'Goal Contribution',
      note: `Contribution for ${goal.target_name}`, type: 'Contribution', account,
      account_id: accounts.find((item) => item.name === account)?.id, date: contributionDate,
      goal_id: goalId, client_request_id: requestId, pending_sync: true,
    };
    await updatePendingQueue(userId, (queue) => [...queue, {
      id: requestId, kind: 'goal.deposit', payload, localEntityId: goalId, transaction,
      created_at: new Date().toISOString(),
    }]);
    const newSavings = goal.current_savings + amount;
    const reachedTarget = newSavings >= goal.target_amount;
    const updatedGoals = goals.map((item) => item.id === goalId ? {
      ...item, current_savings: newSavings,
      ...(reachedTarget ? { status: 'target_reached' as const, target_reached_at: new Date().toISOString() } : {}),
    } : item);
    setGoals(updatedGoals);
    const updatedTransactions = [...transactions, transaction];
    setTransactions(updatedTransactions);
    await Promise.all([
      AsyncStorage.setItem(cachedGoalsKey(userId), JSON.stringify(updatedGoals)),
      AsyncStorage.setItem(cachedTransactionsKey(userId), JSON.stringify(updatedTransactions)),
    ]);
    try { await syncPendingTransactions(); } catch { /* Keep the contribution queued for the next sync. */ }
    return await isPendingQueueEmpty(userId) ? 'synced' : 'pending';
  };

  const withdrawFromGoal = async (goalId: string, amount: number, account: string): Promise<'synced' | 'pending' | false> => {
    const userId = await AsyncStorage.getItem('user_id');
    if (!userId) { Alert.alert('Sign-in required', 'Your session has expired. Please sign in again.'); return false; }
    const goal = goals.find((item) => item.id === goalId);
    if (!goal) { Alert.alert('Goal unavailable', 'This goal is not saved on this device. Connect to the internet and refresh your goals.'); return false; }
    if (amount <= 0 || amount > Number(goal.current_savings || 0)) {
      Alert.alert('Insufficient goal savings', `This goal has ₱${Number(goal.current_savings || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} available to withdraw.`);
      return false;
    }
    const selectedAccount = accounts.find((item) => item.name === account && item.account_role !== 'admin');
    if (!selectedAccount) { Alert.alert('Account unavailable', 'Choose an active account to receive the withdrawal.'); return false; }

    const requestId = makeClientRequestId();
    const movementDate = getPhDateString();
    const payload = { user_id: userId, client_request_id: requestId, amount, account, date: movementDate };
    const transaction: Transaction = {
      id: `pending:${requestId}`, amount: String(amount), category: 'Goal Withdrawal',
      note: `Withdrawal from ${goal.target_name}`, type: 'Goal Withdrawal', account,
      account_id: selectedAccount.id, date: movementDate, goal_id: goalId,
      client_request_id: requestId, pending_sync: true,
    };
    await updatePendingQueue(userId, (queue) => [...queue, {
      id: requestId, kind: 'goal.withdraw', payload, localEntityId: goalId, transaction,
      created_at: new Date().toISOString(),
    }]);
    const updatedGoals = goals.map((item) => item.id === goalId ? { ...item, current_savings: Math.max(0, item.current_savings - amount) } : item);
    const updatedTransactions = [...transactions, transaction];
    setGoals(updatedGoals);
    setTransactions(updatedTransactions);
    await Promise.all([
      AsyncStorage.setItem(cachedGoalsKey(userId), JSON.stringify(updatedGoals)),
      AsyncStorage.setItem(cachedTransactionsKey(userId), JSON.stringify(updatedTransactions)),
    ]);
    try { await syncPendingTransactions(); } catch { /* Keep the withdrawal queued for the next sync. */ }
    return await isPendingQueueEmpty(userId) ? 'synced' : 'pending';
  };

  const totalIncome = useMemo(() => visibleTransactions.filter(t => t.type === 'Income').reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0), [visibleTransactions]);
  const totalExpense = useMemo(() => visibleTransactions.filter(t => t.type === 'Expense' && !t.goal_id).reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0), [visibleTransactions]);

  const totalSavings = useMemo(() => {
    if (!hasCurrentUserData) return 0;
    return visibleGoals.reduce((sum, goal) => sum + (Number(goal.current_savings) || 0), 0) + archivedGoalSavings;
  }, [visibleGoals, archivedGoalSavings, hasCurrentUserData]);

  const balance = useMemo(() => {
    if (!hasCurrentUserData) return 0;
    const accountNames = [...new Set(visibleAccounts.map((account) => account.name))];

    // Archived accounts remain in transaction history, but they are not active
    // tracked wallets and therefore do not contribute to the dashboard balance.
    return accountNames.reduce((total, accountName) => total + getAccountBalance(accountName), 0);
  }, [visibleAccounts, getAccountBalance, hasCurrentUserData]);

  const displayedPendingChanges = pendingChanges.map((item) => {
    const budget = budgets.find((candidate) => candidate.id === item.localEntityId || candidate.category_id === item.detail);
    const goal = goals.find((candidate) => candidate.id === item.localEntityId);
    const category = categories.find((candidate) => candidate.id === item.detail || candidate.id === budget?.category_id);
    return { ...item, detail: category?.name || budget?.category_name || goal?.target_name || item.detail };
  });

  return (
    <TransactionContext.Provider value={{ transactions: visibleTransactions, categories: visibleCategories, accounts: visibleAccounts, budgets: visibleBudgets, notifications: visibleNotifications, transactionToast: hasCurrentUserData ? transactionToast : null, showTransactionToast, clearTransactionToast, goals: visibleGoals, goalTypes, isLoading, isRefreshing, pendingTransactionCount, pendingChanges: displayedPendingChanges, failedPendingChangeCount: pendingChanges.filter((item) => Boolean(item.sync_error)).length, syncPendingTransactions, retryPendingChange, discardFailedPendingChange, addTransaction, updateTransaction, archiveTransaction, updateBudget, setBudget, deleteBudget, addGoal, updateGoal, deleteGoal, archiveGoal, completeGoal, depositToGoal, withdrawFromGoal, getAccountBalance, totalIncome, totalExpense, totalSavings, balance, fetchTransactions, markNotificationRead, markAllNotificationsRead, clearAllNotifications }}>
      {children}
    </TransactionContext.Provider>
  );
};

export const useTransactions = () => {
  const context = useContext(TransactionContext);
  if (!context) throw new Error('useTransactions must be used within a TransactionProvider');
  return context;
};
