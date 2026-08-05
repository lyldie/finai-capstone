import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Modal, TouchableOpacity, ActivityIndicator, Alert, LogBox, Image } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../config';

// I-ignore ang OCR logs kung sakaling mag-trigger pa sa Expo LogBox
LogBox.ignoreLogs(['Camera Capture / OCR Error:', 'Hindi valid na resibo']);

interface ReceiptScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onScanComplete: (data: { amount: string; category: string; date: string; note: string }) => void;
  categories: any[];
  userId?: string;
}

// Dapat tumugma ito sa visual proportions ng styles.scanFrame sa ibaba
// (width: '82%', height: '85%', centered) — dito kino-crop ang aktwal na litrato.
const GUIDE_FRAME_WIDTH_RATIO = 0.82;
const GUIDE_FRAME_HEIGHT_RATIO = 0.85;
const MAX_MULTI_PHOTOS = 4;

export default function ReceiptScannerModal({ 
  visible, 
  onClose, 
  onScanComplete, 
  categories,
  userId 
}: ReceiptScannerModalProps) {
  const [permission, requestPermission] = useCameraPermissions();
  
  // State management
  const [capturedPhotos, setCapturedPhotos] = useState<string[]>([]);
  const [isMultiMode, setIsMultiMode] = useState(false); // Default: Single Photo Scan
  const [isPreviewing, setIsPreviewing] = useState(false); // Freeze Frame State
  const [isProcessing, setIsProcessing] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);
  const cameraRef = useRef<any>(null);

  useEffect(() => {
    if (visible && (!permission || !permission.granted)) {
      requestPermission();
    }
    if (visible) {
      handleResetAll();
    }
  }, [visible]);

  const handleResetAll = () => {
    setCapturedPhotos([]);
    setIsPreviewing(false);
    setIsProcessing(false);
  };

  // Tinatanggal lang yung pinaka-huling kuha, hindi lahat — para sa "Retake"
  // sa multi-photo flow kung sablay lang yung pinaka-bagong shot.
  const handleRetakeLast = () => {
    setCapturedPhotos((prev) => prev.slice(0, -1));
    setIsPreviewing(false);
  };

  // Balik sa live camera para kumuha pa ng dagdag na section, pero
  // panatilihin yung mga nakuha na — para sa mahahabang resibo na
  // kailangan ng 3+ segments.
  const handleAddAnother = () => {
    setIsPreviewing(false);
  };

  // I-crop papunta sa proportions ng berdeng guide frame bago i-upload,
  // para hindi masayang ang resolution sa background/paligid ng resibo.
  const cropToGuideFrame = async (uri: string, photoWidth?: number, photoHeight?: number): Promise<string> => {
    try {
      if (!photoWidth || !photoHeight) return uri;

      const cropWidth = Math.round(photoWidth * GUIDE_FRAME_WIDTH_RATIO);
      const cropHeight = Math.round(photoHeight * GUIDE_FRAME_HEIGHT_RATIO);
      const originX = Math.round((photoWidth - cropWidth) / 2);
      const originY = Math.round((photoHeight - cropHeight) / 2);

      const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ crop: { originX, originY, width: cropWidth, height: cropHeight } }],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
      );

      return result.uri;
    } catch (cropError) {
      console.log("Crop Error (gagamitin na lang ang orihinal na litrato):", cropError);
      return uri; // huwag ma-block ang buong flow kung sablay lang ang crop
    }
  };

  // Direct Submission Logic to FastAPI Endpoint
  const submitPhotosToBackend = async (photos: string[]) => {
    if (!photos || photos.length === 0) {
      Alert.alert("FinAi Scanner", "Walang larawan ang natanggap. Kunan ulit ang resibo.");
      return;
    }

    try {
      setIsProcessing(true);

      const formData = new FormData();

      photos.forEach((uri, index) => {
        formData.append('files', {
          uri,
          name: `receipt_frame_${index + 1}.jpg`,
          type: 'image/jpeg',
        } as any);
      });

      if (userId) {
        formData.append('user_id', userId);
      }

      const response = await fetch(`${API_URL}/ocr-scan`, {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      let result: any = {};
      try {
        result = await response.json();
      } catch {
        result = {};
      }

      if (!response.ok) {
        throw new Error(result?.detail || "Hindi nabasa nang maayos ang resibo. Subukan ulit paps.");
      }

      const payload = result?.data || {};
      const extractedAmount = payload.amount || "0.00";
      const extractedMerchant = payload.merchant || "Store";
      const backendCategory = payload.category || "General";
      const extractedDate = payload.date || new Date().toISOString().split('T')[0];

      let matchedCategory = backendCategory;
      const foundCat = categories.find((c) => {
        const categoryName = (c?.name || '').toLowerCase();
        const backendName = (backendCategory || '').toLowerCase();
        return categoryName.includes(backendName) || backendName.includes(categoryName);
      });

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
      Alert.alert("FinAi Scanner", error?.message || "Hindi nabasa nang maayos ang resibo. Subukan ulit paps.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCapture = async () => {
    if (!cameraRef.current || isProcessing) return;

    try {
      // 1. Shutter Flash Feedback
      setIsFlashing(true);
      setTimeout(() => setIsFlashing(false), 150);

      // 2. High Quality Image Capture
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        skipProcessing: false,
        exif: false,
      });

      // 3. I-crop papunta sa guide frame area para hindi masayang ang
      // resolution sa background — ito yung pangunahing fix sa "malaking
      // frame" issue lalo na sa multi-photo mode.
      const finalUri = await cropToGuideFrame(photo.uri, photo.width, photo.height);

      const updatedPhotos = [...capturedPhotos, finalUri];
      setCapturedPhotos(updatedPhotos);

      // Palaging mag-freeze preview pagkatapos ng bawat kuha (single o multi),
      // para makapag-decide ang user: retake / add another / analyze na.
      setIsPreviewing(true);

    } catch (error: any) {
      console.log("Capture Error:", error);
      Alert.alert("Error", "Bumagsak ang kuha ng camera. Subukan ulit.");
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

  const canAddAnother = isMultiMode && capturedPhotos.length < MAX_MULTI_PHOTOS;

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={styles.container}>
        
        {/* 1. Camera Live Stream O Freeze Preview Frame */}
        {isPreviewing && capturedPhotos.length > 0 ? (
          <Image 
            source={{ uri: capturedPhotos[capturedPhotos.length - 1] }} 
            style={StyleSheet.absoluteFillObject} 
            resizeMode="cover"
          />
        ) : (
          <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} facing="back" />
        )}

        {/* 2. White Flash Overlay Animation Effect */}
        {isFlashing && <View style={styles.flashOverlay} pointerEvents="none" />}

        {/* 3. Absolute overlay for UI elements */}
        <View style={styles.overlayContainer} pointerEvents="box-none">
          
          {/* Header Controls */}
          <View style={styles.overlayHeader}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            
            {/* Mode Selector Toggle Button */}
            {!isPreviewing && (
              <TouchableOpacity 
                style={[styles.modeToggle, isMultiMode && styles.modeToggleActive]}
                onPress={() => {
                  setIsMultiMode(!isMultiMode);
                  handleResetAll();
                }}
              >
                <Ionicons name={isMultiMode ? "layers" : "document-text"} size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.modeToggleText}>
                  {isMultiMode ? "Long Receipt (Multi-Photo)" : "Standard (1 Photo)"}
                </Text>
              </TouchableOpacity>
            )}

            {capturedPhotos.length > 0 ? (
              <TouchableOpacity onPress={handleResetAll} style={styles.resetButton}>
                <Ionicons name="refresh" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 40 }} />
            )}
          </View>

          {/* Scanner Guidance Frame / Freeze Notice */}
          <View style={styles.scanFrameContainer}>
            {!isPreviewing ? (
              <>
                <View style={styles.scanFrame} />
                <Text style={styles.frameInstruction}>
                  {isMultiMode 
                    ? (capturedPhotos.length === 0 
                        ? "📸 Section 1: Kunan ang Store Header" 
                        : `📸 Section ${capturedPhotos.length + 1}: Kunan ang susunod na parte`)
                    : "📸 I-tapat ang buong resibo sa frame"}
                </Text>
              </>
            ) : (
              <View style={styles.freezeBadge}>
                <Ionicons name="checkmark-circle" size={20} color="#10B981" style={{ marginRight: 6 }} />
                <Text style={styles.freezeBadgeText}>Photo Captured! Pakisuri kung malinaw.</Text>
              </View>
            )}
          </View>

          {/* Footer Controls & Actions */}
          <View style={styles.overlayFooter}>
            
            {/* Case A: FREEZE PREVIEW MODE (Retake, Add Another, or Analyze) */}
            {isPreviewing ? (
              <View style={styles.previewActionsContainer}>
                {isProcessing ? (
                  <View style={styles.processingContainer}>
                    <ActivityIndicator size="large" color="#10B981" />
                    <Text style={styles.processingText}>FinAi Engine analyzing receipt...</Text>
                  </View>
                ) : (
                  <>
                    {canAddAnother && (
                      <TouchableOpacity style={styles.addAnotherButton} onPress={handleAddAnother}>
                        <Ionicons name="add-circle-outline" size={18} color="#10B981" style={{ marginRight: 6 }} />
                        <Text style={styles.addAnotherButtonText}>Add Another Section</Text>
                      </TouchableOpacity>
                    )}

                    <View style={styles.actionButtonGroup}>
                      <TouchableOpacity style={styles.retakeButton} onPress={handleRetakeLast}>
                        <Ionicons name="camera-reverse" size={20} color="#FFFFFF" style={{ marginRight: 6 }} />
                        <Text style={styles.actionButtonText}>Retake</Text>
                      </TouchableOpacity>

                      <TouchableOpacity 
                        style={styles.submitButton} 
                        onPress={() => submitPhotosToBackend(capturedPhotos)}
                      >
                        <Ionicons name="sparkles" size={20} color="#FFFFFF" style={{ marginRight: 6 }} />
                        <Text style={styles.actionButtonText}>
                          Analyze {capturedPhotos.length} {capturedPhotos.length > 1 ? "Photos" : "Photo"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            ) : (
              /* Case B: LIVE CAMERA SHUTTER MODE */
              <View style={{ alignItems: 'center' }}>
                {isMultiMode && capturedPhotos.length >= 1 && (
                  <View style={styles.stepIndicator}>
                    <Text style={styles.stepIndicatorText}>
                      {capturedPhotos.length} section{capturedPhotos.length > 1 ? "s" : ""} captured na. Kunan pa o Analyze na sa preview.
                    </Text>
                  </View>
                )}

                <TouchableOpacity style={styles.captureButton} onPress={handleCapture}>
                  <View style={styles.captureButtonInner} />
                </TouchableOpacity>
              </View>
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
  modeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#7C9A95'
  },
  modeToggleActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.3)',
    borderColor: '#10B981'
  },
  modeToggleText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  scanFrameContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scanFrame: { 
    width: '82%', 
    height: '85%', 
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
  freezeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(20, 45, 42, 0.95)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#10B981'
  },
  freezeBadgeText: { color: '#FFFFFF', fontSize: 13, fontWeight: 'bold' },
  overlayFooter: { paddingBottom: 40, alignItems: 'center', paddingHorizontal: 20 },
  previewActionsContainer: { width: '100%', alignItems: 'center' },
  addAnotherButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: '#10B981',
    paddingVertical: 12,
    borderRadius: 16,
    width: '100%',
    marginBottom: 12
  },
  addAnotherButtonText: { color: '#10B981', fontWeight: 'bold', fontSize: 13 },
  actionButtonGroup: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', gap: 12 },
  retakeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.85)',
    paddingVertical: 14,
    borderRadius: 16
  },
  submitButton: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: 16
  },
  actionButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
  stepIndicator: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#10B981'
  },
  stepIndicatorText: { color: '#10B981', fontSize: 12, fontWeight: 'bold' },
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
    backgroundColor: 'rgba(20, 45, 42, 0.95)', 
    paddingHorizontal: 24, 
    paddingVertical: 16, 
    borderRadius: 16,
    width: '100%'
  },
  processingText: { color: '#FFFFFF', marginTop: 8, fontSize: 14, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(20, 45, 42, 0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  permissionBox: { backgroundColor: '#FFFFFF', padding: 30, borderRadius: 20, alignItems: 'center', width: '80%' },
  permissionText: { textAlign: 'center', marginBottom: 20, fontSize: 15, color: '#142D2A' },
  permissionButton: { backgroundColor: '#2b5f56', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12 },
  permissionButtonText: { color: '#FFFFFF', fontWeight: 'bold' }
});
