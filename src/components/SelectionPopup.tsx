import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useTheme } from '../styles/theme';
import { SelectionInfo } from '../native/CanvasView';

interface Props {
  info: SelectionInfo;
  onDelete?: () => void;
  onCut?: () => void;
  onCapture?: () => void;
}

export default function SelectionPopup({ info, onDelete, onCut, onCapture }: Props) {
  const theme = useTheme();
  if (!info.hasSelection) return null;

  // Position popup below the selection bounding box
  const popupLeft = info.bounds.x;
  const popupTop  = info.bounds.y + info.bounds.height + 12;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.popup, {
        top: popupTop,
        left: popupLeft,
        backgroundColor: theme.surface,
        borderColor: theme.border,
      }]}
    >
      {onCut && (
        <>
          <ActionButton icon="✂️" label="Cut" onPress={onCut} theme={theme} />
          <Separator theme={theme} />
        </>
      )}
      {onDelete && (
        <>
          <ActionButton icon="🗑️" label="Delete" onPress={onDelete} theme={theme} />
          <Separator theme={theme} />
        </>
      )}
      {onCapture && (
        <>
          <ActionButton icon="📷" label="Capture" onPress={onCapture} theme={theme} />
          <Separator theme={theme} />
        </>
      )}
      <ActionButton icon="⤢" label="Resize" onPress={() => {}} theme={theme} hint="Drag corner handles" />
    </View>
  );
}

function ActionButton({ icon, label, onPress, theme, hint }: {
  icon: string; label: string; onPress: () => void; theme: any; hint?: string;
}) {
  return (
    <TouchableOpacity style={styles.action} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.actionIcon}>{icon}</Text>
      <View>
        <Text style={[styles.actionLabel, { color: theme.text }]}>{label}</Text>
        {hint && <Text style={[styles.actionHint, { color: theme.textHint }]}>{hint}</Text>}
      </View>
    </TouchableOpacity>
  );
}

function Separator({ theme }: { theme: any }) {
  return <View style={[styles.sep, { backgroundColor: theme.border }]} />;
}

const styles = StyleSheet.create({
  popup: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 8,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    gap: 6,
  },
  actionIcon:  { fontSize: 18 },
  actionLabel: { fontSize: 13, fontWeight: '500' },
  actionHint:  { fontSize: 10, marginTop: 1 },
  sep: {
    width: 1,
    height: 28,
  },
});
