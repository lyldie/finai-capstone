// finai-frontend/context/TransactionContext.tsx
import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config';
import { useAuth } from './AuthContext';
import { getSecureItem } from '../utils/secureStorage';


export type TransactionType = 'Income' | 'Expense' | 'Transfer' | 'Contribution';
export type Transaction = { id: string; amount: string; category: string; category_id?: string; note: string; type: TransactionType; account: string; account_id?: string; to_account?: string; to_account_id?: string; date: string; goal_id?: string; };
export type Category = { id: string; name: string; type: string; icon: string; };
export type GoalTypePreset = { id: string; name: string; icon?: string };
export type Account = { id: string; name: string; initial_balance: number; current_balance?: number; icon: string; user_id?: string | null; account_role?: 'admin' | 'user'; parent_template_id?: string | null; };
export type Budget = { id: string; category_id: string; category_name?: string; amount: number; available_limit?: number; rollover_enabled?: boolean; budget_kind?: 'fixed' | 'variable'; rollover_in?: number; rollover_out?: number; spent: number; remaining?: number; percentage_used?: number; period_type: 'weekly' | 'monthly' | 'annual'; period_key: string; start_date?: string; end_date?: string; month_year?: string; };
export type AppNotification = { id: string; budget_id?: string | null; category_id?: string | null; category_name?: string; event_type?: 'budget_threshold' | 'spending_spike' | string; title?: string; current_amount?: number; baseline_amount?: number; change_amount?: number; change_percent?: number; threshold: number; percentage_used?: number; level: string; message: string; is_read: boolean; created_at: string; advisor_conversation_id?: string };
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
  addTransaction: (amount: string, category: string, note: string, type: TransactionType, account: string, toAccount?: string, date?: string) => Promise<AppNotification[]>;
  updateTransaction: (id: string, amount: string, category: string, note: string, type: TransactionType, account: string, toAccount?: string, date?: string) => Promise<AppNotification[]>;
  archiveTransaction: (id: string) => Promise<void>;
  updateBudget: (id: string, amount: number, rollover_enabled?: boolean, budget_kind?: 'fixed' | 'variable') => Promise<void>;
  deleteBudget: (id: string) => Promise<void>;
  addGoal: (name: string, target_amount: number, target_date: string, goal_type_id: string) => Promise<void>;
  updateGoal: (id: string, name: string, target_amount: number, target_date: string, goal_type_id: string, current_savings?: number) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
  archiveGoal: (id: string) => Promise<void>;
  depositToGoal: (goalId: string, amount: number, account: string) => Promise<boolean>;
  getAccountBalance: (name: string) => number;
  totalIncome: number;
  totalExpense: number;
  totalSavings: number;
  balance: number;
  fetchTransactions: (showLoading?: boolean) => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  clearAllNotifications: () => Promise<void>;
};

