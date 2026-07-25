// finai-frontend/context/TransactionContext.tsx
import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config'; 

export type TransactionType = 'Income' | 'Expense' | 'Transfer';
export type Transaction = { id: string; amount: string; category: string; note: string; type: TransactionType; account: string; to_account?: string; date: string; };
export type Category = { id: string; name: string; type: string; icon: string; };
export type Account = { id: string; name: string; initial_balance: number; icon: string; };
export type Budget = { id: string; category_id: string; amount: number; spent: number; month_year: string; };

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
  goals: Goal[];
  isLoading: boolean;
  addTransaction: (amount: string, category: string, note: string, type: TransactionType, account: string, toAccount?: string, date?: string) => Promise<void>;
  updateTransaction: (id: string, amount: string, category: string, note: string, type: TransactionType, account: string, toAccount?: string, date?: string) => Promise<void>; 
  deleteTransaction: (id: string) => Promise<void>;
  updateBudget: (id: string, amount: number) => Promise<void>;
  deleteBudget: (id: string) => Promise<void>;
  addGoal: (name: string, target_amount: number, target_date: string, goal_type_id: string) => Promise<void>;
  updateGoal: (id: string, name: string, target_amount: number, target_date: string, goal_type_id: string, current_savings?: number) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
  depositToGoal: (goalId: string, amount: number, account: string) => Promise<boolean>;
  getAccountBalance: (name: string) => number;
  totalIncome: number; 
  totalExpense: number; 
  balance: number;
  fetchTransactions: () => Promise<void>;
};

const TransactionContext = createContext<TransactionContextType | undefined>(undefined);

