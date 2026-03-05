# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A tablet note-taking app ("Goodnotes + Parallel Pages"). Built with a **hybrid React Native + Kotlin architecture**: React Native handles UI/navigation, while the drawing engine runs natively in Kotlin to bypass the JS bridge for low-latency stylus input.

## Commands

```bash
# Install dependencies (use --legacy-peer-deps — required due to version conflicts)
npm install --legacy-peer-deps

# Start Metro bundler (Terminal 1)
npx react-native start

# Build and run on Android emulator (Terminal 2)
npx react-native run-android

# TypeScript check
npx tsc --noEmit
```

### Android build requirements
- **JDK 17** is required (JDK 21+ breaks Gradle 8.3). Path is pinned in `android/gradle.properties` via `org.gradle.java.home`.
- `android/gradle.properties` sets `org.gradle.java.home=/Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home` — update this path if JDK 17 is installed elsewhere.
- Gradle wrapper: 8.3, AGP: 8.1.1. Do not upgrade these — RN 0.73's gradle plugin has Kotlin warnings that become errors under Gradle 8.11+.
- `androidx.core` and `androidx.transition` are pinned to older versions in `android/build.gradle` via `resolutionStrategy` to stay within `compileSdk 34`.
- The `native_modules.gradle` path in `android/settings.gradle` and `android/app/build.gradle` points to `node_modules/react-native/node_modules/@react-native-community/cli-platform-android/` (not the root `node_modules/`) due to npm hoisting.

## Project Structure

```
tablet-note-app/
├── android/app/src/main/java/com/tabletnoteapp/  # Kotlin native
│   ├── canvas/                    # Pure drawing engine (no RN dependency)
│   │   ├── DrawingCanvas.kt       # Custom View: touch events + rendering
│   │   ├── models/Stroke.kt       # Stroke data model
│   │   ├── models/Point.kt        # Point (x, y, pressure) data model
│   │   └── utils/BezierSmoother.kt
│   └── reactbridge/               # RN <-> Kotlin bridge
│       ├── CanvasViewManager.kt   # Exposes DrawingCanvas as RN UI component
│       ├── CanvasModule.kt        # Exposes Kotlin methods (save, clear, etc.) to JS
│       └── CanvasPackage.kt       # Registers both with RN engine
├── src/
│   ├── screens/
│   │   ├── HomeScreen.tsx         # Note grid, PDF import button
│   │   ├── PdfViewerScreen.tsx    # Renders PDF pages via react-native-pdf
│   │   └── NoteEditorScreen.tsx   # (stub) Drawing canvas screen
│   ├── store/
│   │   ├── useNotebookStore.ts    # Notes list (addNote, deleteNote)
│   │   ├── useToolStore.ts        # (stub) Active pen/eraser state
│   │   └── useEditorStore.ts      # (stub) Current page, zoom
│   ├── native/                    # Bridge wrappers (stubs)
│   │   ├── CanvasView.tsx         # Maps Kotlin DrawingCanvas as RN component
│   │   └── CanvasModule.ts        # TypeScript wrapper for Kotlin canvas methods
│   └── types/canvasTypes.ts       # Shared types: Note, NoteType, StrokeStyle, ToolMode
└── App.tsx                        # NavigationContainer + RootStackParamList
```

## Architecture

### Navigation (`App.tsx`)
Uses `@react-navigation/native-stack`. Route types are exported from `App.tsx` as `RootStackParamList`. Current routes: `Home` and `PdfViewer: { note: Note }`. `NoteEditorScreen` is not yet wired into navigation.

### PDF Import Flow
1. User taps "Import PDF" → `react-native-document-picker` opens system file picker
2. Selected file is copied to `DocumentDirectoryPath/pdfs/` via `react-native-fs`
3. A `Note` object (`type: 'pdf'`, `pdfUri: <internal path>`) is saved to `useNotebookStore`
4. Tapping the PDF card navigates to `PdfViewerScreen` with the note passed as a route param

### State Management
- `useNotebookStore` — the only implemented store; holds `Note[]` in memory (no persistence yet)
- `Note` type is defined in `src/types/canvasTypes.ts` and is the shared contract across screens and the store

### Hybrid Drawing Engine (not yet active)
Drawing will be handled entirely in Kotlin (`canvas/`) using Android Canvas API, bypassing the RN bridge for rendering. The bridge (`reactbridge/`) is only for commands (tool changes, save, undo) and events. The `src/native/` files are stubs waiting for the Kotlin implementation.

### Known Dependency Quirks
- `npm install` requires `--legacy-peer-deps` due to conflicts between installed library versions and RN 0.73
- `react-native-pdf` requires `react-native-blob-util` as a peer dependency
- `@react-native/metro-config` must be installed explicitly (not bundled in this setup)
