# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A tablet note-taking app ("Goodnotes + Parallel Pages"). Built with a **hybrid React Native + Kotlin architecture**: React Native handles UI/navigation, while the drawing engine runs natively in Kotlin to bypass the JS bridge for low-latency stylus input.

## Commands

**macOS:**

```bash
npm install --legacy-peer-deps
npx react-native start          # Terminal 1 — Metro bundler
npx react-native run-android    # Terminal 2 — build & deploy
npx tsc --noEmit                # TypeScript check
```

**Windows:**

```cmd
npm install --legacy-peer-deps
.\node_modules\.bin\react-native start
.\node_modules\.bin\react-native run-android
.\node_modules\.bin\tsc --noEmit
```

> On Windows, `npx` may not be available — use `.\node_modules\.bin\` directly if so.

### Android build requirements

**JDK 17 is required** (JDK 21+ breaks Gradle 8.3). `android/gradle.properties` is committed and contains shared settings — do **not** put `org.gradle.java.home` there. Instead, put your machine-specific JDK path in `~/.gradle/gradle.properties` (macOS/Linux) or `%USERPROFILE%\.gradle\gradle.properties` (Windows). Create the file if it doesn't exist:

```properties
# macOS — ~/.gradle/gradle.properties
org.gradle.java.home=/Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home

# Windows — %USERPROFILE%\.gradle\gradle.properties
org.gradle.java.home=C:\\Program Files\\jdk-17.0.18+8
```

**Android SDK** location must be set in `android/local.properties` (not committed — create it if missing):

```properties
# macOS
sdk.dir=/Users/<you>/Library/Android/sdk

# Windows
sdk.dir=C\:\\Users\\<you>\\AppData\\Local\\Android\\Sdk
```

Other build constraints:

- Gradle wrapper: 8.3, AGP: 8.1.1. Do not upgrade — RN 0.73's Gradle plugin has Kotlin warnings that become errors under Gradle 8.11+.
- `androidx.core` and `androidx.transition` are pinned in `android/build.gradle` via `resolutionStrategy` to stay within `compileSdk 34`.
- The `native_modules.gradle` path in `android/settings.gradle` and `android/app/build.gradle` points to `node_modules/react-native/node_modules/@react-native-community/cli-platform-android/` (not root `node_modules/`) due to npm hoisting.

### Physical device (Windows + tablet)

1. Enable Developer Options on device → turn on USB Debugging
2. Connect via USB and accept the "Allow USB debugging?" prompt
3. Verify: `adb devices` — must show `device` (not `unauthorized`)
4. Run Metro + `run-android` as normal

### Emulator (macOS or Windows without tablet)

Create and start an AVD via Android Studio's Device Manager before running `run-android`. React Native will auto-detect the running emulator.

## Project Structure

```
tablet-note-app/
├── index.js                       # App entry point, registers TabletNoteApp component
├── App.tsx                        # Mounts <Navigation />
├── android/
│   ├── build.gradle               # AGP 8.1.1, compileSdk 34, androidx pins
│   ├── gradle.properties          # Hermes, new arch flags (committed; JDK path goes in ~/.gradle/gradle.properties)
│   └── app/
│       └── src/main/java/com/tabletnoteapp/
│           ├── MainActivity.kt            # S-Pen button key intercept (KEYCODE_STYLUS_BUTTON_PRIMARY)
│           ├── MainApplication.kt         # RN app entry, registers CanvasPackage
│           ├── canvas/                    # Pure drawing engine (no RN dependency)
│           │   ├── DrawingCanvas.kt       # Custom View: touch events + rendering (blank notes)
│           │   ├── PdfDrawingView.kt      # Custom View: PDF rendering + drawing overlay
│           │   ├── ColorGradientView.kt   # Native HSV color picker gradient view
│           │   ├── models/Stroke.kt       # Stroke, StrokeStyle, ToolType enum, UndoAction sealed class
│           │   ├── models/Point.kt        # Point (x, y, pressure)
│           │   └── utils/BezierSmoother.kt
│           └── reactbridge/               # RN <-> Kotlin bridge
│               ├── CanvasViewManager.kt
│               ├── CanvasModule.kt
│               ├── CanvasPackage.kt
│               ├── PdfCanvasViewManager.kt
│               ├── PdfCanvasModule.kt
│               └── ColorGradientViewManager.kt
└── src/
    ├── screens/
    │   ├── HomeScreen.tsx         # Note grid, PDF import button
    │   ├── PdfViewerScreen.tsx    # PDF viewer + canvas overlay
    │   └── NoteEditorScreen.tsx   # Blank drawing canvas screen
    ├── store/
    │   ├── useNotebookStore.ts    # Notes list + categories with AsyncStorage persistence
    │   ├── useToolStore.ts        # Active tool state (pen/eraser/select), undo/redo, color/thickness
    │   ├── useSettingsStore.ts    # S-Pen button action mapping, persisted via AsyncStorage
    │   └── useEditorStore.ts      # (stub) Current page, zoom
    ├── navigation/
    │   └── index.tsx              # NavigationContainer + RootStackParamList
    ├── styles/
    │   └── theme.ts               # Light/dark palettes + useTheme() hook
    ├── native/                    # Bridge wrappers
    │   ├── CanvasView.tsx         # requireNativeComponent wrapper with forwardRef
    │   ├── CanvasModule.ts        # undo/redo/clear/getStrokes/loadStrokes
    │   ├── PdfCanvasView.tsx      # requireNativeComponent wrapper for PdfDrawingView
    │   ├── PdfCanvasModule.ts     # undo/redo/clear/getStrokes/loadStrokes/scrollToPage
    │   └── ColorGradientView.tsx  # Native HSV gradient picker with batched event coalescing
    ├── components/
    │   ├── Sidebar.tsx            # Collapsible left sidebar: categories, settings modal, S-Pen action mapping
    │   ├── Toolbar.tsx            # Full toolbar: tool switching, undo/redo, color/thickness
    │   ├── ColorPickerPanel.tsx   # HSV color picker using ColorGradientView + preset swatches
    │   ├── ThicknessSlider.tsx    # PanResponder-based slider for pen/eraser thickness
    │   └── ThumbnailStrip.tsx     # PDF page thumbnail strip using react-native-pdf-thumbnail
    └── types/
        ├── noteTypes.ts           # Note, NoteType (includes optional categoryId, drawingUri)
        ├── categoryTypes.ts       # Category interface + BUILT_IN_CATEGORIES (all/pdfs/notes)
        └── canvasTypes.ts         # PenColor, ToolMode, StrokeStyle
