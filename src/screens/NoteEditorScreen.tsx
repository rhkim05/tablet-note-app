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
  const updateNote = useNotebookStore(s => s.updateNote);
  const theme = useTheme();

  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | null>(null);
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
      // v2 format: { version, pageCount, strokes: [...] }
      const parsed = JSON.parse(json);
      const strokes = Array.isArray(parsed) ? parsed : (parsed.strokes ?? []);
      if (strokes.length === 0) return;
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
});
