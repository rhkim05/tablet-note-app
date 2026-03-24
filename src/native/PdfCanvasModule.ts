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
  addTextElement: (viewTag: number, id: string, text: string, x: number, y: number, width: number, height: number, fontSize: number, color: string, bold: boolean, italic: boolean, fontFamily: string) => PdfCanvasModule.addTextElement(viewTag, id, text, x, y, width, height, fontSize, color, bold, italic, fontFamily),
  updateTextElement: (viewTag: number, id: string, text: string, fontSize: number, color: string, bold: boolean, italic: boolean, fontFamily: string) => PdfCanvasModule.updateTextElement(viewTag, id, text, fontSize, color, bold, italic, fontFamily),
  deleteTextElement: (viewTag: number, id: string) => PdfCanvasModule.deleteTextElement(viewTag, id),
  setActiveText: (viewTag: number, id: string) => PdfCanvasModule.setActiveText(viewTag, id),
  clearPendingBox: (viewTag: number) => PdfCanvasModule.clearPendingBox(viewTag),
};
