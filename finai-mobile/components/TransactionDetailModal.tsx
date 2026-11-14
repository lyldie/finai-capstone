import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Transaction } from '../context/TransactionContext';
import { displayTransactionNote } from '../utils/transactionNote';

const GREEN = '#1c3c36';
const TEAL = '#3D7D6C';
const SAGE = '#718780';
const CREAM = '#FAF7F2';

type Props = {
  transaction: Transaction | null;
  goalName?: string;
  onClose: () => void;
  onEdit?: (transaction: Transaction) => void;
  onArchive?: (transaction: Transaction) => void;
  onViewGoals?: () => void;
};

const formatAmount = (value: string) => `₱${(Number(value) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function TransactionDetailModal({ transaction, goalName, onClose, onEdit, onArchive, onViewGoals }: Props) {
  if (!transaction) return null;
  const withdrawal = transaction.type === 'Goal Withdrawal';
  const contribution = !withdrawal && (transaction.type === 'Contribution' || Boolean(transaction.goal_id));
  const transfer = transaction.type === 'Transfer';
  const income = transaction.type === 'Income';
  const title = contribution ? 'Goal contribution' : withdrawal ? 'Goal withdrawal' : transfer ? 'Transfer' : transaction.category;
  const amountPrefix = transfer ? '' : income || withdrawal ? '+' : '−';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => undefined}>
          <View style={styles.header}>
            <View style={styles.titleWrap}>
              <Text style={styles.eyebrow}>{contribution || withdrawal ? 'SAVINGS MOVEMENT' : 'TRANSACTION'}</Text>
              <Text style={styles.title} numberOfLines={1}>{title}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel="Close transaction details">
              <Ionicons name="close" size={20} color={GREEN} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.amount, { color: income || contribution || withdrawal ? TEAL : GREEN }]}>{amountPrefix}{formatAmount(transaction.amount)}</Text>

          <View style={styles.details}>
            <Detail label={contribution || withdrawal ? 'Goal' : 'Category'} value={contribution || withdrawal ? (goalName || displayTransactionNote(transaction.note).replace(/^Contribution to goal:\s*/i, '') || 'Savings goal') : transaction.category} />
            <Detail label={transfer ? 'From' : 'Account'} value={transaction.account || '—'} />
            {transfer ? <Detail label="To" value={transaction.to_account || '—'} /> : null}
            <Detail label="Date" value={transaction.date} />
            {transaction.note && !contribution ? <Detail label="Note" value={transaction.note} /> : null}
          </View>

          {contribution ? <Text style={styles.helper}>This moved money from your account into savings. It is not an expense.</Text> : null}
          {withdrawal ? <Text style={styles.helper}>This returned money from your goal savings to your account. It is not income.</Text> : null}

          <View style={styles.actions}>
            {contribution ? (
              <>
                {onEdit ? <TouchableOpacity style={styles.primaryButton} onPress={() => onEdit(transaction)} accessibilityRole="button">
                  <Ionicons name="pencil-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.primaryText}>Edit contribution</Text>
                </TouchableOpacity> : null}
                {onViewGoals ? <TouchableOpacity style={styles.secondaryButton} onPress={onViewGoals} accessibilityRole="button">
                  <Ionicons name="flag-outline" size={16} color={GREEN} />
                  <Text style={styles.secondaryText}>View savings goals</Text>
                </TouchableOpacity> : null}
              </>
            ) : withdrawal ? (
              onViewGoals ? <TouchableOpacity style={styles.secondaryButton} onPress={onViewGoals} accessibilityRole="button"><Ionicons name="flag-outline" size={16} color={GREEN} /><Text style={styles.secondaryText}>View savings goals</Text></TouchableOpacity> : null
            ) : onEdit ? (
              <TouchableOpacity style={styles.primaryButton} onPress={() => onEdit(transaction)} accessibilityRole="button">
                <Ionicons name="pencil-outline" size={16} color="#FFFFFF" />
                <Text style={styles.primaryText}>Edit transaction</Text>
              </TouchableOpacity>
            ) : null}
            {onArchive ? <TouchableOpacity style={styles.archiveButton} onPress={() => onArchive(transaction)} accessibilityRole="button">
              <Ionicons name="archive-outline" size={16} color="#A33B34" />
              <Text style={styles.archiveText}>Archive transaction</Text>
            </TouchableOpacity> : null}
            <TouchableOpacity style={styles.cancelButton} onPress={onClose} accessibilityRole="button"><Text style={styles.cancelText}>Close</Text></TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <View style={styles.detailRow}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue} numberOfLines={2}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(13, 34, 30, 0.46)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 420, borderRadius: 24, padding: 20, backgroundColor: CREAM, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  titleWrap: { flex: 1 }, eyebrow: { color: SAGE, fontSize: 10, fontWeight: '900', letterSpacing: 1 }, title: { color: GREEN, fontSize: 19, fontWeight: '900', marginTop: 3 },
  close: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  amount: { fontSize: 28, fontWeight: '900', marginTop: 18, marginBottom: 16 },
  details: { borderRadius: 16, backgroundColor: '#FFFFFF', paddingHorizontal: 14 },
  detailRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E6EAE6' },
  detailLabel: { color: SAGE, fontSize: 12, fontWeight: '700' }, detailValue: { flex: 1, color: GREEN, fontSize: 13, fontWeight: '800', textAlign: 'right' },
  helper: { color: SAGE, fontSize: 12, lineHeight: 17, marginTop: 12 },
  actions: { gap: 9, marginTop: 18 },
  primaryButton: { minHeight: 48, borderRadius: 15, backgroundColor: GREEN, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  secondaryButton: { minHeight: 44, borderRadius: 14, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondaryText: { color: GREEN, fontSize: 13, fontWeight: '800' },
  archiveButton: { minHeight: 44, borderRadius: 14, backgroundColor: 'rgba(217, 76, 67, 0.08)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  archiveText: { color: '#A33B34', fontSize: 13, fontWeight: '800' },
  cancelButton: { minHeight: 44, borderRadius: 14, backgroundColor: '#E9EFEC', alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: GREEN, fontSize: 13, fontWeight: '800' },
});
