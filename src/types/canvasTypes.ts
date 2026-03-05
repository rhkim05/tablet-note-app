// Shared TypeScript types between React Native and Kotlin bridge

export type PenColor = string; // hex color e.g. '#000000'

export type ToolMode = 'pen' | 'eraser' | 'select';

export interface StrokeStyle {
  color: PenColor;
  thickness: number;
}

// Note types

export type NoteType = 'note' | 'pdf';

export interface Note {
  id: string;
  title: string;
  createdAt: number; // unix timestamp
  updatedAt: number; // unix timestamp
  type: NoteType;
  pdfUri?: string;   // internal app storage path (only for pdf type)
}
