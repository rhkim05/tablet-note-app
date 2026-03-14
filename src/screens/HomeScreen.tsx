import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import RNFS from 'react-native-fs';
import PdfThumbnail from 'react-native-pdf-thumbnail';
import PdfCanvasModule from '../native/PdfCanvasModule';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNotebookStore } from '../store/useNotebookStore';
import { Note } from '../types/noteTypes';
import { RootStackParamList } from '../navigation';
import Sidebar from '../components/Sidebar';
import { useTheme } from '../styles/theme';

type HomeNav = NativeStackNavigationProp<RootStackParamList, 'Home'>;

const POPUP_W = 180;
const screenWidth = Dimensions.get('window').width;

const formatDate = (ts: number) =>
  new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const uniqueTitle = (base: string, existingNotes: Note[]): string => {
  const titles = new Set(existingNotes.map(n => n.title));
  if (!titles.has(base)) return base;
  let i = 1;
  while (titles.has(`${base} (${i})`)) i++;
  return `${base} (${i})`;
};

const PICKER_ITEM_H = 36;
const PICKER_VISIBLE = 3;

function PagePicker({ value, min = 1, max, onChange, theme }: {
  value: number;
  min?: number;
  max: number;
  onChange: (v: number) => void;
  theme: any;
}) {
  const listRef = useRef<FlatList>(null);
  const pages = useMemo(
    () => Array.from({ length: max - min + 1 }, (_, i) => min + i),
    [min, max],
  );

  useEffect(() => {
    const offset = (value - min) * PICKER_ITEM_H;
    listRef.current?.scrollToOffset({ offset, animated: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [min, max]);

  return (
    <View style={{ height: PICKER_ITEM_H * PICKER_VISIBLE, width: 72, overflow: 'hidden' }}>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: PICKER_ITEM_H,
          left: 0, right: 0,
          height: PICKER_ITEM_H,
          backgroundColor: theme.surfaceAlt,
          borderRadius: 8,
        }}
      />
      <FlatList
        ref={listRef}
        data={pages}
        keyExtractor={i => String(i)}
        renderItem={({ item }) => (
          <View style={{ height: PICKER_ITEM_H, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ color: theme.text, fontSize: 15, fontWeight: '500' }}>{item}</Text>
          </View>
        )}
        snapToInterval={PICKER_ITEM_H}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: PICKER_ITEM_H }}
        onMomentumScrollEnd={e => {
          const idx = Math.round(e.nativeEvent.contentOffset.y / PICKER_ITEM_H);
          onChange(Math.min(Math.max(min + idx, min), max));
        }}
      />
    </View>
  );
}

