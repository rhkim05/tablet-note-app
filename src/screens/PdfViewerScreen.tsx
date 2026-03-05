import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  findNodeHandle,
} from 'react-native';
import Pdf from 'react-native-pdf';
import RNFS from 'react-native-fs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import Toolbar from '../components/Toolbar';
import CanvasView from '../native/CanvasView';
import CanvasModule from '../native/CanvasModule';
import { useToolStore } from '../store/useToolStore';

type Props = NativeStackScreenProps<RootStackParamList, 'PdfViewer'>;

// Isolated so tool changes don't re-render the PDF
const PdfCanvasOverlay = React.memo(({ canvasRef }: { canvasRef: React.RefObject<any> }) => {
  const tool = useToolStore(s => s.activeTool);
  if (tool === 'select') return null;
  return (
    <CanvasView
      ref={canvasRef}
      tool={tool}
      penColor="#000000"
      penThickness={4}
      eraserThickness={24}
      style={StyleSheet.absoluteFill}
    />
  );
});

export default function PdfViewerScreen({ route, navigation }: Props) {
  const { note } = route.params;
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [pdfSource, setPdfSource] = useState<{ uri: string } | null>(null);
  const canvasRef = useRef<any>(null);

  // Default to scroll (select) mode when entering PDF viewer
  useEffect(() => {
    useToolStore.getState().setTool('select');
  }, []);

  // Read file as base64 to bypass react-native-blob-util file:// URI issues
  useEffect(() => {
    RNFS.readFile(note.pdfUri, 'base64').then(data => {
      setPdfSource({ uri: `data:application/pdf;base64,${data}` });
    });
  }, [note.pdfUri]);

  const handleUndo = useCallback(() => {
    const tag = findNodeHandle(canvasRef.current);
    if (tag) CanvasModule.undo(tag);
  }, []);

  const handleRedo = useCallback(() => {
    const tag = findNodeHandle(canvasRef.current);
    if (tag) CanvasModule.redo(tag);
  }, []);

  const onLoadComplete = useCallback((pages: number) => {
    setTotalPages(pages);
    setLoading(false);
  }, []);

  const onPageChanged = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  const onError = useCallback(() => {
    setLoading(false);
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{note.title}</Text>
        <Text style={styles.pageCount}>
          {totalPages > 0 ? `${currentPage} / ${totalPages}` : ''}
        </Text>
      </View>

      <Toolbar showHandTool onUndo={handleUndo} onRedo={handleRedo} />

      <View style={styles.pdfContainer}>
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#FFFFFF" />
            <Text style={styles.loadingText}>Loading PDF...</Text>
          </View>
        )}
        {pdfSource && (
          <Pdf
            source={pdfSource}
            style={styles.pdf}
            enablePaging={false}
            onLoadComplete={onLoadComplete}
            onPageChanged={onPageChanged}
            onError={onError}
          />
        )}
        <PdfCanvasOverlay canvasRef={canvasRef} />
      </View>
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
  pageCount: { color: '#AAAAAA', fontSize: 14, paddingLeft: 16, minWidth: 60, textAlign: 'right' },
  pdfContainer: { flex: 1 },
  pdf: { flex: 1, width: '100%' },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2C2C2C',
  },
  loadingText: { color: '#AAAAAA', marginTop: 12, fontSize: 14 },
});
