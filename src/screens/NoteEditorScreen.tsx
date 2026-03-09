import React, { useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  findNodeHandle,
} from 'react-native';
import RNFS from 'react-native-fs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import Toolbar from '../components/Toolbar';
import CanvasView from '../native/CanvasView';
import CanvasModule from '../native/CanvasModule';
import { useToolStore } from '../store/useToolStore';
import { useNotebookStore } from '../store/useNotebookStore';

type Props = NativeStackScreenProps<RootStackParamList, 'NoteEditor'>;

const DRAWINGS_DIR = `${RNFS.DocumentDirectoryPath}/drawings`;

export default function NoteEditorScreen({ route, navigation }: Props) {
  const { note } = route.params;
  const canvasRef = useRef<any>(null);
  const activeTool      = useToolStore(s => s.activeTool);
  const penThickness    = useToolStore(s => s.penThickness);
  const eraserThickness = useToolStore(s => s.eraserThickness);
  const penColor        = useToolStore(s => s.penColor);
  const updateNote = useNotebookStore(s => s.updateNote);

  // Save strokes to file and update the note record
  const saveStrokes = useCallback(async () => {
    const tag = findNodeHandle(canvasRef.current);
    if (!tag) return;
    const json = await CanvasModule.getStrokes(tag);
    if (json === '[]') return; // nothing to save
    await RNFS.mkdir(DRAWINGS_DIR);
    const filePath = `${DRAWINGS_DIR}/${note.id}.json`;
    await RNFS.writeFile(filePath, json, 'utf8');
    updateNote(note.id, { drawingUri: filePath, updatedAt: Date.now() });
  }, [note.id, updateNote]);

  // Save when the user navigates back
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', saveStrokes);
    return unsub;
  }, [navigation, saveStrokes]);

  // Load strokes once the canvas is laid out
  const handleLayout = useCallback(async () => {
    if (!note.drawingUri) return;
    const exists = await RNFS.exists(note.drawingUri);
    if (!exists) return;
    const json = await RNFS.readFile(note.drawingUri, 'utf8');
    const tag = findNodeHandle(canvasRef.current);
    if (tag) CanvasModule.loadStrokes(tag, json);
  }, [note.drawingUri]);

  const handleUndo = useCallback(() => {
    const tag = findNodeHandle(canvasRef.current);
    if (tag) CanvasModule.undo(tag);
  }, []);

  const handleRedo = useCallback(() => {
    const tag = findNodeHandle(canvasRef.current);
    if (tag) CanvasModule.redo(tag);
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

      <Toolbar onUndo={handleUndo} onRedo={handleRedo} />

      <CanvasView
        ref={canvasRef}
        tool={activeTool}
        penColor={penColor}
        penThickness={penThickness}
        eraserThickness={eraserThickness}
        style={styles.canvas}
        onLayout={handleLayout}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F0',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0D8',
  },
  backButton: {
    paddingVertical: 6,
    paddingRight: 16,
  },
  backButtonText: {
    color: '#1A1A1A',
    fontSize: 16,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    textAlign: 'center',
  },
  headerRight: {
    width: 60,
  },
  canvas: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
});
