// Kotlin으로 개발한 Canvas 뷰를 네이티브 컴포넌트로 매핑
import React, { forwardRef, useEffect } from 'react';
import { DeviceEventEmitter, requireNativeComponent, StyleProp, ViewStyle } from 'react-native';
import { ToolMode } from '../types/canvasTypes';
import { useToolStore } from '../store/useToolStore';
import { useSettingsStore } from '../store/useSettingsStore';

interface CanvasViewProps {
  tool: ToolMode;
  penColor: string;
  penThickness: number;
  eraserThickness: number;
  eraserMode: string;
  style?: StyleProp<ViewStyle>;
  onLayout?: () => void;
}

const NativeCanvasView = requireNativeComponent<CanvasViewProps>('CanvasView');

const CanvasView = forwardRef<any, CanvasViewProps>((props, ref) => {
  const { setCanUndo, setCanRedo, setTool } = useToolStore();

  useEffect(() => {
    const undoSub = DeviceEventEmitter.addListener('canvasUndoRedoState', (event: { canUndo: boolean; canRedo: boolean }) => {
      setCanUndo(event.canUndo);
      setCanRedo(event.canRedo);
    });
    const eraserLiftSub = DeviceEventEmitter.addListener('canvasEraserLift', () => {
      if (useSettingsStore.getState().autoSwitchToPen) {
        setTool('pen');
      }
    });
    return () => {
      undoSub.remove();
      eraserLiftSub.remove();
    };
  }, [setCanUndo, setCanRedo, setTool]);

  return <NativeCanvasView ref={ref} {...props} />;
});

export default CanvasView;
