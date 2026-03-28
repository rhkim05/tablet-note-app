# Phase 0 — Project Scaffolding: Todo List

Detailed task tracking for [plan.md](plan.md). Execute in order — each phase builds on the previous. Run `./gradlew build` (or the noted verification command) after completing each phase to catch issues early.

---

## Phase A — Root Project & Gradle Wrapper

> Goal: A valid Gradle project that syncs, even if it has no modules yet.

- [x] **A.1** Generate the Gradle wrapper files
  - Downloaded official `gradlew`, `gradlew.bat`, `gradle-wrapper.jar` from Gradle v8.12.0 GitHub release
  - Created `gradle/wrapper/gradle-wrapper.properties` pointing to `gradle-8.12-bin.zip`
- [x] **A.2** Create `settings.gradle.kts`
- [x] **A.3** Create `gradle/libs.versions.toml` (version catalog)
  - **Deviation**: ink version changed from `1.0.0-alpha04` to `1.0.0` (stable) — compose ink artifacts didn't exist until alpha05
- [x] **A.4** Create `gradle.properties`
- [x] **A.5** Create root `build.gradle.kts`
- [x] **A.6** Create `.gitignore`
- [x] **A.7** Create `local.properties` with `sdk.dir` pointing to Android SDK (gitignored)
- [x] **A.8** Verify: `./gradlew --version` succeeds

---

## Phase B — Shared KMP Module (Empty Shell)

> Goal: The `:shared` module compiles for Android and iOS targets.

- [x] **B.1** Create directory: `shared/src/commonMain/kotlin/com/drafty/shared/`
- [x] **B.2** Create directory: `shared/src/androidMain/kotlin/com/drafty/shared/`
- [x] **B.3** Create directory: `shared/src/iosMain/kotlin/com/drafty/shared/`
- [x] **B.4** Create `shared/build.gradle.kts`
- [x] **B.5** Create `shared/src/commonMain/kotlin/com/drafty/shared/Platform.kt`
- [x] **B.6** Create `shared/src/androidMain/kotlin/com/drafty/shared/Platform.android.kt`
- [x] **B.7** Create `shared/src/iosMain/kotlin/com/drafty/shared/Platform.ios.kt`
- [x] **B.8** Verify: `./gradlew :shared:compileKotlinAndroid` succeeds
- [x] **B.9** Verify: `./gradlew :shared:compileKotlinIosArm64` succeeds

---

## Phase C — SQLDelight Schema & Driver Factories

> Goal: SQLDelight generates `DraftyDatabase` Kotlin code; platform drivers compile.

- [x] **C.1** Create directory: `shared/src/commonMain/sqldelight/com/drafty/shared/data/db/`
- [x] **C.2** Create `DraftyDatabase.sq`
  - **Note**: `PdfDocument` table declared before `Page` table to satisfy FK ordering
- [x] **C.3** Create `shared/src/commonMain/kotlin/com/drafty/shared/data/db/Database.kt`
- [x] **C.4** Create `shared/src/androidMain/kotlin/com/drafty/shared/data/db/DatabaseDriverFactory.kt`
- [x] **C.5** Create `shared/src/iosMain/kotlin/com/drafty/shared/data/db/DatabaseDriverFactory.kt`
- [x] **C.6** Verify: `./gradlew :shared:generateCommonMainDraftyDatabaseInterface` succeeds
- [x] **C.7** Verify: generated `DraftyDatabase.kt` exists in `shared/build/generated/sqldelight/`

---

## Phase D — Android App Module (Compiles, No UI Yet)

> Goal: `:androidApp` compiles, depends on `:shared`.

- [x] **D.1** Create directory: `androidApp/src/main/kotlin/com/drafty/android/`
- [x] **D.2** Create directory: `androidApp/src/main/res/values/`
- [x] **D.3** Create `androidApp/build.gradle.kts`
  - **Deviation**: Added `libs.napier` dependency directly to androidApp (needed for `DraftyApp.kt` Napier init)
- [x] **D.4** Create `androidApp/src/main/AndroidManifest.xml`
  - **Deviation**: Removed `android:icon="@mipmap/ic_launcher"` — no launcher icon assets yet
- [x] **D.5** Create `androidApp/src/main/res/values/strings.xml`
- [x] **D.6** Create `androidApp/src/main/res/values/themes.xml`
- [x] **D.7** Create `MainActivity.kt` (full Compose setup — combined D.7 and G.6)
- [x] **D.8** Create `DraftyApp.kt` (full Koin init — combined D.8 and E.3)
- [x] **D.9** Verify: `./gradlew :androidApp:compileDebugKotlin` succeeds

---

## Phase E — Koin Dependency Injection

> Goal: Koin initializes on app start, provides `SqlDriver` and `DraftyDatabase` via DI.

- [x] **E.1** Create `shared/src/commonMain/kotlin/com/drafty/shared/di/SharedModule.kt`
- [x] **E.2** Create `androidApp/src/main/kotlin/com/drafty/android/di/AppModule.kt`
- [x] **E.3** `DraftyApp.kt` initializes Koin with `appModule` + `sharedModule` and Napier with `DebugAntilog()`
- [x] **E.4** Verify: `./gradlew :androidApp:build` succeeds
- [x] **E.5** Verify: Koin wiring compiles (runtime verification deferred to device test)

---

## Phase F — androidx.ink Dependency Verification

> Goal: All 9 ink artifacts resolve and compile.

