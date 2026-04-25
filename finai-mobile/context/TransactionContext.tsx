import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 1. Dagdagan natin ang Type para sa Income, Expense, at Transfer
export type TransactionType = 'Income' | 'Expense' | 'Transfer';

type Transaction = {
  id: string;
  amount: string;
  category: string;
  note: string;
  type: TransactionType; // New field!
  date: string;
};

type TransactionContextType = {
  transactions: Transaction[];
  addTransaction: (amount: string, category: string, note: string, type: TransactionType) => void;
  deleteTransaction: (id: string) => void;
  totalIncome: number;
  totalExpense: number;
  balance: number;
};

const TransactionContext = createContext<TransactionContextType | undefined>(undefined);

export const TransactionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  // Load data from phone storage
  useEffect(() => {
    const loadTransactions = async () => {
      try {
        const savedData = await AsyncStorage.getItem('@transactions');
        if (savedData) setTransactions(JSON.parse(savedData));
      } catch (e) {
        console.error("Failed to load transactions", e);
      }
    };
    loadTransactions();
  }, []);

  const saveToStorage = async (newList: Transaction[]) => {
    try {
      await AsyncStorage.setItem('@transactions', JSON.stringify(newList));
    } catch (e) {
      console.error("Failed to save", e);
    }
  };

  // 2. Updated Add Function: May 'type' na!
  const addTransaction = (amount: string, category: string, note: string, type: TransactionType) => {
    const newTransaction: Transaction = {
      id: Date.now().toString(),
      amount,
      category,
      note,
      type,
      date: new Date().toLocaleDateString(),
    };
    const updatedList = [newTransaction, ...transactions];
    setTransactions(updatedList);
    saveToStorage(updatedList);
  };

  const deleteTransaction = (id: string) => {
    const updatedList = transactions.filter(t => t.id !== id);
    setTransactions(updatedList);
    saveToStorage(updatedList);
  };

  // 3. COMPUTATIONS: Dito nagaganap ang magic para sa Dashboard
  const totalIncome = transactions
    .filter(t => t.type === 'Income')
    .reduce((sum, t) => sum + parseFloat(t.amount || '0'), 0);

  const totalExpense = transactions
    .filter(t => t.type === 'Expense')
    .reduce((sum, t) => sum + parseFloat(t.amount || '0'), 0);

  // Transfer ay hindi nakaka-apekto sa overall balance (pasa-pasa lang)
  const balance = totalIncome - totalExpense;

  return (
    <TransactionContext.Provider value={{ 
      transactions, 
      addTransaction, 
      deleteTransaction,
      totalIncome,
      totalExpense,
      balance 
    }}>
      {children}
    </TransactionContext.Provider>
  );
};

export const useTransactions = () => {
  const context = useContext(TransactionContext);
  if (!context) throw new Error('useTransactions must be used within a TransactionProvider');
  return context;
};