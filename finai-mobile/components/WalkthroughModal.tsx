import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const GREEN = '#1c3c36';
const GOLD = '#edb232';
const STEPS = [
  { icon: 'home-outline' as const, title: 'Your money at a glance', body: 'Home gives you a quick view of your balance and recent activity.' },
  { icon: 'receipt-outline' as const, title: 'Track every transaction', body: 'Record income, expenses, and transfers. You can search and filter your history anytime.' },
  { icon: 'pie-chart-outline' as const, title: 'Understand and plan', body: 'Insights helps you follow budgets and goals. Plan Ahead estimates where your money may go based on your recorded activity.' },
  { icon: 'chatbubbles-outline' as const, title: 'Ask Finn', body: 'Chat with Finn for help understanding your spending and planning your budget. Suggestions are guidance based on the information you record.' },
];

export default function WalkthroughModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  useEffect(() => { if (visible) setIndex(0); }, [visible]);
  const step = STEPS[index];
  const isLast = index === STEPS.length - 1;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.scrim}>
        <View style={styles.card}>
          <Pressable accessibilityRole="button" accessibilityLabel="Skip walkthrough" onPress={onClose} style={styles.skip}>
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
          <View style={styles.iconCircle}><Ionicons name={step.icon} size={38} color={GREEN} /></View>
          <Text style={styles.eyebrow}>GETTING STARTED · {index + 1} OF {STEPS.length}</Text>
          <Text style={styles.title}>{step.title}</Text>
          <Text style={styles.body}>{step.body}</Text>
          <View style={styles.dots}>
            {STEPS.map((_, dotIndex) => <View key={dotIndex} style={[styles.dot, dotIndex === index && styles.activeDot]} />)}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => isLast ? onClose() : setIndex((current) => current + 1)}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.primaryText}>{isLast ? 'Get started' : 'Next'}</Text>
            {!isLast && <Ionicons name="arrow-forward" size={18} color="#fff" />}
          </Pressable>
          {index > 0 && <Pressable accessibilityRole="button" onPress={() => setIndex((current) => current - 1)} style={styles.backButton}><Text style={styles.backText}>Back</Text></Pressable>}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(7, 24, 21, 0.72)', justifyContent: 'center', alignItems: 'center', padding: 22 },
  card: { width: '100%', maxWidth: 430, borderRadius: 28, backgroundColor: '#FFFEFB', paddingHorizontal: 26, paddingTop: 28, paddingBottom: 22, alignItems: 'center' },
  skip: { alignSelf: 'flex-end', paddingVertical: 5, paddingHorizontal: 2 },
  skipText: { color: '#60736D', fontSize: 15, fontWeight: '600' },
  iconCircle: { width: 82, height: 82, borderRadius: 41, backgroundColor: '#F7EBCB', justifyContent: 'center', alignItems: 'center', marginTop: 16, marginBottom: 22 },
  eyebrow: { color: '#71847E', letterSpacing: 1.1, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  title: { color: GREEN, fontSize: 25, fontWeight: '800', textAlign: 'center', marginTop: 10 },
  body: { color: '#596B66', fontSize: 16, lineHeight: 24, textAlign: 'center', marginTop: 12, minHeight: 72 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 24, marginBottom: 22 },
  dot: { height: 7, width: 7, borderRadius: 4, backgroundColor: '#D8E0DC' },
  activeDot: { width: 22, backgroundColor: GOLD },
  primaryButton: { minHeight: 52, width: '100%', borderRadius: 18, backgroundColor: GREEN, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9 },
  pressed: { opacity: 0.86 },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  backButton: { paddingVertical: 12, marginTop: 3 },
  backText: { color: GREEN, fontSize: 14, fontWeight: '600' },
});
