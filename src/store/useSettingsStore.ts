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
  setPenButtonAction: (action: PenAction) => void;
  setPenButtonDoubleAction: (action: PenAction) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    set => ({
      penButtonAction:       'togglePenEraser',
      penButtonDoubleAction: 'undo',
      setPenButtonAction:       (action) => set({ penButtonAction: action }),
      setPenButtonDoubleAction: (action) => set({ penButtonDoubleAction: action }),
    }),
    {
      name: 'settings-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
