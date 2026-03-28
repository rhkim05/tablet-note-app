# Drafty — Technical Research & Architecture Plan

A minimal, effortless tablet note-taking application (comparable to Goodnotes / Noteshelf).
First target: Android. Architecture designed for future iOS port via Kotlin Multiplatform.

---

## 1. Recommended Technical Stack

### 1.1 Kotlin Multiplatform (KMP) — Shared Module

| Concern | Library / Approach | Notes |
|---|---|---|
| Language | Kotlin 2.1+ | Single language across shared + Android |
| Build system | Gradle with KMP plugin | `kotlin("multiplatform")` |
| Async | `kotlinx-coroutines` (multiplatform) | Flows for reactive state |
| Serialization | `kotlinx-serialization` | JSON config; protobuf for strokes (see §3) |
| Database | **SQLDelight** | Generates typesafe Kotlin from SQL; multiplatform drivers for Android & iOS |
| DI | **Koin** (multiplatform) | Lightweight; first-class KMP support |
| Date/Time | `kotlinx-datetime` | |
| File I/O | `okio` (multiplatform) | Filesystem abstraction across platforms |
| Logging | **Napier** | Multiplatform logger |

> **Why SQLDelight over Room?** Room is Android-only. SQLDelight compiles SQL to Kotlin interfaces with platform-specific drivers, making it the natural KMP choice.

### 1.2 Android — UI & Rendering

| Concern | Library / Approach | Version |
|---|---|---|
| UI toolkit | **Jetpack Compose** (Material 3) | BOM 2025.x |
| Ink / drawing | **androidx.ink** | 1.0.0 stable (Dec 2025) |
| Low-latency graphics | Jetpack Graphics Library (front-buffer rendering) | Bundled with ink |
| PDF rendering | **android.graphics.pdf.PdfRenderer** | Framework API |
| Navigation | Compose Navigation | |
| Image loading | Coil 3 (multiplatform) | For thumbnails / exports |
| File picker | `ActivityResultContracts.OpenDocument` | For PDF import |

### 1.3 androidx.ink Module Breakdown

```
androidx.ink:ink-brush              — Brush, BrushFamily, BrushPaint definitions
androidx.ink:ink-brush-compose      — Compose extensions for brushes
androidx.ink:ink-strokes            — Stroke, StrokeInputBatch, MutableStrokeInputBatch
androidx.ink:ink-geometry           — Geometric helpers (Box, Vec, MeshEnvelope)
androidx.ink:ink-geometry-compose   — Compose interop (toComposeRect, etc.)
androidx.ink:ink-authoring          — InProgressStrokesView (View-based)
androidx.ink:ink-authoring-compose  — InProgressStrokes composable
androidx.ink:ink-rendering          — CanvasStrokeRenderer, ViewStrokeRenderer
androidx.ink:ink-storage            — Protobuf encode/decode for StrokeInputBatch
```

---

## 2. Software Architecture

### 2.1 High-Level: Clean Architecture + MVI

```
┌─────────────────────────────────────────────────────┐
│                   Android App                        │
│  ┌───────────────────────────────────────────────┐  │
│  │  UI Layer (Jetpack Compose)                   │  │
│  │  - Screens / Composables                      │  │
│  │  - AndroidInkCanvas (androidx.ink)             │  │
│  │  - PdfRendererView                            │  │
│  │  - Platform ViewModels                        │  │
│  └──────────────────┬────────────────────────────┘  │
│                     │ observes state / dispatches    │
│                     │ intents                        │
│  ┌──────────────────▼────────────────────────────┐  │
│  │  Shared KMP Module                            │  │
│  │  ┌────────────────────────────────────────┐   │  │
│  │  │  Presentation: MVI State Machines      │   │  │
│  │  │  - CanvasStore (strokes, tools, undo)  │   │  │
│  │  │  - NotebookStore (pages, navigation)   │   │  │
│  │  │  - LibraryStore (notebook list, search)│   │  │
│  │  └──────────────┬─────────────────────────┘   │  │
│  │  ┌──────────────▼─────────────────────────┐   │  │
│  │  │  Domain: Use Cases & Models            │   │  │
│  │  │  - ManageStrokesUseCase                │   │  │
│  │  │  - ManagePagesUseCase                  │   │  │
│  │  │  - ExportUseCase                       │   │  │
│  │  └──────────────┬─────────────────────────┘   │  │
│  │  ┌──────────────▼─────────────────────────┐   │  │
│  │  │  Data: Repositories & DAOs             │   │  │
│  │  │  - StrokeRepository                    │   │  │
│  │  │  - NotebookRepository                  │   │  │
│  │  │  - FileStorage (expect/actual)         │   │  │
│  │  └────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 2.2 MVI Flow

```
User Intent  →  Store.dispatch(Intent)  →  Reducer(State, Intent) → new State
                                        →  Side-effects (DB writes, etc.)
