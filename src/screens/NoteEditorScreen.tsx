import React, { useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  findNodeHandle,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import Toolbar from '../components/Toolbar';
import CanvasView from '../native/CanvasView';
import CanvasModule from '../native/CanvasModule';
import { useToolStore } from '../store/useToolStore';

type Props = NativeStackScreenProps<RootStackParamList, 'NoteEditor'>;

export default function NoteEditorScreen({ route, navigation }: Props) {
  const { note } = route.params;
  const canvasRef = useRef<any>(null);
  const activeTool = useToolStore(s => s.activeTool);

  const handleUndo = () => {
    const tag = findNodeHandle(canvasRef.current);
    if (tag) CanvasModule.undo(tag);
  };

  const handleRedo = () => {
    const tag = findNodeHandle(canvasRef.current);
    if (tag) CanvasModule.redo(tag);
  };

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
        penColor="#000000"
        penThickness={4}
        eraserThickness={24}
        style={styles.canvas}
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
