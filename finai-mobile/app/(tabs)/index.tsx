import React from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTransactions } from '../../context/TransactionContext';

export default function Dashboard() {
  // 1. KUNIN ANG DATA AT COMPUTATIONS MULA SA CONTEXT
  const { transactions, totalIncome, totalExpense, balance, deleteTransaction } = useTransactions();

  const getTransactionIcon = (type: string, category: string) => {
    if (type === 'Transfer') return 'swap-horizontal-outline';
    if (type === 'Income') return 'add-circle-outline';
    return 'cart-outline'; // Default for Expense
  };

  const getColor = (type: string) => {
    if (type === 'Income') return '#4facfe'; // Blue
    if (type === 'Expense') return '#ff4b2b'; // Red
    return '#9b59b6'; // Purple for Transfer
  };

  return (
    <View style={styles.container}>
      {/* TOTAL BALANCE CARD */}
      <View style={styles.balanceCard}>
        <View style={styles.statRow}>
          <View>
            <Text style={styles.statLabel}>Income</Text>
            <Text style={[styles.statValue, { color: '#4facfe' }]}>₱{totalIncome.toLocaleString()}</Text>
          </View>
          <View>
            <Text style={styles.statLabel}>Exp.</Text>
            <Text style={[styles.statValue, { color: '#ff4b2b' }]}>₱{totalExpense.toLocaleString()}</Text>
          </View>
          <View>
            <Text style={styles.statLabel}>Total Balance</Text>
            <Text style={styles.totalValue}>₱{balance.toLocaleString()}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Recent Activity</Text>

      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.transactionItem}>
            <View style={[styles.iconContainer, { backgroundColor: getColor(item.type) }]}>
              <Ionicons name={getTransactionIcon(item.type, item.category) as any} size={20} color="white" />
            </View>
            
            <View style={{ flex: 1, marginLeft: 15 }}>
              <Text style={styles.itemCategory}>{item.category}</Text>
              <Text style={styles.itemNote}>{item.note || item.date}</Text>
            </View>

            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.itemAmount, { color: getColor(item.type) }]}>
                {item.type === 'Income' ? '+' : item.type === 'Expense' ? '-' : ''} ₱{parseFloat(item.amount).toLocaleString()}
              </Text>
              <TouchableOpacity onPress={() => deleteTransaction(item.id)}>
                <Ionicons name="trash-outline" size={16} color="#444" style={{ marginTop: 5 }} />
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={{ color: '#666', textAlign: 'center', marginTop: 50 }}>Wala pang records, paps! 🚀</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', padding: 20 },
  balanceCard: { 
    backgroundColor: '#1e1e1e', 
    borderRadius: 20, 
    padding: 25, 
    marginTop: 40, 
    marginBottom: 30,
    elevation: 4
  },
  statRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statLabel: { color: '#888', fontSize: 12, marginBottom: 5 },
  statValue: { fontSize: 16, fontWeight: 'bold' },
  totalValue: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  sectionTitle: { color: 'white', fontSize: 16, fontWeight: 'bold', marginBottom: 15 },
  transactionItem: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#1a1a1a', 
    padding: 15, 
    borderRadius: 15, 
    marginBottom: 10 
  },
  iconContainer: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  itemCategory: { color: 'white', fontSize: 15, fontWeight: '600' },
  itemNote: { color: '#666', fontSize: 12 },
  itemAmount: { fontSize: 15, fontWeight: 'bold' },
});