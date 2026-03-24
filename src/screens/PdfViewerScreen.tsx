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
  Animated,
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
  const [toolLabel, setToolLabel] = useState('');
  const labelOpacity = useRef(new Animated.Value(0)).current;
  const labelAnim = useRef<Animated.CompositeAnimation | null>(null);
  const handleShowLabel = useCallback((name: string) => {
    labelAnim.current?.stop();
    if (!name) {
      labelOpacity.setValue(0);
      setToolLabel('');
      return;
    }
    setToolLabel(name);
    labelOpacity.setValue(1);
    labelAnim.current = Animated.sequence([
      Animated.delay(800),
      Animated.timing(labelOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]);
    labelAnim.current.start(({ finished }) => { if (finished) setToolLabel(''); });
  }, [labelOpacity]);
  const [pageInputText, setPageInputText] = useState('');
  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | null>(null);
  const [activeTextBox, setActiveTextBox] = useState<{
    id: string | null;
    docX: number; docY: number; width: number; height: number;
  } | null>(null);
  const [activeTextInput, setActiveTextInput] = useState('');
  const [localTextBold, setLocalTextBold] = useState(false);
  const [localTextItalic, setLocalTextItalic] = useState(false);
  const [localTextFontSize, setLocalTextFontSize] = useState(24);
  const [localTextFontFamily, setLocalTextFontFamily] = useState('sans-serif');
  const [localTextColor, setLocalTextColor] = useState('#000000');
  const textInputRef = useRef<TextInput>(null);
  const viewRef = useRef<any>(null);
  const strokesLoadedRef = useRef(false);
  const updateNote = useNotebookStore(s => s.updateNote);
  const activeTool           = useToolStore(s => s.activeTool);
  const penThickness         = useToolStore(s => s.penThickness);
  const eraserThickness      = useToolStore(s => s.eraserThickness);
  const eraserMode           = useToolStore(s => s.eraserMode);
  const penColor             = useToolStore(s => s.penColor);
  const highlighterColor     = useToolStore(s => s.highlighterColor);
  const highlighterThickness = useToolStore(s => s.highlighterThickness);
  const laserColor           = useToolStore(s => s.laserColor);
  const shapeType            = useToolStore(s => s.shapeType);
  const shapeColor           = useToolStore(s => s.shapeColor);
  const shapeThickness       = useToolStore(s => s.shapeThickness);
  const textColor            = useToolStore(s => s.textColor);
  const textFontSize         = useToolStore(s => s.textFontSize);
  const textBold             = useToolStore(s => s.textBold);
  const textItalic           = useToolStore(s => s.textItalic);
  const textFontFamily       = useToolStore(s => s.textFontFamily);

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
        // Restore last zoom and page
        const tag = findNodeHandle(viewRef.current);
        if (tag) {
          if (note.lastScale) PdfCanvasModule.setScale(tag, note.lastScale);
          if (note.lastPage && note.lastPage > 1) PdfCanvasModule.scrollToPage(tag, note.lastPage);
        }
      },
    );
    return () => { pageSub.remove(); selSub.remove(); loadSub.remove(); };
  }, [note.lastPage]);

  // Auto-focus text input when panel opens
  useEffect(() => {
    if (activeTextBox) {
      const t = setTimeout(() => textInputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [activeTextBox !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cancel editing when tool changes away from text
  useEffect(() => {
    if (activeTool !== 'text' && activeTextBox) {
      const tag = findNodeHandle(viewRef.current);
      if (tag) {
        if (activeTextBox.id === null) PdfCanvasModule.clearPendingBox(tag);
        else PdfCanvasModule.setActiveText(tag, '');
      }
      setActiveTextBox(null);
    }
  }, [activeTool]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for text tap events from Kotlin
  useEffect(() => {
    const newTextSub = DeviceEventEmitter.addListener('pdfCanvasTextTap', ({ docX, docY, width, height }: { docX: number; docY: number; width: number; height: number }) => {
      setActiveTextBox({ id: null, docX, docY, width, height });
      setActiveTextInput('');
      setLocalTextBold(textBold);
      setLocalTextItalic(textItalic);
      setLocalTextFontSize(textFontSize);
      setLocalTextFontFamily(textFontFamily);
      setLocalTextColor(textColor);
    });
    const editTextSub = DeviceEventEmitter.addListener('pdfCanvasTextEditTap', (el: {
      id: string; text: string; docX: number; docY: number; width: number; height: number;
      fontSize: number; color: number; bold: boolean; italic: boolean; fontFamily: string;
    }) => {
      const r = (el.color >> 16) & 0xFF;
      const g = (el.color >> 8) & 0xFF;
      const b = el.color & 0xFF;
      const colorHex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      setActiveTextBox({ id: el.id, docX: el.docX, docY: el.docY, width: el.width, height: el.height });
      setActiveTextInput(el.text);
      setLocalTextBold(el.bold);
      setLocalTextItalic(el.italic);
      setLocalTextFontSize(Math.round(el.fontSize));
      setLocalTextFontFamily(el.fontFamily);
      setLocalTextColor(colorHex);
    });
    return () => { newTextSub.remove(); editTextSub.remove(); };
  }, [textBold, textItalic, textFontSize, textFontFamily, textColor]);

  // Load saved strokes once on initial layout only — must not re-run on rotation,
  // because reLayoutPages in Kotlin already rescales coordinates in-place.
  const handleViewLayout = useCallback(async () => {
    if (strokesLoadedRef.current) return;
    strokesLoadedRef.current = true;
    if (!note.drawingUri) return;
    const exists = await RNFS.exists(note.drawingUri);
    if (!exists) return;
    const json = await RNFS.readFile(note.drawingUri, 'utf8');
    const tag = findNodeHandle(viewRef.current);
    if (tag) PdfCanvasModule.loadStrokes(tag, json);
  }, [note.drawingUri]);

  // Save strokes, page and zoom checkpoint when navigating back
  const saveStrokes = useCallback(async () => {
    try {
      updateNote(note.id, { lastPage: currentPage, updatedAt: Date.now() });
      const tag = findNodeHandle(viewRef.current);
      if (!tag) return;
      const [json, scale] = await Promise.all([
        PdfCanvasModule.getStrokes(tag),
        PdfCanvasModule.getScale(tag),
      ]);
      updateNote(note.id, { lastScale: scale });
      try {
        const parsed = JSON.parse(json);
        const strokes = Array.isArray(parsed) ? parsed : (parsed.strokes ?? []);
        const textEls = Array.isArray(parsed) ? [] : (parsed.textElements ?? []);
        if (strokes.length === 0 && textEls.length === 0) return;
      } catch (_) { return; }
      await RNFS.mkdir(DRAWINGS_DIR);
      const filePath = `${DRAWINGS_DIR}/${note.id}.json`;
      await RNFS.writeFile(filePath, json, 'utf8');
      updateNote(note.id, { drawingUri: filePath });
    } catch (_) {}
  }, [note.id, currentPage, updateNote]);

  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', saveStrokes);
    return unsub;
  }, [navigation, saveStrokes]);

  // Periodic auto-save every 30 seconds
  useEffect(() => {
    const id = setInterval(saveStrokes, 30_000);
    return () => clearInterval(id);
  }, [saveStrokes]);

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

  const handleTextConfirm = useCallback(() => {
    const tag = findNodeHandle(viewRef.current);
    if (!tag || !activeTextBox) return;
    const text = activeTextInput.trim();
    if (!text) {
      if (activeTextBox.id === null) PdfCanvasModule.clearPendingBox(tag);
      else PdfCanvasModule.setActiveText(tag, '');
      setActiveTextBox(null);
      return;
    }
    if (activeTextBox.id === null) {
      const id = `text_${Date.now()}`;
      PdfCanvasModule.addTextElement(tag, id, text, activeTextBox.docX, activeTextBox.docY, activeTextBox.width, activeTextBox.height, localTextFontSize, localTextColor, localTextBold, localTextItalic, localTextFontFamily);
    } else {
      PdfCanvasModule.updateTextElement(tag, activeTextBox.id, text, localTextFontSize, localTextColor, localTextBold, localTextItalic, localTextFontFamily);
    }
    setActiveTextBox(null);
  }, [activeTextInput, activeTextBox, localTextFontSize, localTextColor, localTextBold, localTextItalic, localTextFontFamily]);

  const handleTextCancel = useCallback(() => {
    const tag = findNodeHandle(viewRef.current);
    if (tag && activeTextBox) {
      if (activeTextBox.id === null) PdfCanvasModule.clearPendingBox(tag);
      else PdfCanvasModule.setActiveText(tag, '');
    }
    setActiveTextBox(null);
  }, [activeTextBox]);

  const handleTextDelete = useCallback(() => {
    if (!activeTextBox?.id) return;
    const tag = findNodeHandle(viewRef.current);
    if (tag) PdfCanvasModule.deleteTextElement(tag, activeTextBox.id);
    setActiveTextBox(null);
  }, [activeTextBox]);

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
        onShowLabel={handleShowLabel}
        showStrip={showStrip}
        currentPage={currentPage}
        totalPages={totalPages}
      />

      <View style={styles.pdfContainer}>
        {!!toolLabel && (
          <Animated.View style={[styles.toolLabel, { opacity: labelOpacity }]} pointerEvents="none">
            <Text style={styles.toolLabelText}>{toolLabel}</Text>
          </Animated.View>
        )}
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
          laserColor={laserColor}
          shapeType={shapeType}
          shapeColor={shapeColor}
          shapeThickness={shapeThickness}
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

      {/* Inline text editing panel — no modal */}
      {activeTextBox && (
        <KeyboardAvoidingView
          style={styles.textPanel}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.textFmtRow}>
            <TouchableOpacity
              style={[styles.fmtBtn, localTextBold && styles.fmtBtnOn]}
              onPress={() => setLocalTextBold(b => !b)}
            >
              <Text style={[styles.fmtBtnText, localTextBold && styles.fmtBtnOnText, { fontWeight: '700' }]}>B</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.fmtBtn, localTextItalic && styles.fmtBtnOn]}
              onPress={() => setLocalTextItalic(i => !i)}
            >
              <Text style={[styles.fmtBtnText, localTextItalic && styles.fmtBtnOnText, { fontStyle: 'italic' }]}>I</Text>
            </TouchableOpacity>
            <View style={styles.fmtSep} />
            <TouchableOpacity onPress={() => setLocalTextFontSize(s => Math.max(8, s - 2))} style={styles.fmtBtn}>
              <Text style={styles.fmtBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.fmtSizeVal}>{localTextFontSize}pt</Text>
            <TouchableOpacity onPress={() => setLocalTextFontSize(s => Math.min(72, s + 2))} style={styles.fmtBtn}>
              <Text style={styles.fmtBtnText}>+</Text>
            </TouchableOpacity>
            <View style={styles.fmtSep} />
            <View style={[styles.fmtColorDot, { backgroundColor: localTextColor }]} />
            <View style={{ flex: 1 }} />
            {activeTextBox.id !== null && (
              <TouchableOpacity style={styles.fmtDeleteBtn} onPress={handleTextDelete}>
                <Text style={styles.fmtDeleteText}>Delete</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.fmtCancelBtn} onPress={handleTextCancel}>
              <Text style={styles.fmtCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.fmtDoneBtn} onPress={handleTextConfirm}>
              <Text style={styles.fmtDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            ref={textInputRef}
            style={styles.textPanelInput}
            multiline
            value={activeTextInput}
            onChangeText={setActiveTextInput}
            placeholder="Type here..."
            placeholderTextColor="#666"
            textAlignVertical="top"
            autoFocus={false}
          />
        </KeyboardAvoidingView>
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
  toolLabel: {
    position: 'absolute',
    top: 12,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  toolLabelText: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 8,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
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
  // Inline text editing panel (PDF screen - dark theme)
  textPanel: { borderTopWidth: 1, borderTopColor: '#3A3A3A', paddingHorizontal: 12, paddingBottom: 6, backgroundColor: '#2C2C2C' },
  textFmtRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  fmtBtn: { width: 32, height: 32, borderRadius: 6, borderWidth: 1.5, borderColor: '#666', alignItems: 'center', justifyContent: 'center' },
  fmtBtnOn: { backgroundColor: '#FFFFFF' },
  fmtBtnText: { fontSize: 15, color: '#FFFFFF' },
  fmtBtnOnText: { color: '#1A1A1A' },
  fmtSep: { width: 1, height: 20, backgroundColor: '#555' },
  fmtSizeVal: { fontSize: 13, fontWeight: '600', minWidth: 32, textAlign: 'center', color: '#FFFFFF' },
  fmtColorDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#666' },
  fmtDeleteBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: '#4A0000' },
  fmtDeleteText: { color: '#FF6B6B', fontSize: 13, fontWeight: '500' },
  fmtCancelBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: '#3A3A3A' },
  fmtCancelText: { fontSize: 13, color: '#AAA' },
  fmtDoneBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 6, backgroundColor: '#4A90E2' },
  fmtDoneText: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  textPanelInput: { minHeight: 80, maxHeight: 160, borderRadius: 8, padding: 10, fontSize: 16, color: '#FFFFFF', backgroundColor: '#1A1A1A', marginBottom: 4 },
});
