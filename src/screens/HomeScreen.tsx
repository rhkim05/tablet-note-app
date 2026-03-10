import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  AlertButton,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import RNFS from 'react-native-fs';
import PdfThumbnail from 'react-native-pdf-thumbnail';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNotebookStore } from '../store/useNotebookStore';
import { Note } from '../types/noteTypes';
import { RootStackParamList } from '../navigation';
import Sidebar from '../components/Sidebar';

type HomeNav = NativeStackNavigationProp<RootStackParamList, 'Home'>;

const formatDate = (ts: number) =>
  new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const uniqueTitle = (base: string, existingNotes: Note[]): string => {
  const titles = new Set(existingNotes.map(n => n.title));
  if (!titles.has(base)) return base;
  let i = 1;
  while (titles.has(`${base} (${i})`)) i++;
  return `${base} (${i})`;
};

export default function HomeScreen() {
  const navigation = useNavigation<HomeNav>();
  const { notes, categories, addNote, deleteNote, updateNote, addCategory } = useNotebookStore();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState('all');
  const [moveCategoryTarget, setMoveCategoryTarget] = useState<Note | null>(null);

  // Retroactively generate thumbnails for PDF notes that don't have one yet
  useEffect(() => {
    const thumbsDir = `${RNFS.DocumentDirectoryPath}/thumbnails`;
    notes.forEach(async (note) => {
      if (note.type !== 'pdf' || note.thumbnailUri || !note.pdfUri) return;
      try {
        await RNFS.mkdir(thumbsDir);
        const thumbPath = `${thumbsDir}/${note.id}_p1.jpg`;
        const { uri } = await PdfThumbnail.generate(note.pdfUri, 0);
        await RNFS.copyFile(uri, thumbPath);
        updateNote(note.id, { thumbnailUri: thumbPath });
      } catch {
        // silently skip — thumbnail is optional
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  const filteredNotes = useMemo(() => {
    switch (selectedCategoryId) {
      case 'all':   return notes;
      case 'pdfs':  return notes.filter(n => n.type === 'pdf');
      case 'notes': return notes.filter(n => n.type === 'note');
      default:      return notes.filter(n => n.categoryId === selectedCategoryId);
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

      // Generate cover thumbnail (page 1, 0-indexed = 0)
      let thumbnailUri: string | undefined;
      try {
        const thumbsDir = `${RNFS.DocumentDirectoryPath}/thumbnails`;
        await RNFS.mkdir(thumbsDir);
        const thumbPath = `${thumbsDir}/${noteId}_p1.jpg`;
        const { uri } = await PdfThumbnail.generate(destPath, 0);
        await RNFS.copyFile(uri, thumbPath);
        thumbnailUri = thumbPath;
      } catch {
        // thumbnail is optional — silently skip on failure
      }

      const note: Note = {
        id: noteId,
        title: uniqueTitle(result.name?.replace(/\.pdf$/i, '') ?? 'Imported PDF', notes),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        type: 'pdf',
        pdfUri: destPath,
        thumbnailUri,
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

  const onLongPress = (note: Note) => {
    const actions: AlertButton[] = [
      { text: 'Rename', onPress: () => { setRenameText(note.title); setRenameTarget({ id: note.id, title: note.title }); } },
      { text: 'Delete', style: 'destructive', onPress: () =>
        Alert.alert('Delete', `Delete "${note.title}"?`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => deleteNote(note.id) },
        ])
      },
    ];

    if (categories.length > 0) {
      actions.splice(1, 0, { text: 'Move to Category', onPress: () => setMoveCategoryTarget(note) });
    }

    actions.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(note.title, undefined, actions);
  };

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
    <SafeAreaView style={styles.container}>
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
        <View style={styles.header}>
          <TouchableOpacity style={styles.menuBtn} onPress={() => setSidebarOpen(o => !o)}>
            <Text style={styles.menuIcon}>≡</Text>
          </TouchableOpacity>
          <Text style={styles.title}>My Notes</Text>
          <View style={styles.headerButtons}>
            <TouchableOpacity style={styles.importButton} onPress={importPdf}>
              <Text style={styles.importButtonText}>Import PDF</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.newButton} onPress={createNote}>
              <Text style={styles.newButtonText}>+ New</Text>
            </TouchableOpacity>
          </View>
        </View>

        {filteredNotes.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{isEmptyCategory ? 'No notes in this category.' : 'No notes yet.'}</Text>
            {!isEmptyCategory && <Text style={styles.emptySubText}>Tap "+ New" to create one.</Text>}
          </View>
        ) : (
          <FlatList
            data={filteredNotes}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.list}
            numColumns={3}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.card}
                onPress={() => openNote(item)}
                onLongPress={() => onLongPress(item)}
                activeOpacity={0.7}
              >
                <View style={styles.cardThumbnail}>
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
                <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.cardDate}>{formatDate(item.updatedAt)}</Text>
              </TouchableOpacity>
            )}
          />
        )}
        </View>
      </View>

      {/* Rename Modal */}
      <Modal visible={!!renameTarget} transparent animationType="fade" onRequestClose={() => setRenameTarget(null)}>
        <KeyboardAvoidingView style={renameStyles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setRenameTarget(null)} />
          <View style={renameStyles.box}>
            <Text style={renameStyles.title}>Rename</Text>
            <TextInput
              style={renameStyles.input}
              value={renameText}
              onChangeText={setRenameText}
              onSubmitEditing={confirmRename}
              autoFocus
              selectTextOnFocus
              autoCorrect={false}
              autoCapitalize="none"
              keyboardType="default"
            />
            <View style={renameStyles.buttons}>
              <TouchableOpacity style={renameStyles.cancel} onPress={() => setRenameTarget(null)}>
                <Text style={renameStyles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={renameStyles.confirm} onPress={confirmRename}>
                <Text style={renameStyles.confirmText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Move to Category Modal */}
      <Modal visible={!!moveCategoryTarget} transparent animationType="fade" onRequestClose={() => setMoveCategoryTarget(null)}>
        <TouchableOpacity style={moveCatStyles.overlay} activeOpacity={1} onPress={() => setMoveCategoryTarget(null)}>
          <View style={moveCatStyles.box}>
            <Text style={moveCatStyles.title}>Move to Category</Text>
            {categories.map(cat => (
              <TouchableOpacity
                key={cat.id}
                style={moveCatStyles.row}
                onPress={() => {
                  if (moveCategoryTarget) {
                    updateNote(moveCategoryTarget.id, { categoryId: cat.id });
                  }
                  setMoveCategoryTarget(null);
                }}
              >
                <Text style={moveCatStyles.rowText}>{cat.name}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={moveCatStyles.cancelRow} onPress={() => setMoveCategoryTarget(null)}>
              <Text style={moveCatStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const renameStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  box:     { backgroundColor: '#FFF', borderRadius: 14, padding: 24, width: 300 },
  title:   { fontSize: 16, fontWeight: '600', color: '#1A1A1A', marginBottom: 14 },
  input:   { borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 10, fontSize: 15, color: '#1A1A1A', marginBottom: 18 },
  buttons: { flexDirection: 'row', gap: 10 },
  cancel:  { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: '#F0F0EA', alignItems: 'center' },
  cancelText:  { color: '#555', fontSize: 15 },
  confirm: { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: '#1A1A1A', alignItems: 'center' },
  confirmText: { color: '#FFF', fontSize: 15, fontWeight: '600' },
});

const moveCatStyles = StyleSheet.create({
  overlay:   { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  box:       { backgroundColor: '#FFF', borderRadius: 14, padding: 8, width: 280 },
  title:     { fontSize: 15, fontWeight: '600', color: '#1A1A1A', padding: 16, paddingBottom: 8 },
  row:       { paddingHorizontal: 16, paddingVertical: 14, borderRadius: 8 },
  rowText:   { fontSize: 15, color: '#1A1A1A' },
  cancelRow: { paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#E0E0D8', marginTop: 4 },
  cancelText: { fontSize: 15, color: '#888', textAlign: 'center' },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F0',
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
    borderBottomColor: '#E0E0D8',
    backgroundColor: '#FFFFFF',
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
    color: '#1A1A1A',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
    flex: 1,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  importButton: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#1A1A1A',
  },
  importButtonText: {
    color: '#1A1A1A',
    fontSize: 16,
    fontWeight: '600',
  },
  newButton: {
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  newButtonText: {
    color: '#FFFFFF',
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
    backgroundColor: '#FFFFFF',
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
    backgroundColor: '#F0F0EB',
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
    color: '#1A1A1A',
    marginBottom: 4,
  },
  cardDate: {
    fontSize: 12,
    color: '#999',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#555',
  },
  emptySubText: {
    fontSize: 15,
    color: '#AAA',
    marginTop: 6,
  },
});
