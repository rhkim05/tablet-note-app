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
  Switch,
} from 'react-native';
import { Category, BUILT_IN_CATEGORIES } from '../types/categoryTypes';
import { useToolStore } from '../store/useToolStore';
import { useNotebookStore } from '../store/useNotebookStore';
import { useSettingsStore, PenAction, PEN_ACTION_LABELS } from '../store/useSettingsStore';
import ThicknessSlider from './ThicknessSlider';
import { useTheme } from '../styles/theme';

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
  const theme = useTheme();

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
  const autoSwitchToPen = useSettingsStore(s => s.autoSwitchToPen);
  const setAutoSwitchToPen = useSettingsStore(s => s.setAutoSwitchToPen);
  const isDarkMode = useSettingsStore(s => s.isDarkMode);
  const setIsDarkMode = useSettingsStore(s => s.setIsDarkMode);

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
      <Animated.View style={[styles.sidebar, { width: widthAnim, backgroundColor: theme.surface, borderRightColor: theme.border }]}>
        {/* Close button */}
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={[styles.closeBtnText, { color: theme.textSub }]}>✕</Text>
        </TouchableOpacity>

        {/* Category list */}
        <ScrollView style={styles.categoryList} showsVerticalScrollIndicator={false}>
          {allCategories.map(cat => (
            <TouchableOpacity
              key={cat.id}
              style={[styles.categoryRow, selectedCategoryId === cat.id && { backgroundColor: theme.text }]}
              onPress={() => selectCategory(cat.id)}
            >
              <Text style={[styles.categoryIcon, cat.id === 'favorites' && styles.favoriteIcon]}>
                {cat.id === 'all' ? '📋' : cat.id === 'favorites' ? '★' : cat.id === 'pdfs' ? '📄' : cat.id === 'notes' ? '📝' : '📁'}
              </Text>
              <Text
                style={[styles.categoryLabel, { color: theme.text }, selectedCategoryId === cat.id && { color: theme.surface }]}
                numberOfLines={1}
              >
                {cat.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Divider */}
        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        {/* Add category button */}
        <TouchableOpacity style={styles.addCategoryBtn} onPress={() => setAddModalVisible(true)}>
          <Text style={[styles.addCategoryText, { color: theme.textSub }]}>+ Add Category</Text>
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
        <TouchableOpacity style={[settingsStyles.overlay, { backgroundColor: theme.overlay }]} activeOpacity={1} onPress={() => setSettingsVisible(false)}>
          <TouchableOpacity style={[settingsStyles.box, { backgroundColor: theme.surface }]} activeOpacity={1} onPress={() => {}}>
            {/* Header */}
            <View style={settingsStyles.header}>
              <Text style={[settingsStyles.headerTitle, { color: theme.text }]}>Settings</Text>
              <TouchableOpacity onPress={() => setSettingsVisible(false)}>
                <Text style={[settingsStyles.headerClose, { color: theme.textHint }]}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* APPEARANCE section */}
            <Text style={[settingsStyles.sectionLabel, { color: theme.textHint }]}>APPEARANCE</Text>
            <View style={settingsStyles.row}>
              <Text style={[settingsStyles.rowLabel, { color: theme.text }]}>Dark mode</Text>
              <Switch
                value={isDarkMode}
                onValueChange={setIsDarkMode}
                trackColor={{ false: theme.border, true: theme.accent }}
                thumbColor={theme.surface}
              />
            </View>

            <View style={[settingsStyles.divider, { backgroundColor: theme.border }]} />

            {/* DRAWING section */}
            <Text style={[settingsStyles.sectionLabel, { color: theme.textHint }]}>DRAWING</Text>
            <View style={settingsStyles.row}>
              <Text style={[settingsStyles.rowLabel, { color: theme.text }]}>Pen thickness</Text>
              <ThicknessSlider value={penThickness} min={1} max={20} onChange={setPenThickness} />
            </View>
            <View style={settingsStyles.row}>
              <Text style={[settingsStyles.rowLabel, { color: theme.text }]}>Eraser thickness</Text>
              <ThicknessSlider value={eraserThickness} min={8} max={60} onChange={setEraserThickness} />
            </View>
            <View style={settingsStyles.row}>
              <Text style={[settingsStyles.rowLabel, { color: theme.text }]}>Auto-switch to pen on lift</Text>
              <Switch
                value={autoSwitchToPen}
                onValueChange={setAutoSwitchToPen}
                trackColor={{ false: theme.border, true: '#1A1A1A' }}
                thumbColor={theme.surface}
              />
            </View>

            <View style={[settingsStyles.divider, { backgroundColor: theme.border }]} />

            {/* ACTION MAPPING section */}
            <Text style={[settingsStyles.sectionLabel, { color: theme.textHint }]}>ACTION MAPPING</Text>
            <TouchableOpacity style={settingsStyles.row} onPress={() => showActionPicker(penButtonAction, setPenButtonAction)}>
              <Text style={[settingsStyles.rowLabel, { color: theme.text }]}>Pen side button</Text>
              <Text style={[settingsStyles.rowValue, { color: theme.textSub }]}>{PEN_ACTION_LABELS[penButtonAction]} ›</Text>
            </TouchableOpacity>
            <TouchableOpacity style={settingsStyles.row} onPress={() => showActionPicker(penButtonDoubleAction, setPenButtonDoubleAction)}>
              <Text style={[settingsStyles.rowLabel, { color: theme.text }]}>Double press</Text>
              <Text style={[settingsStyles.rowValue, { color: theme.textSub }]}>{PEN_ACTION_LABELS[penButtonDoubleAction]} ›</Text>
            </TouchableOpacity>

            <View style={[settingsStyles.divider, { backgroundColor: theme.border }]} />

            {/* PRESET COLORS section */}
            <Text style={[settingsStyles.sectionLabel, { color: theme.textHint }]}>PRESET COLORS</Text>
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

            <View style={[settingsStyles.divider, { backgroundColor: theme.border }]} />

            {/* DATA section */}
            <Text style={[settingsStyles.sectionLabel, { color: theme.textHint }]}>DATA</Text>
            <TouchableOpacity style={[settingsStyles.clearBtn, { backgroundColor: theme.destructiveBg }]} onPress={handleClearAll}>
              <Text style={[settingsStyles.clearBtnText, { color: theme.destructive }]}>Clear All Notes</Text>
            </TouchableOpacity>

            <View style={[settingsStyles.divider, { backgroundColor: theme.border }]} />

            {/* About */}
            <Text style={[settingsStyles.about, { color: theme.textHint }]}>Tablet Notes  v1.0</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Add Category Modal */}
      <Modal visible={addModalVisible} transparent animationType="fade" onRequestClose={() => setAddModalVisible(false)}>
        <KeyboardAvoidingView style={[modalStyles.overlay, { backgroundColor: theme.overlay }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setAddModalVisible(false)} />
          <View style={[modalStyles.box, { backgroundColor: theme.surface }]}>
            <Text style={[modalStyles.title, { color: theme.text }]}>New Category</Text>
            <TextInput
              style={[modalStyles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surfaceAlt }]}
              value={newCategoryName}
              onChangeText={setNewCategoryName}
              onSubmitEditing={confirmAddCategory}
              placeholder="Category name"
              placeholderTextColor={theme.textHint}
              autoFocus
              autoCorrect={false}
              autoCapitalize="words"
            />
            <View style={modalStyles.buttons}>
              <TouchableOpacity style={[modalStyles.cancel, { backgroundColor: theme.surfaceAlt }]} onPress={() => setAddModalVisible(false)}>
                <Text style={[modalStyles.cancelText, { color: theme.textSub }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[modalStyles.confirm, { backgroundColor: theme.text }]} onPress={confirmAddCategory}>
                <Text style={[modalStyles.confirmText, { color: theme.surface }]}>Add</Text>
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
    borderRightWidth: 1,
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
  categoryIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  favoriteIcon: {
    color: '#F5A623',
  },
  categoryLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    marginHorizontal: 12,
    marginVertical: 8,
  },
  addCategoryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  addCategoryText: {
    fontSize: 13,
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

const settingsStyles = StyleSheet.create({
  overlay:     { flex: 1, justifyContent: 'center', alignItems: 'center' },
  box:         { borderRadius: 14, padding: 24, width: MODAL_W },
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  headerClose: { fontSize: 18 },
  sectionLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 12 },
  row:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  rowLabel:    { fontSize: 14 },
  rowValue:    { fontSize: 14 },
  divider:     { height: 1, marginVertical: 16 },
  swatchRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  swatch:      { width: 22, height: 22, borderRadius: 11 },
  swatchWhite: { borderWidth: 1, borderColor: '#DDD' },
  clearBtn:    { paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  clearBtnText: { fontSize: 15, fontWeight: '600' },
  about:       { fontSize: 12, textAlign: 'center', marginTop: 4 },
});
