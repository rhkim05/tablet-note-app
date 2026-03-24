// Shared types between React Native and Kotlin bridge

export type PenColor = string; // hex color e.g. '#000000'

export type ToolMode = 'pen' | 'eraser' | 'highlighter' | 'select' | 'scroll' | 'text' | 'laser' | 'shapes';

export type ShapeType = 'line' | 'arrow' | 'rectangle' | 'oval';

export type EraserMode = 'pixel' | 'stroke'; // 'pixel' = PorterDuff clear, 'stroke' = removes whole stroke

export interface StrokeStyle {
  color: PenColor;
  thickness: number;
}
