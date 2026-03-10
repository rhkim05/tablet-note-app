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
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { Category, BUILT_IN_CATEGORIES } from '../types/categoryTypes';
import { useAuthStore } from '../store/useAuthStore';
import { RootStackParamList } from '../navigation';

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
  const widthAnim = useRef(new Animated.Value(0)).current;
  const { user, clearUser } = useAuthStore();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

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
    if (trimmed) {
      onAddCategory(trimmed);
    }
    setNewCategoryName('');
    setAddModalVisible(false);
  };

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Sign out of your Google account?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await GoogleSignin.signOut();
          } catch { /* ignore */ }
          clearUser();
          navigation.replace('Login');
        },
      },
    ]);
  };

  const userInitial = user?.name ? user.name.charAt(0).toUpperCase() : '?';

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

        {/* Account row */}
        <TouchableOpacity style={styles.accountRow} onPress={handleSignOut}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{userInitial}</Text>
          </View>
          <Text style={styles.accountName} numberOfLines={1}>
            {user?.name ?? user?.email ?? 'Account'}
          </Text>
        </TouchableOpacity>
      </Animated.View>

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
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    paddingBottom: 16,
    gap: 10,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  accountName: {
    flex: 1,
    fontSize: 13,
    color: '#555',
    fontWeight: '500',
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
