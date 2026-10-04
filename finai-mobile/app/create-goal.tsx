import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
  Modal,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useTransactions } from '../context/TransactionContext'; 
import { router, useLocalSearchParams } from 'expo-router';
import { API_URL } from '../config'; 
import { getGoalEmoji } from '../utils/goalEmoji'; // 👈 IMPORT NATIN YUNG EMOJI HELPER
import { getDisplayEmoji } from '../components/EmojiPicker';

const FINAI_DEEP_GREEN = '#0D5C3A';
const FINAI_BG = '#F4F7F5';
const FINAI_CARD = '#FFFFFF';
const FINAI_TEXT = '#1F2937';
const FINAI_MUTED = '#6B7280';
const FINAI_BORDER = '#E5E7EB';

interface GoalType {
  id: string;
  name: string;
  icon?: string; // 👈 DINAGDAG YUNG ICON FIELD
}

export default function CreateGoal() {
  const params = useLocalSearchParams();
  const { addGoal, updateGoal } = useTransactions();

  const isEditMode = Boolean(params.id);

  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [currentSavings, setCurrentSavings] = useState(0);

  const [goalTypes, setGoalTypes] = useState<GoalType[]>([]);
  const [selectedType, setSelectedType] = useState<GoalType | null>(null);
  const [showTypeModal, setShowTypeModal] = useState(false);

  useEffect(() => {
    const fetchTypes = async () => {
      try {
        const res = await fetch(`${API_URL}/api/goal-types/`);
        if (res.ok) {
          const data: GoalType[] = await res.json();
          setGoalTypes(data);
        } else {
          console.error("Failed to fetch goal types status:", res.status);
        }
      } catch (error) {
        console.error("Error fetching goal types:", error);
      }
    };
    fetchTypes();
  }, []);

  useEffect(() => {
    if (goalTypes.length > 0) {
      const targetParam = params.goal_type_id || params.preset_id || params.type_id || params.goal_type;
      if (targetParam) {
        const matched = goalTypes.find(
          (gt) => String(gt.id) === String(targetParam) || 
                  gt.name.toLowerCase() === String(targetParam).toLowerCase()
        );
        if (matched) {
          setSelectedType(matched);
        }
      }
    }
  }, [goalTypes, params.goal_type_id, params.preset_id, params.type_id, params.goal_type]);

  useEffect(() => {
    if (isEditMode) {
      if (params.target_name) setName(String(params.target_name));
      if (params.target_amount) setAmount(String(params.target_amount));
      if (params.current_savings) setCurrentSavings(parseFloat(String(params.current_savings)) || 0);
      if (params.target_date) {
        const parsedDate = new Date(String(params.target_date));
        if (!isNaN(parsedDate.getTime())) {
          setDate(parsedDate);
        }
      }
    }
  }, [params.id, params.target_name, params.target_amount, params.current_savings, params.target_date]);

  const onDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowPicker(false); 
    }
    if (selectedDate) {
      setDate(selectedDate); 
    }
  };

  const handleSave = async () => {
    if (!selectedType) {
      Alert.alert("Oops!", "Pumili ka muna ng Goal Type preset, paps.");
      return;
    }

    if (!name.trim() || !amount.trim()) {
      Alert.alert("Oops!", "Kumpletuhin mo muna ang details, paps.");
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert("Invalid Amount", "Maglagay ng tamang target amount.");
      return;
    }

    const formattedDate = date.toISOString().split('T')[0];

    try {
      if (isEditMode) {
        await updateGoal(
          String(params.id),
          name,
          parsedAmount,
          formattedDate,
          selectedType.id,
          currentSavings
        );
        Alert.alert("Success 🎉", "Na-update na ang goal mo!");
      } else {
        await addGoal(name, parsedAmount, formattedDate, selectedType.id);
        Alert.alert("Success 🎉", "Na-save na ang bagong goal!");
      }
      router.back();
    } catch (error) {
      Alert.alert("Error", "Bumagsak ang pag-save ng goal.");
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={FINAI_TEXT} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isEditMode ? 'Edit Goal' : 'New Financial Goal'}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          
          {/* GOAL TYPE DROPDOWN PRESET */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Goal Type Preset</Text>
            <TouchableOpacity
              style={styles.dropdownSelector}
              onPress={() => setShowTypeModal(true)}
              activeOpacity={0.7}
            >
              <View style={styles.dateLeftRow}>
                {/* 👈 NAGPAPAKITA NA NG EMOJI KUNG MAY SELECTED TYPE */}
                {selectedType ? (
                  <Text style={{ fontSize: 20, marginRight: 10 }}>
                    {getDisplayEmoji(selectedType.icon, getGoalEmoji(selectedType.name))}
                  </Text>
                ) : (
                  <Ionicons name="options-outline" size={20} color={FINAI_DEEP_GREEN} style={styles.inputIcon} />
                )}
                <Text style={[styles.dropdownText, !selectedType && { color: '#9CA3AF' }]}>
                  {selectedType ? selectedType.name : "Select from Admin Presets"}
                </Text>
              </View>
              <Ionicons name="chevron-down" size={20} color={FINAI_MUTED} />
            </TouchableOpacity>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Goal Name</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="flag-outline" size={20} color={FINAI_DEEP_GREEN} style={styles.inputIcon} />
              <TextInput
                placeholder="e.g. New Laptop, Emergency Fund"
                placeholderTextColor="#9CA3AF"
                value={name}
                onChangeText={setName}
                style={styles.input}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Target Amount (₱)</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="cash-outline" size={20} color={FINAI_DEEP_GREEN} style={styles.inputIcon} />
              <TextInput
                placeholder="0.00"
                placeholderTextColor="#9CA3AF"
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                style={styles.input}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Target Date</Text>
            <TouchableOpacity
              style={styles.dateSelector}
              onPress={() => setShowPicker((prev) => !prev)}
              activeOpacity={0.7}
            >
              <View style={styles.dateLeftRow}>
                <Ionicons name="calendar-outline" size={20} color={FINAI_DEEP_GREEN} style={styles.inputIcon} />
                <Text style={styles.dateText}>
                  {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
              </View>
              <Ionicons
                name={showPicker ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={FINAI_MUTED}
              />
            </TouchableOpacity>

            {showPicker && (
              <View style={styles.pickerContainer}>
                <DateTimePicker
                  value={date}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={onDateChange}
                  minimumDate={new Date()}
                />
                <TouchableOpacity
                  style={styles.doneBtn}
                  onPress={() => setShowPicker(false)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.doneBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.85}>
          <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
          <Text style={styles.saveBtnText}>{isEditMode ? 'Update Goal' : 'Save Goal'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* CUSTOM MODAL DROPDOWN SHEET */}
      <Modal
        visible={showTypeModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowTypeModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Goal Type</Text>
              <TouchableOpacity onPress={() => setShowTypeModal(false)}>
                <Ionicons name="close" size={24} color={FINAI_TEXT} />
              </TouchableOpacity>
            </View>
            
            <FlatList
              data={goalTypes}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.modalItem,
                    selectedType?.id === item.id && styles.modalItemSelected
                  ]}
                  onPress={() => {
                    setSelectedType(item);
                    setShowTypeModal(false);
                  }}
                >
                  {/* 👈 DINAGDAG ANG EMOJI SA LISTAHAN NG MODAL */}
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ fontSize: 20, marginRight: 12 }}>
                      {getDisplayEmoji(item.icon, getGoalEmoji(item.name))}
                    </Text>
                    <Text style={[
                      styles.modalItemText,
                      selectedType?.id === item.id && { color: FINAI_DEEP_GREEN, fontWeight: '700' }
                    ]}>
                      {item.name}
                    </Text>
                  </View>
                  
                  {selectedType?.id === item.id && (
                    <Ionicons name="checkmark" size={20} color={FINAI_DEEP_GREEN} />
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.emptyText}>Walang nakitang Admin Presets. Magdagdag muna sa Admin panel.</Text>
              }
            />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: FINAI_BG,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 15,
    backgroundColor: FINAI_CARD,
    borderBottomWidth: 1,
    borderBottomColor: FINAI_BORDER,
  },
  iconBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: FINAI_TEXT,
  },
  scrollContent: {
    padding: 20,
  },
  card: {
    backgroundColor: FINAI_CARD,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: FINAI_MUTED,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: FINAI_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: FINAI_BORDER,
    paddingHorizontal: 12,
    height: 50,
  },
  dropdownSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: FINAI_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: FINAI_BORDER,
    paddingHorizontal: 12,
    height: 50,
  },
  dropdownText: {
    fontSize: 15,
    color: FINAI_TEXT,
    fontWeight: '500',
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: FINAI_TEXT,
  },
  dateSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: FINAI_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: FINAI_BORDER,
    paddingHorizontal: 12,
    height: 50,
  },
  dateLeftRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateText: {
    fontSize: 15,
    color: FINAI_TEXT,
    fontWeight: '500',
  },
  pickerContainer: {
    backgroundColor: FINAI_CARD,
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: FINAI_BORDER,
    overflow: 'hidden',
  },
  doneBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: FINAI_DEEP_GREEN,
    borderTopWidth: 1,
    borderTopColor: FINAI_BORDER,
  },
  doneBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  saveBtn: {
    backgroundColor: FINAI_DEEP_GREEN,
    borderRadius: 12,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: FINAI_DEEP_GREEN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
    marginBottom: 12,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  cancelBtn: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    color: FINAI_MUTED,
    fontSize: 15,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: FINAI_CARD,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '50%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: FINAI_TEXT,
  },
  modalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: FINAI_BORDER,
  },
  modalItemSelected: {
    backgroundColor: '#EAF5F0',
    borderRadius: 8,
    paddingHorizontal: 10,
  },
  modalItemText: {
    fontSize: 16,
    color: FINAI_TEXT,
  },
  emptyText: {
    textAlign: 'center',
    color: FINAI_MUTED,
    marginTop: 20,
    fontSize: 14,
  },
});