new State    →  StateFlow<UiState>      →  Compose collects & redraws
```

Each feature has:
- **State** — immutable data class representing the full UI state
- **Intent** — sealed interface of all user actions
- **SideEffect** — one-shot events (navigation, toasts)
- **Store** — processes intents, updates state, triggers side-effects

### 2.3 KMP Module Structure

```
drafty/
├── shared/                          # KMP shared module
│   └── src/
│       ├── commonMain/
│       │   ├── domain/
│       │   │   ├── model/           # Notebook, Page, StrokeData, Tool, etc.
│       │   │   └── usecase/         # Business logic
│       │   ├── data/
│       │   │   ├── repository/      # Repository interfaces + impls
│       │   │   ├── db/              # SQLDelight .sq files
│       │   │   └── storage/         # File storage interface
│       │   └── presentation/
│       │       ├── canvas/          # CanvasState, CanvasIntent, CanvasStore
│       │       ├── notebook/        # NotebookState, NotebookIntent, NotebookStore
│       │       └── library/         # LibraryState, LibraryIntent, LibraryStore
│       ├── androidMain/             # Android-specific expect/actual impls
│       └── iosMain/                 # (future) iOS-specific impls
│
├── androidApp/                      # Android application
│   └── src/main/
│       ├── ui/
│       │   ├── canvas/              # InkCanvas composable, tool bar
│       │   ├── notebook/            # Page navigator, PDF overlay
│       │   ├── library/             # Notebook grid, creation dialog
│       │   └── theme/               # Material 3 theming
│       ├── ink/                     # androidx.ink wrappers & bridge
│       ├── pdf/                     # PdfRenderer integration
│       └── di/                      # Koin Android modules
│
├── build.gradle.kts
└── settings.gradle.kts
```

### 2.4 The Ink Bridge — Shared ↔ Android Boundary

The critical architectural boundary is between **shared stroke data** (platform-agnostic) and **Android's `androidx.ink` rendering** (platform-specific).

```
Shared (commonMain)                  Android (androidApp)
─────────────────                    ────────────────────
StrokeData                     ←→   androidx.ink.Stroke
  - points: List<StrokePoint>        - StrokeInputBatch
  - brush: BrushConfig               - Brush / BrushFamily
  - color: Long                      - BrushPaint
  - strokeWidth: Float

StrokePoint                    ←→   StrokeInputBatch entry
  - x: Float                        - x, y, elapsedTimeMillis
  - y: Float                        - pressure, tiltRadians
  - pressure: Float                  - orientationRadians
  - tiltRadians: Float
  - timestamp: Long
```

A `StrokeMapper` on the Android side converts between these representations:
- **On draw complete**: `androidx.ink.Stroke` → `StrokeData` → persisted via shared repository
- **On page load**: `StrokeData` → `androidx.ink.Stroke` → rendered by `CanvasStrokeRenderer`

---

## 3. Data Modeling Strategy

### 3.1 Database Schema (SQLDelight)

```sql
-- Notebooks
CREATE TABLE Notebook (
    id            TEXT NOT NULL PRIMARY KEY,
    title         TEXT NOT NULL,
    coverColor    INTEGER NOT NULL DEFAULT 0,
    createdAt     INTEGER NOT NULL,   -- epoch millis
    updatedAt     INTEGER NOT NULL,
    pageCount     INTEGER NOT NULL DEFAULT 0,
    sortOrder     INTEGER NOT NULL DEFAULT 0
);

