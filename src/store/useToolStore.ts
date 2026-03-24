import { create } from 'zustand';
import { EraserMode, ShapeType, ToolMode } from '../types/canvasTypes';

const DEFAULT_PRESETS = [
  '#000000', '#E53935', '#FB8C00', '#FDD835', '#43A047',
  '#039BE5', '#1E88E5', '#8E24AA', '#D81B60', '#FFFFFF',
];

const DEFAULT_HIGHLIGHTER_PRESETS = [
  '#FFFF00', '#A8F0A0', '#FFB3DE', '#A0D4FF', '#FFD580',
];

interface ToolState {
  activeTool: ToolMode;
  canUndo: boolean;
  canRedo: boolean;
  penThickness: number;
  eraserThickness: number;
  eraserMode: EraserMode;
  penColor: string;
  presetColors: string[];
  highlighterColor: string;
  highlighterPresets: string[];
  highlighterThickness: number;
  laserColor: string;
  setLaserColor: (color: string) => void;
  shapeType: ShapeType;
  setShapeType: (type: ShapeType) => void;
  shapeColor: string;
  setShapeColor: (color: string) => void;
  shapeThickness: number;
  setShapeThickness: (value: number) => void;
  textColor: string;
  textFontSize: number;
  textBold: boolean;
  textItalic: boolean;
  textFontFamily: string;
  setTool: (tool: ToolMode) => void;
  setCanUndo: (value: boolean) => void;
  setCanRedo: (value: boolean) => void;
  setPenThickness: (value: number) => void;
  setEraserThickness: (value: number) => void;
  setEraserMode: (mode: EraserMode) => void;
  setPenColor: (color: string) => void;
  setPresetColor: (index: number, color: string) => void;
  addPresetColor: (color: string) => void;
  removePresetColor: (index: number) => void;
  setHighlighterColor: (color: string) => void;
  setHighlighterPresetColor: (index: number, color: string) => void;
  addHighlighterPreset: (color: string) => void;
  removeHighlighterPreset: (index: number) => void;
  setHighlighterThickness: (value: number) => void;
  setTextColor: (color: string) => void;
  setTextFontSize: (size: number) => void;
  setTextBold: (bold: boolean) => void;
  setTextItalic: (italic: boolean) => void;
  setTextFontFamily: (family: string) => void;
}

export const useToolStore = create<ToolState>(set => ({
  activeTool: 'pen',
  canUndo: false,
  canRedo: false,
  penThickness: 4,
  eraserThickness: 24,
  eraserMode: 'pixel',
  penColor: '#000000',
  presetColors: DEFAULT_PRESETS,
  highlighterColor: '#FFFF00',
  highlighterPresets: DEFAULT_HIGHLIGHTER_PRESETS,
  highlighterThickness: 16,
  laserColor: '#FF3B30',
  setLaserColor: (color) => set({ laserColor: color }),
  shapeType: 'line',
  setShapeType: (type) => set({ shapeType: type }),
  shapeColor: '#000000',
  setShapeColor: (color) => set({ shapeColor: color }),
  shapeThickness: 4,
  setShapeThickness: (value) => set({ shapeThickness: value }),
  textColor: '#000000',
  textFontSize: 24,
  textBold: false,
  textItalic: false,
  textFontFamily: 'sans-serif',
  setTool: (tool) => set({ activeTool: tool }),
  setCanUndo: (value) => set({ canUndo: value }),
  setCanRedo: (value) => set({ canRedo: value }),
  setPenThickness: (value) => set({ penThickness: value }),
  setEraserThickness: (value) => set({ eraserThickness: value }),
  setEraserMode: (mode) => set({ eraserMode: mode }),
  setPenColor: (color) => set({ penColor: color }),
  setPresetColor: (index, color) => set(state => {
    const updated = [...state.presetColors];
    updated[index] = color;
    return { presetColors: updated };
  }),
  addPresetColor: (color) => set(state => ({ presetColors: [...state.presetColors, color] })),
  removePresetColor: (index) => set(state => ({
    presetColors: state.presetColors.filter((_, i) => i !== index),
  })),
  setHighlighterColor: (color) => set({ highlighterColor: color }),
  setHighlighterPresetColor: (index, color) => set(state => {
    const updated = [...state.highlighterPresets];
    updated[index] = color;
    return { highlighterPresets: updated };
  }),
  addHighlighterPreset: (color) => set(state => ({ highlighterPresets: [...state.highlighterPresets, color] })),
  removeHighlighterPreset: (index) => set(state => ({
    highlighterPresets: state.highlighterPresets.filter((_, i) => i !== index),
  })),
  setHighlighterThickness: (value) => set({ highlighterThickness: value }),
  setTextColor: (color) => set({ textColor: color }),
  setTextFontSize: (size) => set({ textFontSize: size }),
  setTextBold: (bold) => set({ textBold: bold }),
  setTextItalic: (italic) => set({ textItalic: italic }),
  setTextFontFamily: (family) => set({ textFontFamily: family }),
}));
