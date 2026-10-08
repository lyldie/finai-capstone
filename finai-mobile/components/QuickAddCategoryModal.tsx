import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../config';
import { useAuth } from '../context/AuthContext';
import { getCategoryEmoji } from '../utils/categoryEmoji';
import EmojiPicker, { getDisplayEmoji } from './EmojiPicker';

type CategoryKind = 'expense' | 'income';

type Props = {
  visible: boolean;
  type: CategoryKind;
  onClose: () => void;
  onCreated: (category: { id: string; name: string; type: CategoryKind; icon?: string }) => void;
};

export default function QuickAddCategoryModal({ visible, type, onClose, onCreated }: Props) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(getCategoryEmoji('category', type));
  const [emojiTouched, setEmojiTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!emojiTouched) setEmoji(getCategoryEmoji(name || 'category', type));
  }, [name, type, emojiTouched]);

  useEffect(() => {
    if (!visible) return;
    setName('');
    setEmojiTouched(false);
    setSaving(false);
  }, [visible, type]);

  const saveCategory = async () => {
    const normalizedName = name.trim();
    if (!normalizedName) {
      Alert.alert('Name required', 'Enter a name for the category.');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/categories/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user?.token || ''}`,
        },
        body: JSON.stringify({
          name: normalizedName,
          type,
          icon: getDisplayEmoji(emoji, getCategoryEmoji(normalizedName, type)),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = response.status === 409
          ? 'A category with this name already exists.'
          : (typeof result?.detail === 'string' ? result.detail : 'The category could not be created. Please try again.');
        Alert.alert('Could not create category', message);
        return;
      }

      onCreated({ ...result, id: result.id || result._id, name: normalizedName, type });
    } catch {
      Alert.alert('Connection error', 'Check your internet connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const fallbackEmoji = getCategoryEmoji(name || 'category', type);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>Add {type} category</Text>
              <Text style={styles.subtitle}>It will be added to your personal categories.</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton} accessibilityLabel="Close">
              <Ionicons name="close" size={21} color="#1C3C36" />
            </TouchableOpacity>
          </View>

          <View style={styles.emojiRow}>
            <EmojiPicker
              value={emoji}
              onChange={(value) => { setEmojiTouched(true); setEmoji(value); }}
              fallback={fallbackEmoji}
              context={type}
              tint={type === 'income' ? '#E8F5E9' : '#FFF0EF'}
              accessibilityLabel="Choose category emoji"
            />
            <Text style={styles.emojiHint}>Choose an icon, or use the suggested one.</Text>
          </View>

          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Category name"
            placeholderTextColor="#8A9A86"
            autoCapitalize="words"
            maxLength={40}
            returnKeyType="done"
            onSubmitEditing={saveCategory}
          />

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose} disabled={saving}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveButton} onPress={saveCategory} disabled={saving}>
              {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveText}>Create category</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(12, 28, 25, 0.58)', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 22, padding: 20 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 },
  headerCopy: { flex: 1, paddingRight: 12 },
  title: { color: '#1C3C36', fontSize: 19, fontWeight: '800' },
  subtitle: { color: '#71827D', fontSize: 12, marginTop: 5 },
  closeButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0F4F2', alignItems: 'center', justifyContent: 'center' },
  emojiRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 18, gap: 14 },
  emojiHint: { color: '#71827D', fontSize: 12, flex: 1 },
  input: { minHeight: 50, borderRadius: 12, borderWidth: 1, borderColor: '#E1EAE6', backgroundColor: '#F7F9F8', paddingHorizontal: 14, color: '#142D2A', fontSize: 16, marginBottom: 18 },
  actions: { flexDirection: 'row', gap: 10 },
  cancelButton: { flex: 1, minHeight: 48, borderRadius: 12, backgroundColor: '#F0F4F2', alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: '#42635A', fontWeight: '700' },
  saveButton: { flex: 1.4, minHeight: 48, borderRadius: 12, backgroundColor: '#144A3D', alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#FFFFFF', fontWeight: '700' },
});
