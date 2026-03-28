# Phase 0 — Project Scaffolding: Implementation Plan

This document details every step to initialize the Drafty KMP project with `shared` and `androidApp` modules, configure source sets, wire up SQLDelight, Koin, androidx.ink, Compose navigation, and a CI build check.

---

## Table of Contents

1. [Overview & Final Directory Structure](#1-overview--final-directory-structure)
2. [Step 1 — Root Project Setup](#2-step-1--root-project-setup)
3. [Step 2 — Shared KMP Module](#3-step-2--shared-kmp-module)
4. [Step 3 — Android App Module](#4-step-3--android-app-module)
5. [Step 4 — SQLDelight Setup](#5-step-4--sqldelight-setup)
6. [Step 5 — Koin Dependency Injection](#6-step-5--koin-dependency-injection)
7. [Step 6 — androidx.ink Dependencies](#7-step-6--androidxink-dependencies)
8. [Step 7 — Compose Navigation Shell](#8-step-7--compose-navigation-shell)
9. [Step 8 — CI Build Check](#9-step-8--ci-build-check)
10. [Verification Checklist](#10-verification-checklist)

---

## 1. Overview & Final Directory Structure

After completing Phase 0, the project tree should look like this:

```
drafty/
├── .github/
│   └── workflows/
│       └── build.yml                    # CI workflow
├── shared/                              # KMP shared module
│   ├── build.gradle.kts
│   └── src/
│       ├── commonMain/
│       │   └── kotlin/
│       │       └── com/drafty/shared/
│       │           ├── Platform.kt              # expect declaration
│       │           ├── di/
│       │           │   └── SharedModule.kt      # Koin shared module
│       │           ├── data/
│       │           │   └── db/
│       │           │       └── (SQLDelight .sq files)
│       │           └── domain/
│       │               └── model/
│       │                   └── (domain models — empty stubs for now)
│       ├── androidMain/
│       │   └── kotlin/
│       │       └── com/drafty/shared/
│       │           ├── Platform.android.kt      # actual declaration
│       │           └── data/
│       │               └── db/
│       │                   └── DatabaseDriverFactory.kt
│       └── iosMain/
│           └── kotlin/
│               └── com/drafty/shared/
│                   ├── Platform.ios.kt          # actual declaration (stub)
│                   └── data/
│                       └── db/
│                           └── DatabaseDriverFactory.kt
├── androidApp/                          # Android application
│   ├── build.gradle.kts
│   └── src/
│       └── main/
│           ├── AndroidManifest.xml
│           ├── kotlin/
│           │   └── com/drafty/android/
│           │       ├── DraftyApp.kt             # Application class (Koin init)
│           │       ├── MainActivity.kt
│           │       ├── di/
│           │       │   └── AppModule.kt         # Koin Android module
│           │       └── ui/
│           │           ├── navigation/
│           │           │   └── DraftyNavHost.kt
│           │           ├── library/
│           │           │   └── LibraryScreen.kt
│           │           ├── notebook/
│           │           │   └── NotebookScreen.kt
│           │           ├── canvas/
│           │           │   └── CanvasScreen.kt
│           │           └── theme/
│           │               └── DraftyTheme.kt
│           └── res/
│               ├── values/
│               │   ├── strings.xml
│               │   └── themes.xml
│               └── mipmap-xxxhdpi/
│                   └── (launcher icons)
├── build.gradle.kts                     # Root build file
├── settings.gradle.kts                  # Module includes + plugin repos
├── gradle.properties                    # JVM args, Android/KMP flags
├── gradle/
│   └── libs.versions.toml              # Version catalog
└── local.properties                     # SDK path (gitignored)
```

---

## 2. Step 1 — Root Project Setup

### 2.1 `settings.gradle.kts`

Declares both modules and configures plugin/dependency repositories.

```kotlin
// settings.gradle.kts
pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "Drafty"
include(":shared")
include(":androidApp")
```

### 2.2 `gradle/libs.versions.toml`

Centralizes all versions and dependency coordinates. This is the single source of truth for every library used across both modules.

```toml
# gradle/libs.versions.toml
[versions]
kotlin = "2.1.10"
agp = "8.8.2"
coroutines = "1.10.1"
serialization = "1.8.0"
sqldelight = "2.0.2"
koin = "4.0.2"
napier = "2.7.1"
okio = "3.10.2"
kotlinx-datetime = "0.6.2"

# Android-specific
compose-bom = "2025.03.00"
compose-compiler = "1.5.15"  # Not needed with Kotlin 2.0+ (compiler plugin)
activity-compose = "1.10.1"
navigation-compose = "2.8.9"
lifecycle = "2.8.7"
core-ktx = "1.15.0"

# androidx.ink
ink = "1.0.0"

# Testing
junit = "4.13.2"
kotlin-test = "2.1.10"

[libraries]
# Kotlin & KotlinX
kotlinx-coroutines-core = { module = "org.jetbrains.kotlinx:kotlinx-coroutines-core", version.ref = "coroutines" }
kotlinx-coroutines-android = { module = "org.jetbrains.kotlinx:kotlinx-coroutines-android", version.ref = "coroutines" }
kotlinx-serialization-json = { module = "org.jetbrains.kotlinx:kotlinx-serialization-json", version.ref = "serialization" }
kotlinx-datetime = { module = "org.jetbrains.kotlinx:kotlinx-datetime", version.ref = "kotlinx-datetime" }
okio = { module = "com.squareup.okio:okio", version.ref = "okio" }
napier = { module = "io.github.aakira:napier", version.ref = "napier" }

# SQLDelight
sqldelight-android-driver = { module = "app.cash.sqldelight:android-driver", version.ref = "sqldelight" }
sqldelight-native-driver = { module = "app.cash.sqldelight:native-driver", version.ref = "sqldelight" }
sqldelight-coroutines = { module = "app.cash.sqldelight:coroutines-extensions", version.ref = "sqldelight" }

# Koin
koin-core = { module = "io.insert-koin:koin-core", version.ref = "koin" }
koin-android = { module = "io.insert-koin:koin-android", version.ref = "koin" }
koin-compose = { module = "io.insert-koin:koin-androidx-compose", version.ref = "koin" }

# Compose
compose-bom = { module = "androidx.compose:compose-bom", version.ref = "compose-bom" }
compose-ui = { module = "androidx.compose.ui:ui" }
compose-ui-tooling = { module = "androidx.compose.ui:ui-tooling" }
compose-ui-tooling-preview = { module = "androidx.compose.ui:ui-tooling-preview" }
compose-material3 = { module = "androidx.compose.material3:material3" }
compose-material-icons = { module = "androidx.compose.material:material-icons-extended" }
activity-compose = { module = "androidx.activity:activity-compose", version.ref = "activity-compose" }
navigation-compose = { module = "androidx.navigation:navigation-compose", version.ref = "navigation-compose" }
lifecycle-runtime-compose = { module = "androidx.lifecycle:lifecycle-runtime-compose", version.ref = "lifecycle" }
lifecycle-viewmodel-compose = { module = "androidx.lifecycle:lifecycle-viewmodel-compose", version.ref = "lifecycle" }

# AndroidX Core
core-ktx = { module = "androidx.core:core-ktx", version.ref = "core-ktx" }

# androidx.ink
ink-brush = { module = "androidx.ink:ink-brush", version.ref = "ink" }
ink-brush-compose = { module = "androidx.ink:ink-brush-compose", version.ref = "ink" }
ink-strokes = { module = "androidx.ink:ink-strokes", version.ref = "ink" }
ink-geometry = { module = "androidx.ink:ink-geometry", version.ref = "ink" }
ink-geometry-compose = { module = "androidx.ink:ink-geometry-compose", version.ref = "ink" }
ink-authoring = { module = "androidx.ink:ink-authoring", version.ref = "ink" }
ink-authoring-compose = { module = "androidx.ink:ink-authoring-compose", version.ref = "ink" }
ink-rendering = { module = "androidx.ink:ink-rendering", version.ref = "ink" }
ink-storage = { module = "androidx.ink:ink-storage", version.ref = "ink" }

# Testing
junit = { module = "junit:junit", version.ref = "junit" }
kotlin-test = { module = "org.jetbrains.kotlin:kotlin-test", version.ref = "kotlin-test" }

[plugins]
android-application = { id = "com.android.application", version.ref = "agp" }
android-library = { id = "com.android.library", version.ref = "agp" }
kotlin-multiplatform = { id = "org.jetbrains.kotlin.multiplatform", version.ref = "kotlin" }
kotlin-android = { id = "org.jetbrains.kotlin.android", version.ref = "kotlin" }
kotlin-serialization = { id = "org.jetbrains.kotlin.plugin.serialization", version.ref = "kotlin" }
kotlin-compose-compiler = { id = "org.jetbrains.kotlin.plugin.compose", version.ref = "kotlin" }
sqldelight = { id = "app.cash.sqldelight", version.ref = "sqldelight" }
```

> **Note on versions**: The versions above are the latest stable as of March 2026. Before implementing, check for updates on `mavenCentral()` / Google Maven. In particular, `androidx.ink` may have moved from alpha to beta/stable.

### 2.3 `gradle.properties`

```properties
# gradle.properties

# JVM
org.gradle.jvmargs=-Xmx2048M -Dfile.encoding=UTF-8

# Android
android.useAndroidX=true
android.nonTransitiveRClass=true

# Kotlin
kotlin.code.style=official

# KMP
kotlin.mpp.androidSourceSetLayoutVersion=2
```

### 2.4 Root `build.gradle.kts`

```kotlin
// build.gradle.kts (root)
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.android.library) apply false
    alias(libs.plugins.kotlin.multiplatform) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.serialization) apply false
    alias(libs.plugins.kotlin.compose.compiler) apply false
    alias(libs.plugins.sqldelight) apply false
}
```

---

## 3. Step 2 — Shared KMP Module

### 3.1 `shared/build.gradle.kts`

This is the core KMP module. It declares `commonMain`, `androidMain`, and `iosMain` source sets.

```kotlin
// shared/build.gradle.kts
plugins {
    alias(libs.plugins.kotlin.multiplatform)
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.sqldelight)
}

kotlin {
    // Android target
    androidTarget {
        compilations.all {
            kotlinOptions {
                jvmTarget = "17"
            }
        }
    }

    // iOS targets (stubs for future — ensures source sets exist)
    listOf(
        iosX64(),
        iosArm64(),
        iosSimulatorArm64()
    ).forEach { iosTarget ->
        iosTarget.binaries.framework {
            baseName = "shared"
            isStatic = true
        }
    }

    sourceSets {
        commonMain.dependencies {
            implementation(libs.kotlinx.coroutines.core)
            implementation(libs.kotlinx.serialization.json)
            implementation(libs.kotlinx.datetime)
            implementation(libs.okio)
            implementation(libs.napier)
            implementation(libs.koin.core)
            implementation(libs.sqldelight.coroutines)
        }

        commonTest.dependencies {
            implementation(libs.kotlin.test)
        }

        androidMain.dependencies {
            implementation(libs.sqldelight.android.driver)
            implementation(libs.kotlinx.coroutines.android)
        }

        iosMain.dependencies {
            implementation(libs.sqldelight.native.driver)
        }
    }
}

android {
    namespace = "com.drafty.shared"
    compileSdk = 35

    defaultConfig {
        minSdk = 26  // Android 8.0 — broad tablet coverage
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

sqldelight {
    databases {
        create("DraftyDatabase") {
            packageName.set("com.drafty.shared.data.db")
        }
    }
}
```

### 3.2 `shared/src/commonMain/kotlin/com/drafty/shared/Platform.kt`

A minimal `expect`/`actual` pair to verify the KMP source sets compile correctly.

```kotlin
// shared/src/commonMain/kotlin/com/drafty/shared/Platform.kt
package com.drafty.shared

expect fun getPlatformName(): String
```

### 3.3 `shared/src/androidMain/kotlin/com/drafty/shared/Platform.android.kt`

```kotlin
// shared/src/androidMain/kotlin/com/drafty/shared/Platform.android.kt
package com.drafty.shared

actual fun getPlatformName(): String = "Android"
```

### 3.4 `shared/src/iosMain/kotlin/com/drafty/shared/Platform.ios.kt`

```kotlin
// shared/src/iosMain/kotlin/com/drafty/shared/Platform.ios.kt
package com.drafty.shared

actual fun getPlatformName(): String = "iOS"
```

---

## 4. Step 3 — Android App Module

### 4.1 `androidApp/build.gradle.kts`

```kotlin
// androidApp/build.gradle.kts
plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose.compiler)
}

android {
    namespace = "com.drafty.android"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.drafty.android"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
    }
}

dependencies {
    // Shared KMP module
    implementation(project(":shared"))

    // Compose BOM — manages all Compose artifact versions
    val composeBom = platform(libs.compose.bom)
    implementation(composeBom)
    implementation(libs.compose.ui)
    implementation(libs.compose.material3)
    implementation(libs.compose.material.icons)
    implementation(libs.compose.ui.tooling.preview)
    debugImplementation(libs.compose.ui.tooling)

    // AndroidX
    implementation(libs.core.ktx)
    implementation(libs.activity.compose)
    implementation(libs.navigation.compose)
    implementation(libs.lifecycle.runtime.compose)
    implementation(libs.lifecycle.viewmodel.compose)

    // Koin
    implementation(libs.koin.android)
    implementation(libs.koin.compose)

    // androidx.ink
    implementation(libs.ink.brush)
    implementation(libs.ink.brush.compose)
    implementation(libs.ink.strokes)
    implementation(libs.ink.geometry)
    implementation(libs.ink.geometry.compose)
    implementation(libs.ink.authoring)
    implementation(libs.ink.authoring.compose)
    implementation(libs.ink.rendering)
    implementation(libs.ink.storage)

    // Testing
    testImplementation(libs.junit)
}
```

### 4.2 `androidApp/src/main/AndroidManifest.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <application
        android:name=".DraftyApp"
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:supportsRtl="true"
        android:theme="@style/Theme.Drafty">

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:windowSoftInputMode="adjustResize">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
```

### 4.3 `androidApp/src/main/res/values/strings.xml`

```xml
<resources>
    <string name="app_name">Drafty</string>
</resources>
```

### 4.4 `androidApp/src/main/res/values/themes.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- Base theme delegates to Compose (Material 3), so this is minimal -->
    <style name="Theme.Drafty" parent="android:Theme.Material.Light.NoActionBar" />
</resources>
```

---

## 5. Step 4 — SQLDelight Setup

### 5.1 Schema File: `shared/src/commonMain/sqldelight/com/drafty/shared/data/db/DraftyDatabase.sq`

Place the full schema from research.md here. SQLDelight generates Kotlin interfaces from these definitions.

```sql
-- DraftyDatabase.sq

CREATE TABLE Notebook (
    id            TEXT NOT NULL PRIMARY KEY,
    title         TEXT NOT NULL,
    coverColor    INTEGER NOT NULL DEFAULT 0,
    createdAt     INTEGER NOT NULL,
    updatedAt     INTEGER NOT NULL,
    pageCount     INTEGER NOT NULL DEFAULT 0,
    sortOrder     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE Page (
    id            TEXT NOT NULL PRIMARY KEY,
    notebookId    TEXT NOT NULL REFERENCES Notebook(id) ON DELETE CASCADE,
    pageIndex     INTEGER NOT NULL,
    pageType      TEXT NOT NULL DEFAULT 'blank',
    width         REAL NOT NULL DEFAULT 1404.0,
    height        REAL NOT NULL DEFAULT 1984.0,
    templateType  TEXT,
    pdfDocumentId TEXT REFERENCES PdfDocument(id),
    pdfPageIndex  INTEGER,
    createdAt     INTEGER NOT NULL
);

CREATE TABLE PdfDocument (
    id            TEXT NOT NULL PRIMARY KEY,
    fileName      TEXT NOT NULL,
    filePath      TEXT NOT NULL,
    pageCount     INTEGER NOT NULL,
    fileSizeBytes INTEGER NOT NULL,
    importedAt    INTEGER NOT NULL
);

CREATE TABLE Stroke (
    id            TEXT NOT NULL PRIMARY KEY,
    pageId        TEXT NOT NULL REFERENCES Page(id) ON DELETE CASCADE,
    brushType     TEXT NOT NULL,
    brushSize     REAL NOT NULL,
    colorArgb     INTEGER NOT NULL,
    strokeOrder   INTEGER NOT NULL,
    inputData     BLOB NOT NULL,
    boundingBoxX  REAL NOT NULL,
    boundingBoxY  REAL NOT NULL,
    boundingBoxW  REAL NOT NULL,
    boundingBoxH  REAL NOT NULL,
    createdAt     INTEGER NOT NULL
);

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

-- Indices
CREATE INDEX idx_page_notebook ON Page(notebookId, pageIndex);
CREATE INDEX idx_stroke_page ON Stroke(pageId, strokeOrder);
CREATE INDEX idx_textbox_page ON TextBox(pageId);

-- Queries (minimal set for scaffolding — expanded in later phases)
getAllNotebooks:
SELECT * FROM Notebook ORDER BY sortOrder ASC, updatedAt DESC;

getNotebookById:
SELECT * FROM Notebook WHERE id = ?;

insertNotebook:
INSERT INTO Notebook(id, title, coverColor, createdAt, updatedAt, pageCount, sortOrder)
VALUES (?, ?, ?, ?, ?, ?, ?);

getPagesForNotebook:
SELECT * FROM Page WHERE notebookId = ? ORDER BY pageIndex ASC;

getStrokesForPage:
SELECT * FROM Stroke WHERE pageId = ? ORDER BY strokeOrder ASC;
```

### 5.2 Android Database Driver Factory

```kotlin
// shared/src/androidMain/kotlin/com/drafty/shared/data/db/DatabaseDriverFactory.kt
package com.drafty.shared.data.db

import android.content.Context
import app.cash.sqldelight.db.SqlDriver
import app.cash.sqldelight.driver.android.AndroidSqliteDriver

class DatabaseDriverFactory(private val context: Context) {
    fun create(): SqlDriver {
        return AndroidSqliteDriver(
            schema = DraftyDatabase.Schema,
            context = context,
            name = "drafty.db"
        )
    }
}
```

### 5.3 iOS Database Driver Factory (Stub)

```kotlin
// shared/src/iosMain/kotlin/com/drafty/shared/data/db/DatabaseDriverFactory.kt
package com.drafty.shared.data.db

import app.cash.sqldelight.db.SqlDriver
import app.cash.sqldelight.driver.native.NativeSqliteDriver

class DatabaseDriverFactory {
    fun create(): SqlDriver {
        return NativeSqliteDriver(
            schema = DraftyDatabase.Schema,
            name = "drafty.db"
        )
    }
}
```

### 5.4 Database Creation Helper (commonMain)

```kotlin
// shared/src/commonMain/kotlin/com/drafty/shared/data/db/Database.kt
package com.drafty.shared.data.db

fun createDatabase(driver: app.cash.sqldelight.db.SqlDriver): DraftyDatabase {
    return DraftyDatabase(driver)
}
```

---

## 6. Step 5 — Koin Dependency Injection

### 6.1 Shared Koin Module (commonMain)

Exposes the database and (later) repositories to the DI graph.

```kotlin
// shared/src/commonMain/kotlin/com/drafty/shared/di/SharedModule.kt
package com.drafty.shared.di

import com.drafty.shared.data.db.DraftyDatabase
import com.drafty.shared.data.db.createDatabase
import org.koin.core.module.Module
import org.koin.dsl.module

val sharedModule: Module = module {
    // DraftyDatabase — driver provided by platform module
    single<DraftyDatabase> { createDatabase(get()) }
}
```

### 6.2 Android Koin Module

Provides the platform-specific `SqlDriver` and any Android-only dependencies.

```kotlin
// androidApp/src/main/kotlin/com/drafty/android/di/AppModule.kt
package com.drafty.android.di

import com.drafty.shared.data.db.DatabaseDriverFactory
import org.koin.android.ext.koin.androidContext
import org.koin.dsl.module

val appModule = module {
    // Platform-specific SqlDriver
    single { DatabaseDriverFactory(androidContext()).create() }
}
```

### 6.3 Application Class — Koin Startup

```kotlin
// androidApp/src/main/kotlin/com/drafty/android/DraftyApp.kt
package com.drafty.android

import android.app.Application
import com.drafty.android.di.appModule
import com.drafty.shared.di.sharedModule
import io.github.aakira.napier.DebugAntilog
import io.github.aakira.napier.Napier
import org.koin.android.ext.koin.androidContext
import org.koin.android.ext.koin.androidLogger
import org.koin.core.context.startKoin

class DraftyApp : Application() {
    override fun onCreate() {
        super.onCreate()

        // Logging
        Napier.base(DebugAntilog())

        // Koin
        startKoin {
            androidLogger()
            androidContext(this@DraftyApp)
            modules(appModule, sharedModule)
        }
    }
}
```

---

## 7. Step 6 — androidx.ink Dependencies

All ink dependencies are already declared in Step 3's `androidApp/build.gradle.kts`. Here's a verification snippet to confirm everything resolves at compile time.

Create a minimal ink smoke-test file that imports key types:

```kotlin
// androidApp/src/main/kotlin/com/drafty/android/ink/InkDependencyCheck.kt
package com.drafty.android.ink

import androidx.ink.brush.Brush
import androidx.ink.brush.BrushFamily
import androidx.ink.strokes.Stroke
import androidx.ink.authoring.InProgressStrokesView

/**
 * This file exists only to verify that all androidx.ink dependencies resolve.
 * Delete once actual ink integration begins in Phase 1.
 */
internal object InkDependencyCheck {
    val brushFamilyAvailable = BrushFamily.PRESSURE_PEN
}
```

> **Important**: The ink Compose authoring module (`ink-authoring-compose`) is alpha. If it causes build failures, fall back to the View-based `InProgressStrokesView` wrapped in `AndroidView`. The dependency is included either way as a compile-time check.

---

## 8. Step 7 — Compose Navigation Shell

Three placeholder screens connected by Compose Navigation: **Library -> Notebook -> Canvas**.

### 8.1 Navigation Route Definitions & NavHost

```kotlin
// androidApp/src/main/kotlin/com/drafty/android/ui/navigation/DraftyNavHost.kt
package com.drafty.android.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import com.drafty.android.ui.canvas.CanvasScreen
import com.drafty.android.ui.library.LibraryScreen
import com.drafty.android.ui.notebook.NotebookScreen

object Routes {
    const val LIBRARY = "library"
    const val NOTEBOOK = "notebook/{notebookId}"
    const val CANVAS = "canvas/{notebookId}/{pageId}"

    fun notebook(notebookId: String) = "notebook/$notebookId"
    fun canvas(notebookId: String, pageId: String) = "canvas/$notebookId/$pageId"
}

@Composable
fun DraftyNavHost(navController: NavHostController) {
    NavHost(
        navController = navController,
        startDestination = Routes.LIBRARY
    ) {
        composable(Routes.LIBRARY) {
            LibraryScreen(
                onNotebookClick = { notebookId ->
                    navController.navigate(Routes.notebook(notebookId))
                }
            )
        }

        composable(
            route = Routes.NOTEBOOK,
            arguments = listOf(navArgument("notebookId") { type = NavType.StringType })
        ) { backStackEntry ->
            val notebookId = backStackEntry.arguments?.getString("notebookId") ?: return@composable
            NotebookScreen(
                notebookId = notebookId,
                onPageClick = { pageId ->
                    navController.navigate(Routes.canvas(notebookId, pageId))
                },
                onBack = { navController.popBackStack() }
            )
        }

        composable(
            route = Routes.CANVAS,
            arguments = listOf(
                navArgument("notebookId") { type = NavType.StringType },
                navArgument("pageId") { type = NavType.StringType }
            )
        ) { backStackEntry ->
            val notebookId = backStackEntry.arguments?.getString("notebookId") ?: return@composable
            val pageId = backStackEntry.arguments?.getString("pageId") ?: return@composable
            CanvasScreen(
                notebookId = notebookId,
                pageId = pageId,
                onBack = { navController.popBackStack() }
            )
        }
    }
}
```

### 8.2 Library Screen (Placeholder)

```kotlin
// androidApp/src/main/kotlin/com/drafty/android/ui/library/LibraryScreen.kt
package com.drafty.android.ui.library

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LibraryScreen(onNotebookClick: (String) -> Unit) {
    Scaffold(
        topBar = { TopAppBar(title = { Text("Drafty") }) }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text("Library — Your Notebooks", modifier = Modifier.padding(16.dp))
            Button(onClick = { onNotebookClick("sample-notebook-id") }) {
                Text("Open Sample Notebook")
            }
        }
    }
}
```

### 8.3 Notebook Screen (Placeholder)

```kotlin
// androidApp/src/main/kotlin/com/drafty/android/ui/notebook/NotebookScreen.kt
package com.drafty.android.ui.notebook

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotebookScreen(
    notebookId: String,
    onPageClick: (String) -> Unit,
    onBack: () -> Unit
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Notebook") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text("Notebook: $notebookId", modifier = Modifier.padding(16.dp))
            Button(onClick = { onPageClick("sample-page-id") }) {
                Text("Open Canvas")
            }
        }
    }
}
```

### 8.4 Canvas Screen (Placeholder)

```kotlin
// androidApp/src/main/kotlin/com/drafty/android/ui/canvas/CanvasScreen.kt
package com.drafty.android.ui.canvas

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CanvasScreen(
    notebookId: String,
    pageId: String,
    onBack: () -> Unit
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Canvas") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { padding ->
        // Placeholder canvas — will be replaced with androidx.ink in Phase 1
        Canvas(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            // Draw a crosshair to confirm canvas renders
            drawLine(
                color = Color.LightGray,
                start = Offset(0f, size.height / 2),
                end = Offset(size.width, size.height / 2),
                strokeWidth = 1f
            )
            drawLine(
                color = Color.LightGray,
                start = Offset(size.width / 2, 0f),
                end = Offset(size.width / 2, size.height),
                strokeWidth = 1f
            )
        }
    }
}
```

### 8.5 Theme

```kotlin
// androidApp/src/main/kotlin/com/drafty/android/ui/theme/DraftyTheme.kt
package com.drafty.android.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import android.os.Build

@Composable
fun DraftyTheme(content: @Composable () -> Unit) {
    val colorScheme = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        dynamicLightColorScheme(LocalContext.current)
    } else {
        lightColorScheme()
    }

    MaterialTheme(
        colorScheme = colorScheme,
        content = content
    )
}
```

### 8.6 MainActivity

```kotlin
// androidApp/src/main/kotlin/com/drafty/android/MainActivity.kt
package com.drafty.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.navigation.compose.rememberNavController
import com.drafty.android.ui.navigation.DraftyNavHost
import com.drafty.android.ui.theme.DraftyTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            DraftyTheme {
                val navController = rememberNavController()
                DraftyNavHost(navController = navController)
            }
        }
    }
}
```

---

## 9. Step 8 — CI Build Check

### 9.1 `.github/workflows/build.yml`

```yaml
# .github/workflows/build.yml
name: Build

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Set up JDK 17
        uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'

      - name: Setup Gradle
        uses: gradle/actions/setup-gradle@v4

      - name: Build project
        run: ./gradlew build

      - name: Run shared module tests
        run: ./gradlew :shared:allTests

      - name: Run Android lint
        run: ./gradlew :androidApp:lint
```

### 9.2 `.gitignore`

```gitignore
# .gitignore

# Gradle
.gradle/
build/
!gradle-wrapper.jar

# IDE
.idea/
*.iml
.DS_Store

# Android
local.properties
*.apk
*.aab

# Kotlin
*.kotlin_module
```

---

## 10. Verification Checklist

After implementing all steps, verify the scaffolding is correct:

| # | Check | Command / Action |
|---|-------|-----------------|
| 1 | Gradle sync succeeds | Open in Android Studio, wait for sync |
| 2 | Shared module compiles | `./gradlew :shared:build` |
| 3 | Android app compiles | `./gradlew :androidApp:build` |
| 4 | SQLDelight generates code | Check `shared/build/generated/sqldelight/` for `DraftyDatabase.kt` |
| 5 | Koin starts without crash | Run app on emulator, check logcat for Koin startup logs |
| 6 | androidx.ink resolves | Build succeeds with ink imports in `InkDependencyCheck.kt` |
| 7 | Navigation works | Tap "Open Sample Notebook" -> "Open Canvas" -> back button |
| 8 | CI passes | Push to branch, verify GitHub Actions green |
| 9 | `expect`/`actual` links | `./gradlew :shared:compileKotlinAndroid` succeeds |
| 10 | iOS source set exists | `shared/src/iosMain/` dir exists, `./gradlew :shared:compileKotlinIosArm64` succeeds (no iOS toolchain needed for compilation check) |

---

## Implementation Order

Execute the steps in this order to minimize build errors along the way:

1. **Root files first** — `settings.gradle.kts`, `gradle.properties`, root `build.gradle.kts`, `libs.versions.toml`, `.gitignore`
2. **Shared module** — `shared/build.gradle.kts`, `Platform` expect/actual files
3. **SQLDelight** — `.sq` schema file, `DatabaseDriverFactory` on both platforms, `Database.kt`
4. **Android app module** — `androidApp/build.gradle.kts`, `AndroidManifest.xml`, resources
5. **Koin** — `SharedModule.kt`, `AppModule.kt`, `DraftyApp.kt`
6. **UI** — Theme, screens, navigation, `MainActivity.kt`
7. **Ink check** — `InkDependencyCheck.kt`
8. **CI** — `.github/workflows/build.yml`

> Run `./gradlew build` after each major step to catch issues early.

> Detailed task tracking is in [TODO.md](TODO.md).