export default function HomeScreen() {
  const navigation = useNavigation<HomeNav>();
  const { notes, categories, addNote, deleteNote, updateNote, addCategory } = useNotebookStore();
  const theme = useTheme();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState('all');
  const [moveCategoryTarget, setMoveCategoryTarget] = useState<Note | null>(null);
  const [exportTarget, setExportTarget] = useState<Note | null>(null);
  const [exportFormat, setExportFormat] = useState<'pdf' | 'png' | 'note'>('pdf');
  const [exportPageFrom, setExportPageFrom] = useState(1);
  const [exportPageTo, setExportPageTo] = useState(1);
  const [exportMaxPage, setExportMaxPage] = useState(1);

  useEffect(() => {
    if (!exportTarget) return;
    const max = exportTarget.type === 'pdf' ? (exportTarget.totalPages ?? exportTarget.lastPage ?? 1) : 1;
    setExportMaxPage(max);
    setExportPageFrom(1);
    setExportPageTo(1);
  }, [exportTarget]);
  const [popupNote, setPopupNote] = useState<Note | null>(null);
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });
  const optBtnRefs = useRef<Record<string, any>>({});

  // Retroactively generate thumbnails and totalPages for PDF notes that are missing them
  useEffect(() => {
    const thumbsDir = `${RNFS.DocumentDirectoryPath}/thumbnails`;
    notes.forEach(async (note) => {
      if (note.type !== 'pdf' || !note.pdfUri) return;
      const updates: Partial<Note> = {};
      try {
        if (!note.thumbnailUri) {
          await RNFS.mkdir(thumbsDir);
          const thumbPath = `${thumbsDir}/${note.id}_p1.jpg`;
          const { uri } = await PdfThumbnail.generate(note.pdfUri, 0);
          await RNFS.copyFile(uri, thumbPath);
          updates.thumbnailUri = thumbPath;
        }
        if (!note.totalPages) {
          updates.totalPages = await PdfCanvasModule.getPageCount(note.pdfUri);
        }
        if (Object.keys(updates).length > 0) updateNote(note.id, updates);
      } catch {
        // silently skip — thumbnail and page count are optional
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  const filteredNotes = useMemo(() => {
    switch (selectedCategoryId) {
      case 'all':       return notes;
      case 'favorites': return notes.filter(n => n.isFavorite);
      case 'pdfs':      return notes.filter(n => n.type === 'pdf');
      case 'notes':     return notes.filter(n => n.type === 'note');
      default:          return notes.filter(n => n.categoryIds?.includes(selectedCategoryId));
    }
  }, [notes, selectedCategoryId]);

  const openNote = (note: Note) => {
    if (note.type === 'pdf') {
      navigation.navigate('PdfViewer', { note });
    } else {
      navigation.navigate('NoteEditor', { note });
    }
  };

  const createNote = () => {
    const note: Note = {
      id: Date.now().toString(),
      title: uniqueTitle('New Note', notes),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      type: 'note',
    };
    addNote(note);
    navigation.navigate('NoteEditor', { note });
  };

  const importPdf = async () => {
    try {
      const result = await DocumentPicker.pickSingle({ type: DocumentPicker.types.pdf });

      // Copy picked PDF into app's internal Documents directory so it persists
      const destDir = `${RNFS.DocumentDirectoryPath}/pdfs`;
      await RNFS.mkdir(destDir);
      const fileName = `${Date.now()}_${result.name ?? 'imported.pdf'}`;
      const destPath = `${destDir}/${fileName}`;
      await RNFS.copyFile(result.uri, destPath);

      const noteId = Date.now().toString();

      // Generate cover thumbnail and read total page count in parallel
      let thumbnailUri: string | undefined;
      let totalPages: number | undefined;
      await Promise.allSettled([
        (async () => {
          const thumbsDir = `${RNFS.DocumentDirectoryPath}/thumbnails`;
          await RNFS.mkdir(thumbsDir);
          const thumbPath = `${thumbsDir}/${noteId}_p1.jpg`;
          const { uri } = await PdfThumbnail.generate(destPath, 0);
          await RNFS.copyFile(uri, thumbPath);
          thumbnailUri = thumbPath;
        })(),
        (async () => {
          totalPages = await PdfCanvasModule.getPageCount(destPath);
        })(),
      ]);

      const note: Note = {
        id: noteId,
        title: uniqueTitle(result.name?.replace(/\.pdf$/i, '') ?? 'Imported PDF', notes),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        type: 'pdf',
        pdfUri: destPath,
        thumbnailUri,
        totalPages,
      };
      addNote(note);
    } catch (err) {
      if (!DocumentPicker.isCancel(err)) {
        Alert.alert('Error', 'Failed to import PDF.');
      }
    }
  };

  const [renameTarget, setRenameTarget] = useState<{ id: string; title: string } | null>(null);
  const [renameText, setRenameText] = useState('');

  const confirmRename = () => {
    if (!renameTarget) return;
    const trimmed = renameText.trim();
    if (trimmed && trimmed !== renameTarget.title) {
      updateNote(renameTarget.id, { title: uniqueTitle(trimmed, notes.filter(n => n.id !== renameTarget.id)) });
    }
    setRenameTarget(null);
  };

  const isEmptyCategory = selectedCategoryId !== 'all';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.row}>
        {/* Sidebar — flex child, pushes content right when open */}
        <Sidebar
          open={sidebarOpen}
          categories={categories}
          selectedCategoryId={selectedCategoryId}
          onSelectCategory={setSelectedCategoryId}
          onAddCategory={addCategory}
          onClose={() => setSidebarOpen(false)}
        />

        {/* Main content */}
        <View style={{ flex: 1 }}>
        <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
          <TouchableOpacity style={styles.menuBtn} onPress={() => setSidebarOpen(o => !o)}>
            <Text style={[styles.menuIcon, { color: theme.text }]}>≡</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.text }]}>My Notes</Text>
          <View style={styles.headerButtons}>
            <TouchableOpacity style={[styles.importButton, { backgroundColor: theme.surface, borderColor: theme.text }]} onPress={importPdf}>
              <Text style={[styles.importButtonText, { color: theme.text }]}>Import PDF</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.newButton, { backgroundColor: theme.text }]} onPress={createNote}>
              <Text style={[styles.newButtonText, { color: theme.surface }]}>+ New</Text>
            </TouchableOpacity>
          </View>
        </View>

        {filteredNotes.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: theme.textSub }]}>{isEmptyCategory ? 'No notes in this category.' : 'No notes yet.'}</Text>
            {!isEmptyCategory && <Text style={[styles.emptySubText, { color: theme.textHint }]}>Tap "+ New" to create one.</Text>}
          </View>
        ) : (
          <FlatList
            data={filteredNotes}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.list}
            numColumns={3}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.card, { backgroundColor: theme.surface }]}
                onPress={() => openNote(item)}
                activeOpacity={0.7}
              >
                <View style={[styles.cardThumbnail, { backgroundColor: theme.surfaceAlt }]}>
                  {item.thumbnailUri && (
                    <Image
                      source={{ uri: `file://${item.thumbnailUri}` }}
                      style={styles.cardThumbnailImage}
                      resizeMode="cover"
                    />
                  )}
                  {item.type === 'pdf' && (
                    <View style={styles.pdfBadge}>
                      <Text style={styles.pdfBadgeText}>PDF</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={2}>{item.title}</Text>
                <Text style={[styles.cardDate, { color: theme.textHint }]}>{formatDate(item.updatedAt)}</Text>
                {/* Favorite button — top-left */}
                <TouchableOpacity
                  style={styles.favoriteBtn}
                  onPress={() => updateNote(item.id, { isFavorite: !item.isFavorite })}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={styles.favoriteBtnText}>{item.isFavorite ? '★' : '☆'}</Text>
                </TouchableOpacity>

                {/* Options button — top-right */}
                <TouchableOpacity
                  ref={(r) => { optBtnRefs.current[item.id] = r; }}
                  style={styles.optionsBtn}
                  onPress={() => {
                    optBtnRefs.current[item.id]?.measureInWindow(
                      (x: number, y: number, w: number, h: number) => {
                        setPopupPos({ x: x + w, y: y + h + 4 });
                        setPopupNote(item);
                      }
                    );
                  }}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={[styles.optionsBtnText, { color: theme.textSub }]}>⋮</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            )}
          />
        )}
        </View>
      </View>

      {/* Rename Modal */}
      <Modal visible={!!renameTarget} transparent animationType="fade" onRequestClose={() => setRenameTarget(null)}>
        <KeyboardAvoidingView style={[renameStyles.overlay, { backgroundColor: theme.overlay }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setRenameTarget(null)} />
          <View style={[renameStyles.box, { backgroundColor: theme.surface }]}>
            <Text style={[renameStyles.title, { color: theme.text }]}>Rename</Text>
            <TextInput
              style={[renameStyles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surfaceAlt }]}
              value={renameText}
              onChangeText={setRenameText}
              onSubmitEditing={confirmRename}
              autoFocus
              selectTextOnFocus
              autoCorrect={false}
              autoCapitalize="none"
              keyboardType="default"
              placeholderTextColor={theme.textHint}
            />
            <View style={renameStyles.buttons}>
              <TouchableOpacity style={[renameStyles.cancel, { backgroundColor: theme.surfaceAlt }]} onPress={() => setRenameTarget(null)}>
                <Text style={[renameStyles.cancelText, { color: theme.textSub }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[renameStyles.confirm, { backgroundColor: theme.text }]} onPress={confirmRename}>
                <Text style={[renameStyles.confirmText, { color: theme.surface }]}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add to Category Modal */}
      <Modal visible={!!moveCategoryTarget} transparent animationType="fade" onRequestClose={() => setMoveCategoryTarget(null)}>
        <TouchableOpacity style={[moveCatStyles.overlay, { backgroundColor: theme.overlay }]} activeOpacity={1} onPress={() => setMoveCategoryTarget(null)}>
          <View style={[moveCatStyles.box, { backgroundColor: theme.surface }]}>
            <Text style={[moveCatStyles.title, { color: theme.text }]}>Add to Category</Text>
            {categories.map(cat => {
              const already = moveCategoryTarget?.categoryIds?.includes(cat.id) ?? false;
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={moveCatStyles.row}
                  onPress={() => {
                    if (!moveCategoryTarget) return;
                    const prev = moveCategoryTarget.categoryIds ?? [];
                    const next = already
                      ? prev.filter(id => id !== cat.id)
                      : [...prev, cat.id];
                    updateNote(moveCategoryTarget.id, { categoryIds: next });
                    setMoveCategoryTarget(n => n ? { ...n, categoryIds: next } : n);
                  }}
                >
                  <View style={moveCatStyles.rowInner}>
                    <Text style={[moveCatStyles.rowText, { color: theme.text }]}>{cat.name}</Text>
                    {already && <Text style={[moveCatStyles.check, { color: theme.text }]}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={[moveCatStyles.cancelRow, { borderTopColor: theme.border }]} onPress={() => setMoveCategoryTarget(null)}>
              <Text style={[moveCatStyles.cancelText, { color: theme.textSub }]}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Export Modal */}
      <Modal visible={!!exportTarget} transparent animationType="fade" onRequestClose={() => setExportTarget(null)}>
        <View style={[exportStyles.overlay, { backgroundColor: theme.overlay }]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setExportTarget(null)} />
          <View style={[exportStyles.box, { backgroundColor: theme.surface }]}>
            <Text style={[exportStyles.title, { color: theme.text }]}>Export</Text>

            {/* Format selector */}
            <View style={[exportStyles.section, { borderTopColor: theme.border }]}>
              <Text style={[exportStyles.sectionLabel, { color: theme.textSub }]}>File Format</Text>
              <View style={exportStyles.formatRow}>
                {(['pdf', 'png', 'note'] as const).map(fmt => {
                  const active = exportFormat === fmt;
                  return (
                    <TouchableOpacity
                      key={fmt}
                      style={[exportStyles.formatBtn, { borderColor: theme.border, backgroundColor: active ? theme.text : theme.surfaceAlt }]}
                      onPress={() => setExportFormat(fmt)}
                    >
                      <Text style={[exportStyles.formatBtnText, { color: active ? theme.surface : theme.textSub }]}>
                        .{fmt}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Page range */}
            <View style={[exportStyles.section, { borderTopColor: theme.border }]}>
              <Text style={[exportStyles.sectionLabel, { color: theme.textSub }]}>Page Range</Text>
              <View style={exportStyles.pageRangeRow}>
                <View style={exportStyles.pageField}>
                  <Text style={[exportStyles.pageLabel, { color: theme.textSub }]}>From</Text>
                  <PagePicker value={exportPageFrom} max={exportPageTo} onChange={setExportPageFrom} theme={theme} />
                </View>
                <Text style={[exportStyles.pageDash, { color: theme.textSub }]}>–</Text>
                <View style={exportStyles.pageField}>
                  <Text style={[exportStyles.pageLabel, { color: theme.textSub }]}>To</Text>
                  <PagePicker value={exportPageTo} min={exportPageFrom} max={exportMaxPage} onChange={setExportPageTo} theme={theme} />
                </View>
              </View>
            </View>

            {/* Bottom buttons */}
            <View style={[exportStyles.bottomRow, { borderTopColor: theme.border }]}>
              <TouchableOpacity style={[exportStyles.bottomBtn, { backgroundColor: theme.surfaceAlt }]} onPress={() => setExportTarget(null)}>
                <Text style={[exportStyles.bottomBtnText, { color: theme.textSub }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[exportStyles.bottomBtn, { backgroundColor: theme.text }]} onPress={() => { /* TODO */ }}>
                <Text style={[exportStyles.bottomBtnText, { color: theme.surface }]}>Export</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Note options popup */}
      <Modal
        visible={!!popupNote}
        transparent
        animationType="none"
        onRequestClose={() => setPopupNote(null)}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={() => setPopupNote(null)}
        />
        <View style={[
          popupStyles.box,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border,
            top: popupPos.y,
            left: Math.min(popupPos.x - POPUP_W, screenWidth - POPUP_W - 8),
          },
        ]}>
          <TouchableOpacity
            style={popupStyles.row}
            onPress={() => {
              const note = popupNote!;
              setPopupNote(null);
              setRenameText(note.title);
              setRenameTarget({ id: note.id, title: note.title });
            }}
          >
            <Text style={[popupStyles.rowText, { color: theme.text }]}>Rename</Text>
          </TouchableOpacity>

          {categories.length > 0 && (
            <>
              <View style={[popupStyles.sep, { backgroundColor: theme.border }]} />
              <TouchableOpacity
                style={popupStyles.row}
                onPress={() => { const note = popupNote!; setPopupNote(null); setMoveCategoryTarget(note); }}
              >
                <Text style={[popupStyles.rowText, { color: theme.text }]}>Edit Category</Text>
              </TouchableOpacity>
            </>
          )}


          <View style={[popupStyles.sep, { backgroundColor: theme.border }]} />
          <TouchableOpacity
            style={popupStyles.row}
            onPress={() => { const note = popupNote!; setPopupNote(null); setExportTarget(note); }}
          >
            <Text style={[popupStyles.rowText, { color: theme.text }]}>Export</Text>
          </TouchableOpacity>

          <View style={[popupStyles.sep, { backgroundColor: theme.border }]} />
          <TouchableOpacity
            style={popupStyles.row}
            onPress={() => {
              const note = popupNote!;
              setPopupNote(null);
              Alert.alert('Delete', `Delete "${note.title}"?`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => deleteNote(note.id) },
              ]);
            }}
          >
            <Text style={[popupStyles.rowText, { color: theme.destructive }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const renameStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  box:     { borderRadius: 14, padding: 24, width: 300 },
  title:   { fontSize: 16, fontWeight: '600', marginBottom: 14 },
  input:   { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 15, marginBottom: 18 },
  buttons: { flexDirection: 'row', gap: 10 },
  cancel:  { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  cancelText:  { fontSize: 15 },
  confirm: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  confirmText: { fontSize: 15, fontWeight: '600' },
});

const moveCatStyles = StyleSheet.create({
  overlay:   { flex: 1, justifyContent: 'center', alignItems: 'center' },
  box:       { borderRadius: 14, padding: 8, width: 280 },
  title:     { fontSize: 15, fontWeight: '600', padding: 16, paddingBottom: 8 },
  row:       { paddingHorizontal: 16, paddingVertical: 14, borderRadius: 8 },
  rowInner:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowText:   { fontSize: 15 },
  check:     { fontSize: 15, fontWeight: '600' },
  cancelRow: { paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, marginTop: 4 },
  cancelText: { fontSize: 15, textAlign: 'center' },
});

const screenHeight = Dimensions.get('window').height;

const exportStyles = StyleSheet.create({
  overlay:      { flex: 1, justifyContent: 'center', alignItems: 'center' },
  box:          { borderRadius: 14, width: screenWidth * 0.7, height: screenHeight * 0.7, overflow: 'hidden' },
  title:        { fontSize: 17, fontWeight: '700', padding: 20, paddingBottom: 20 },
  section:      { borderTopWidth: 1, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 },
  sectionLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12 },
  formatRow:    { flexDirection: 'row', gap: 10 },
  formatBtn:    { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  formatBtnText:{ fontSize: 15, fontWeight: '600' },
  pageRangeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pageField:    { alignItems: 'center', gap: 6 },
  pageLabel:    { fontSize: 12, fontWeight: '500' },
  pageDash:     { fontSize: 18, fontWeight: '300' },
  bottomRow:    { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1 },
  bottomBtn:    { flex: 1, paddingVertical: 13, borderRadius: 10, alignItems: 'center' },
  bottomBtnText:{ fontSize: 15, fontWeight: '600' },
});

const popupStyles = StyleSheet.create({
  box: {
    position: 'absolute',
    width: POPUP_W,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  rowText: {
    fontSize: 15,
  },
  sep: {
    height: 1,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  menuBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  menuIcon: {
    fontSize: 22,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    flex: 1,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  importButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  importButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  newButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  newButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  list: {
    padding: 16,
    gap: 16,
  },
  card: {
    flex: 1,
    margin: 8,
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  cardThumbnail: {
    height: 140,
    borderRadius: 8,
    marginBottom: 10,
    position: 'relative',
    overflow: 'hidden',
  },
  cardThumbnailImage: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 8,
  },
  pdfBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#E8402A',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  pdfBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  cardDate: {
    fontSize: 12,
  },
  favoriteBtn: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  favoriteBtnText: {
    fontSize: 16,
    color: '#F5A623',
  },
  optionsBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  optionsBtnText: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
  },
  emptySubText: {
    fontSize: 15,
    marginTop: 6,
  },
});
