export type NoteType = 'note' | 'pdf';

export interface Note {
  id: string;
  title: string;
  createdAt: number; // unix timestamp
  updatedAt: number; // unix timestamp
  type: NoteType;
  pdfUri?: string;      // internal app storage path (only for pdf type)
  drawingUri?: string;  // path to saved strokes JSON file
}
