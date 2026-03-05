import { create } from 'zustand';
import { Note } from '../types/canvasTypes';

interface NotebookState {
  notes: Note[];
  addNote: (note: Note) => void;
  deleteNote: (id: string) => void;
}

export const useNotebookStore = create<NotebookState>(set => ({
  notes: [],

  addNote: (note) =>
    set(state => ({ notes: [note, ...state.notes] })),

  deleteNote: (id) =>
    set(state => ({ notes: state.notes.filter(n => n.id !== id) })),
}));