-- Pages (blank canvas or PDF-backed)
CREATE TABLE Page (
    id            TEXT NOT NULL PRIMARY KEY,
    notebookId    TEXT NOT NULL REFERENCES Notebook(id) ON DELETE CASCADE,
    pageIndex     INTEGER NOT NULL,
    pageType      TEXT NOT NULL DEFAULT 'blank',  -- 'blank' | 'pdf'
    width         REAL NOT NULL DEFAULT 1404.0,   -- default ~A4 @ 2x
    height        REAL NOT NULL DEFAULT 1984.0,
    templateType  TEXT,                            -- 'lined' | 'grid' | 'dotted' | 'blank'
    pdfDocumentId TEXT REFERENCES PdfDocument(id),
    pdfPageIndex  INTEGER,
    createdAt     INTEGER NOT NULL
);

-- PDF documents (stored as files, metadata in DB)
CREATE TABLE PdfDocument (
    id            TEXT NOT NULL PRIMARY KEY,
    fileName      TEXT NOT NULL,
    filePath      TEXT NOT NULL,    -- relative path in app storage
    pageCount     INTEGER NOT NULL,
    fileSizeBytes INTEGER NOT NULL,
    importedAt    INTEGER NOT NULL
);

-- Strokes — metadata row per stroke, binary blob for point data
CREATE TABLE Stroke (
    id            TEXT NOT NULL PRIMARY KEY,
    pageId        TEXT NOT NULL REFERENCES Page(id) ON DELETE CASCADE,
    brushType     TEXT NOT NULL,        -- 'pen' | 'highlighter'
    brushSize     REAL NOT NULL,
    colorArgb     INTEGER NOT NULL,
    strokeOrder   INTEGER NOT NULL,     -- z-order for rendering
    inputData     BLOB NOT NULL,        -- protobuf-encoded StrokeInputBatch
    boundingBoxX  REAL NOT NULL,        -- for spatial queries / culling
    boundingBoxY  REAL NOT NULL,
    boundingBoxW  REAL NOT NULL,
    boundingBoxH  REAL NOT NULL,
    createdAt     INTEGER NOT NULL
);

-- Text boxes
CREATE TABLE TextBox (
    id            TEXT NOT NULL PRIMARY KEY,
    pageId        TEXT NOT NULL REFERENCES Page(id) ON DELETE CASCADE,
    x             REAL NOT NULL,
    y             REAL NOT NULL,
    width         REAL NOT NULL,
    height        REAL NOT NULL,
    content       TEXT NOT NULL DEFAULT '',
    fontFamily    TEXT NOT NULL DEFAULT 'default',
    fontSize      REAL NOT NULL DEFAULT 16.0,
    colorArgb     INTEGER NOT NULL,
    zOrder        INTEGER NOT NULL,
    createdAt     INTEGER NOT NULL,
    updatedAt     INTEGER NOT NULL
);

-- Indices for common access patterns
CREATE INDEX idx_page_notebook ON Page(notebookId, pageIndex);
CREATE INDEX idx_stroke_page ON Stroke(pageId, strokeOrder);
CREATE INDEX idx_textbox_page ON TextBox(pageId);
```

### 3.2 Stroke Serialization Strategy

**Problem**: A single stroke can contain hundreds of input points, each with 6+ float fields. Storing as individual rows is prohibitively slow; storing as JSON is bloated.

**Solution**: Use `androidx.ink:ink-storage` protobuf encoding with delta compression.

```kotlin
// Android: Serialize stroke inputs to binary blob
fun encodeStrokeInputs(stroke: InkStroke): ByteArray {
    return ByteArrayOutputStream().use { stream ->
        stroke.inputs.encode(stream)
        stream.toByteArray()
    }
}

// Android: Deserialize binary blob back to StrokeInputBatch
fun decodeStrokeInputs(data: ByteArray): StrokeInputBatch {
    return ByteArrayInputStream(data).use { stream ->
        StrokeInputBatch.decode(stream)
    }
}
```

**Shared module** stores raw `ByteArray` blobs. The Android layer handles encode/decode via `expect/actual`:

```kotlin
// commonMain
expect class StrokeSerializer {
    fun encode(points: List<StrokePoint>): ByteArray
    fun decode(data: ByteArray): List<StrokePoint>
}

