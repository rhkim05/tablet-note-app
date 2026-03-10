import React, { useEffect } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Navigation from './src/navigation';
import { useSettingsStore } from './src/store/useSettingsStore';
import { useToolStore } from './src/store/useToolStore';

export default function App() {
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('spenButtonPress', () => {
      const action = useSettingsStore.getState().penButtonAction;
      const { activeTool, setTool } = useToolStore.getState();
      if (action === 'togglePenEraser') setTool(activeTool === 'pen' ? 'eraser' : 'pen');
      else if (action === 'pen')    setTool('pen');
      else if (action === 'eraser') setTool('eraser');
      // 'undo' and 'none' are no-ops here; undo requires the active canvas ref
    });
    return () => sub.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Navigation />
    </GestureHandlerRootView>
  );
}
