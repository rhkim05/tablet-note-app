// 뷰포트 이동, 캔버스 초기화, 파일 저장등 캔버스에 직접 명령(Method)을 내리거나
// 네이티브 이벤트를 받아오는 브릿지 모듈.
import { NativeModules } from 'react-native';

const { CanvasModule } = NativeModules;

export default {
  undo: (viewTag: number) => CanvasModule.undo(viewTag),
  redo: (viewTag: number) => CanvasModule.redo(viewTag),
  clear: (viewTag: number) => CanvasModule.clear(viewTag),
  getStrokes: (viewTag: number): Promise<string> => CanvasModule.getStrokes(viewTag),
  loadStrokes: (viewTag: number, json: string) => CanvasModule.loadStrokes(viewTag, json),
  scrollToPage: (viewTag: number, page: number) => CanvasModule.scrollToPage(viewTag, page),
  getScale:     (viewTag: number): Promise<number> => CanvasModule.getScale(viewTag),
  setScale:     (viewTag: number, scale: number)   => CanvasModule.setScale(viewTag, scale),
  deleteSelected: (viewTag: number) => CanvasModule.deleteSelected(viewTag),
  captureSelected: (viewTag: number): Promise<string> => CanvasModule.captureSelected(viewTag),
  cutSelected: (viewTag: number): Promise<string> => CanvasModule.cutSelected(viewTag),
  addTextElement: (viewTag: number, id: string, text: string, x: number, y: number, width: number, height: number, fontSize: number, color: string, bold: boolean, italic: boolean, fontFamily: string) => CanvasModule.addTextElement(viewTag, id, text, x, y, width, height, fontSize, color, bold, italic, fontFamily),
  updateTextElement: (viewTag: number, id: string, text: string, fontSize: number, color: string, bold: boolean, italic: boolean, fontFamily: string) => CanvasModule.updateTextElement(viewTag, id, text, fontSize, color, bold, italic, fontFamily),
  deleteTextElement: (viewTag: number, id: string) => CanvasModule.deleteTextElement(viewTag, id),
  setActiveText: (viewTag: number, id: string) => CanvasModule.setActiveText(viewTag, id),
  clearPendingBox: (viewTag: number) => CanvasModule.clearPendingBox(viewTag),
};
