import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  DeviceEventEmitter,
  findNodeHandle,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import RNFS from 'react-native-fs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import Toolbar from '../components/Toolbar';
import PdfCanvasView from '../native/PdfCanvasView';
import PdfCanvasModule from '../native/PdfCanvasModule';
import SelectionPopup from '../components/SelectionPopup';
import { SelectionInfo } from '../native/CanvasView';
import { useToolStore } from '../store/useToolStore';
import { useNotebookStore } from '../store/useNotebookStore';
import ThumbnailStrip from '../components/ThumbnailStrip';

type Props = NativeStackScreenProps<RootStackParamList, 'PdfViewer'>;

const DRAWINGS_DIR = `${RNFS.DocumentDirectoryPath}/drawings`;

export default function PdfViewerScreen({ route, navigation }: Props) {
  const { note } = route.params;
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(note.lastPage ?? 1);
  const [loading, setLoading] = useState(true);
  const [showStrip, setShowStrip] = useState(false);
  const [showPageInput, setShowPageInput] = useState(false);
  const [pageInputText, setPageInputText] = useState('');
  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | null>(null);
  const viewRef = useRef<any>(null);
  const updateNote = useNotebookStore(s => s.updateNote);
  const activeTool           = useToolStore(s => s.activeTool);
  const penThickness         = useToolStore(s => s.penThickness);
  const eraserThickness      = useToolStore(s => s.eraserThickness);
  const eraserMode           = useToolStore(s => s.eraserMode);
  const penColor             = useToolStore(s => s.penColor);
  const highlighterColor     = useToolStore(s => s.highlighterColor);
  const highlighterThickness = useToolStore(s => s.highlighterThickness);

  // Default to scroll mode on entry
  useEffect(() => {
    useToolStore.getState().setTool('scroll');
  }, []);

  // Listen to native events from PdfDrawingView
  useEffect(() => {
    const pageSub = DeviceEventEmitter.addListener(
      'pdfCanvasPageChanged',
      ({ page }: { page: number }) => setCurrentPage(page),
    );
    const selSub = DeviceEventEmitter.addListener(
      'pdfSelectionChanged',
      (info: SelectionInfo) => setSelectionInfo(info),
    );
    const loadSub = DeviceEventEmitter.addListener(
      'pdfCanvasLoadComplete',
      ({ totalPages: tp }: { totalPages: number }) => {
        setTotalPages(tp);
        setLoading(false);
        if (!note.totalPages || note.totalPages !== tp) {
          updateNote(note.id, { totalPages: tp });
        }
        // Jump to last checkpoint
        if (note.lastPage && note.lastPage > 1) {
          const tag = findNodeHandle(viewRef.current);
          if (tag) PdfCanvasModule.scrollToPage(tag, note.lastPage);
        }
      },
    );
    return () => { pageSub.remove(); selSub.remove(); loadSub.remove(); };
  }, [note.lastPage]);

  // Load saved strokes once the view is laid out
  const handleViewLayout = useCallback(async () => {
    if (!note.drawingUri) return;
    const exists = await RNFS.exists(note.drawingUri);
    if (!exists) return;
    const json = await RNFS.readFile(note.drawingUri, 'utf8');
    // Only load flat-array format (document coordinates); skip legacy per-page format
    if (!json.startsWith('[')) return;
    const tag = findNodeHandle(viewRef.current);
    if (tag) PdfCanvasModule.loadStrokes(tag, json);
  }, [note.drawingUri]);

  // Save strokes and page checkpoint when navigating back
  const saveStrokes = useCallback(async () => {
    updateNote(note.id, { lastPage: currentPage, updatedAt: Date.now() });
    const tag = findNodeHandle(viewRef.current);
    if (!tag) return;
    const json = await PdfCanvasModule.getStrokes(tag);
    if (json === '[]') return;
    await RNFS.mkdir(DRAWINGS_DIR);
    const filePath = `${DRAWINGS_DIR}/${note.id}.json`;
    await RNFS.writeFile(filePath, json, 'utf8');
    updateNote(note.id, { drawingUri: filePath });
  }, [note.id, currentPage, updateNote]);

  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', saveStrokes);
    return unsub;
  }, [navigation, saveStrokes]);

  const handleGoToPage = useCallback(() => {
    const page = parseInt(pageInputText, 10);
    if (!isNaN(page) && page >= 1 && page <= totalPages) {
      const tag = findNodeHandle(viewRef.current);
      if (tag) PdfCanvasModule.scrollToPage(tag, page);
    }
    setShowPageInput(false);
    setPageInputText('');
  }, [pageInputText, totalPages]);

  const handleUndo = useCallback(() => {
    const tag = findNodeHandle(viewRef.current);
    if (tag) PdfCanvasModule.undo(tag);
  }, []);

  const handleRedo = useCallback(() => {
    const tag = findNodeHandle(viewRef.current);
    if (tag) PdfCanvasModule.redo(tag);
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{note.title}</Text>
        <View style={styles.headerRight} />
      </View>

      <Toolbar
        showHandTool
        onUndo={handleUndo}
        onRedo={handleRedo}
        onToggleStrip={() => setShowStrip(s => !s)}
        showStrip={showStrip}
        currentPage={currentPage}
        totalPages={totalPages}
      />

      <View style={styles.pdfContainer}>
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#FFFFFF" />
            <Text style={styles.loadingText}>Loading PDF...</Text>
          </View>
        )}

        <PdfCanvasView
          ref={viewRef}
          pdfUri={note.pdfUri}
          tool={activeTool}
          penColor={penColor}
          penThickness={penThickness}
          eraserThickness={eraserThickness}
          eraserMode={eraserMode}
          highlighterColor={highlighterColor}
          highlighterThickness={highlighterThickness}
          style={StyleSheet.absoluteFill}
          onLayout={handleViewLayout}
        />

        {totalPages > 0 && (
          <TouchableOpacity
            style={styles.pageIndex}
            onPress={() => { setPageInputText(String(currentPage)); setShowPageInput(true); }}
            activeOpacity={0.8}
          >
            <Text style={styles.pageIndexText}>{currentPage} / {totalPages}</Text>
          </TouchableOpacity>
        )}

        {selectionInfo?.hasSelection && (() => {
          const tag = findNodeHandle(viewRef.current);
          return tag != null ? (
            <SelectionPopup
              info={selectionInfo}
              onDelete={() => PdfCanvasModule.deleteSelected(tag)}
            />
          ) : null;
        })()}
      </View>

      <Modal visible={showPageInput} transparent animationType="fade" onRequestClose={() => setShowPageInput(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setShowPageInput(false)} />
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Go to page</Text>
            <TextInput
              style={styles.modalInput}
              keyboardType="number-pad"
              value={pageInputText}
              onChangeText={setPageInputText}
              onSubmitEditing={handleGoToPage}
              selectTextOnFocus
              autoFocus
              maxLength={6}
            />
            <Text style={styles.modalHint}>1 – {totalPages}</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowPageInput(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalGo} onPress={handleGoToPage}>
                <Text style={styles.modalGoText}>Go</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {showStrip && note.pdfUri && totalPages > 0 && (
        <ThumbnailStrip
          pdfUri={note.pdfUri}
          noteId={note.id}
          totalPages={totalPages}
          currentPage={currentPage}
          onPageSelect={(page) => {
            const tag = findNodeHandle(viewRef.current);
            if (tag) PdfCanvasModule.scrollToPage(tag, page);
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#2C2C2C' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#1A1A1A',
  },
  backButton: { paddingVertical: 6, paddingRight: 16 },
  backButtonText: { color: '#FFFFFF', fontSize: 16 },
  title: { flex: 1, color: '#FFFFFF', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  headerRight: { minWidth: 60 },
  pdfContainer: { flex: 1 },
  pageIndex: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pageIndexText: { color: '#FFFFFF', fontSize: 13 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2C2C2C',
    zIndex: 1,
  },
  loadingText: { color: '#AAAAAA', marginTop: 12, fontSize: 14 },
  modalOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  modalBox: {
    backgroundColor: '#2C2C2C',
    borderRadius: 14,
    padding: 24,
    width: 260,
    alignItems: 'center',
  },
  modalTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', marginBottom: 16 },
  modalInput: {
    backgroundColor: '#1A1A1A',
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    borderRadius: 8,
    width: '100%',
    paddingVertical: 10,
    marginBottom: 6,
  },
  modalHint: { color: '#777', fontSize: 12, marginBottom: 20 },
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalCancel: {
    flex: 1, paddingVertical: 10, borderRadius: 8,
    backgroundColor: '#3A3A3A', alignItems: 'center',
  },
  modalCancelText: { color: '#AAA', fontSize: 15 },
  modalGo: {
    flex: 1, paddingVertical: 10, borderRadius: 8,
    backgroundColor: '#4A90E2', alignItems: 'center',
  },
  modalGoText: { color: '#FFF', fontSize: 15, fontWeight: '600' },
});
