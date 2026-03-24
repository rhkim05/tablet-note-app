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

  const textColor = useToolStore(s => s.textColor);
  const textFontSize = useToolStore(s => s.textFontSize);
  const textBold = useToolStore(s => s.textBold);
  const textItalic = useToolStore(s => s.textItalic);
  const textFontFamily = useToolStore(s => s.textFontFamily);
  const setTextColor = useToolStore(s => s.setTextColor);
  const setTextFontSize = useToolStore(s => s.setTextFontSize);
  const setTextBold = useToolStore(s => s.setTextBold);
  const setTextItalic = useToolStore(s => s.setTextItalic);
  const setTextFontFamily = useToolStore(s => s.setTextFontFamily);

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

  const [textExpanded, setTextExpanded] = useState(false);
  const [showTextColorPicker, setShowTextColorPicker] = useState(false);
  const [textPickerKey, setTextPickerKey] = useState(0);
  const [textPopupPos, setTextPopupPos] = useState({ top: 60, left: 0 });

  const [laserExpanded, setLaserExpanded] = useState(false);
  const [showLaserColorPicker, setShowLaserColorPicker] = useState(false);
  const [laserPickerKey, setLaserPickerKey] = useState(0);
  const [laserPopupPos, setLaserPopupPos] = useState({ top: 60, left: 0 });

  const penBtnRef      = useRef<TouchableOpacity>(null);
  const eraserBtnRef   = useRef<TouchableOpacity>(null);
  const hlBtnRef       = useRef<TouchableOpacity>(null);
  const textBtnRef     = useRef<TouchableOpacity>(null);
  const laserBtnRef    = useRef<TouchableOpacity>(null);
  const penScrollRef   = useRef<ScrollView>(null);
  const laserScrollRef = useRef<ScrollView>(null);
  const hlScrollRef    = useRef<ScrollView>(null);

  const theme = useTheme();

  const LASER_PRESETS = ['#FF3B30', '#30D158', '#0A84FF', '#FFD60A', '#FF375F', '#5AC8FA', '#FF9F0A', '#FFFFFF'];

  const isPen        = activeTool === 'pen';
  const isEraser     = activeTool === 'eraser';
  const isHighlighter = activeTool === 'highlighter';
  const isText       = activeTool === 'text';
  const isLaser      = activeTool === 'laser';
  const laserColor    = useToolStore(s => s.laserColor);
  const setLaserColor = useToolStore(s => s.setLaserColor);
  const shapeType     = useToolStore(s => s.shapeType);
  const setShapeType  = useToolStore(s => s.setShapeType);
  const shapeColor    = useToolStore(s => s.shapeColor);
  const setShapeColor = useToolStore(s => s.setShapeColor);
  const shapeThickness     = useToolStore(s => s.shapeThickness);
  const setShapeThickness  = useToolStore(s => s.setShapeThickness);
  const isShapes      = activeTool === 'shapes';

  const [shapesExpanded, setShapesExpanded] = useState(false);
  const [showShapeColorPicker, setShowShapeColorPicker] = useState(false);
  const [shapePickerKey, setShapePickerKey] = useState(0);
  const [shapesPopupPos, setShapesPopupPos] = useState({ top: 60, left: 0 });
  const shapesBtnRef = useRef<TouchableOpacity>(null);

  const closeTextPopup   = () => { setTextExpanded(false); setShowTextColorPicker(false); };
  const closeLaserPopup  = () => { setLaserExpanded(false); setShowLaserColorPicker(false); };
  const closeShapesPopup = () => { setShapesExpanded(false); setShowShapeColorPicker(false); };

  const closePenPopup = () => {
    setPenExpanded(false);
    setShowColorPicker(false);
  };

  const closeEraserPopup  = () => setEraserExpanded(false);
  const closeHlPopup      = () => { setHlExpanded(false); setShowHlColorPicker(false); };

  const handleTextPress = () => {
    if (isText) {
      if (!textExpanded) {
        textBtnRef.current?.measureInWindow((x, y, _w, h) => {
          setTextPopupPos({ top: y + h + 6, left: x });
        });
      }
      onShowLabel?.('');
      setTextExpanded(v => !v);
      setShowTextColorPicker(false);
    } else {
      setTool('text');
      onShowLabel?.('Text');
      closePenPopup(); closeEraserPopup(); closeHlPopup(); closeTextPopup(); closeLaserPopup(); closeShapesPopup();
    }
  };

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
      closeEraserPopup(); closePenPopup(); closeHlPopup(); closeLaserPopup(); closeShapesPopup();
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
      closePenPopup(); closeEraserPopup(); closeHlPopup(); closeLaserPopup(); closeShapesPopup();
    }
  };

  const handleLaserPress = () => {
    if (isLaser) {
      if (!laserExpanded) {
        laserBtnRef.current?.measureInWindow((x, y, _w, h) => {
          setLaserPopupPos({ top: y + h + 6, left: x });
        });
      }
      onShowLabel?.('');
      setLaserExpanded(v => !v);
      setShowLaserColorPicker(false);
    } else {
      setTool('laser');
      onShowLabel?.('Laser');
      closePenPopup(); closeEraserPopup(); closeHlPopup(); closeTextPopup(); closeLaserPopup(); closeShapesPopup();
    }
  };

  const handleShapesPress = () => {
    if (isShapes) {
      if (!shapesExpanded) {
        shapesBtnRef.current?.measureInWindow((x, y, _w, h) => {
          setShapesPopupPos({ top: y + h + 6, left: x });
        });
      }
      onShowLabel?.('');
      setShapesExpanded(v => !v);
      setShowShapeColorPicker(false);
    } else {
      setTool('shapes');
      onShowLabel?.('Shapes');
      closePenPopup(); closeEraserPopup(); closeHlPopup(); closeTextPopup(); closeLaserPopup(); closeShapesPopup();
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
      closePenPopup(); closeEraserPopup(); closeHlPopup(); closeLaserPopup(); closeShapesPopup();
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
            onPress={() => { if (activeTool !== 'scroll') { setTool('scroll'); onShowLabel?.('Scroll'); } closePenPopup(); closeEraserPopup(); closeHlPopup(); closeLaserPopup(); closeShapesPopup(); }}
          >
            <Text style={styles.buttonIcon}>✋</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, activeTool === 'select' && activeStyle]}
            onPress={() => { if (activeTool !== 'select') { setTool('select'); onShowLabel?.('Select'); } closePenPopup(); closeEraserPopup(); closeHlPopup(); closeLaserPopup(); closeShapesPopup(); }}
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

          <TouchableOpacity
            ref={textBtnRef}
            style={[styles.button, isText && activeStyle]}
            onPress={handleTextPress}
          >
            <Text style={[styles.buttonIcon, { fontWeight: '700' }]}>T</Text>
          </TouchableOpacity>

          <TouchableOpacity
            ref={laserBtnRef}
            style={[styles.button, isLaser && { backgroundColor: '#FF3B30' }]}
            onPress={handleLaserPress}
          >
            <Text style={styles.buttonIcon}>🔴</Text>
          </TouchableOpacity>

          <TouchableOpacity
            ref={shapesBtnRef}
            style={[styles.button, isShapes && activeStyle]}
            onPress={handleShapesPress}
          >
            <Text style={styles.buttonIcon}>▭</Text>
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

      {/* ── Laser options popup ── */}
      <Modal
        visible={isLaser && laserExpanded}
        transparent
        animationType="fade"
        onRequestClose={closeLaserPopup}
      >
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeLaserPopup} activeOpacity={1} />

        <View style={[styles.popupRow, { top: laserPopupPos.top }]}>
          <View style={[styles.penPopup, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.popupTitle, { color: theme.textSub }]}>Laser</Text>
            <View style={[styles.hDivider, { backgroundColor: theme.border }]} />
            <ScrollView
              ref={laserScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.presetScroll}
              contentContainerStyle={styles.presetScrollContent}
            >
              {LASER_PRESETS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[
                    styles.presetDot,
                    { backgroundColor: c },
                    laserColor === c && styles.presetDotActive,
                  ]}
                  onPress={() => { setLaserColor(c); setShowLaserColorPicker(false); }}
                />
              ))}
              <TouchableOpacity
                style={styles.addPresetBtn}
                onPress={() => { setLaserPickerKey(k => k + 1); setShowLaserColorPicker(v => !v); }}
              >
                <Text style={styles.addPresetText}>+</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>

        {showLaserColorPicker && (
          <View style={[styles.popupRow, { top: laserPopupPos.top + 100 }]}>
            <ColorPickerPanel
              key={laserPickerKey}
              color={laserColor}
              presetColors={LASER_PRESETS}
              onColorChange={setLaserColor}
              onPresetSave={() => {}}
            />
          </View>
        )}
      </Modal>

      {/* ── Text options popup ── */}
      <Modal
        visible={isText && textExpanded}
        transparent
        animationType="fade"
        onRequestClose={closeTextPopup}
      >
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeTextPopup} activeOpacity={1} />

        <View style={[styles.popupRow, { top: textPopupPos.top }]}>
          <View style={[styles.penPopup, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.popupTitle, { color: theme.textSub }]}>Text</Text>
            <View style={[styles.hDivider, { backgroundColor: theme.border }]} />
            {/* Bold / Italic row */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
              <TouchableOpacity
                style={[styles.fmtBtn, textBold && { backgroundColor: theme.text }]}
                onPress={() => setTextBold(!textBold)}
              >
                <Text style={[styles.fmtBtnLabel, { color: textBold ? theme.surface : theme.text, fontWeight: '700' }]}>B</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.fmtBtn, textItalic && { backgroundColor: theme.text }]}
                onPress={() => setTextItalic(!textItalic)}
              >
                <Text style={[styles.fmtBtnLabel, { color: textItalic ? theme.surface : theme.text, fontStyle: 'italic' }]}>I</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.hDivider, { backgroundColor: theme.border }]} />
            {/* Font family row */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
              {(['sans-serif', 'serif', 'monospace'] as const).map(family => (
                <TouchableOpacity
                  key={family}
                  style={[styles.fontFamilyBtn, textFontFamily === family && { borderColor: theme.text, borderWidth: 2 }]}
                  onPress={() => setTextFontFamily(family)}
                >
                  <Text style={[styles.fontFamilyBtnLabel, { color: theme.text, fontFamily: family === 'sans-serif' ? undefined : family }]}>
                    Aa
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={[styles.hDivider, { backgroundColor: theme.border }]} />
            {/* Font size stepper */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <TouchableOpacity onPress={() => setTextFontSize(Math.max(8, textFontSize - 2))} style={styles.sizeStepper}>
                <Text style={[styles.sizeStepperText, { color: theme.text }]}>−</Text>
              </TouchableOpacity>
              <Text style={[styles.sizeLabel, { color: theme.text }]}>{textFontSize}pt</Text>
              <TouchableOpacity onPress={() => setTextFontSize(Math.min(72, textFontSize + 2))} style={styles.sizeStepper}>
                <Text style={[styles.sizeStepperText, { color: theme.text }]}>+</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.hDivider, { backgroundColor: theme.border }]} />
            {/* Color */}
            <View style={{ alignItems: 'center' }}>
              <TouchableOpacity
                style={[styles.textColorDot, { backgroundColor: textColor }]}
                onPress={() => { setTextPickerKey(k => k + 1); setShowTextColorPicker(v => !v); }}
              />
            </View>
          </View>
        </View>

        {showTextColorPicker && (
          <View style={[styles.popupRow, { top: textPopupPos.top + 240 }]}>
            <ColorPickerPanel
              key={textPickerKey}
              color={textColor}
              presetColors={presetColors}
              onColorChange={setTextColor}
              onPresetSave={() => {}}
            />
          </View>
        )}
      </Modal>

      {/* ── Shapes options popup ── */}
      <Modal
        visible={isShapes && shapesExpanded}
        transparent
        animationType="fade"
        onRequestClose={closeShapesPopup}
      >
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeShapesPopup} activeOpacity={1} />

        <View style={[styles.popupRow, { top: shapesPopupPos.top }]}>
          <View style={[styles.penPopup, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.popupTitle, { color: theme.textSub }]}>Shapes</Text>
            <View style={[styles.hDivider, { backgroundColor: theme.border }]} />
            {/* Shape type selector */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
              {(['line', 'arrow', 'rectangle', 'oval'] as const).map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.shapeTypeBtn, shapeType === t && { borderColor: theme.text, borderWidth: 2 }]}
                  onPress={() => setShapeType(t)}
                >
                  <Text style={[styles.shapeTypeBtnLabel, { color: theme.text }]}>
                    {t === 'line' ? '—' : t === 'arrow' ? '→' : t === 'rectangle' ? '▭' : '⬭'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={[styles.hDivider, { backgroundColor: theme.border }]} />
            <ThicknessSlider
              value={shapeThickness}
              min={1} max={30}
              color={shapeColor}
              onChange={setShapeThickness}
            />
            <View style={[styles.hDivider, { backgroundColor: theme.border }]} />
            <View style={{ alignItems: 'center' }}>
              <TouchableOpacity
                style={[styles.textColorDot, { backgroundColor: shapeColor }]}
                onPress={() => { setShapePickerKey(k => k + 1); setShowShapeColorPicker(v => !v); }}
              />
            </View>
          </View>
        </View>

        {showShapeColorPicker && (
          <View style={[styles.popupRow, { top: shapesPopupPos.top + 200 }]}>
            <ColorPickerPanel
              key={shapePickerKey}
              color={shapeColor}
              presetColors={presetColors}
              onColorChange={setShapeColor}
              onPresetSave={() => {}}
            />
          </View>
        )}
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
  fmtBtn: { width: 36, height: 36, borderRadius: 8, borderWidth: 1.5, borderColor: '#AAA', alignItems: 'center', justifyContent: 'center' },
  fmtBtnLabel: { fontSize: 16 },
  fontFamilyBtn: { width: 50, height: 32, borderRadius: 6, borderWidth: 1.5, borderColor: '#CCCCCC', alignItems: 'center', justifyContent: 'center' },
  fontFamilyBtnLabel: { fontSize: 14 },
  sizeStepper: { width: 32, height: 32, borderRadius: 6, borderWidth: 1.5, borderColor: '#AAA', alignItems: 'center', justifyContent: 'center' },
  sizeStepperText: { fontSize: 20, lineHeight: 24 },
  sizeLabel: { fontSize: 15, fontWeight: '600', minWidth: 40, textAlign: 'center' },
  textColorDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: '#AAA' },
  shapeTypeBtn: { width: 44, height: 36, borderRadius: 8, borderWidth: 1.5, borderColor: '#CCCCCC', alignItems: 'center', justifyContent: 'center' },
  shapeTypeBtnLabel: { fontSize: 18 },
});
