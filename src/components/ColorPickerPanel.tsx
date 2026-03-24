import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Text } from 'react-native';
import ColorGradientView from '../native/ColorGradientView';
import { useTheme } from '../styles/theme';

// ── Color math ────────────────────────────────────────────────────────────────

function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if      (h < 60)  { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) {         g = c; b = x; }
  else if (h < 240) {         g = x; b = c; }
  else if (h < 300) { r = x;         b = c; }
  else              { r = c;         b = x; }
  const hex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function hexToHsv(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const v = max, s = max === 0 ? 0 : d / max;
  let h = 0;
  if (d !== 0) {
    if      (max === r) h = (((g - b) / d) + 6) % 6 * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else                h = ((r - g) / d + 4) * 60;
  }
  return [h, s, v];
}

// ── Panel ─────────────────────────────────────────────────────────────────────

const PANEL_W      = 260;
const PAD          = 14;
const CONTENT_W    = PANEL_W - PAD * 2;
const GRADIENT_H   = 200;   // native view height (square + gap + hue bar inside)

interface Props {
  color: string;
  presetColors: string[];
  onColorChange: (hex: string) => void;
  onPresetSave: (index: number, hex: string) => void;
  onPresetDelete?: () => void;
}

export default function ColorPickerPanel({ color, presetColors, onColorChange, onPresetSave, onPresetDelete }: Props) {
  const theme = useTheme();
  const [hsv, setHsv] = useState<[number, number, number]>(() =>
    hexToHsv(color.length === 7 ? color : '#000000')
  );
  const [h, s, v] = hsv;

  const apply = (nh: number, ns: number, nv: number) => {
    setHsv([nh, ns, nv]);
    onColorChange(hsvToHex(nh, ns, nv));
  };

  const currentHex = hsvToHex(h, s, v).toUpperCase();

  return (
    <View style={[styles.panel, { backgroundColor: theme.surfaceAlt }]}>
      {/* Native gradient view — smooth, zero React overhead during touch */}
      <ColorGradientView
        hue={h}
        sat={s}
        brightness={v}
        style={{ width: CONTENT_W, height: GRADIENT_H }}
        onSVChange={(ns, nv) => apply(h, ns, nv)}
        onHueChange={(nh) => apply(nh, s, v)}
      />

      <View style={[styles.sep, { backgroundColor: theme.border }]} />

      {/* Preset swatches 5 × 2 */}
      <View style={styles.presets}>
        {presetColors.map((c, i) => (
          <TouchableOpacity
            key={i}
            style={[styles.swatch, { backgroundColor: c, borderColor: theme.border },
              c.toUpperCase() === currentHex && styles.swatchActive]}
            onPress={() => { const [ph, ps, pv] = hexToHsv(c); apply(ph, ps, pv); }}
            onLongPress={() => onPresetSave(i, currentHex)}
          />
        ))}
      </View>

      <View style={[styles.sep, { backgroundColor: theme.border }]} />

      {/* Preview */}
      <View style={styles.preview}>
        <View style={[styles.previewSwatch, { backgroundColor: currentHex, borderColor: theme.border }]} />
        <Text style={[styles.hex, { color: theme.text }]}>{currentHex}</Text>
        <Text style={[styles.hint, { color: theme.textHint }]}>long-press preset to save</Text>
      </View>

      {onPresetDelete && (
        <>
          <View style={[styles.sep, { backgroundColor: theme.border }]} />
          <TouchableOpacity style={styles.deleteBtn} onPress={onPresetDelete}>
            <Text style={styles.deleteBtnText}>Delete from preset</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const SWATCH = 20;

const styles = StyleSheet.create({
  panel: {
    backgroundColor: '#F8F8F6',
    borderRadius: 14,
    padding: PAD,
    width: PANEL_W,
    gap: 10,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
  },
  sep:     { height: 1, backgroundColor: '#E4E4DC' },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  swatch:  {
    width: SWATCH, height: SWATCH, borderRadius: SWATCH / 2,
    borderWidth: 1.5, borderColor: '#D8D8D0',
  },
  swatchActive: { borderWidth: 2.5, borderColor: '#4A90E2' },
  preview:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  previewSwatch: {
    width: 28, height: 28, borderRadius: 6,
    borderWidth: 1, borderColor: '#D8D8D0',
  },
  hex:  { fontSize: 13, fontWeight: '700', color: '#333', letterSpacing: 0.5 },
  hint: { flex: 1, textAlign: 'right', fontSize: 10, color: '#AAA' },
  deleteBtn: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  deleteBtnText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#E53935',
  },
});
