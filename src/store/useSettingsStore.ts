import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type PenAction = 'none' | 'togglePenEraser' | 'eraser' | 'pen' | 'undo';

export const PEN_ACTION_LABELS: Record<PenAction, string> = {
  none:            'None',
  togglePenEraser: 'Toggle Pen / Eraser',
  eraser:          'Switch to Eraser',
  pen:             'Switch to Pen',
  undo:            'Undo',
};

interface SettingsState {
  penButtonAction: PenAction;
  penButtonDoubleAction: PenAction;
  autoSwitchToPen: boolean;
  isDarkMode: boolean;
  setPenButtonAction: (action: PenAction) => void;
  setPenButtonDoubleAction: (action: PenAction) => void;
  setAutoSwitchToPen: (value: boolean) => void;
  setIsDarkMode: (value: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    set => ({
      penButtonAction:       'togglePenEraser',
      penButtonDoubleAction: 'undo',
      autoSwitchToPen:       true,
      isDarkMode:            false,
      setPenButtonAction:       (action) => set({ penButtonAction: action }),
      setPenButtonDoubleAction: (action) => set({ penButtonDoubleAction: action }),
      setAutoSwitchToPen:       (value) => set({ autoSwitchToPen: value }),
      setIsDarkMode:            (value) => set({ isDarkMode: value }),
    }),
    {
      name: 'settings-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
