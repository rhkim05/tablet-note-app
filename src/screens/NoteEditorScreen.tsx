import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Share,
  findNodeHandle,
  Animated,
  DeviceEventEmitter,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import RNFS from 'react-native-fs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import Toolbar from '../components/Toolbar';
import CanvasView, { SelectionInfo } from '../native/CanvasView';
import CanvasModule from '../native/CanvasModule';
import SelectionPopup from '../components/SelectionPopup';
import NotePageStrip from '../components/NotePageStrip';
import { useToolStore } from '../store/useToolStore';
import { useNotebookStore } from '../store/useNotebookStore';
import { useTheme } from '../styles/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'NoteEditor'>;

const DRAWINGS_DIR = `${RNFS.DocumentDirectoryPath}/drawings`;

export default function NoteEditorScreen({ route, navigation }: Props) {
  const { note } = route.params;
  const canvasRef = useRef<any>(null);
  const strokesLoadedRef = useRef(false);
  const activeTool          = useToolStore(s => s.activeTool);
  const penThickness        = useToolStore(s => s.penThickness);
  const eraserThickness     = useToolStore(s => s.eraserThickness);
  const eraserMode          = useToolStore(s => s.eraserMode);
  const penColor            = useToolStore(s => s.penColor);
  const highlighterColor    = useToolStore(s => s.highlighterColor);
  const highlighterThickness = useToolStore(s => s.highlighterThickness);
  const laserColor          = useToolStore(s => s.laserColor);
  const shapeType           = useToolStore(s => s.shapeType);
  const shapeColor          = useToolStore(s => s.shapeColor);
  const shapeThickness      = useToolStore(s => s.shapeThickness);
  const textColor           = useToolStore(s => s.textColor);
  const textFontSize        = useToolStore(s => s.textFontSize);
  const textBold            = useToolStore(s => s.textBold);
  const textItalic          = useToolStore(s => s.textItalic);
  const textFontFamily      = useToolStore(s => s.textFontFamily);
  const updateNote = useNotebookStore(s => s.updateNote);
  const theme = useTheme();

  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | null>(null);
  // Text editing state (no modal — inline panel)
  const [activeTextBox, setActiveTextBox] = useState<{
    id: string | null;  // null = new box (pending in Kotlin)
    docX: number; docY: number; width: number; height: number;
  } | null>(null);
  const [activeTextInput, setActiveTextInput] = useState('');
  const [localTextBold, setLocalTextBold] = useState(false);
  const [localTextItalic, setLocalTextItalic] = useState(false);
  const [localTextFontSize, setLocalTextFontSize] = useState(24);
  const [localTextFontFamily, setLocalTextFontFamily] = useState('sans-serif');
  const [localTextColor, setLocalTextColor] = useState('#000000');
  const textInputRef = useRef<TextInput>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showStrip, setShowStrip] = useState(false);
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

  // Save strokes and zoom to file and update the note record
  const saveStrokes = useCallback(async () => {
    try {
      const tag = findNodeHandle(canvasRef.current);
      if (!tag) return;
      const [json, scale] = await Promise.all([
        CanvasModule.getStrokes(tag),
        CanvasModule.getScale(tag),
      ]);
      updateNote(note.id, { lastScale: scale, updatedAt: Date.now() });
      // v2 format: { version, pageCount, strokes: [...], textElements: [...] }
      const parsed = JSON.parse(json);
      const strokes = Array.isArray(parsed) ? parsed : (parsed.strokes ?? []);
      const textEls = Array.isArray(parsed) ? [] : (parsed.textElements ?? []);
      if (strokes.length === 0 && textEls.length === 0) return;
      await RNFS.mkdir(DRAWINGS_DIR);
      const filePath = `${DRAWINGS_DIR}/${note.id}.json`;
      await RNFS.writeFile(filePath, json, 'utf8');
      updateNote(note.id, { drawingUri: filePath });
    } catch (_) {}
  }, [note.id, updateNote]);

  // Save when the user navigates back
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', saveStrokes);
    return unsub;
  }, [navigation, saveStrokes]);

  // Periodic auto-save every 30 seconds
  useEffect(() => {
    const id = setInterval(saveStrokes, 30_000);
    return () => clearInterval(id);
  }, [saveStrokes]);

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
      const tag = findNodeHandle(canvasRef.current);
      if (tag) {
        if (activeTextBox.id === null) CanvasModule.clearPendingBox(tag);
        else CanvasModule.setActiveText(tag, '');
      }
      setActiveTextBox(null);
    }
  }, [activeTool]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for text tap events from Kotlin
  useEffect(() => {
    const newTextSub = DeviceEventEmitter.addListener('canvasTextTap', ({ docX, docY, width, height }: { docX: number; docY: number; width: number; height: number }) => {
      setActiveTextBox({ id: null, docX, docY, width, height });
      setActiveTextInput('');
      setLocalTextBold(textBold);
      setLocalTextItalic(textItalic);
      setLocalTextFontSize(textFontSize);
      setLocalTextFontFamily(textFontFamily);
      setLocalTextColor(textColor);
    });
    const editTextSub = DeviceEventEmitter.addListener('canvasTextEditTap', (el: {
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

  // Load strokes once on initial layout only — must not re-run on rotation,
  // because onSizeChanged in Kotlin already rescales coordinates in-place.
  const handleLayout = useCallback(async () => {
    if (strokesLoadedRef.current) return;
    strokesLoadedRef.current = true;
    if (!note.drawingUri) return;
    const exists = await RNFS.exists(note.drawingUri);
    if (!exists) return;
    const json = await RNFS.readFile(note.drawingUri, 'utf8');
    const tag = findNodeHandle(canvasRef.current);
    if (tag) {
      CanvasModule.loadStrokes(tag, json);
      if (note.lastScale) CanvasModule.setScale(tag, note.lastScale);
    }
  }, [note.drawingUri, note.lastScale]);

  const handleUndo = useCallback(() => {
    const tag = findNodeHandle(canvasRef.current);
    if (tag) CanvasModule.undo(tag);
  }, []);

  const handleRedo = useCallback(() => {
    const tag = findNodeHandle(canvasRef.current);
    if (tag) CanvasModule.redo(tag);
  }, []);

  const handleTextConfirm = useCallback(() => {
    const tag = findNodeHandle(canvasRef.current);
    if (!tag || !activeTextBox) return;
    const text = activeTextInput.trim();
    if (!text) {
      // Nothing typed — cancel
      if (activeTextBox.id === null) CanvasModule.clearPendingBox(tag);
      else CanvasModule.setActiveText(tag, '');
      setActiveTextBox(null);
      return;
    }
    if (activeTextBox.id === null) {
      const id = `text_${Date.now()}`;
      CanvasModule.addTextElement(tag, id, text, activeTextBox.docX, activeTextBox.docY, activeTextBox.width, activeTextBox.height, localTextFontSize, localTextColor, localTextBold, localTextItalic, localTextFontFamily);
    } else {
      CanvasModule.updateTextElement(tag, activeTextBox.id, text, localTextFontSize, localTextColor, localTextBold, localTextItalic, localTextFontFamily);
    }
    setActiveTextBox(null);
  }, [activeTextInput, activeTextBox, localTextFontSize, localTextColor, localTextBold, localTextItalic, localTextFontFamily]);

  const handleTextCancel = useCallback(() => {
    const tag = findNodeHandle(canvasRef.current);
    if (tag && activeTextBox) {
      if (activeTextBox.id === null) CanvasModule.clearPendingBox(tag);
      else CanvasModule.setActiveText(tag, '');
    }
    setActiveTextBox(null);
  }, [activeTextBox]);

  const handleTextDelete = useCallback(() => {
    if (!activeTextBox?.id) return;
    const tag = findNodeHandle(canvasRef.current);
    if (tag) CanvasModule.deleteTextElement(tag, activeTextBox.id);
    setActiveTextBox(null);
  }, [activeTextBox]);

  const handleSelectionChanged = useCallback((info: SelectionInfo) => {
    setSelectionInfo(info);
  }, []);

  const handlePageChanged = useCallback((page: number) => {
    setCurrentPage(page + 1); // 0-indexed → 1-indexed
  }, []);

  const handlePageCountChanged = useCallback((total: number) => {
    setTotalPages(total);
  }, []);

  const viewTag = canvasRef.current ? findNodeHandle(canvasRef.current) : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={[styles.backButtonText, { color: theme.text }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>{note.title}</Text>
        <View style={styles.headerRight} />
      </View>

      <Toolbar
        onUndo={handleUndo}
        onRedo={handleRedo}
        onToggleStrip={() => setShowStrip(s => !s)}
        onShowLabel={handleShowLabel}
        showStrip={showStrip}
        currentPage={currentPage}
        totalPages={totalPages}
      />

      <View style={styles.canvasContainer}>
        {!!toolLabel && (
          <Animated.View style={[styles.toolLabel, { opacity: labelOpacity }]} pointerEvents="none">
            <Text style={styles.toolLabelText}>{toolLabel}</Text>
          </Animated.View>
        )}
        <CanvasView
          ref={canvasRef}
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
          style={styles.canvas}
          onLayout={handleLayout}
          onSelectionChanged={handleSelectionChanged}
          onPageChanged={handlePageChanged}
          onPageCountChanged={handlePageCountChanged}
        />

        {selectionInfo?.hasSelection && viewTag != null && (
          <SelectionPopup
            info={selectionInfo}
            onDelete={() => CanvasModule.deleteSelected(viewTag)}
            onCut={() => CanvasModule.cutSelected(viewTag)}
            onCapture={async () => {
              const fp = await CanvasModule.captureSelected(viewTag);
              if (fp) await Share.share({ url: `file://${fp}`, title: 'Captured selection' });
            }}
          />
        )}
      </View>

      {showStrip && totalPages > 0 && (
        <NotePageStrip
          totalPages={totalPages}
          currentPage={currentPage}
          onPageSelect={(page) => {
            const tag = findNodeHandle(canvasRef.current);
            if (tag) CanvasModule.scrollToPage(tag, page);
          }}
        />
      )}

      {/* Inline text editing panel — no modal, keyboard opens naturally */}
      {activeTextBox && (
        <KeyboardAvoidingView
          style={[styles.textPanel, { backgroundColor: theme.surface, borderTopColor: theme.border }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Format bar (above the text input) */}
          <View style={styles.textFmtRow}>
            <TouchableOpacity
              style={[styles.fmtBtn, localTextBold && { backgroundColor: theme.text }]}
              onPress={() => setLocalTextBold(b => !b)}
            >
              <Text style={[styles.fmtBtnText, { color: localTextBold ? theme.surface : theme.text, fontWeight: '700' }]}>B</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.fmtBtn, localTextItalic && { backgroundColor: theme.text }]}
              onPress={() => setLocalTextItalic(i => !i)}
            >
              <Text style={[styles.fmtBtnText, { color: localTextItalic ? theme.surface : theme.text, fontStyle: 'italic' }]}>I</Text>
            </TouchableOpacity>
            <View style={[styles.fmtSep, { backgroundColor: theme.border }]} />
            <TouchableOpacity onPress={() => setLocalTextFontSize(s => Math.max(8, s - 2))} style={styles.fmtBtn}>
              <Text style={[styles.fmtBtnText, { color: theme.text }]}>−</Text>
            </TouchableOpacity>
            <Text style={[styles.fmtSizeVal, { color: theme.text }]}>{localTextFontSize}pt</Text>
            <TouchableOpacity onPress={() => setLocalTextFontSize(s => Math.min(72, s + 2))} style={styles.fmtBtn}>
              <Text style={[styles.fmtBtnText, { color: theme.text }]}>+</Text>
            </TouchableOpacity>
            <View style={[styles.fmtSep, { backgroundColor: theme.border }]} />
            <View style={[styles.fmtColorDot, { backgroundColor: localTextColor }]} />
            <View style={{ flex: 1 }} />
            {activeTextBox.id !== null && (
              <TouchableOpacity style={styles.fmtDeleteBtn} onPress={handleTextDelete}>
                <Text style={styles.fmtDeleteText}>Delete</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.fmtCancelBtn, { backgroundColor: theme.surfaceAlt }]} onPress={handleTextCancel}>
              <Text style={[styles.fmtCancelText, { color: theme.textSub }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.fmtDoneBtn} onPress={handleTextConfirm}>
              <Text style={styles.fmtDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
          {/* Text input — keyboard pops up automatically via focus() */}
          <TextInput
            ref={textInputRef}
            style={[styles.textPanelInput, { color: theme.text, backgroundColor: theme.bg }]}
            multiline
            value={activeTextInput}
            onChangeText={setActiveTextInput}
            placeholder="Type here..."
            placeholderTextColor={theme.textHint}
            textAlignVertical="top"
            autoFocus={false}
          />
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    paddingVertical: 6,
    paddingRight: 16,
  },
  backButtonText: {
    fontSize: 16,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  headerRight: {
    width: 60,
  },
  canvasContainer: {
    flex: 1,
  },
  canvas: {
    flex: 1,
  },
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
  // Inline text editing panel (bottom, no modal)
  textPanel: { borderTopWidth: 1, paddingHorizontal: 12, paddingBottom: 6 },
  textFmtRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  fmtBtn: { width: 32, height: 32, borderRadius: 6, borderWidth: 1.5, borderColor: '#AAA', alignItems: 'center', justifyContent: 'center' },
  fmtBtnText: { fontSize: 15 },
  fmtSep: { width: 1, height: 20 },
  fmtSizeVal: { fontSize: 13, fontWeight: '600', minWidth: 32, textAlign: 'center' },
  fmtColorDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#AAA' },
  fmtDeleteBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: '#FFEBEE' },
  fmtDeleteText: { color: '#E53935', fontSize: 13, fontWeight: '500' },
  fmtCancelBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  fmtCancelText: { fontSize: 13 },
  fmtDoneBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 6, backgroundColor: '#4A90E2' },
  fmtDoneText: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  textPanelInput: { minHeight: 80, maxHeight: 160, borderRadius: 8, padding: 10, fontSize: 16, marginBottom: 4 },
});
