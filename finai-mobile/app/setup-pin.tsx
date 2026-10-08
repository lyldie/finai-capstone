import React, { useState, useRef } from 'react';
import { 
  StyleSheet, Text, View, TouchableOpacity, TextInput, Modal, FlatList,
  Alert, StatusBar, Platform, KeyboardAvoidingView, ScrollView, Pressable, ActivityIndicator, Keyboard 
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config';
import { useAuth } from '../context/AuthContext';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { getGoalEmoji } from '../utils/goalEmoji';
import { getDisplayEmoji } from '../components/EmojiPicker';

// ---- FINAI BRAND TOKENS ----
const DEEP_GREEN = '#1c3c36';
const TEAL = '#3D7D6C';
const GOLD = '#edb232';
const SAGE = '#8BA19D';
const CREAM = '#FAF7F2';

interface GoalType {
  id: string;
  name: string;
  icon?: string;
}

const formatLocalDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const philippineTodayKey = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
};

const getTomorrowInPhilippines = () => {
  const [year, month, day] = philippineTodayKey().split('-').map(Number);
  return new Date(year, month - 1, day + 1, 12, 0, 0);
};

export default function SetupPinScreen() {
  const [pin, setPin] = useState('');
  const [income, setIncome] = useState('');
  const [goalName, setGoalName] = useState('');
  const [goalAmount, setGoalAmount] = useState('');
  const [goalDate, setGoalDate] = useState<Date | null>(null);
  const [showGoalDatePicker, setShowGoalDatePicker] = useState(false);
  const [goalTypes, setGoalTypes] = useState<GoalType[]>([]);
  const [selectedGoalType, setSelectedGoalType] = useState<GoalType | null>(null);
  const [showGoalTypePicker, setShowGoalTypePicker] = useState(false);
  const [loading, setLoading] = useState(false);

  const inputRef = useRef<TextInput>(null); 
  const router = useRouter();
  
  const { user } = useAuth();

  React.useEffect(() => {
    let active = true;
    fetch(`${API_URL}/api/goal-types/`)
      .then(async (response) => response.ok ? response.json() : [])
      .then((types: GoalType[]) => {
        if (active) setGoalTypes(Array.isArray(types) ? types.filter((item) => item && item.id && item.name) : []);
      })
      .catch(() => { if (active) setGoalTypes([]); });
    return () => { active = false; };
  }, []);

  const onGoalDateChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') setShowGoalDatePicker(false);
    if (selectedDate) setGoalDate(selectedDate);
  };

  const handleConfirmPinAndSetup = async () => {
    Keyboard.dismiss();

    if (pin.length !== 4) {
      Alert.alert('Invalid PIN', 'Enter all 4 digits to continue.');
      return;
    }

    const incomeText = income.trim();
    const parsedIncome = incomeText ? Number(incomeText) : null;
    if (parsedIncome !== null && (!Number.isFinite(parsedIncome) || parsedIncome < 0)) {
      Alert.alert("Invalid Amount", "Enter a valid monthly amount, or leave it blank for now.");
      return;
    }

    const goalValues = [goalName.trim(), goalAmount.trim(), goalDate ? formatLocalDate(goalDate) : ''];
    const goalProvided = goalValues.some(Boolean);
    if (goalProvided && !goalValues.every(Boolean)) {
      Alert.alert("Goal details incomplete", "To add a goal now, fill in its name, target amount, goal type, and target date. Otherwise, leave the goal blank and add it later.");
      return;
    }

    let parsedGoalAmount: number | undefined;
    if (goalProvided) {
      if (!selectedGoalType) {
        Alert.alert("Choose a goal type", "Select a goal type preset, or leave the optional goal for later.");
        return;
      }
      if (goalValues[2] <= philippineTodayKey()) {
        Alert.alert("Invalid Date", "Choose a target date in the future.");
        return;
      }

      parsedGoalAmount = Number(goalAmount);
      if (!Number.isFinite(parsedGoalAmount) || parsedGoalAmount <= 0) {
        Alert.alert("Invalid Amount", "Enter a target amount greater than zero.");
        return;
      }
    }

    setLoading(true);

    try {
      const userId = user?.id || await AsyncStorage.getItem('user_id');
      if (!userId) {
        Alert.alert('Session error', 'Your user session could not be found. Please sign in again.');
        router.replace('/signup');
        return;
      }

      const payload = {
        user_id: userId,
        pin: pin,
        monthly_income: parsedIncome,
        ...(goalProvided ? {
          target_name: goalName.trim(),
          target_amount: parsedGoalAmount,
          target_date: formatLocalDate(goalDate!),
          goal_type_id: selectedGoalType!.id,
        } : {}),
      };

      const response = await fetch(`${API_URL}/initial-setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user?.token || ''}` },
        body: JSON.stringify(payload)
      });

      const res = await response.json();

      if (response.ok) {
        await AsyncStorage.setItem('user_pin', pin);

        Alert.alert(
          'Setup complete',
          "Your app PIN is set. You can add or update your optional money baseline and savings goals later.", 
          [
            { 
              text: 'Continue',
              onPress: () => router.replace('/login') 
            }
          ]
        );
      } else {
        Alert.alert('Setup error', typeof res.detail === 'string' ? res.detail : 'Could not save your setup. Please try again.');
      }

    } catch (error) {
      console.error(error);
      Alert.alert('Connection error', 'Could not reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const focusInput = () => {
    inputRef.current?.focus();
  };

  const isFormComplete = pin.length === 4;

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <ScrollView 
        contentContainerStyle={{ flexGrow: 1 }} 
        bounces={true} 
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        
        <LinearGradient
          colors={[DEEP_GREEN, TEAL]}
          style={styles.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <Text style={styles.headerText}>Account{"\n"}Onboarding</Text>
          <Ionicons name="rocket-outline" size={80} color="rgba(255,255,255,0.2)" style={styles.headerIcon} />
        </LinearGradient>

        <View style={styles.content}>
          
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>🔒 SECURITY LOCK</Text>
            <Text style={styles.instruction}>Set a 4-digit PIN to lock this app. This is separate from your account password and bank PIN.</Text>
            
            <Pressable style={styles.pinWrapper} onPress={focusInput} disabled={loading}>
              <View style={styles.pinContainer}>
                {[...Array(4)].map((_, i) => (
                  <View key={i} style={[styles.dot, pin.length > i && styles.dotActive]} />
                ))}
              </View>
            </Pressable>

            <TextInput
              ref={inputRef}
              style={styles.hiddenInput}
              keyboardType="number-pad"
              maxLength={4}
              value={pin}
              onChangeText={(text) => setPin(text.replace(/[^0-9]/g, ''))}
              autoFocus={true}
              editable={!loading}
            />
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>💰 MONTHLY MONEY AVAILABLE · OPTIONAL</Text>
            <Text style={styles.label}>About how much money do you usually have available each month?</Text>
            <Text style={styles.fieldHint}>Include salary, allowance, family support, or other money. If it varies, enter a typical estimate. Leave blank if you prefer not to estimate or share; enter 0 if you usually have none. You can update this later.</Text>
            <TextInput 
              style={styles.inputField}
              placeholder="e.g. 25000 or leave blank"
              placeholderTextColor={SAGE}
              keyboardType="decimal-pad"
              value={income}
              onChangeText={setIncome}
              editable={!loading}
            />
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>🎯 FIRST FINANCIAL GOAL · OPTIONAL</Text>
            <Text style={styles.fieldHint}>You can set a savings goal now or add one later from Insights.</Text>
            <Text style={styles.label}>Goal name</Text>
            <TextInput 
              style={styles.inputField}
              placeholder="e.g. Emergency Fund / Laptop"
              placeholderTextColor={SAGE}
              value={goalName}
              onChangeText={setGoalName}
              editable={!loading}
            />

            <Text style={styles.label}>Goal Type</Text>
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => { Keyboard.dismiss(); setShowGoalTypePicker(true); }}
              disabled={loading}
              activeOpacity={0.75}
            >
              <View style={styles.pickerButtonContent}>
                {selectedGoalType ? (
                  <Text style={styles.goalTypeEmoji}>{getDisplayEmoji(selectedGoalType.icon, getGoalEmoji(selectedGoalType.name))}</Text>
                ) : (
                  <Ionicons name="options-outline" size={19} color={TEAL} style={{ marginRight: 10 }} />
                )}
                <Text style={[styles.pickerButtonText, !selectedGoalType && styles.placeholderText]}>
                  {selectedGoalType?.name || 'Choose a goal type preset'}
                </Text>
              </View>
              <Ionicons name="chevron-down" size={19} color={SAGE} />
            </TouchableOpacity>

            <Text style={styles.label}>Target savings amount</Text>
            <TextInput 
              style={styles.inputField}
              placeholder="e.g. 15000"
              placeholderTextColor={SAGE}
              keyboardType="decimal-pad"
              value={goalAmount}
              onChangeText={setGoalAmount}
              editable={!loading}
            />

            <Text style={styles.label}>Target date</Text>
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => { Keyboard.dismiss(); setShowGoalDatePicker((current) => !current); }}
              disabled={loading}
              activeOpacity={0.75}
            >
              <View style={styles.pickerButtonContent}>
                <Ionicons name="calendar-outline" size={19} color={TEAL} style={{ marginRight: 10 }} />
                <Text style={[styles.pickerButtonText, !goalDate && styles.placeholderText]}>
                  {goalDate ? goalDate.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Choose a target date'}
                </Text>
              </View>
              <Ionicons name={showGoalDatePicker ? 'chevron-up' : 'chevron-down'} size={19} color={SAGE} />
            </TouchableOpacity>
            {showGoalDatePicker && (
              <View style={styles.datePickerContainer}>
                <DateTimePicker
                  value={goalDate || getTomorrowInPhilippines()}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  minimumDate={getTomorrowInPhilippines()}
                  onChange={onGoalDateChange}
                />
                {Platform.OS === 'ios' && (
                  <TouchableOpacity style={styles.datePickerDone} onPress={() => setShowGoalDatePicker(false)}>
                    <Text style={styles.datePickerDoneText}>Done</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          <View style={styles.buttonWrapper}>
            <TouchableOpacity 
              style={[styles.button, (!isFormComplete || loading) && { opacity: 0.5 }]}
              onPress={handleConfirmPinAndSetup}
              disabled={!isFormComplete || loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>SAVE AND CONTINUE</Text>
              )}
            </TouchableOpacity>
            <Text style={styles.footerNote}>Your PIN is required. Monthly money details and a first goal are optional and can be added later.</Text>
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={showGoalTypePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowGoalTypePicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choose a goal type</Text>
              <TouchableOpacity onPress={() => setShowGoalTypePicker(false)} style={styles.modalCloseButton}>
                <Ionicons name="close" size={20} color={DEEP_GREEN} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalHint}>These presets are managed by your app administrator.</Text>
            <FlatList
              data={goalTypes}
              keyExtractor={(item) => item.id}
              style={{ maxHeight: 330 }}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={styles.emptyGoalTypes}>No active goal presets are available. You can skip this optional goal and add one later.</Text>}
              renderItem={({ item }) => {
                const isSelected = selectedGoalType?.id === item.id;
                return (
                  <TouchableOpacity
                    style={[styles.goalTypeOption, isSelected && styles.goalTypeOptionSelected]}
                    onPress={() => { setSelectedGoalType(item); setShowGoalTypePicker(false); }}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.goalTypeEmoji}>{getDisplayEmoji(item.icon, getGoalEmoji(item.name))}</Text>
                    <Text style={styles.goalTypeOptionText}>{item.name}</Text>
                    {isSelected && <Ionicons name="checkmark-circle" size={20} color={TEAL} />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CREAM },
  header: {
    height: 220,
    borderBottomRightRadius: 80,
    justifyContent: 'center',
    paddingHorizontal: 30,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 20 : 50,
  },
  headerText: { color: '#fff', fontSize: 34, fontWeight: '900' },
  headerIcon: { position: 'absolute', right: 20, bottom: 20 },
  content: { 
    flex: 1, 
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  sectionCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 20,
    marginBottom: 20,
    elevation: 2,
    shadowColor: DEEP_GREEN,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', color: DEEP_GREEN, marginBottom: 15, letterSpacing: 1 },
  instruction: { fontSize: 14, color: SAGE, marginBottom: 10, fontWeight: '500' },
  pinWrapper: { paddingVertical: 10, alignItems: 'center' },
  pinContainer: { flexDirection: 'row', gap: 25 },
  dot: { 
    width: 20, 
    height: 20, 
    borderRadius: 10, 
    borderWidth: 2, 
    borderColor: TEAL 
  },
  dotActive: { 
    backgroundColor: GOLD, 
    borderColor: GOLD,
    transform: [{ scale: 1.2 }] 
  },
  hiddenInput: { position: 'absolute', opacity: 0, width: 1, height: 1 },
  label: { fontSize: 12, color: SAGE, marginBottom: 6, fontWeight: '600' },
  fieldHint: { fontSize: 12, color: SAGE, lineHeight: 17, marginBottom: 12 },
  inputField: {
    backgroundColor: CREAM,
    color: DEEP_GREEN,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 10,
    fontSize: 14,
    marginBottom: 12,
  },
  pickerButton: {
    minHeight: 48,
    backgroundColor: CREAM,
    borderRadius: 10,
    paddingHorizontal: 13,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerButtonContent: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  pickerButtonText: { color: DEEP_GREEN, fontSize: 14, fontWeight: '600', flexShrink: 1 },
  placeholderText: { color: SAGE, fontWeight: '500' },
  goalTypeEmoji: { fontSize: 20, marginRight: 10 },
  datePickerContainer: {
    backgroundColor: CREAM,
    borderRadius: 12,
    marginBottom: 14,
    paddingVertical: 8,
    alignItems: 'center',
  },
  datePickerDone: { alignSelf: 'flex-end', paddingHorizontal: 18, paddingVertical: 10 },
  datePickerDoneText: { color: TEAL, fontSize: 14, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(10, 25, 22, 0.48)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 30 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { color: DEEP_GREEN, fontSize: 18, fontWeight: '800' },
  modalCloseButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center' },
  modalHint: { color: SAGE, fontSize: 12, lineHeight: 18, marginTop: 6, marginBottom: 12 },
  goalTypeOption: { minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderRadius: 12, marginBottom: 6 },
  goalTypeOptionSelected: { backgroundColor: '#EDF5F1' },
  goalTypeOptionText: { flex: 1, color: DEEP_GREEN, fontSize: 15, fontWeight: '600' },
  emptyGoalTypes: { textAlign: 'center', color: SAGE, fontSize: 13, lineHeight: 19, paddingVertical: 22, paddingHorizontal: 10 },
  buttonWrapper: { width: '100%', alignItems: 'center', marginTop: 10 },
  button: { 
    backgroundColor: DEEP_GREEN, 
    width: '100%', 
    paddingVertical: 18, 
    borderRadius: 35, 
    alignItems: 'center',
    elevation: 4,
    shadowColor: DEEP_GREEN,
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold', letterSpacing: 1 },
  footerNote: { marginTop: 15, color: SAGE, fontSize: 11, textAlign: 'center' }
});
