import React from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
} from 'react-native';
import { useToolStore } from '../store/useToolStore';

interface ToolbarProps {
  onUndo?: () => void;
  onRedo?: () => void;
  showHandTool?: boolean;
}

export default function Toolbar({ onUndo, onRedo, showHandTool }: ToolbarProps) {
  const { activeTool, canUndo, canRedo, setTool } = useToolStore();

  return (
    <View style={styles.container}>
      {showHandTool && (
        <TouchableOpacity
          style={[styles.button, activeTool === 'select' && styles.buttonActive]}
          onPress={() => setTool('select')}
        >
          <Text style={[styles.icon, activeTool === 'select' && styles.iconActive]}>✋</Text>
          <Text style={[styles.label, activeTool === 'select' && styles.labelActive]}>Scroll</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={[styles.button, activeTool === 'pen' && styles.buttonActive]}
        onPress={() => setTool('pen')}
      >
        <Text style={[styles.icon, activeTool === 'pen' && styles.iconActive]}>✏️</Text>
        <Text style={[styles.label, activeTool === 'pen' && styles.labelActive]}>Pen</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, activeTool === 'eraser' && styles.buttonActive]}
        onPress={() => setTool('eraser')}
      >
        <Text style={[styles.icon, activeTool === 'eraser' && styles.iconActive]}>⬜</Text>
        <Text style={[styles.label, activeTool === 'eraser' && styles.labelActive]}>Eraser</Text>
      </TouchableOpacity>

      <View style={styles.divider} />

      <TouchableOpacity
        style={[styles.button, !canUndo && styles.buttonDisabled]}
        disabled={!canUndo}
        onPress={onUndo}
      >
        <Text style={[styles.icon, !canUndo && styles.iconDisabled]}>↩️</Text>
        <Text style={[styles.label, !canUndo && styles.labelDisabled]}>Undo</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, !canRedo && styles.buttonDisabled]}
        disabled={!canRedo}
        onPress={onRedo}
      >
        <Text style={[styles.icon, !canRedo && styles.iconDisabled]}>↪️</Text>
        <Text style={[styles.label, !canRedo && styles.labelDisabled]}>Redo</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0D8',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 4,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
    flexDirection: 'row',
    gap: 6,
  },
  buttonActive: {
    backgroundColor: '#1A1A1A',
  },
  buttonDisabled: {
    opacity: 0.3,
  },
  icon: {
    fontSize: 16,
  },
  iconActive: {},
  iconDisabled: {},
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1A1A1A',
  },
  labelActive: {
    color: '#FFFFFF',
  },
  labelDisabled: {
    color: '#1A1A1A',
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: '#E0E0D8',
    marginHorizontal: 8,
  },
});
