import React, { useRef, useState, useEffect } from 'react';
import {
  Animated,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Dimensions,
} from 'react-native';
import { Category, BUILT_IN_CATEGORIES } from '../types/categoryTypes';
import { useToolStore } from '../store/useToolStore';
import { useNotebookStore } from '../store/useNotebookStore';
import { useSettingsStore, PenAction, PEN_ACTION_LABELS } from '../store/useSettingsStore';
import ThicknessSlider from './ThicknessSlider';

const MODAL_W = Dimensions.get('window').width * 0.70;

const EXPANDED_W = 240;

interface SidebarProps {
  open: boolean;
  categories: Category[];
  selectedCategoryId: string;
  onSelectCategory: (id: string) => void;
  onAddCategory: (name: string) => void;
  onClose: () => void;
}

export default function Sidebar({ open, categories, selectedCategoryId, onSelectCategory, onAddCategory, onClose }: SidebarProps) {
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [settingsVisible, setSettingsVisible] = useState(false);
  const widthAnim = useRef(new Animated.Value(0)).current;

  const penThickness = useToolStore(s => s.penThickness);
  const eraserThickness = useToolStore(s => s.eraserThickness);
  const presetColors = useToolStore(s => s.presetColors);
  const setPenThickness = useToolStore(s => s.setPenThickness);
  const setEraserThickness = useToolStore(s => s.setEraserThickness);
  const { notes, deleteNote } = useNotebookStore();
  const penButtonAction = useSettingsStore(s => s.penButtonAction);
  const penButtonDoubleAction = useSettingsStore(s => s.penButtonDoubleAction);
  const setPenButtonAction = useSettingsStore(s => s.setPenButtonAction);
  const setPenButtonDoubleAction = useSettingsStore(s => s.setPenButtonDoubleAction);

  const showActionPicker = (current: PenAction, setter: (a: PenAction) => void) => {
    const actions: PenAction[] = ['none', 'togglePenEraser', 'eraser', 'pen', 'undo'];
    Alert.alert(
      'Choose Action',
      undefined,
      actions.map(a => ({
        text: (a === current ? '✓ ' : '    ') + PEN_ACTION_LABELS[a],
        onPress: () => setter(a),
      })).concat([{ text: 'Cancel', style: 'cancel' }] as any[])
    );
  };

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: open ? EXPANDED_W : 0,
      duration: 220,
      useNativeDriver: false,
    }).start();
  }, [open]);

  const selectCategory = (id: string) => {
    onSelectCategory(id);
    onClose();
  };

  const confirmAddCategory = () => {
    const trimmed = newCategoryName.trim();
    if (trimmed) onAddCategory(trimmed);
    setNewCategoryName('');
    setAddModalVisible(false);
  };

  const handleClearAll = () => {
    Alert.alert(
      'Clear All Notes',
      `Delete all ${notes.length} note${notes.length !== 1 ? 's' : ''}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete All', style: 'destructive', onPress: () => notes.forEach(n => deleteNote(n.id)) },
      ]
    );
  };

  const allCategories: Category[] = [...BUILT_IN_CATEGORIES, ...categories];

  return (
    <>
      <Animated.View style={[styles.sidebar, { width: widthAnim }]}>
        {/* Close button */}
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>

        {/* Category list */}
        <ScrollView style={styles.categoryList} showsVerticalScrollIndicator={false}>
          {allCategories.map(cat => (
            <TouchableOpacity
              key={cat.id}
              style={[styles.categoryRow, selectedCategoryId === cat.id && styles.categoryRowSelected]}
              onPress={() => selectCategory(cat.id)}
            >
              <Text style={styles.categoryIcon}>
                {cat.id === 'all' ? '📋' : cat.id === 'pdfs' ? '📄' : cat.id === 'notes' ? '📝' : '📁'}
              </Text>
              <Text
                style={[styles.categoryLabel, selectedCategoryId === cat.id && styles.categoryLabelSelected]}
                numberOfLines={1}
              >
                {cat.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Add category button */}
        <TouchableOpacity style={styles.addCategoryBtn} onPress={() => setAddModalVisible(true)}>
          <Text style={styles.addCategoryText}>+ Add Category</Text>
        </TouchableOpacity>

        {/* Settings and Account icon stubs */}
        <View style={styles.iconRow}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => setSettingsVisible(true)}>
            <Text style={styles.iconText}>⚙</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn}>
            <Text style={styles.iconText}>👤</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Settings Modal */}
      <Modal visible={settingsVisible} transparent animationType="fade" onRequestClose={() => setSettingsVisible(false)}>
        <TouchableOpacity style={settingsStyles.overlay} activeOpacity={1} onPress={() => setSettingsVisible(false)}>
          <TouchableOpacity style={settingsStyles.box} activeOpacity={1} onPress={() => {}}>
            {/* Header */}
            <View style={settingsStyles.header}>
              <Text style={settingsStyles.headerTitle}>Settings</Text>
              <TouchableOpacity onPress={() => setSettingsVisible(false)}>
                <Text style={settingsStyles.headerClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* DRAWING section */}
            <Text style={settingsStyles.sectionLabel}>DRAWING</Text>
            <View style={settingsStyles.row}>
              <Text style={settingsStyles.rowLabel}>Pen thickness</Text>
              <ThicknessSlider value={penThickness} min={1} max={20} onChange={setPenThickness} />
            </View>
            <View style={settingsStyles.row}>
              <Text style={settingsStyles.rowLabel}>Eraser thickness</Text>
              <ThicknessSlider value={eraserThickness} min={8} max={60} onChange={setEraserThickness} />
            </View>

            <View style={settingsStyles.divider} />

            {/* ACTION MAPPING section */}
            <Text style={settingsStyles.sectionLabel}>ACTION MAPPING</Text>
            <TouchableOpacity style={settingsStyles.row} onPress={() => showActionPicker(penButtonAction, setPenButtonAction)}>
              <Text style={settingsStyles.rowLabel}>Pen side button</Text>
              <Text style={settingsStyles.rowValue}>{PEN_ACTION_LABELS[penButtonAction]} ›</Text>
            </TouchableOpacity>
            <TouchableOpacity style={settingsStyles.row} onPress={() => showActionPicker(penButtonDoubleAction, setPenButtonDoubleAction)}>
              <Text style={settingsStyles.rowLabel}>Double press</Text>
              <Text style={settingsStyles.rowValue}>{PEN_ACTION_LABELS[penButtonDoubleAction]} ›</Text>
            </TouchableOpacity>

            <View style={settingsStyles.divider} />

            {/* PRESET COLORS section */}
            <Text style={settingsStyles.sectionLabel}>PRESET COLORS</Text>
            <View style={settingsStyles.swatchRow}>
              {presetColors.map((color, i) => (
                <View
                  key={i}
                  style={[
                    settingsStyles.swatch,
                    { backgroundColor: color },
                    color === '#FFFFFF' && settingsStyles.swatchWhite,
                  ]}
                />
              ))}
            </View>

            <View style={settingsStyles.divider} />

            {/* DATA section */}
            <Text style={settingsStyles.sectionLabel}>DATA</Text>
            <TouchableOpacity style={settingsStyles.clearBtn} onPress={handleClearAll}>
              <Text style={settingsStyles.clearBtnText}>Clear All Notes</Text>
            </TouchableOpacity>

            <View style={settingsStyles.divider} />

            {/* About */}
            <Text style={settingsStyles.about}>Tablet Notes  v1.0</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Add Category Modal */}
      <Modal visible={addModalVisible} transparent animationType="fade" onRequestClose={() => setAddModalVisible(false)}>
        <KeyboardAvoidingView style={modalStyles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setAddModalVisible(false)} />
          <View style={modalStyles.box}>
            <Text style={modalStyles.title}>New Category</Text>
            <TextInput
              style={modalStyles.input}
              value={newCategoryName}
              onChangeText={setNewCategoryName}
              onSubmitEditing={confirmAddCategory}
              placeholder="Category name"
              placeholderTextColor="#AAA"
              autoFocus
              autoCorrect={false}
              autoCapitalize="words"
            />
            <View style={modalStyles.buttons}>
              <TouchableOpacity style={modalStyles.cancel} onPress={() => setAddModalVisible(false)}>
                <Text style={modalStyles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={modalStyles.confirm} onPress={confirmAddCategory}>
                <Text style={modalStyles.confirmText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    backgroundColor: '#FFFFFF',
    borderRightWidth: 1,
    borderRightColor: '#E0E0D8',
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.10,
    shadowRadius: 6,
  },
  closeBtn: {
    width: EXPANDED_W,
    height: 48,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 16,
  },
  closeBtnText: {
    fontSize: 18,
    color: '#555',
  },
  categoryList: {
    flex: 1,
    paddingTop: 4,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    marginHorizontal: 8,
    marginVertical: 2,
  },
  categoryRowSelected: {
    backgroundColor: '#1A1A1A',
  },
  categoryIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  categoryLabel: {
    flex: 1,
    fontSize: 14,
    color: '#1A1A1A',
    fontWeight: '500',
  },
  categoryLabelSelected: {
    color: '#FFFFFF',
  },
  divider: {
    height: 1,
    backgroundColor: '#E0E0D8',
    marginHorizontal: 12,
    marginVertical: 8,
  },
  addCategoryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  addCategoryText: {
    fontSize: 13,
    color: '#555',
    fontWeight: '500',
  },
  iconRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingBottom: 16,
    gap: 4,
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 18,
    color: '#555',
  },
});

const modalStyles = StyleSheet.create({
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

const settingsStyles = StyleSheet.create({
  overlay:     { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  box:         { backgroundColor: '#FFF', borderRadius: 14, padding: 24, width: MODAL_W },
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A1A' },
  headerClose: { fontSize: 18, color: '#888' },
  sectionLabel: { fontSize: 11, fontWeight: '600', color: '#AAA', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 12 },
  row:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  rowLabel:    { fontSize: 14, color: '#1A1A1A' },
  rowValue:    { fontSize: 14, color: '#888' },
  divider:     { height: 1, backgroundColor: '#E0E0D8', marginVertical: 16 },
  swatchRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  swatch:      { width: 22, height: 22, borderRadius: 11 },
  swatchWhite: { borderWidth: 1, borderColor: '#DDD' },
  clearBtn:    { backgroundColor: '#FFF2F0', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  clearBtnText: { color: '#E8402A', fontSize: 15, fontWeight: '600' },
  about:       { fontSize: 12, color: '#BBB', textAlign: 'center', marginTop: 4 },
});