```

## Architecture

### Navigation (`src/navigation/index.tsx`)

Uses `@react-navigation/native-stack`. All three routes are wired and active: `Home`, `PdfViewer: { note: Note }`, `NoteEditor: { note: Note }`. `App.tsx` just mounts `<Navigation />`.

### Drawing Engine

There are **two separate native drawing views** — both follow the same patterns but serve different purposes:

- **`DrawingCanvas.kt`** — used in `NoteEditorScreen` (blank notes), exposed as `"CanvasView"`.
- **`PdfDrawingView.kt`** — used in `PdfViewerScreen`, handles PDF rendering + drawing overlay, exposed as `"PdfCanvasView"`. Adds `scrollToPage` command.

Both views share these implementation details:

- Off-screen `Bitmap` caches committed strokes; only the active in-progress stroke is replayed each `onDraw`.
- Eraser uses `PorterDuff.Mode.CLEAR` — requires `LAYER_TYPE_SOFTWARE` (hardware acceleration breaks it). In `DrawingCanvas`, the active eraser stroke is drawn inside `canvas.saveLayer()` so CLEAR only affects the layer and transparent holes reveal the white view background rather than punching through to the dark parent in dark mode. `PdfDrawingView` uses the same `saveLayer` pattern around all annotation strokes.
- Undo replays all committed strokes onto a fresh bitmap; redo appends the restored stroke.
- After each stroke commit or undo/redo, Kotlin emits a `canvasUndoRedoState` device event `{ canUndo, canRedo }`. The respective native view wrapper in `src/native/` subscribes via `DeviceEventEmitter` and syncs `useToolStore`.
- On eraser `ACTION_UP`, Kotlin emits `canvasEraserLift` (no payload). `CanvasView.tsx` / `PdfCanvasView.tsx` listen and call `setTool('pen')` if `useSettingsStore.autoSwitchToPen` is true.

### Bridge (`reactbridge/` ↔ `src/native/`)

- **`CanvasViewManager.kt`** / **`PdfCanvasViewManager.kt`** — expose `DrawingCanvas`/`PdfDrawingView` as native views. Props: `tool`, `penColor`, `penThickness`, `eraserThickness` (PdfCanvasView also accepts `pdfUri`).
- **`CanvasModule.kt`** / **`PdfCanvasModule.kt`** — imperative commands via view tag from `findNodeHandle`: `undo`, `redo`, `clear`, `getStrokes` (async, returns JSON string), `loadStrokes`. `PdfCanvasModule` also has `scrollToPage(viewTag, page)`.
- **`ColorGradientViewManager.kt`** — exposes `ColorGradientView` as native view `"ColorGradientView"`. Props: `hue`, `sat`, `brightness`. Emits `colorPickerSVChange` and `colorPickerHueChange` device events.
- **`src/native/CanvasView.tsx`** / **`src/native/PdfCanvasView.tsx`** — `requireNativeComponent` wrappers with `forwardRef`; own the `DeviceEventEmitter` subscription for undo/redo state.
- **`src/native/ColorGradientView.tsx`** — wraps the native gradient view; coalesces rapid `colorPickerSVChange`/`colorPickerHueChange` events to avoid flooding React with updates.

### Stroke Persistence

Both `NoteEditorScreen` and `PdfViewerScreen` use the same pattern:

- **Save** (`beforeRemove` navigation event): `getStrokes(tag)` → write JSON to `DocumentDirectoryPath/drawings/<noteId>.json` → `updateNote` stores the path in `note.drawingUri`.
- **Load** (canvas layout callback): if `note.drawingUri` exists, read the file and call `loadStrokes(tag, json)`.

### PDF Flow

1. Import: `react-native-document-picker` → copy to `DocumentDirectoryPath/pdfs/` via `react-native-fs` → save `Note { type: 'pdf', pdfUri }` to store.
2. View: PDF is read as base64 and passed as a `data:application/pdf;base64,...` URI to `react-native-pdf` — workaround for `file://` URI issues with `react-native-blob-util`.
3. Canvas overlay is always mounted over the PDF. `pointerEvents` on its wrapper toggles between `'none'` (scroll/select mode) and `'auto'` (draw mode) based on `useToolStore.activeTool`.

