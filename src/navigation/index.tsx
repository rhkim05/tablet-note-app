import React from 'react';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Note } from '../types/noteTypes';
import HomeScreen from '../screens/HomeScreen';
import PdfViewerScreen from '../screens/PdfViewerScreen';
import NoteEditorScreen from '../screens/NoteEditorScreen';
import { useSettingsStore } from '../store/useSettingsStore';

export type RootStackParamList = {
  Home: undefined;
  PdfViewer: { note: Note };
  NoteEditor: { note: Note };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function Navigation() {
  const isDarkMode = useSettingsStore(s => s.isDarkMode);

  return (
    <NavigationContainer theme={isDarkMode ? DarkTheme : DefaultTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="PdfViewer" component={PdfViewerScreen} />
        <Stack.Screen name="NoteEditor" component={NoteEditorScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
