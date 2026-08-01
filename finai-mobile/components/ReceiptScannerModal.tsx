import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Modal, TouchableOpacity, ActivityIndicator, Alert, LogBox } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';

// I-ignore ang OCR logs kung sakaling mag-trigger pa sa Expo LogBox
LogBox.ignoreLogs(['Camera Capture / OCR Error:', 'Hindi valid na resibo']);

interface ReceiptScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onScanComplete: (data: { amount: string; category: string; date: string; note: string }) => void;
  categories: any[];
  userId?: string; // Dagdag na prop para maipasa ang kasalukuyang user ID
}

export default function ReceiptScannerModal({ 
  visible, 
  onClose, 
  onScanComplete, 
  categories,
  userId 
}: ReceiptScannerModalProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [isProcessing, setIsProcessing] = useState(false);
  const cameraRef = useRef<any>(null);

  useEffect(() => {
    if (visible && (!permission || !permission.granted)) {
      requestPermission();
    }
  }, [visible]);

  const handleCapture = async () => {
    if (!cameraRef.current) return;

    try {
      setIsProcessing(true);

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        skipProcessing: true,
      });

      const formData = new FormData();
      formData.append('file', {
        uri: photo.uri,
        name: 'receipt.jpg',
        type: 'image/jpeg',
      } as any);

      // IPINAPASA ANG USER_ID SA BACKEND PARA SA DYNAMIC CATEGORY MATCHING
      if (userId) {
        formData.append('user_id', userId);
      }

      // PALITAN ANG IP ADDRESS NG LOCAL IP MO KUNG KAILANGAN
      const response = await fetch('http://192.168.1.74:8000/ocr-scan', {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || "Hindi nabasa ng maayos ang resibo. Subukan ulit paps.");
      }

      setIsProcessing(false);

      const extractedAmount = result.data.amount || "0.00";
      const extractedMerchant = result.data.merchant || "Store";
      const backendCategory = result.data.category || "General";
      const extractedDate = result.data.date || new Date().toISOString().split('T')[0];

      // 🔍 Dynamic Category Matching mula sa backend response papunta sa categories list mo
      let matchedCategory = backendCategory;
      const foundCat = categories.find(c => 
        c.name.toLowerCase().includes(backendCategory.toLowerCase()) ||
        backendCategory.toLowerCase().includes(c.name.toLowerCase())
      );
      
      if (foundCat) {
        matchedCategory = foundCat.name;
      } else if (categories.length > 0) {
        // Fallback kung walang match sa exact name
        matchedCategory = categories[0].name;
      }

      onScanComplete({
        amount: extractedAmount,
        category: matchedCategory,
        date: extractedDate,
        note: `Scanned from ${extractedMerchant}`
      });

      onClose();

    } catch (error: any) {
      console.log("OCR Handled Error:", error?.message || error);
      
      Alert.alert(
        "Oops!", 
        error?.message || "Hindi nabasa ng maayos ang resibo. Subukan ulit paps."
      );
      setIsProcessing(false);
    }
  };

  if (!permission) {
    return <View />;
  }

  if (!permission.granted) {
    return (
      <Modal visible={visible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.permissionBox}>
            <Text style={styles.permissionText}>Kailangan natin ng camera permission para ma-scan ang resibo mo, paps!</Text>
            <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
              <Text style={styles.permissionButtonText}>Grant Permission</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={{ marginTop: 15 }}>
              <Text style={{ color: '#7C9A95' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={styles.container}>
        {/* 1. CameraView standalone without children */}
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} facing="back" />

        {/* 2. Absolute overlay for UI elements */}
        <View style={styles.overlayContainer} pointerEvents="box-none">
          <View style={styles.overlayHeader}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Scan Receipt</Text>
            <View style={{ width: 24 }} />
          </View>

          <View style={styles.scanFrameContainer}>
            <View style={styles.scanFrame} />
            <Text style={styles.frameInstruction}>I-align ang resibo sa loob ng kahon</Text>
          </View>

          <View style={styles.overlayFooter}>
            {isProcessing ? (
              <View style={styles.processingContainer}>
                <ActivityIndicator size="large" color="#FFFFFF" />
                <Text style={styles.processingText}>Analyzing receipt context...</Text>
              </View>
            ) : (
              <TouchableOpacity style={styles.captureButton} onPress={handleCapture}>
                <View style={styles.captureButtonInner} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  overlayContainer: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between' },
  overlayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 50, paddingHorizontal: 20 },
  closeButton: { backgroundColor: 'rgba(0,0,0,0.5)', padding: 8, borderRadius: 20 },
  headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' },
  scanFrameContainer: { alignItems: 'center', justifyContent: 'center' },
  scanFrame: { width: '80%', height: 350, borderWidth: 2, borderColor: '#10B981', borderRadius: 20, backgroundColor: 'transparent' },
  frameInstruction: { color: '#FFFFFF', marginTop: 15, fontSize: 14, fontWeight: '500', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  overlayFooter: { paddingBottom: 50, alignItems: 'center' },
  captureButton: { width: 75, height: 75, borderRadius: 38, borderWidth: 4, borderColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', backgroundColor: 'transparent' },
  captureButtonInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#FFFFFF' },
  processingContainer: { alignItems: 'center' },
  processingText: { color: '#FFFFFF', marginTop: 10, fontSize: 14, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(20, 45, 42, 0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  permissionBox: { backgroundColor: '#FFFFFF', padding: 30, borderRadius: 20, alignItems: 'center', width: '80%' },
  permissionText: { textAlign: 'center', marginBottom: 20, fontSize: 15, color: '#142D2A' },
  permissionButton: { backgroundColor: '#2b5f56', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12 },
  permissionButtonText: { color: '#FFFFFF', fontWeight: 'bold' }
});