// androidMain — delegates to androidx.ink.storage
actual class StrokeSerializer {
    actual fun encode(points: List<StrokePoint>): ByteArray { /* ink-storage */ }
    actual fun decode(data: ByteArray): List<StrokePoint> { /* ink-storage */ }
}
```

**Storage size estimates** (delta-compressed protobuf):
- Typical stroke: 100–300 points × ~6 bytes/point (delta) ≈ **0.6–1.8 KB per stroke**
- Dense page (200 strokes): ~**200–360 KB**
- Notebook (50 pages): ~**10–18 MB** (very manageable)

### 3.3 PDF File Management

- PDF files stored in app-internal storage (`context.filesDir/pdfs/`)
- Database stores only the relative path and metadata
- On import: copy file to app storage, record in `PdfDocument` table, generate `Page` entries (one per PDF page)
- Annotations (strokes drawn on PDF pages) stored in the same `Stroke` table — the `Page` row links back to the PDF page index

### 3.4 Undo/Redo Model

Managed in-memory in the shared `CanvasStore`:

```kotlin
data class CanvasState(
    val strokes: List<StrokeData>,
    val textBoxes: List<TextBoxData>,
    val undoStack: List<CanvasAction>,   // actions that can be undone
    val redoStack: List<CanvasAction>,   // actions that can be redone
    val activeTool: Tool,
    val activeColor: Long,
    val activeBrushSize: Float,
    // ...
)

