import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from './src/screens/HomeScreen';
import PdfViewerScreen from './src/screens/PdfViewerScreen';
import { Note } from './src/types/canvasTypes';

export type RootStackParamList = {
  Home: undefined;
  PdfViewer: { note: Note };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="PdfViewer" component={PdfViewerScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
