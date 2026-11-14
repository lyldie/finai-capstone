import React, { useEffect, useState } from 'react';
import {
  Modal,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type AlertButton = {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

type AlertOptions = { cancelable?: boolean; onDismiss?: () => void };
type AlertRequest = {
  title: string;
  message?: string;
  buttons: AlertButton[];
  options?: AlertOptions;
};

let activeAlert: AlertRequest | null = null;
let alertQueue: AlertRequest[] = [];
let alertListener: ((request: AlertRequest | null) => void) | null = null;

export const Alert = {
  alert(title?: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) {
    Keyboard.dismiss();
    const request: AlertRequest = {
      title: title?.trim() || 'FinAI',
      message,
      buttons: buttons?.length ? buttons : [{ text: 'OK' }],
      options,
    };
    if (activeAlert) alertQueue.push(request);
    else activeAlert = request;
    alertListener?.(activeAlert);
  },
};

export function FinAIAlertHost() {
  const [request, setRequest] = useState<AlertRequest | null>(activeAlert);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    alertListener = setRequest;
    setRequest(activeAlert);
    return () => {
      if (alertListener === setRequest) alertListener = null;
    };
  }, []);

  const dismiss = (button?: AlertButton) => {
    const current = activeAlert;
    activeAlert = alertQueue.shift() ?? null;
    setRequest(activeAlert);
    if (button?.onPress) button.onPress();
    else current?.options?.onDismiss?.();
  };

  const cancelButton = request?.buttons.find((button) => button.style === 'cancel');
  const canDismiss = request?.options?.cancelable === true;

  return (
    <Modal
      transparent
      visible={Boolean(request)}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (!canDismiss) return;
        dismiss(cancelButton);
      }}
    >
      <View style={[styles.backdrop, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close dialog"
          style={StyleSheet.absoluteFill}
          onPress={() => { if (canDismiss) dismiss(cancelButton); }}
        />
        <View accessibilityRole="alert" accessibilityViewIsModal style={styles.card}>
          <View style={styles.accent} />
          <Text style={styles.title}>{request?.title}</Text>
          {request?.message ? <Text style={styles.message}>{request.message}</Text> : null}
          <View style={styles.actions}>
            {request?.buttons.map((button, index) => {
              const destructive = button.style === 'destructive';
              const cancel = button.style === 'cancel';
              return (
                <Pressable
                  key={`${button.text ?? 'button'}-${index}`}
                  accessibilityRole="button"
                  onPress={() => dismiss(button)}
                  style={({ pressed }) => [
                    styles.button,
                    cancel ? styles.cancelButton : destructive ? styles.destructiveButton : styles.primaryButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.buttonText, cancel && styles.cancelText, destructive && styles.destructiveText]}>
                    {button.text || 'OK'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(12, 31, 27, 0.48)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 24,
    backgroundColor: '#FFFEF8',
    padding: 24,
    shadowColor: '#102B26',
    shadowOpacity: 0.2,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  accent: { width: 42, height: 5, borderRadius: 4, backgroundColor: '#EDB232', marginBottom: 18 },
  title: { color: '#1C3C36', fontSize: 19, fontWeight: '800', lineHeight: 25 },
  message: { color: '#516963', fontSize: 15, lineHeight: 22, marginTop: 9 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 10, marginTop: 24 },
  button: { minHeight: 44, minWidth: 88, paddingHorizontal: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  primaryButton: { backgroundColor: '#1C3C36' },
  cancelButton: { backgroundColor: '#EAF0EC' },
  destructiveButton: { backgroundColor: '#FBE9E6' },
  buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  cancelText: { color: '#31574F' },
  destructiveText: { color: '#A33B34' },
  pressed: { opacity: 0.78 },
});
