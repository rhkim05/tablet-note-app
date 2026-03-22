import React, { useState, useRef } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Modal, ScrollView } from 'react-native';
import { useToolStore } from '../store/useToolStore';
import ThicknessSlider from './ThicknessSlider';
import ColorPickerPanel from './ColorPickerPanel';
import { useTheme } from '../styles/theme';

interface ToolbarProps {
  onUndo?: () => void;
  onRedo?: () => void;
  onToggleStrip?: () => void;
  onShowLabel?: (name: string) => void;
  showHandTool?: boolean;
  currentPage?: number;
  totalPages?: number;
  showStrip?: boolean;
}

export default function Toolbar({ onUndo, onRedo, onToggleStrip, onShowLabel, showHandTool, currentPage, totalPages, showStrip }: ToolbarProps) {
  const {
    activeTool, canUndo, canRedo,
    penThickness, eraserThickness, eraserMode,
    penColor, presetColors,
    highlighterColor, highlighterPresets, highlighterThickness,
    setTool, setCanUndo: _cu, setCanRedo: _cr,
    setPenThickness, setEraserThickness, setEraserMode,
    setPenColor, setPresetColor, addPresetColor, removePresetColor,
    setHighlighterColor, setHighlighterPresetColor, addHighlighterPreset, removeHighlighterPreset, setHighlighterThickness,
  } = useToolStore();

  const [penExpanded, setPenExpanded]           = useState(false);
  const [showColorPicker, setShowColorPicker]   = useState(false);
  const [pickerKey, setPickerKey]               = useState(0);
  const [popupPos, setPopupPos]                 = useState({ top: 60, left: 0 });
  const [penPresetIdx, setPenPresetIdx]         = useState<number | null>(null);

  const [eraserExpanded, setEraserExpanded]     = useState(false);
  const [eraserPopupPos, setEraserPopupPos]     = useState({ top: 60, left: 0 });

  const [hlExpanded, setHlExpanded]             = useState(false);
  const [showHlColorPicker, setShowHlColorPicker] = useState(false);
  const [hlPickerKey, setHlPickerKey]           = useState(0);
  const [hlPopupPos, setHlPopupPos]             = useState({ top: 60, left: 0 });
  const [hlPresetIdx, setHlPresetIdx]           = useState<number | null>(null);

  const penBtnRef      = useRef<TouchableOpacity>(null);
  const eraserBtnRef   = useRef<TouchableOpacity>(null);
  const hlBtnRef       = useRef<TouchableOpacity>(null);
  const penScrollRef   = useRef<ScrollView>(null);
  const hlScrollRef    = useRef<ScrollView>(null);

  const theme = useTheme();
  const isPen        = activeTool === 'pen';
  const isEraser     = activeTool === 'eraser';
  const isHighlighter = activeTool === 'highlighter';

  const closePenPopup = () => {
    setPenExpanded(false);
    setShowColorPicker(false);
  };

  const closeEraserPopup  = () => setEraserExpanded(false);
  const closeHlPopup      = () => { setHlExpanded(false); setShowHlColorPicker(false); };

  const handleEraserPress = () => {
    if (isEraser) {
      if (!eraserExpanded) {
        eraserBtnRef.current?.measureInWindow((x, y, _w, h) => {
          setEraserPopupPos({ top: y + h + 6, left: x });
        });
      }
      onShowLabel?.('');
      setEraserExpanded(v => !v);
    } else {
      setTool('eraser');
      onShowLabel?.('Eraser');
      closeEraserPopup(); closePenPopup(); closeHlPopup();
    }
  };

  const handlePenPress = () => {
    if (isPen) {
      if (!penExpanded) {
        penBtnRef.current?.measureInWindow((x, y, _w, h) => {
          setPopupPos({ top: y + h + 6, left: x });
        });
      }
      onShowLabel?.('');
      setPenExpanded(v => !v);
      setShowColorPicker(false);
    } else {
      setTool('pen');
      onShowLabel?.('Pen');
      closePenPopup(); closeEraserPopup(); closeHlPopup();
    }
  };

  const handleHighlighterPress = () => {
    if (isHighlighter) {
      if (!hlExpanded) {
        hlBtnRef.current?.measureInWindow((x, y, _w, h) => {
          setHlPopupPos({ top: y + h + 6, left: x });
        });
      }
      onShowLabel?.('');
      setHlExpanded(v => !v);
      setShowHlColorPicker(false);
    } else {
      setTool('highlighter');
      onShowLabel?.('Highlight');
      closePenPopup(); closeEraserPopup(); closeHlPopup();
    }
  };

  const activeStyle = { backgroundColor: theme.text };

  return (
    <View style={{ backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border }}>
      {/* ── Main toolbar row ── */}
      <View style={styles.container}>

        {/* Left: strip toggle */}
        <View style={styles.sideSection}>
          {onToggleStrip != null && totalPages != null && totalPages > 0 && (
            <TouchableOpacity
              style={[styles.iconBtn, showStrip && activeStyle]}
              onPress={onToggleStrip}
            >
              <View style={[styles.hamburgerLine, { backgroundColor: showStrip ? theme.surface : theme.text }]} />
              <View style={[styles.hamburgerLine, { backgroundColor: showStrip ? theme.surface : theme.text }]} />
              <View style={[styles.hamburgerLine, { backgroundColor: showStrip ? theme.surface : theme.text }]} />
            </TouchableOpacity>
          )}
        </View>

        {/* Center: tool buttons */}
        <View style={styles.centerSection}>
          <TouchableOpacity
            style={[styles.button, activeTool === 'scroll' && activeStyle]}
            onPress={() => { if (activeTool !== 'scroll') { setTool('scroll'); onShowLabel?.('Scroll'); } closePenPopup(); closeEraserPopup(); closeHlPopup(); }}
          >
            <Text style={styles.buttonIcon}>✋</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, activeTool === 'select' && activeStyle]}
            onPress={() => { if (activeTool !== 'select') { setTool('select'); onShowLabel?.('Select'); } closePenPopup(); closeEraserPopup(); closeHlPopup(); }}
          >
            <Text style={styles.buttonIcon}>✦</Text>
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: theme.border }]} />

          <TouchableOpacity
            ref={penBtnRef}
            style={[styles.button, isPen && activeStyle]}
            onPress={handlePenPress}
          >
            <Text style={styles.buttonIcon}>✏️</Text>
          </TouchableOpacity>

          <TouchableOpacity
            ref={hlBtnRef}
            style={[styles.button, isHighlighter && activeStyle]}
            onPress={handleHighlighterPress}
          >
            <Text style={styles.buttonIcon}>🖊️</Text>
          </TouchableOpacity>

          <TouchableOpacity
            ref={eraserBtnRef}
            style={[styles.button, isEraser && activeStyle]}
            onPress={handleEraserPress}
          >
            <Text style={styles.buttonIcon}>⬜</Text>
          </TouchableOpacity>
        </View>

        {/* Right: undo, redo, page */}
        <View style={[styles.sideSection, { justifyContent: 'flex-end' }]}>
          <TouchableOpacity
            style={[styles.button, !canUndo && styles.buttonDisabled]}
            disabled={!canUndo}
            onPress={onUndo}
          >
            <Text style={styles.buttonIcon}>↩️</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, !canRedo && styles.buttonDisabled]}
            disabled={!canRedo}
            onPress={onRedo}
          >
            <Text style={styles.buttonIcon}>↪️</Text>
          </TouchableOpacity>

          {totalPages != null && totalPages > 0 && (
            <>
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
              <Text style={[styles.pageIndex, { color: theme.textSub }]}>{currentPage} / {totalPages}</Text>
            </>
          )}
        </View>
      </View>

      {/* ── Pen options popup ── */}
      <Modal
        visible={isPen && penExpanded}
        transparent
        animationType="fade"
        onRequestClose={closePenPopup}
      >
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closePenPopup} activeOpacity={1} />

        <View style={[styles.popupRow, { top: popupPos.top }]}>
          <View style={[styles.penPopup, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.popupTitle, { color: theme.textSub }]}>Pen</Text>
            <View style={[styles.hDivider, { backgroundColor: theme.border }]} />
            <ScrollView
              ref={penScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.presetScroll}
              contentContainerStyle={styles.presetScrollContent}
            >
              {presetColors.map((c, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.presetDot, { backgroundColor: c }, penColor === c && styles.presetDotActive]}
                  onPress={() => { setPenColor(c); setPenPresetIdx(i); setPickerKey(k => k + 1); setShowColorPicker(true); }}
                />
              ))}
              <TouchableOpacity
                style={styles.addPresetBtn}
                onPress={() => {
                  setPenPresetIdx(presetColors.length);
                  addPresetColor(penColor);
                  setPickerKey(k => k + 1);
                  setShowColorPicker(true);
                  setTimeout(() => penScrollRef.current?.scrollToEnd({ animated: true }), 50);
                }}
              >
                <Text style={styles.addPresetText}>+</Text>
              </TouchableOpacity>
            </ScrollView>
            <View style={[styles.hDivider, { backgroundColor: theme.border }]} />
            <ThicknessSlider
              value={penThickness}
              min={1} max={30}
              color="#1A1A1A"
              onChange={setPenThickness}
            />
          </View>
        </View>

        {showColorPicker && (
          <View style={[styles.popupRow, { top: popupPos.top + 155 }]}>
            <ColorPickerPanel
              key={pickerKey}
              color={penColor}
              presetColors={presetColors}
              onColorChange={setPenColor}
              onPresetSave={(i, c) => setPresetColor(i, c)}
              onPresetDelete={penPresetIdx !== null ? () => {
                removePresetColor(penPresetIdx);
                setPenPresetIdx(null);
                setShowColorPicker(false);
              } : undefined}
            />
          </View>
        )}
      </Modal>

      {/* ── Highlighter options popup ── */}
      <Modal
        visible={isHighlighter && hlExpanded}
        transparent
        animationType="fade"
        onRequestClose={closeHlPopup}
      >
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeHlPopup} activeOpacity={1} />

        <View style={[styles.popupRow, { top: hlPopupPos.top }]}>
          <View style={[styles.penPopup, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.popupTitle, { color: theme.textSub }]}>Highlight</Text>
            <View style={[styles.hDivider, { backgroundColor: theme.border }]} />
            <ScrollView
              ref={hlScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.presetScroll}
              contentContainerStyle={styles.presetScrollContent}
            >
              {highlighterPresets.map((c, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.presetDot, { backgroundColor: c }, highlighterColor === c && styles.presetDotActive]}
                  onPress={() => { setHighlighterColor(c); setHlPresetIdx(i); setHlPickerKey(k => k + 1); setShowHlColorPicker(true); }}
                />
              ))}
              <TouchableOpacity
                style={styles.addPresetBtn}
                onPress={() => {
                  setHlPresetIdx(highlighterPresets.length);
                  addHighlighterPreset(highlighterColor);
                  setHlPickerKey(k => k + 1);
                  setShowHlColorPicker(true);
                  setTimeout(() => hlScrollRef.current?.scrollToEnd({ animated: true }), 50);
                }}
              >
                <Text style={styles.addPresetText}>+</Text>
              </TouchableOpacity>
            </ScrollView>
            <View style={[styles.hDivider, { backgroundColor: theme.border }]} />
            <ThicknessSlider
              value={highlighterThickness}
              min={8} max={48}
              color={highlighterColor}
              onChange={setHighlighterThickness}
            />
          </View>
        </View>

        {showHlColorPicker && (
          <View style={[styles.popupRow, { top: hlPopupPos.top + 155 }]}>
            <ColorPickerPanel
              key={hlPickerKey}
              color={highlighterColor}
              presetColors={highlighterPresets}
              onColorChange={setHighlighterColor}
              onPresetSave={(i, c) => setHighlighterPresetColor(i, c)}
              onPresetDelete={hlPresetIdx !== null ? () => {
                removeHighlighterPreset(hlPresetIdx);
                setHlPresetIdx(null);
                setShowHlColorPicker(false);
              } : undefined}
            />
          </View>
        )}
      </Modal>

      {/* ── Eraser options popup ── */}
      <Modal
        visible={isEraser && eraserExpanded}
        transparent
        animationType="fade"
        onRequestClose={closeEraserPopup}
      >
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeEraserPopup} activeOpacity={1} />

        <View style={[styles.popupRow, { top: eraserPopupPos.top }]}>
          <View style={[styles.penPopup, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.popupTitle, { color: theme.textSub }]}>Eraser</Text>
            <View style={[styles.hDivider, { backgroundColor: theme.border }]} />
            <ThicknessSlider
              value={eraserThickness}
              min={20} max={300}
              color="eraser"
              showLabel={false}
              onChange={setEraserThickness}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  sideSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 4,
  },
  centerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  popupTitle: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  buttonDisabled: { opacity: 0.3 },
  buttonIcon: { fontSize: 16 },
  divider: {
    width: 1, height: 24,
    marginHorizontal: 6,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 8,
  },
  hamburgerLine: {
    width: 18,
    height: 2,
    borderRadius: 1,
  },
  presetDot: {
    width: 24, height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#CCCCCC',
  },
  presetDotActive: {
    borderColor: '#333',
    borderWidth: 3,
  },
  pageIndex: {
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 8,
  },
  // Pen popup
  penPopup: {
    flexDirection: 'column',
    width: 250,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 1,
  },
  hDivider: {
    height: 1,
    marginVertical: 10,
  },
  presetScroll: {
    // exactly 6 dots (24px) + 5 gaps (10px) = 194px
    width: 194,
    alignSelf: 'center',
  },
  presetScrollContent: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 2,
  },
  addPresetBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#AAAAAA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPresetText: {
    fontSize: 16,
    lineHeight: 18,
    color: '#888888',
    includeFontPadding: false,
  },
  popupRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
  },
});
