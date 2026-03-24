import React, { useRef } from 'react';
import { View, Text, PanResponder, StyleSheet, GestureResponderEvent, PanResponderGestureState } from 'react-native';
import { useTheme } from '../styles/theme';

interface Props {
  value: number;
  min: number;
  max: number;
  color?: string;
  showLabel?: boolean;
  onChange: (value: number) => void;
}

const TRACK_W = 130;
const THUMB_R = 10;

export default function ThicknessSlider({ value, min, max, color = '#1A1A1A', showLabel = true, onChange }: Props) {
  const theme = useTheme();
  const baseValue  = useRef(value);
  const valueRef   = useRef(value);
  const minRef     = useRef(min);
  const maxRef     = useRef(max);
  const onChangeRef = useRef(onChange);
  valueRef.current   = value;
  minRef.current     = min;
  maxRef.current     = max;
  onChangeRef.current = onChange;

  const thumbX = ((value - min) / (max - min)) * TRACK_W;
  const previewSize = Math.min(value, 28);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        baseValue.current = valueRef.current;
      },
      onPanResponderMove: (_: GestureResponderEvent, gs: PanResponderGestureState) => {
        const raw = baseValue.current + (gs.dx / TRACK_W) * (maxRef.current - minRef.current);
        const clamped = Math.round(Math.max(minRef.current, Math.min(maxRef.current, raw)));
        if (clamped !== valueRef.current) onChangeRef.current(clamped);
      },
    })
  ).current;

  return (
    <View style={styles.wrapper}>
      {/* Preview dot — fixed container so it never shifts the slider */}
      <View style={styles.previewContainer}>
        <View style={{
          width: previewSize, height: previewSize,
          borderRadius: previewSize / 2,
          backgroundColor: color === '#1A1A1A' ? theme.text : 'transparent',
          borderWidth: color === '#1A1A1A' ? 0 : 1.5,
          borderColor: theme.textSub,
        }} />
      </View>

      {/* Track + thumb */}
      <View style={styles.trackArea} {...panResponder.panHandlers}>
        <View style={[styles.track, { backgroundColor: theme.border }]}>
          <View style={[styles.fill, { width: thumbX }]} />
        </View>
        <View style={[styles.thumb, { left: thumbX - THUMB_R, backgroundColor: theme.surface }]} />
      </View>

      {/* Value label */}
      {showLabel && <Text style={[styles.label, { color: theme.textSub }]}>{value}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  previewContainer: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackArea: {
    width: TRACK_W,
    height: 36,
    justifyContent: 'center',
  },
  track: {
    height: 4,
    backgroundColor: '#E0E0D8',
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: 4,
    backgroundColor: '#4A90E2',
    borderRadius: 2,
  },
  thumb: {
    position: 'absolute',
    top: (36 - THUMB_R * 2) / 2,
    width: THUMB_R * 2,
    height: THUMB_R * 2,
    borderRadius: THUMB_R,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#4A90E2',
    elevation: 2,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#444',
    width: 24,
    textAlign: 'right',
  },
});
