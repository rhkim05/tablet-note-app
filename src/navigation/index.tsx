import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Note } from '../types/noteTypes';
import LoginScreen from '../screens/LoginScreen';
import HomeScreen from '../screens/HomeScreen';
import PdfViewerScreen from '../screens/PdfViewerScreen';
import NoteEditorScreen from '../screens/NoteEditorScreen';
import { useAuthStore } from '../store/useAuthStore';

export type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  PdfViewer: { note: Note };
  NoteEditor: { note: Note };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function Navigation() {
  const user = useAuthStore(s => s.user);

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={user ? 'Home' : 'Login'}
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="PdfViewer" component={PdfViewerScreen} />
        <Stack.Screen name="NoteEditor" component={NoteEditorScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
