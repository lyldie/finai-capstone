import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Modal, TouchableOpacity, ActivityIndicator, Alert, LogBox, Image } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';

// I-ignore ang OCR logs kung sakaling mag-trigger pa sa Expo LogBox
LogBox.ignoreLogs(['Camera Capture / OCR Error:', 'Hindi valid na resibo']);

interface ReceiptScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onScanComplete: (data: { amount: string; category: string; date: string; note: string }) => void;
  categories: any[];
  userId?: string;
}

export default function ReceiptScannerModal({ 
  visible, 
  onClose, 
  onScanComplete, 
  categories,
  userId 
}: ReceiptScannerModalProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [capturedPhotos, setCapturedPhotos] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);
  const cameraRef = useRef<any>(null);

  useEffect(() => {
    if (visible && (!permission || !permission.granted)) {
      requestPermission();
    }
    // Reset photos queue on open/close
    if (visible) {
      setCapturedPhotos([]);
    }
  }, [visible]);

  // Direct Submission Logic to FastAPI Multi-Photo Endpoint
  const submitPhotosToBackend = async (photos: string[]) => {
    try {
      setIsProcessing(true);

      const formData = new FormData();

      // I-append ang bawat litrato bilang 'files' para sa List[UploadFile]
      photos.forEach((uri, index) => {
        formData.append('files', {
          uri: uri,
          name: `receipt_frame_${index + 1}.jpg`,
          type: 'image/jpeg',
        } as any);
      });

      if (userId) {
        formData.append('user_id', userId);
      }

      // PALITAN ANG IP ADDRESS NG LOCAL IP MO KUNG KAILANGAN
      const response = await fetch('http://192.168.1.67:8000/ocr-scan', {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || "Hindi nabasa nang maayos ang resibo. Subukan ulit paps.");
      }

      setIsProcessing(false);

      const extractedAmount = result.data.amount || "0.00";
      const extractedMerchant = result.data.merchant || "Store";
      const backendCategory = result.data.category || "General";
      const extractedDate = result.data.date || new Date().toISOString().split('T')[0];

      // 🔍 Dynamic Category Matching
      let matchedCategory = backendCategory;
      const foundCat = categories.find(c => 
        c.name.toLowerCase().includes(backendCategory.toLowerCase()) ||
        backendCategory.toLowerCase().includes(c.name.toLowerCase())
      );
      
      if (foundCat) {
        matchedCategory = foundCat.name;
      } else if (categories.length > 0) {
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
        "FinAi Scanner", 
        error?.message || "Hindi nabasa nang maayos ang resibo. Subukan ulit paps."
      );
      setIsProcessing(false);
    }
  };

  const handleCapture = async () => {
    if (!cameraRef.current || isProcessing) return;

    try {
      // 1. Shutter Flash Feedback
      setIsFlashing(true);
      setTimeout(() => setIsFlashing(false), 150);

      // 2. High Quality Image Capture (0.7 quality for sharp text)
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        skipProcessing: false,
      });

      const newPhotosList = [...capturedPhotos, photo.uri];
      setCapturedPhotos(newPhotosList);

      // Kapag nakadalawang kuha na (Top + Bottom section), automatic submit na sa backend!
      if (newPhotosList.length === 2) {
        await submitPhotosToBackend(newPhotosList);
      }

    } catch (error: any) {
      console.log("Capture Error:", error);
      Alert.alert("Error", "Bumagsak ang kuha ng camera. Subukan ulit.");
    }
  };

  const handleReset = () => {
    setCapturedPhotos([]);
  };

  const handleManualAnalyzeNow = () => {
    if (capturedPhotos.length > 0) {
      submitPhotosToBackend(capturedPhotos);
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
        {/* 1. CameraView */}
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} facing="back" />

        {/* 2. White Flash Overlay Animation Effect */}
        {isFlashing && <View style={styles.flashOverlay} pointerEvents="none" />}

        {/* 3. Absolute overlay for UI elements */}
        <View style={styles.overlayContainer} pointerEvents="box-none">
          
          {/* Header Controls */}
          <View style={styles.overlayHeader}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            
            <View style={styles.headerBadge}>
              <Text style={styles.headerTitle}>
                {capturedPhotos.length === 0 ? "Step 1: Top / Header" : "Step 2: Bottom / Total"}
              </Text>
            </View>

            {capturedPhotos.length > 0 ? (
              <TouchableOpacity onPress={handleReset} style={styles.resetButton}>
                <Ionicons name="refresh" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 40 }} />
            )}
          </View>

          {/* Scanner Guidance Frame */}
          <View style={styles.scanFrameContainer}>
            <View style={styles.scanFrame} />
            <Text style={styles.frameInstruction}>
              {capturedPhotos.length === 0 
                ? "📸 Step 1: Kunan ang Store Name & Header" 
                : "📸 Step 2: Kunan ang Total Amount / Bottom Section"}
            </Text>
          </View>

          {/* Footer Controls & Multi-Photo Preview Bar */}
          <View style={styles.overlayFooter}>
            
            {/* Thumbnail Preview Bar (Kapag may 1st Photo na) */}
            {capturedPhotos.length > 0 && !isProcessing && (
              <View style={styles.previewRow}>
                {capturedPhotos.map((uri, idx) => (
                  <View key={idx} style={styles.thumbnailWrapper}>
                    <Image source={{ uri }} style={styles.thumbnailImage} />
                    <View style={styles.thumbnailBadge}>
                      <Text style={styles.thumbnailBadgeText}>#{idx + 1}</Text>
                    </View>
                  </View>
                ))}

                {capturedPhotos.length === 1 && (
                  <TouchableOpacity style={styles.analyzeNowBtn} onPress={handleManualAnalyzeNow}>
                    <Ionicons name="sparkles" size={16} color="#FFFFFF" style={{ marginRight: 4 }} />
                    <Text style={styles.analyzeNowText}>Analyze 1 Photo</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Shutter Button & Processing State */}
            {isProcessing ? (
              <View style={styles.processingContainer}>
                <ActivityIndicator size="large" color="#10B981" />
                <Text style={styles.processingText}>FinAi AI Engine analyzing receipt...</Text>
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
  flashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
    opacity: 0.85,
    zIndex: 99,
  },
  overlayContainer: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between', zIndex: 100 },
  overlayHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingTop: 50, 
    paddingHorizontal: 20 
  },
  closeButton: { backgroundColor: 'rgba(0,0,0,0.6)', padding: 10, borderRadius: 20 },
  resetButton: { backgroundColor: 'rgba(239, 68, 68, 0.8)', padding: 10, borderRadius: 20 },
  headerBadge: { 
    backgroundColor: 'rgba(20, 45, 42, 0.85)', 
    paddingHorizontal: 16, 
    paddingVertical: 8, 
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#10B981'
  },
  headerTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: 'bold' },
  scanFrameContainer: { alignItems: 'center', justifyContent: 'center' },
  scanFrame: { 
    width: '85%', 
    height: 320, 
    borderWidth: 2, 
    borderColor: '#10B981', 
    borderRadius: 20, 
    backgroundColor: 'transparent' 
  },
  frameInstruction: { 
    color: '#FFFFFF', 
    marginTop: 15, 
    fontSize: 13, 
    fontWeight: '600', 
    backgroundColor: 'rgba(20, 45, 42, 0.9)', 
    paddingHorizontal: 16, 
    paddingVertical: 8, 
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    overflow: 'hidden'
  },
  overlayFooter: { paddingBottom: 40, alignItems: 'center' },
  previewRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginBottom: 20, 
    backgroundColor: 'rgba(0,0,0,0.6)', 
    padding: 8, 
    borderRadius: 16 
  },
  thumbnailWrapper: { position: 'relative', marginRight: 10 },
  thumbnailImage: { width: 45, height: 60, borderRadius: 8, borderWidth: 1, borderColor: '#10B981' },
  thumbnailBadge: { 
    position: 'absolute', 
    top: -5, 
    right: -5, 
    backgroundColor: '#10B981', 
    borderRadius: 8, 
    paddingHorizontal: 4, 
    paddingVertical: 1 
  },
  thumbnailBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: 'bold' },
  analyzeNowBtn: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#2b5f56', 
    paddingHorizontal: 12, 
    paddingVertical: 8, 
    borderRadius: 10 
  },
  analyzeNowText: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' },
  captureButton: { 
    width: 75, 
    height: 75, 
    borderRadius: 38, 
    borderWidth: 4, 
    borderColor: '#10B981', 
    justifyContent: 'center', 
    alignItems: 'center', 
    backgroundColor: 'transparent' 
  },
  captureButtonInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#FFFFFF' },
  processingContainer: { 
    alignItems: 'center', 
    backgroundColor: 'rgba(20, 45, 42, 0.9)', 
    paddingHorizontal: 20, 
    paddingVertical: 12, 
    borderRadius: 16 
  },
  processingText: { color: '#FFFFFF', marginTop: 8, fontSize: 14, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(20, 45, 42, 0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  permissionBox: { backgroundColor: '#FFFFFF', padding: 30, borderRadius: 20, alignItems: 'center', width: '80%' },
  permissionText: { textAlign: 'center', marginBottom: 20, fontSize: 15, color: '#142D2A' },
  permissionButton: { backgroundColor: '#2b5f56', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12 },
  permissionButtonText: { color: '#FFFFFF', fontWeight: 'bold' }
});