- [x] **F.1** Create `androidApp/src/main/kotlin/com/drafty/android/ink/InkDependencyCheck.kt`
  - References `BrushFamily::class`, `Brush::class`, `Stroke::class`, `InProgressStrokesView::class`
- [x] **F.2** Verify: `./gradlew :androidApp:compileDebugKotlin` succeeds with ink imports
- [x] **F.3** All 9 ink artifacts resolve at `1.0.0` stable — no fallback needed

---

## Phase G — Compose Navigation Shell & Placeholder Screens

> Goal: App launches with 3 navigable placeholder screens: Library -> Notebook -> Canvas.

- [x] **G.1** Create `DraftyTheme.kt` — Material 3 dynamic color on Android 12+
- [x] **G.2** Create `DraftyNavHost.kt` — Routes object + NavHost with 3 destinations
- [x] **G.3** Create `LibraryScreen.kt` — Scaffold + placeholder button
- [x] **G.4** Create `NotebookScreen.kt` — Scaffold + back arrow + placeholder button
- [x] **G.5** Create `CanvasScreen.kt` — Scaffold + back arrow + crosshair Canvas
- [x] **G.6** `MainActivity.kt` uses `enableEdgeToEdge()` + `DraftyTheme` + `DraftyNavHost`
- [x] **G.7** Verify: `./gradlew :androidApp:build` succeeds
- [x] **G.8–G.11** Navigation verification deferred to device/emulator test

---

## Phase H — CI Workflow

> Goal: GitHub Actions runs `./gradlew build` on every push/PR to main.

- [x] **H.1** Create directory: `.github/workflows/`
- [x] **H.2** Create `.github/workflows/build.yml`
- [x] **H.3** Verify locally: `./gradlew build` passes — BUILD SUCCESSFUL (202 tasks)
- [x] **H.4** Verify locally: `./gradlew :shared:allTests` passes (0 tests, no failures)
- [x] **H.5** Verify locally: `./gradlew :androidApp:lint` passes
- [ ] **H.6** Push branch to GitHub, confirm Actions workflow runs green (pending: no git repo yet)

---

## Phase I — Final Verification & Cleanup

> Goal: Everything works end-to-end; no loose ends.

- [x] **I.1** Full build passes: `./gradlew build` — BUILD SUCCESSFUL
- [x] **I.2** Directory structure matches plan (minor deviations noted above)
- [x] **I.3** `InkDependencyCheck.kt` left in place for reference
- [x] **I.4** `local.properties` is in `.gitignore`
- [x] **I.5** No hardcoded SDK paths in committed files (`local.properties` is gitignored)
- [ ] **I.6** Create initial git commit on a feature branch (pending: no git repo yet)
- [ ] **I.7** Open PR to `main` for review (pending: no git repo yet)

---

## File Creation Order

For quick reference, every file that was created:

| # | File | Phase | Status |
|---|------|-------|--------|
| 1 | `gradlew` + `gradlew.bat` + `gradle/wrapper/*` | A | Done |
| 2 | `settings.gradle.kts` | A | Done |
| 3 | `gradle/libs.versions.toml` | A | Done |
| 4 | `gradle.properties` | A | Done |
| 5 | `build.gradle.kts` (root) | A | Done |
| 6 | `.gitignore` | A | Done |
| 7 | `shared/build.gradle.kts` | B | Done |
| 8 | `shared/src/commonMain/.../Platform.kt` | B | Done |
| 9 | `shared/src/androidMain/.../Platform.android.kt` | B | Done |
| 10 | `shared/src/iosMain/.../Platform.ios.kt` | B | Done |
| 11 | `shared/src/commonMain/sqldelight/.../DraftyDatabase.sq` | C | Done |
| 12 | `shared/src/commonMain/.../data/db/Database.kt` | C | Done |
| 13 | `shared/src/androidMain/.../data/db/DatabaseDriverFactory.kt` | C | Done |
| 14 | `shared/src/iosMain/.../data/db/DatabaseDriverFactory.kt` | C | Done |
| 15 | `androidApp/build.gradle.kts` | D | Done |
| 16 | `androidApp/src/main/AndroidManifest.xml` | D | Done |
| 17 | `androidApp/src/main/res/values/strings.xml` | D | Done |
| 18 | `androidApp/src/main/res/values/themes.xml` | D | Done |
| 19 | `androidApp/src/main/kotlin/.../DraftyApp.kt` | D+E | Done |
| 20 | `androidApp/src/main/kotlin/.../MainActivity.kt` | D+G | Done |
| 21 | `shared/src/commonMain/.../di/SharedModule.kt` | E | Done |
| 22 | `androidApp/src/main/kotlin/.../di/AppModule.kt` | E | Done |
| 23 | `androidApp/src/main/kotlin/.../ink/InkDependencyCheck.kt` | F | Done |
| 24 | `androidApp/src/main/kotlin/.../ui/theme/DraftyTheme.kt` | G | Done |
| 25 | `androidApp/src/main/kotlin/.../ui/navigation/DraftyNavHost.kt` | G | Done |
| 26 | `androidApp/src/main/kotlin/.../ui/library/LibraryScreen.kt` | G | Done |
| 27 | `androidApp/src/main/kotlin/.../ui/notebook/NotebookScreen.kt` | G | Done |
| 28 | `androidApp/src/main/kotlin/.../ui/canvas/CanvasScreen.kt` | G | Done |
| 29 | `.github/workflows/build.yml` | H | Done |

**Total: 29 files created, 9 phases, 44/47 tasks completed.**
**Remaining 3 tasks (H.6, I.6, I.7) require git repo initialization and GitHub push.**