export const TransactionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTransactions = useCallback(async () => {
    setIsLoading(true);
    try {
      const userId = await AsyncStorage.getItem('user_id');
      if (!userId) { setIsLoading(false); return; }

      const [transRes, catRes, accRes, budRes, goalsRes] = await Promise.all([
        fetch(`${API_URL}/get-expenses?user_id=${userId}`).then(res => res.json()),
        fetch(`${API_URL}/api/categories/?user_id=${userId}`).then(res => res.json()), 
        fetch(`${API_URL}/api/accounts?user_id=${userId}`).then(res => res.json()),    
        fetch(`${API_URL}/api/budgets/get-all/${userId}`).then(res => res.json()),
        fetch(`${API_URL}/api/goals/?user_id=${userId}`).then(res => res.ok ? res.json() : [])
      ]);

      if (transRes.status === "Success" && Array.isArray(transRes.data)) {
        setTransactions(transRes.data.map((i: any) => ({
          id: i._id || i.id, amount: i.amount?.toString() || '0', category: i.category || 'General',
          note: i.title || i.note || i.item_name || i.category || '', type: i.type || 'Expense',
          account: i.account || 'Cash', to_account: i.to_account || '', date: i.date || new Date().toISOString().split('T')[0]
        })));
      }
      
      const parsedBudgets = Array.isArray(budRes) ? budRes : (budRes.data || []);
      setBudgets(parsedBudgets.map((b: any) => ({ ...b, id: b._id || b.id })));
      
      const parsedCategories = Array.isArray(catRes) ? catRes : (catRes.data || []);
      setCategories(parsedCategories.map((c: any) => ({ ...c, id: c._id || c.id })));
      
      const parsedAccounts = Array.isArray(accRes) ? accRes : (accRes.data || []);
      setAccounts(parsedAccounts.map((a: any) => ({ ...a, id: a._id || a.id })));
      
      const parsedGoals = Array.isArray(goalsRes) ? goalsRes : (goalsRes.data || []);
      setGoals(parsedGoals.map((g: any) => ({ ...g, id: g._id || g.id })));
      
    } catch (e) { console.error("Fetch Error:", e); } finally { setIsLoading(false); }
  }, []);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  const getAccountBalance = useCallback((accountName: string) => {
    return transactions.reduce((total, t) => {
      if (t.account === accountName) {
        return total + (t.type === 'Income' ? parseFloat(t.amount) : -parseFloat(t.amount));
      }
      return total;
    }, 0);
  }, [transactions]);

  const addTransaction = async (amount: string, category: string, note: string, type: TransactionType, account: string, toAccount?: string, date?: string) => {
    const userId = await AsyncStorage.getItem('user_id');
    if (!userId) return;
    const payload = { user_id: userId, amount: parseFloat(amount) || 0, category, title: note, item_name: note, note, type, account, to_account: toAccount || null, date: date || new Date().toISOString().split('T')[0] };
    const res = await fetch(`${API_URL}/add-expense`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (res.ok) fetchTransactions(); else Alert.alert("Error", "Save failed.");
  };

  const updateTransaction = async (id: string, amount: string, category: string, note: string, type: TransactionType, account: string, toAccount?: string, date?: string) => {
    const userId = await AsyncStorage.getItem('user_id');
    if (!userId) return;
    const payload = { user_id: userId, amount: parseFloat(amount) || 0, category, title: note, item_name: note, note, type, account, to_account: toAccount || null, date: date || new Date().toISOString().split('T')[0] };
    const res = await fetch(`${API_URL}/update-expense/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (res.ok) fetchTransactions(); else Alert.alert("Error", "Update failed.");
  };

  const deleteTransaction = async (id: string) => {
    if ((await fetch(`${API_URL}/delete-expense/${id}`, { method: 'DELETE' })).ok) fetchTransactions();
  };

  const updateBudget = async (id: string, amount: number) => {
    try {
      const res = await fetch(`${API_URL}/api/budgets/update/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount }) });
      if (res.ok) fetchTransactions(); else Alert.alert("Error", "Failed to update budget.");
    } catch (e) { console.error(e); }
  };

  const deleteBudget = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/api/budgets/delete/${id}`, { method: 'DELETE' });
      if (res.ok) fetchTransactions(); else Alert.alert("Error", "Failed to delete budget.");
    } catch (e) { console.error(e); }
  };

  const addGoal = async (name: string, target_amount: number, target_date: string, goal_type_id: string) => {
    try {
      const userId = await AsyncStorage.getItem('user_id');
      if (!userId) { Alert.alert("Error", "User session not found."); return; }
      const response = await fetch(`${API_URL}/api/goals/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, goal_type_id, target_name: name, target_amount, current_savings: 0, target_date }),
      });
      if (!response.ok) throw new Error('Failed to add goal');
      await fetchTransactions(); 
    } catch (error) { console.error("addGoal Error:", error); Alert.alert("Error", "Bumagsak ang pag-save ng goal."); }
  };

  const updateGoal = async (id: string, name: string, target_amount: number, target_date: string, goal_type_id: string, current_savings: number = 0) => {
    try {
      const userId = await AsyncStorage.getItem('user_id');
      if (!userId) { Alert.alert("Error", "User session not found."); return; }
      
      const response = await fetch(`${API_URL}/api/goals/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          user_id: userId, 
          goal_type_id, 
          target_name: name, 
          target_amount, 
          current_savings, 
          target_date 
        }),
      });

      if (!response.ok) throw new Error('Failed to update goal');
      await fetchTransactions(); 
    } catch (error) { 
      console.error("updateGoal Error:", error); 
      Alert.alert("Error", "Bumagsak ang pag-update ng goal."); 
    }
  };

  const deleteGoal = async (id: string) => {
    const res = await fetch(`${API_URL}/api/goals/${id}`, { method: 'DELETE' });
    if (res.ok) fetchTransactions(); else Alert.alert("Error", "Failed to delete.");
  };

  const depositToGoal = async (goalId: string, amount: number, account: string): Promise<boolean> => {
    try {
      const response = await fetch(`${API_URL}/api/goals/${goalId}/deposit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, account })
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to process deposit');
      }
      await fetchTransactions(); 
      return true;
    } catch (error: any) {
      console.error("depositToGoal Error:", error);
      Alert.alert("Deposit Error", error.message || "Hindi maiproseso ang hulog mo ngayon.");
      return false;
    }
  };

  const totalIncome = useMemo(() => transactions.filter(t => t.type === 'Income').reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0), [transactions]);
  const totalExpense = useMemo(() => transactions.filter(t => t.type === 'Expense').reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0), [transactions]);
  const balance = useMemo(() => totalIncome - totalExpense, [totalIncome, totalExpense]);

  return (
    <TransactionContext.Provider value={{ transactions, categories, accounts, budgets, goals, isLoading, addTransaction, updateTransaction, deleteTransaction, updateBudget, deleteBudget, addGoal, updateGoal, deleteGoal, depositToGoal, getAccountBalance, totalIncome, totalExpense, balance, fetchTransactions }}>
      {children}
    </TransactionContext.Provider>
  );
};

export const useTransactions = () => {
  const context = useContext(TransactionContext);
  if (!context) throw new Error('useTransactions must be used within a TransactionProvider');
  return context;
};