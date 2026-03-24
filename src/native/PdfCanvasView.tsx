import React, { forwardRef, useEffect } from 'react';
import { DeviceEventEmitter, requireNativeComponent, StyleProp, ViewStyle } from 'react-native';
import { useToolStore } from '../store/useToolStore';
import { useSettingsStore } from '../store/useSettingsStore';

interface PdfCanvasViewProps {
  pdfUri?: string;
  tool: string;
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
}

const NativePdfCanvasView = requireNativeComponent<PdfCanvasViewProps>('PdfCanvasView');

const PdfCanvasView = forwardRef<any, PdfCanvasViewProps>((props, ref) => {
  const { setCanUndo, setCanRedo, setTool } = useToolStore();

  useEffect(() => {
    const undoSub = DeviceEventEmitter.addListener(
      'canvasUndoRedoState',
      ({ canUndo, canRedo }: { canUndo: boolean; canRedo: boolean }) => {
        setCanUndo(canUndo);
        setCanRedo(canRedo);
      },
    );
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

  return <NativePdfCanvasView ref={ref} {...props} />;
});

export default PdfCanvasView;
