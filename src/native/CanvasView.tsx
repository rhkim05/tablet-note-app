// Kotlin으로 개발한 Canvas 뷰를 네이티브 컴포넌트로 매핑
import React, { forwardRef, useEffect } from 'react';
import { DeviceEventEmitter, requireNativeComponent, StyleProp, ViewStyle } from 'react-native';
import { ToolMode } from '../types/canvasTypes';
import { useToolStore } from '../store/useToolStore';
import { useSettingsStore } from '../store/useSettingsStore';

export interface SelectionInfo {
  hasSelection: boolean;
  count: number;
  bounds: { x: number; y: number; width: number; height: number };
}

interface CanvasViewProps {
  tool: ToolMode;
  penColor: string;
  penThickness: number;
  eraserThickness: number;
  eraserMode: string;
  highlighterColor: string;
  highlighterThickness: number;
  laserColor: string;
  shapeType?: string;
  shapeColor?: string;
  shapeThickness?: number;
  style?: StyleProp<ViewStyle>;
  onLayout?: () => void;
  onSelectionChanged?: (info: SelectionInfo) => void;
  onPageChanged?: (page: number) => void;
  onPageCountChanged?: (total: number) => void;
}

const NativeCanvasView = requireNativeComponent<CanvasViewProps>('CanvasView');

const CanvasView = forwardRef<any, CanvasViewProps>((props, ref) => {
  const { setCanUndo, setCanRedo, setTool } = useToolStore();
  const { onSelectionChanged, onPageChanged, onPageCountChanged, ...nativeProps } = props;

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
    const selectionSub = DeviceEventEmitter.addListener('canvasSelectionChanged', (event: SelectionInfo) => {
      onSelectionChanged?.(event);
    });
    const pageChangedSub = DeviceEventEmitter.addListener('canvasPageChanged', ({ page }: { page: number }) => {
      onPageChanged?.(page);
    });
    const pageCountSub = DeviceEventEmitter.addListener('canvasPageCountChanged', ({ total }: { total: number }) => {
      onPageCountChanged?.(total);
    });
    return () => {
      undoSub.remove();
      eraserLiftSub.remove();
      selectionSub.remove();
      pageChangedSub.remove();
      pageCountSub.remove();
    };
  }, [setCanUndo, setCanRedo, setTool, onSelectionChanged, onPageChanged, onPageCountChanged]);

  return <NativeCanvasView ref={ref} {...nativeProps} />;
});

export default CanvasView;