### State Management

- **`useNotebookStore`** — persists `Note[]` + `Category[]` via zustand `persist` + AsyncStorage (key: `notebook-store`). `Note` includes optional `drawingUri` and `categoryId`. `Category` defined in `src/types/categoryTypes.ts`; built-in categories (`all`, `pdfs`, `notes`) are defined as constants and merged with user-created ones at render time.
- **`useToolStore`** — in-memory only. Holds `activeTool` (pen/eraser/select), `canUndo`, `canRedo`, `penColor`, `penThickness`, `eraserThickness`, `presetColors`. Updated by native view `DeviceEventEmitter` listeners.
- **`useSettingsStore`** — persists settings via AsyncStorage (key: `settings-store`). Contains: S-Pen button action mappings (`penButtonAction` / `penButtonDoubleAction`, `PenAction` type), `autoSwitchToPen: boolean` (auto-switch to pen after eraser lift, default `true`), `isDarkMode: boolean` (default `false`).

### Sidebar & S-Pen Button

- **`Sidebar.tsx`** — push-content (not overlay) flex child. Width animates 0 → 240px via `Animated.Value`; the toggle `≡` button lives in `HomeScreen`'s header outside the sidebar. Contains the settings modal (APPEARANCE: dark mode toggle; DRAWING: pen/eraser thickness, auto-switch toggle; ACTION MAPPING: S-Pen button pickers; PRESET COLORS; DATA: clear-all).
- **S-Pen flow**: `MainActivity.kt` overrides `onKeyDown` to catch `KEYCODE_STYLUS_BUTTON_PRIMARY` (257) and emit `spenButtonPress` via `DeviceEventEmitter`. `App.tsx` subscribes and reads `penButtonAction` from `useSettingsStore` to execute the mapped action against `useToolStore`. `undo` action is a no-op at the `App.tsx` level (requires an active canvas ref inside the editor screen).

### Theming (Dark Mode)

- **`src/styles/theme.ts`** — defines `lightTheme` and `darkTheme` color token objects (12 tokens: `bg`, `surface`, `surfaceAlt`, `border`, `text`, `textSub`, `textHint`, `accent`, `destructive`, `destructiveBg`, `overlay`). Exports `useTheme()` hook that reads `isDarkMode` from `useSettingsStore` and returns the active palette.
- All themed UI components call `const theme = useTheme()` and apply colors via inline style overrides on top of layout-only `StyleSheet` entries (e.g. `style={[styles.container, { backgroundColor: theme.bg }]}`).
- **Canvas drawing surface is intentionally always white** — `DrawingCanvas.kt` and `PdfDrawingView.kt` are not themed. `PdfViewerScreen` and `ThumbnailStrip` are also always dark (intentional PDF-reading UX).
- `NavigationContainer` receives `theme={isDarkMode ? DarkTheme : DefaultTheme}` from `@react-navigation/native`.

### Known Dependency Quirks

**Do not upgrade these packages** — pinned to last versions compatible with RN 0.73 (which lacks `BaseReactPackage`):

- `react-native-screens@3.35.0` (3.36+ breaks)
- `react-native-safe-area-context@4.10.0` (4.11+ breaks)
- `react-native-blob-util@0.19.11` (0.21+ breaks)
- `@react-navigation/native@6.x` + `@react-navigation/native-stack@6.x` (v7 requires screens 4.x)
- `@react-native-async-storage/async-storage@1.23.1` (v2+ requires Kotlin 2.1.0 via KSP; project uses Kotlin 1.8.0)
- `react-native-gesture-handler@~2.14.0` + `react-native-reanimated@~3.6.0` (required by navigation; do not upgrade independently)

### Git / GitHub

`android/app/build/` and `android/local.properties` are gitignored — never commit them. `android/gradle.properties` **is** committed (shared settings only). Each developer's JDK path goes in `~/.gradle/gradle.properties` (never committed). The debug APK is 164MB and will be rejected by GitHub.
