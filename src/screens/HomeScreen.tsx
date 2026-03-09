import React, { useEffect, useState } from 'react';
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
} from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import RNFS from 'react-native-fs';
import PdfThumbnail from 'react-native-pdf-thumbnail';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNotebookStore } from '../store/useNotebookStore';
import { Note } from '../types/noteTypes';
import { RootStackParamList } from '../navigation';

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
  const { notes, addNote, deleteNote, updateNote } = useNotebookStore();

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
    Alert.alert(note.title, undefined, [
      { text: 'Rename', onPress: () => { setRenameText(note.title); setRenameTarget({ id: note.id, title: note.title }); } },
      { text: 'Delete', style: 'destructive', onPress: () =>
        Alert.alert('Delete', `Delete "${note.title}"?`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => deleteNote(note.id) },
        ])
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const confirmRename = () => {
    if (!renameTarget) return;
    const trimmed = renameText.trim();
    if (trimmed && trimmed !== renameTarget.title) {
      updateNote(renameTarget.id, { title: uniqueTitle(trimmed, notes.filter(n => n.id !== renameTarget.id)) });
    }
    setRenameTarget(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
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

      {notes.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No notes yet.</Text>
          <Text style={styles.emptySubText}>Tap "+ New" to create one.</Text>
        </View>
      ) : (
        <FlatList
          data={notes}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F0',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0D8',
    backgroundColor: '#FFFFFF',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
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
