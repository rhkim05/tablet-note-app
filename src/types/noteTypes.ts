export type NoteType = 'note' | 'pdf';

export interface Note {
  id: string;
  title: string;
  createdAt: number; // unix timestamp
  updatedAt: number; // unix timestamp
  type: NoteType;
  pdfUri?: string;      // internal app storage path (only for pdf type)
  drawingUri?: string;  // path to saved strokes JSON file
  lastPage?: number;    // last viewed page (checkpoint)
  thumbnailUri?: string; // path to generated cover thumbnail (page 1)
  categoryId?: string;  // ID of a custom category; undefined = uncategorized
}
