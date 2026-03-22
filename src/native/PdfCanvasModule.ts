import { NativeModules } from 'react-native';

const { PdfCanvasModule } = NativeModules;

export default {
  undo:           (viewTag: number)                  => PdfCanvasModule.undo(viewTag),
  redo:           (viewTag: number)                  => PdfCanvasModule.redo(viewTag),
  clear:          (viewTag: number)                  => PdfCanvasModule.clear(viewTag),
  deleteSelected: (viewTag: number)                  => PdfCanvasModule.deleteSelected(viewTag),
  getStrokes:     (viewTag: number): Promise<string> => PdfCanvasModule.getStrokes(viewTag),
  loadStrokes:    (viewTag: number, json: string)    => PdfCanvasModule.loadStrokes(viewTag, json),
  scrollToPage:   (viewTag: number, page: number)    => PdfCanvasModule.scrollToPage(viewTag, page),
  getScale:       (viewTag: number): Promise<number>  => PdfCanvasModule.getScale(viewTag),
  setScale:       (viewTag: number, scale: number)    => PdfCanvasModule.setScale(viewTag, scale),
  getPageCount:          (filePath: string): Promise<number> => PdfCanvasModule.getPageCount(filePath),
};
