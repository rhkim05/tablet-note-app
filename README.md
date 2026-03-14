# 📒 Tablet Note App

> Goodnotes + Parallel Pages — 태블릿 환경에 최적화된 필기 앱

S-Pen 같은 스타일러스 입력의 저지연(low-latency) 드로잉과 PDF 위에 직접 필기하는 기능을 중심으로, React Native와 Kotlin을 결합한 하이브리드 앱입니다.

---

## ✨ 주요 기능 (Features)

| 기능 | 설명 |
|------|------|
| ✏️ 드로잉 | 펜/지우개 도구, 두께·색상 조절, Bezier 곡선 스무딩 |
| 📄 PDF 필기 | PDF 위에 직접 주석 작성 및 저장 |
| ↩️ Undo / Redo | 스트로크 단위 실행 취소/재실행 |
| 🗂️ 노트 관리 | 카테고리 분류, 즐겨찾기, 이름 변경, 삭제 |
| 🖊️ S-Pen 버튼 | 버튼 액션 커스텀 매핑 (펜/지우개 전환, Undo 등) |
| 🌙 다크 모드 | 앱 전체 다크/라이트 테마 전환 |
| 💾 자동 저장 | 화면 이탈 시 스트로크 데이터 자동 저장 |

---

## 🛠 Tech Stack (기술 스택)

본 프로젝트는 UI 개발 생산성과 드로잉 렌더링 퍼포먼스를 모두 확보하기 위해 **React Native + Kotlin 하이브리드 아키텍처**로 구현되었습니다.

### Core & Native Engine

- **Kotlin (Android Native)** — JS Bridge를 완전히 우회하는 네이티브 드로잉 엔진. `DrawingCanvas`(빈 노트)와 `PdfDrawingView`(PDF 필기) 두 개의 Custom View로 구성.
- **Android Canvas API** — 오프스크린 Bitmap 캐싱으로 커밋된 스트로크를 렌더링. 지우개는 `PorterDuff.Mode.CLEAR` + `saveLayer()` 적용.
- **React Native 0.73** — 전체 UI, 네비게이션, 상태 관리 담당.

### UI & Navigation

- **React Navigation 6** (native-stack) — Home / NoteEditor / PdfViewer 3개 화면
- **React Native Reanimated 3 & Gesture Handler 2** — 툴바, 사이드바 애니메이션
- **Zustand** — 툴 상태(펜/지우개/선택), Undo/Redo, 색상, 두께 등 전역 관리

### Storage & Data

- **AsyncStorage** — 노트 목록, 카테고리, 앱 설정 영구 저장
- **react-native-fs** — 스트로크 JSON 및 PDF 파일을 로컬 저장소에 읽기/쓰기
- **react-native-document-picker** — PDF 가져오기

---

## 🚀 시작하기 (Getting Started)

### 사전 요구사항

- **JDK 17** 필수 (JDK 21+는 Gradle 8.3과 호환 안 됨)
- **Android Studio** + Android SDK
- **Node.js** + npm

### 설치 및 실행

```bash
npm install --legacy-peer-deps
```

터미널 두 개를 열고:

```bash
# 터미널 1 — Metro 번들러
npx react-native start

# 터미널 2 — 앱 빌드 & 배포
npx react-native run-android
```

### 처음 클론 후 필수 설정 (First-time Setup)

**1. Android SDK 경로 설정** — `android/local.properties` 파일 생성 (gitignore됨):

```properties
# macOS
sdk.dir=/Users/<your-username>/Library/Android/sdk

# Windows
sdk.dir=C\:\\Users\\<your-username>\\AppData\\Local\\Android\\Sdk
```

**2. JDK 17 경로 설정** — `~/.gradle/gradle.properties` 파일 생성 (기기별 설정, gitignore됨):

```properties
# macOS
org.gradle.java.home=/Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home

# Windows
org.gradle.java.home=C:\\Program Files\\jdk-17.0.18+8
```

> `android/gradle.properties`는 공유 설정이 담겨 있어 git에 포함됩니다. JDK 경로만 위처럼 별도로 설정하면 됩니다.

---

## 📁 프로젝트 구조 (Project Structure)

```
tablet-note-app/
├── android/
│   └── app/src/main/java/com/tabletnoteapp/
│       ├── canvas/          # 순수 드로잉 엔진 (RN 의존성 없음)
│       └── reactbridge/     # RN ↔ Kotlin 브릿지
├── src/
│   ├── screens/             # HomeScreen, NoteEditorScreen, PdfViewerScreen
│   ├── components/          # Toolbar, Sidebar, ColorPickerPanel 등
│   ├── native/              # requireNativeComponent 래퍼
│   ├── store/               # Zustand 스토어 (노트, 툴, 설정)
│   ├── styles/              # 테마 (lightTheme / darkTheme)
│   └── types/               # TypeScript 타입 정의
└── index.js                 # 앱 진입점
```

---

## 👥 팀 협업 (Team Git Workflow)

```bash
# 내 기능 개발 후 푸시
git add .
git commit -m "feat: ..."
git push origin <내-브랜치>

# main 최신 코드 내 브랜치에 반영
git fetch origin
git merge origin/main

# 팀원 PR 로컬에서 테스트
git fetch origin
git checkout -b test-feature origin/<팀원-브랜치>
```

PR 머지는 GitHub 웹에서 진행합니다.
