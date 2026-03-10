import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Note } from '../types/noteTypes';
import { Category } from '../types/categoryTypes';

interface NotebookState {
  notes: Note[];
  categories: Category[];
  addNote: (note: Note) => void;
  deleteNote: (id: string) => void;
  updateNote: (id: string, partial: Partial<Note>) => void;
  addCategory: (name: string) => void;
  deleteCategory: (id: string) => void;
}

export const useNotebookStore = create<NotebookState>()(
  persist(
    set => ({
      notes: [],
      categories: [],

      addNote: (note) =>
        set(state => ({ notes: [note, ...state.notes] })),

      deleteNote: (id) =>
        set(state => ({ notes: state.notes.filter(n => n.id !== id) })),

      updateNote: (id, partial) =>
        set(state => ({
          notes: state.notes.map(n => n.id === id ? { ...n, ...partial } : n),
        })),

      addCategory: (name) =>
        set(state => ({
          categories: [{ id: Date.now().toString(), name, isBuiltIn: false }, ...state.categories],
        })),

      deleteCategory: (id) =>
        set(state => ({
          categories: state.categories.filter(c => c.id !== id),
          notes: state.notes.map(n => n.categoryId === id ? { ...n, categoryId: undefined } : n),
        })),
    }),
    {
      name: 'notebook-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