sealed interface CanvasAction {
    data class AddStroke(val stroke: StrokeData) : CanvasAction
    data class RemoveStrokes(val strokeIds: List<String>) : CanvasAction
    data class AddTextBox(val textBox: TextBoxData) : CanvasAction
    data class MoveElements(val moves: List<ElementMove>) : CanvasAction
    // ...
}
```

Undo/redo stacks are per-page and cleared on page navigation (standard behavior). Persistence to DB happens on each action for crash safety.

---

## 4. Tool Specifications

| Tool | Behavior | Implementation Notes |
|---|---|---|
| **Pen** | Variable-width stroke based on pressure/velocity | `BrushFamily.PRESSURE_PEN`; multiple color/size options |
| **Highlighter** | Semi-transparent wide stroke, renders behind pen strokes | Lower z-order; `BrushPaint` with alpha ~0.3 |
| **Eraser** | Object eraser (removes whole strokes on touch) | Hit-test stroke bounding boxes, then mesh; split eraser is a stretch goal |
| **Lasso Selector** | Freehand selection loop; move/resize/copy/delete selected elements | Compute selection polygon → intersect with stroke bounding boxes → move offsets |
| **Text Box** | Tap to place, type with soft keyboard, drag to reposition | Compose `TextField` overlay positioned on canvas coordinates |

---

## 5. Phased Development Plan

### Phase 0 — Project Scaffolding (Week 1)

- [ ] Initialize KMP project with Gradle (`shared` + `androidApp` modules)
- [ ] Configure `shared/commonMain`, `shared/androidMain`, `shared/iosMain` source sets
- [ ] Set up SQLDelight with Android driver
- [ ] Set up Koin for dependency injection
- [ ] Add androidx.ink dependencies to `androidApp`
- [ ] Create basic Compose navigation shell (Library → Notebook → Canvas)
- [ ] Establish CI with `./gradlew build` check

### Phase 1 — Core Drawing Canvas (Weeks 2–3)

- [ ] Implement `InkCanvas` composable using `InProgressStrokes` (Compose API)
- [ ] Wire `CanvasStrokeRenderer` for rendering finalized strokes
- [ ] Implement `StrokeMapper` (androidx.ink ↔ shared StrokeData)
- [ ] Build `CanvasStore` (MVI) in shared module — state, intents, reducer
- [ ] Persist strokes to SQLDelight on draw completion
- [ ] Load and render strokes from DB on page open
- [ ] Implement pen tool with pressure sensitivity
- [ ] Implement color picker and brush size selector
- [ ] Verify 120Hz low-latency rendering on a physical tablet

### Phase 2 — Notebook & Page Management (Weeks 4–5)

- [ ] Build `LibraryStore` and library screen (grid of notebooks)
- [ ] Create/rename/delete notebooks
- [ ] Build `NotebookStore` and page navigation (swipe between pages)
- [ ] Add/delete/reorder pages within a notebook
- [ ] Page templates (blank, lined, grid, dotted) — render as background in canvas
- [ ] Thumbnail generation for notebook covers and page previews

### Phase 3 — Extended Tools (Weeks 6–7)

- [ ] Highlighter tool (semi-transparent strokes, correct z-ordering)
- [ ] Eraser tool (object-level: tap stroke to delete)
- [ ] Undo / redo (shared CanvasStore action stacks)
- [ ] Lasso selector (freehand selection → move/delete selected strokes)
- [ ] Text box tool (place, edit, reposition, resize)

### Phase 4 — PDF Support (Weeks 8–9)

- [ ] PDF import via file picker
- [ ] PDF rendering with `PdfRenderer` — display pages as bitmaps beneath ink canvas
- [ ] Create notebook from PDF (one Page per PDF page, linked to PdfDocument)
- [ ] Annotate on PDF pages (strokes render on transparent overlay above PDF bitmap)
- [ ] Page-fit scaling and scroll/zoom for PDF pages

### Phase 5 — Polish & Optimization (Weeks 10–12)

- [ ] Canvas zoom and pan (pinch-to-zoom, two-finger pan)
- [ ] Palm rejection refinement (use `MotionEvent.TOOL_TYPE_STYLUS` filtering)
- [ ] Performance profiling — large stroke counts, page transitions
- [ ] Lazy page loading (only render visible + adjacent pages)
- [ ] Export notebook/page as PNG or PDF
- [ ] App icon, splash screen, and theming polish
- [ ] Crash analytics and error handling
- [ ] Beta testing on multiple tablet form factors

### Stretch Goals (Post-MVP)

- Split eraser (erase portion of a stroke, splitting it into two)
- Infinite canvas mode (unbounded scrollable canvas)
- Shape recognition (auto-straighten lines, circles, rectangles)
- Handwriting-to-text conversion
- Cloud sync (Google Drive / iCloud via KMP abstraction)
- iOS app target (SwiftUI + PencilKit or shared rendering)

---

## 6. Key Technical Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| **androidx.ink Compose API maturity** | Compose authoring module is alpha | Fall back to View-based `InProgressStrokesView` embedded via `AndroidView` if needed |
| **Stroke serialization across platforms** | iOS won't have `ink-storage` | Shared module uses its own `StrokePoint` list; per-platform serializers handle encode/decode |
| **PDF rendering performance** | Large PDFs with many pages | Render only visible page to bitmap; cache adjacent pages; use downscaled bitmaps for thumbnails |
| **Palm rejection conflicts** | Stylus + touch gestures compete | Use `MotionEvent.getToolType()` to distinguish stylus from finger; finger = pan/zoom, stylus = draw |
| **Large notebook DB performance** | Thousands of strokes per page | Bounding-box index for spatial queries; batch stroke loading; consider page-level caching |

---

## 7. References

- [androidx.ink Jetpack releases](https://developer.android.com/jetpack/androidx/releases/ink)
- [Ink API setup guide](https://developer.android.com/develop/ui/compose/touch-input/stylus-input/ink-api-setup)
- [Ink API modules overview](https://developer.android.com/develop/ui/compose/touch-input/stylus-input/ink-api-modules)
- [State preservation & persistent storage for Ink](https://developer.android.com/develop/ui/compose/touch-input/stylus-input/ink-api-state-preservation)
- [Low-latency stylus rendering (front-buffer)](https://medium.com/androiddevelopers/stylus-low-latency-d4a140a9c982)
- [Kotlin Multiplatform overview](https://kotlinlang.org/docs/multiplatform/kmp-overview.html)
- [SQLDelight multiplatform](https://cashapp.github.io/sqldelight/)
- [PdfRenderer API reference](https://developer.android.com/reference/android/graphics/pdf/PdfRenderer)