const TransactionContext = createContext<TransactionContextType | undefined>(undefined);

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
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [transactionToast, setTransactionToast] = useState<TransactionToastNotice | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [archivedGoalSavings, setArchivedGoalSavings] = useState(0);
  const [goalTypes, setGoalTypes] = useState<GoalTypePreset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const activeUserId = useRef<string | null>(null);
  const fetchRequestId = useRef(0);
  const foregroundRequestActive = useRef(false);
  const showTransactionToast = useCallback((notice: Omit<TransactionToastNotice, 'id'>) => {
    setTransactionToast({ ...notice, id: `${Date.now()}-${Math.random().toString(36).slice(2)}` });
  }, []);
  const clearTransactionToast = useCallback(() => setTransactionToast(null), []);

  // Option for silent refresh (showLoading = false) para iwas flicker sa UI
  const fetchTransactions = useCallback(async (showLoading = true) => {
    // A screen-focus refresh must not invalidate the initial load: doing so would
    // leave the shared loading state true because silent refreshes never clear it.
    if (!showLoading && foregroundRequestActive.current) return;
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
        return;
      }
      if (activeUserId.current !== userId) {
        activeUserId.current = userId;
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
      const budgetCacheKey = `@offline_${userId}_budgets`;
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
      const [cachedTrans, cachedBudgets, cachedAccounts] = await Promise.all([
        readCachedArray(transactionCacheKey), readCachedArray(budgetCacheKey), readCachedArray(accountCacheKey),
      ]);
      if (requestId !== fetchRequestId.current || activeUserId.current !== userId) return;

      // Offline data is partitioned by authenticated user so another account on the
      // same device can never briefly see the previous user's cached financial records.
      if (cachedTrans) setTransactions(cachedTrans);
      if (cachedBudgets) setBudgets(cachedBudgets);
      if (cachedAccounts) setAccounts(cachedAccounts);
      // First render this user's own cached financial data; keep the network sync
      // running in the background so returning users don't wait on every endpoint.
      if (showLoading && cachedTrans !== null) setIsLoading(false);

      // 2. BACKGROUND SYNC: Subukan kunin ang latest sa server nang may safe fallbacks
      const fetchAllTransactions = async () => {
        const all: any[] = [];
        let offset = 0;
        while (true) {
          const response = await fetch(`${API_URL}/get-expenses?user_id=${userId}&limit=500&offset=${offset}`, { headers: authHeaders });
          if (!response.ok) throw new Error('Could not load transaction history.');
          const page = await response.json();
          if (page.status !== 'Success' || !Array.isArray(page.data)) throw new Error('Invalid transaction history response.');
          all.push(...page.data);
          if (!page.has_more || page.data.length === 0) return { status: 'Success', data: all };
          offset += page.data.length;
        }
      };
      const [transRes, catRes, accRes, budRes, goalsRes, archivedGoalsRes, notificationRes, goalTypesRes] = await Promise.all([
        fetchAllTransactions(),
        fetch(`${API_URL}/api/categories/?user_id=${userId}`, { headers: authHeaders }).then(res => res.ok ? res.json() : []).catch(() => []),
        fetch(`${API_URL}/api/accounts/user/${userId}`, { headers: authHeaders }).then(res => res.ok ? res.json() : []).catch(() => []),
        fetch(`${API_URL}/api/budgets/get-all/${userId}`, { headers: authHeaders }).then(res => res.ok ? res.json() : []).catch(() => []),
        fetch(`${API_URL}/api/goals/?user_id=${userId}`, { headers: authHeaders }).then(res => res.ok ? res.json() : []).catch(() => []),
        fetch(`${API_URL}/api/goals/?user_id=${userId}&archived=true`, { headers: authHeaders }).then(res => res.ok ? res.json() : []).catch(() => []),
        fetch(`${API_URL}/api/notifications/${userId}`, { headers: authHeaders }).then(res => res.ok ? res.json() : []).catch(() => []),
        fetch(`${API_URL}/api/goal-types/`).then(res => res.ok ? res.json() : []).catch(() => [])
      ]);

      if (requestId !== fetchRequestId.current || activeUserId.current !== userId) return;

      const parsedAccounts = Array.isArray(accRes) ? accRes : (accRes.data || []);
      const formattedAccounts = parsedAccounts.map((a: any) => ({ ...a, id: a._id || a.id }));
      setAccounts(formattedAccounts);
      await AsyncStorage.setItem(accountCacheKey, JSON.stringify(formattedAccounts)); // Cache

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
          date: i.date ? i.date.split('T')[0] : getPhDateString() // Ginamit ang PH time helper
        }));
        setTransactions(formattedTrans);
        await AsyncStorage.setItem(transactionCacheKey, JSON.stringify(formattedTrans)); // Cache
      }

      const parsedBudgets = Array.isArray(budRes) ? budRes : (budRes.data || []);
      const formattedBudgets = parsedBudgets.map((b: any) => ({ ...b, id: b._id || b.id }));
      setBudgets(formattedBudgets);
      await AsyncStorage.setItem(budgetCacheKey, JSON.stringify(formattedBudgets)); // Cache

      const parsedCategories = Array.isArray(catRes) ? catRes : (catRes.data || []);
      setCategories(parsedCategories.map((c: any) => ({ ...c, id: c._id || c.id })));

      const parsedGoals = Array.isArray(goalsRes) ? goalsRes : (goalsRes.data || []);
      setGoals(parsedGoals.map((g: any) => ({ ...g, id: g._id || g.id })));

      const parsedArchivedGoals = Array.isArray(archivedGoalsRes) ? archivedGoalsRes : (archivedGoalsRes.data || []);
      setArchivedGoalSavings(parsedArchivedGoals.reduce((sum: number, goal: any) => sum + (Number(goal.current_savings) || 0), 0));

      const parsedGoalTypes = Array.isArray(goalTypesRes) ? goalTypesRes : (goalTypesRes.data || []);
      setGoalTypes(parsedGoalTypes.map((item: any) => ({ ...item, id: item._id || item.id })));

      const parsedNotifications = Array.isArray(notificationRes) ? notificationRes : (notificationRes.data || []);
      setNotifications(parsedNotifications.map((n: any) => ({ ...n, id: n._id || n.id })));

    } catch (e) {
      if (requestId !== fetchRequestId.current) return;
      // Kahit mag-error, may makikita pa ring data ang user dahil sa cache
      console.log("Offline mode active or network error:", e);
    } finally {
      if (showLoading && requestId === fetchRequestId.current) {
        foregroundRequestActive.current = false;
        setIsRefreshing(false);
        setIsLoading(false);
      }
    }
  }, [user?.id]);

  useEffect(() => {
    fetchTransactions(true);
  }, [fetchTransactions]);

  // Do not expose the previous account's in-memory data during the render before
  // the user-change effect clears it and loads the new account's cache.
  const hasCurrentUserData = Boolean(user?.id && activeUserId.current === user.id);
  const visibleTransactions = hasCurrentUserData ? transactions : [];
  const visibleCategories = hasCurrentUserData ? categories : [];
  const visibleAccounts = hasCurrentUserData ? accounts : [];
  const visibleBudgets = hasCurrentUserData ? budgets : [];
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
      if (transaction.type === 'Transfer') {
        if (transaction.account === accountName) total -= amount;
        if (transaction.to_account === accountName) total += amount;
      }
      return total;
    }, openingBalance);
  }, [accounts, hasCurrentUserData, transactions]);

  const addTransaction = async (amount: string, category: string, note: string, type: TransactionType, account: string, toAccount?: string, date?: string) => {
    const userId = await AsyncStorage.getItem('user_id');
    if (!userId) throw new Error('Your session has expired. Please log in again.');

    const payload = { user_id: userId, amount: parseFloat(amount) || 0, category, title: note, item_name: note, note, type, account, to_account: toAccount || null, date: date || getPhDateString() };

    // FIX: previously this whole block was wrapped in its own try/catch that showed an
    // Alert and then did NOT re-throw -- so a failed save still resolved the promise
    // normally, and two.tsx's handleSave would proceed straight to its own "Success!"
    // alert even though nothing was actually saved. Letting the error propagate here
    // (matching how it worked before the offline-mode changes) means two.tsx's existing
    // try/catch correctly shows a failure message instead of a false success.
    const token = await getSecureItem('user_token');
    const res = await fetch(`${API_URL}/add-expense`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` }, body: JSON.stringify(payload) });

    if (!res.ok) throw await transactionRequestError(res, 'Save failed. Please review the transaction and try again.');
    const result = await res.json();
    const savedTransaction: Transaction = {
      id: String(result.id),
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
    };
    setTransactions((current) => [...current, savedTransaction]);
    void fetchTransactions(false); // Refresh shared screens without delaying transaction feedback.
    return Array.isArray(result.notifications) ? result.notifications : [];
  };

  const updateTransaction = async (id: string, amount: string, category: string, note: string, type: TransactionType, account: string, toAccount?: string, date?: string) => {
    const userId = await AsyncStorage.getItem('user_id');
    if (!userId) throw new Error('Your session has expired. Please log in again.');

    const payload = { user_id: userId, amount: parseFloat(amount) || 0, category, title: note, item_name: note, note, type, account, to_account: toAccount || null, date: date || getPhDateString() };

    // FIX: same reasoning as addTransaction above -- let the error propagate instead of
    // swallowing it, so two.tsx's own error handling reflects what actually happened.
    const token = await getSecureItem('user_token');
    const res = await fetch(`${API_URL}/update-expense/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` }, body: JSON.stringify(payload) });
    if (!res.ok) throw await transactionRequestError(res, 'Update failed. Please review the transaction and try again.');
    const result = await res.json();
    const updatedTransaction: Transaction = {
      id,
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
    };
    setTransactions((current) => current.map((transaction) => transaction.id === id ? updatedTransaction : transaction));
    void fetchTransactions(false); // Refresh shared screens without delaying transaction feedback.
    return Array.isArray(result.notifications) ? result.notifications : [];
  };

  const archiveTransaction = async (id: string) => {
    const token = await getSecureItem('user_token');
    const res = await fetch(`${API_URL}/archive-expense/${id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token || ''}` } });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(typeof body.detail === 'string' ? body.detail : 'Could not archive this transaction. Please try again.');
    }
    // Reflect the successful archive immediately so balances and totals update
    // without waiting for the full multi-endpoint background refresh.
    setTransactions((current) => current.filter((transaction) => transaction.id !== id));
    void fetchTransactions(false);
  };

  const markNotificationRead = async (id: string) => {
    try {
      const token = await getSecureItem('user_token');
      const response = await fetch(`${API_URL}/api/notifications/${id}/read`, { method: 'PATCH', headers: { Authorization: `Bearer ${token || ''}` } });
      if (response.ok) {
        setNotifications((current) => current.map((item) => item.id === id ? { ...item, is_read: true } : item));
      }
    } catch (error) { console.error('Notification read error:', error); }
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
      console.error('Mark all notifications read error:', error);
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
      console.error('Clear notifications error:', error);
      Alert.alert('Could not clear notifications', 'Please check your connection and try again.');
    }
  };

  const updateBudget = async (id: string, amount: number, rollover_enabled?: boolean, budget_kind?: 'fixed' | 'variable') => {
    const userId = await AsyncStorage.getItem('user_id');
    if (!userId) throw new Error('Your session has expired. Please log in again.');
    const token = await getSecureItem('user_token');
    const res = await fetch(`${API_URL}/api/budgets/update/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` }, body: JSON.stringify({ amount, rollover_enabled, budget_kind, user_id: userId }) });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(typeof body.detail === 'string' ? body.detail : 'Failed to update budget. Please try again.');
    }
    void fetchTransactions(false);
  };

  const deleteBudget = async (id: string) => {
    try {
      const userId = await AsyncStorage.getItem('user_id');
      if (!userId) { Alert.alert('Sign-in required', 'Your session has expired. Please sign in again, then retry.'); return; }
      const token = await getSecureItem('user_token');
      const res = await fetch(`${API_URL}/api/budgets/delete/${id}?user_id=${encodeURIComponent(userId)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token || ''}` } });
      if (res.ok) {
        setBudgets((current) => current.filter((budget) => budget.id !== id));
        setNotifications((current) => current.filter((notification) => notification.budget_id !== id));
        void fetchTransactions(false);
      } else Alert.alert('Could not delete budget', 'The budget could not be deleted. Refresh your budgets and try again.');
    } catch (e) { console.error(e); Alert.alert('Could not delete budget', 'We couldn’t reach FinAI. Check your internet connection and try again.'); }
  };

  const addGoal = async (name: string, target_amount: number, target_date: string, goal_type_id: string) => {
    try {
      const userId = await AsyncStorage.getItem('user_id');
      if (!userId) throw new Error('Your session has expired. Please sign in again, then retry.');
      const token = await getSecureItem('user_token');
      const response = await fetch(`${API_URL}/api/goals/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` },
        body: JSON.stringify({ user_id: userId, goal_type_id, target_name: name, target_amount, current_savings: 0, target_date }),
      });
      if (!response.ok) {
        const message = response.status === 400
          ? 'Choose an active goal type from the list, then try again.'
          : response.status === 422
            ? 'Check the goal details and target date, then try again.'
            : response.status === 401
              ? 'Your session may have expired. Please sign in again, then retry.'
              : 'We couldn’t save this goal. Please try again.';
        throw new Error(message);
      }
      void fetchTransactions(false);
    } catch (error) {
      console.error('addGoal Error:', error);
      throw new Error(error instanceof Error ? error.message : 'We couldn’t save this goal. Please try again.');
    }
  };

  const updateGoal = async (id: string, name: string, target_amount: number, target_date: string, goal_type_id: string, current_savings: number = 0) => {
    try {
      const userId = await AsyncStorage.getItem('user_id');
      if (!userId) throw new Error('Your session has expired. Please sign in again, then retry.');
      const token = await getSecureItem('user_token');

      const response = await fetch(`${API_URL}/api/goals/${id}`, {
        method: 'PUT',
         headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` },
        body: JSON.stringify({
          user_id: userId,
          goal_type_id,
          target_name: name,
          target_amount,
          current_savings,
          target_date
        }),
      });

      if (!response.ok) {
        const message = response.status === 400
          ? 'Choose an active goal type from the list, then try again.'
          : response.status === 404
            ? 'This goal could not be found. Refresh the list and try again.'
            : response.status === 422
              ? 'Check the goal details and target date, then try again.'
              : 'We couldn’t update this goal. Please try again.';
        throw new Error(message);
      }
      void fetchTransactions(false);
    } catch (error) {
      console.error("updateGoal Error:", error);
      throw new Error(error instanceof Error ? error.message : 'We couldn’t update this goal. Please try again.');
    }
  };

  const deleteGoal = async (id: string) => {
    try {
      // FIX: the backend now requires and verifies user_id (ownership check on
      // DELETE /api/goals/{id}) so only the goal's owner can delete it.
      const userId = await AsyncStorage.getItem('user_id');
      if (!userId) { Alert.alert('Sign-in required', 'Your session has expired. Please sign in again, then retry.'); return; }
      const token = await getSecureItem('user_token');
      const res = await fetch(`${API_URL}/api/goals/${id}?user_id=${encodeURIComponent(userId)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token || ''}` } });
      if (res.ok) {
        setGoals((current) => current.filter((goal) => goal.id !== id));
        void fetchTransactions(false);
      } else Alert.alert('Could not delete goal', res.status === 404 ? 'This goal may already have been removed. Refresh the list and try again.' : 'The goal could not be deleted. Please try again.');
    } catch (e) {
      console.error('deleteGoal error:', e);
      Alert.alert('Could not delete goal', 'We couldn’t reach FinAI. Check your internet connection and try again.');
    }
  };

  const archiveGoal = async (id: string) => {
    try {
      const token = await getSecureItem('user_token');
      const response = await fetch(`${API_URL}/api/goals/${id}/archive`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token || ''}` },
      });
      if (response.ok) {
        setGoals((current) => current.filter((goal) => goal.id !== id));
        void fetchTransactions(false);
      }
      else {
        const error = await response.json().catch(() => ({}));
        const message = response.status === 404
          ? 'This goal could not be found. Refresh the list and try again.'
          : response.status === 401
            ? 'Your session may have expired. Please sign in again, then retry.'
            : 'The goal could not be archived. Please try again.';
        Alert.alert('Unable to archive goal', message);
      }
    } catch {
      Alert.alert('Unable to archive goal', 'Check your connection and try again.');
    }
  };

  const depositToGoal = async (goalId: string, amount: number, account: string): Promise<boolean> => {
    try {
      const currentBalance = getAccountBalance(account);
      if (amount > currentBalance) {
        Alert.alert(
          "Insufficient balance ⚠️",
          `Your ${account} account has ₱${currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}, which is not enough for this ₱${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} contribution.`
        );
        return false;
      }

      // FIX: the backend now requires and verifies user_id (ownership check on
      // PATCH /api/goals/{id}/deposit) -- previously this endpoint had NO ownership
      // check at all, so anyone with a goal_id could deposit into a different user's
      // goal and inject a fake transaction into their history.
      const userId = await AsyncStorage.getItem('user_id');
      if (!userId) { Alert.alert('Sign-in required', 'Your session has expired. Please sign in again, then retry.'); return false; }
      const token = await getSecureItem('user_token');

      const response = await fetch(`${API_URL}/api/goals/${goalId}/deposit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` },
        body: JSON.stringify({
          user_id: userId,
          amount: amount,
          account: account
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to process deposit');
      }

      void fetchTransactions(false); // Refresh shared screens without delaying the confirmed deposit.
      return true;
    } catch (error: any) {
      console.error("depositToGoal Error:", error);
      Alert.alert("Deposit Error", error.message || "Your contribution could not be processed. Please try again.");
      return false;
    }
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

  return (
    <TransactionContext.Provider value={{ transactions: visibleTransactions, categories: visibleCategories, accounts: visibleAccounts, budgets: visibleBudgets, notifications: visibleNotifications, transactionToast: hasCurrentUserData ? transactionToast : null, showTransactionToast, clearTransactionToast, goals: visibleGoals, goalTypes, isLoading, isRefreshing, addTransaction, updateTransaction, archiveTransaction, updateBudget, deleteBudget, addGoal, updateGoal, deleteGoal, archiveGoal, depositToGoal, getAccountBalance, totalIncome, totalExpense, totalSavings, balance, fetchTransactions, markNotificationRead, markAllNotificationsRead, clearAllNotifications }}>
      {children}
    </TransactionContext.Provider>
  );
};

export const useTransactions = () => {
  const context = useContext(TransactionContext);
  if (!context) throw new Error('useTransactions must be used within a TransactionProvider');
  return context;
};
