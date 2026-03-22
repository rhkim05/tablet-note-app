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
  lastScale?: number;   // last zoom level (checkpoint)
  totalPages?: number;  // total page count (set on first load)
  thumbnailUri?: string; // path to generated cover thumbnail (page 1)
  categoryIds?: string[];  // IDs of custom categories this note belongs to; undefined = uncategorized
  isFavorite?: boolean;
}
