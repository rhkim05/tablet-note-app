// Kotlin으로 개발한 Canvas 뷰를 네이티브 컴포넌트로 매핑
import React, { forwardRef, useEffect } from 'react';
import { DeviceEventEmitter, requireNativeComponent, StyleProp, ViewStyle } from 'react-native';
import { ToolMode } from '../types/canvasTypes';
import { useToolStore } from '../store/useToolStore';

interface CanvasViewProps {
  tool: ToolMode;
  penColor: string;
  penThickness: number;
  eraserThickness: number;
  style?: StyleProp<ViewStyle>;
  onLayout?: () => void;
}

const NativeCanvasView = requireNativeComponent<CanvasViewProps>('CanvasView');

const CanvasView = forwardRef<any, CanvasViewProps>((props, ref) => {
  const { setCanUndo, setCanRedo } = useToolStore();

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('canvasUndoRedoState', (event: { canUndo: boolean; canRedo: boolean }) => {
      setCanUndo(event.canUndo);
      setCanRedo(event.canRedo);
    });
    return () => sub.remove();
  }, [setCanUndo, setCanRedo]);

  return <NativeCanvasView ref={ref} {...props} />;
});

export default CanvasView;
