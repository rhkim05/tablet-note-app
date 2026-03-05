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
};
