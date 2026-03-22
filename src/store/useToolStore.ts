import { create } from 'zustand';
import { EraserMode, ToolMode } from '../types/canvasTypes';

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
}));
