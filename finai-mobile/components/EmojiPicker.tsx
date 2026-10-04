import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const EMOJI_OPTIONS = [
  '🍽️', '🍔', '🥗', '🥕', '🍜', '☕', '🍰', '🛒', '🧹', '🧴', '👕', '👟', '🛍️',
  '🚗', '🚌', '🚕', '⛽', '🛵', '🚲', '✈️', '🏨', '🧳', '🏠', '🔑', '🛠️', '💡',
  '💧', '⚡', '📱', '💻', '🎮', '📺', '🎧', '💳', '💵', '💰', '🏦', '🐷', '📈',
  '💼', '🧾', '📚', '🎓', '🩺', '💊', '🏥', '🧘', '🎁', '🎉', '💍', '👶', '🐾',
  '🌱', '🌴', '🏖️', '🏕️', '🏋️', '⚽', '🎨', '🎯', '🛡️', '🧯', '📦', '🔧', '✨',
];

type Props = {
  value: string;
  onChange: (emoji: string) => void;
  fallback: string;
  tint?: string;
  accessibilityLabel?: string;
};

export function getDisplayEmoji(icon: string | null | undefined, fallback: string): string {
  const candidate = (icon || '').trim();
  // Older preset records stored Ionicons names such as "wallet-outline".
  return candidate && /[^a-zA-Z0-9_\-]/u.test(candidate) ? candidate : fallback;
}

export default function EmojiPicker({ value, onChange, fallback, tint = '#FFF9E6', accessibilityLabel = 'Choose an emoji' }: Props) {
  const [visible, setVisible] = useState(false);
  const displayValue = getDisplayEmoji(value, fallback);

  return (
    <>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`${accessibilityLabel}. Current: ${displayValue}`}
        style={[styles.trigger, { backgroundColor: tint }]}
        onPress={() => setVisible(true)}
      >
        <Text style={styles.selectedEmoji}>{displayValue}</Text>
        <View style={styles.editBadge}><Ionicons name="pencil" size={11} color="#FFFFFF" /></View>
      </TouchableOpacity>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <View style={styles.header}>
              <View>
                <Text style={styles.title}>Choose an emoji</Text>
                <Text style={styles.subtitle}>Pick an icon that is easy to recognize.</Text>
              </View>
              <TouchableOpacity onPress={() => setVisible(false)} style={styles.closeButton} accessibilityLabel="Close emoji picker">
                <Ionicons name="close" size={21} color="#1C3C36" />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.grid}>
              {EMOJI_OPTIONS.map((emoji, index) => (
                <TouchableOpacity
                  key={`${emoji}-${index}`}
                  style={[styles.option, displayValue === emoji && styles.optionSelected]}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${emoji}`}
                  onPress={() => { onChange(emoji); setVisible(false); }}
                >
                  <Text style={styles.optionEmoji}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.resetButton} onPress={() => { onChange(fallback); setVisible(false); }}>
              <Ionicons name="sparkles-outline" size={16} color="#3D7D6C" />
              <Text style={styles.resetText}>Use suggested emoji</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  selectedEmoji: { fontSize: 31 },
  editBadge: { position: 'absolute', right: -3, bottom: -3, width: 21, height: 21, borderRadius: 11, backgroundColor: '#3D7D6C', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
  backdrop: { flex: 1, backgroundColor: 'rgba(12, 28, 25, 0.58)', justifyContent: 'center', padding: 20 },
  sheet: { maxHeight: '78%', borderRadius: 24, padding: 20, backgroundColor: '#FFFFFF' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { color: '#1C3C36', fontSize: 19, fontWeight: '800' },
  subtitle: { color: '#71827D', fontSize: 12, marginTop: 4 },
  closeButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0F4F2', alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', paddingBottom: 8 },
  option: { width: '14.285%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 13, marginBottom: 3 },
  optionSelected: { backgroundColor: '#E5F2EC', borderWidth: 1, borderColor: '#3D7D6C' },
  optionEmoji: { fontSize: 25 },
  resetButton: { marginTop: 10, minHeight: 44, borderRadius: 13, backgroundColor: '#F0F7F3', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  resetText: { color: '#3D7D6C', fontSize: 14, fontWeight: '700' },
});
