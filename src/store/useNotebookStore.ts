import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Note } from '../types/noteTypes';

interface NotebookState {
  notes: Note[];
  addNote: (note: Note) => void;
  deleteNote: (id: string) => void;
  updateNote: (id: string, partial: Partial<Note>) => void;
}

export const useNotebookStore = create<NotebookState>()(
  persist(
    set => ({
      notes: [],

      addNote: (note) =>
        set(state => ({ notes: [note, ...state.notes] })),

      deleteNote: (id) =>
        set(state => ({ notes: state.notes.filter(n => n.id !== id) })),

      updateNote: (id, partial) =>
        set(state => ({
          notes: state.notes.map(n => n.id === id ? { ...n, ...partial } : n),
        })),
    }),
    {
      name: 'notebook-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
