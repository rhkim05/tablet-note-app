// Shared types between React Native and Kotlin bridge

export type PenColor = string; // hex color e.g. '#000000'

export type ToolMode = 'pen' | 'eraser' | 'select'; // 'select' = hand/scroll mode in PDF viewer

export interface StrokeStyle {
  color: PenColor;
  thickness: number;
}
