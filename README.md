# 🌟 DINKIssTyle 3D Wins

[🇰🇷 한국어 버전으로 이동 (Jump to Korean Version)](#-dinkisstyle-3d-wins-korean)

[![GNOME Shell](https://img.shields.io/badge/GNOME-Shell-blue?logo=gnome)](https://extensions.gnome.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

**DINKIssTyle 3D Wins** is a GNOME Shell extension that adds a **3D layer effect** to windows based on focus history. It arranges background windows in 3D layers around the focused window, providing visual depth and an immersive workflow experience.

---

## ✨ Key Features

- 🎯 **Focus-based Layering**: The currently focused window stays in the foreground, while previously used windows move to deeper visual layers sequentially.
- 🧲 **Magnetic Push**: Automatically pushes overlapping background windows away from the focused window to ensure visibility.
- 🔄 **Cylindrical Alt-Tab Switcher**: Replaces the default flat popup with a 3D cylindrical style window switcher.
- 🎨 **Customizable**: Fine-tune maximum layers, distance, rotation angles, transparency, and more.

## ⚙️ Options

- **Maximum layers**: Number of visual depth levels (Default: `5`)
- **Distance between layers**: 3D spacing between windows (Default: `70`)
- **Perspective strength**: Control how much deeper layers tilt toward the focal point (Default: `70`)
- **Layer shrink**: Control how much deeper layers shrink (Default: `120`)
- **Use magnetic push**: Enable/disable pushing background windows (Default: `On`)
- **Magnetic push strength**: Control how far overlapping background windows are pushed (Default: `80`)
- **Use Push Apart spread**: Spread overlapping background windows apart for easier picking (Default: `Off`)
- **Adjust surrounding windows while moving focused window**: Real-time background adjustment while dragging (Default: `Off`)
- **Cylindrical Alt-Tab switcher**: Use 3D cylinder style switcher (Default: `On`)
- **Transparency**: Adjust opacity for deeper layers (Default: `0`)
- **X/Y rotation**: Tilting angles for background windows based on their position.

## 🚀 Installation

### 1. Clone Repository
```bash
git clone https://github.com/DINKIssTyle/DINKIssTyle-3D-Wins-Ubuntu.git
cd DINKIssTyle-3D-Wins-Ubuntu
```

### 2. Local Install

**Using Interactive Installer:**
```bash
./install.sh
```

**Manual Install:**
```bash
make install
```

### 3. Enable Extension
Restart GNOME Shell or log out and back in, then enable via:
```bash
gnome-extensions enable dkst-3d-wins@dinkisstyle.com
```

## 🛠️ Preferences
Open settings with:
```bash
gnome-extensions prefs dkst-3d-wins@dinkisstyle.com
```

---

## 🌟 DINKIssTyle 3D Wins (Korean)

**DINKIssTyle 3D Wins**는 GNOME Shell 창에 포커스 기록 기반의 **3D 레이어 효과**를 부여하는 확장 기능입니다.  
활성 창을 중심으로 배경 창들을 입체적으로 배치하여 시각적인 깊이감과 작업 흐름의 몰입감을 더해줍니다.

---

### ✨ 주요 기능

- 🎯 **포커스 기반 레이어링**: 현재 포커스된 창은 전면에 위치하고, 이전에 사용했던 창들은 순차적으로 깊은 시각적 레이어로 이동합니다.
- 🧲 **마그네틱 푸시 (Magnetic Push)**: 배경 창들이 활성 창과 겹치지 않도록 지능적으로 밀어내어 가독성을 확보합니다.
- 🔄 **원통형 Alt-Tab 전환기**: 기존의 평면적인 팝업 대신 3D 원통형 스타일의 창 전환기를 제공합니다.
- 🎨 **커스터마이징**: 레이어 수, 거리, 회전 각도, 투명도 등을 사용자 취향에 맞게 세밀하게 조정할 수 있습니다.

### ⚙️ 설정 옵션

- **최대 레이어 수 (Maximum layers)**: 시각적으로 표시할 최대 단계 수 (기본값: `5`)
- **레이어 간 거리 (Distance between layers)**: 창들 사이의 입체적인 간격 (기본값: `70`)
- **원근감 강도 (Perspective strength)**: 깊은 레이어가 소실점 방향으로 기울어지는 강도 조절 (기본값: `70`)
- **레이어 축소 (Layer shrink)**: 깊은 레이어의 창이 얼마나 작아질지 조절 (기본값: `120`)
- **마그네틱 푸시 사용**: 활성 창 주변의 창들을 밀어낼지 여부 (기본값: `On`)
- **마그네틱 푸시 강도**: 겹치는 배경 창을 활성 창으로부터 얼마나 멀리 밀어낼지 제어 (기본값: `80`)
- **Push Apart 펼치기 사용**: 겹친 배경 창들을 서로 떨어뜨려 가려진 창을 쉽게 선택 (기본값: `Off`)
- **포커스 창 이동 시 주변 창 실시간 조정**: 활성 창을 드래그할 때 배경 창들이 실시간으로 반응 (기본값: `Off`)
- **원통형 Alt-Tab 전환기**: 3D 실린더 스타일의 창 전환기 사용 여부 (기본값: `On`)
- **투명도 (Transparency)**: 깊은 레이어에 위치한 창들의 투명도 조절 (기본값: `0`)
- **X/Y 축 회전**: 배경 창들의 상하/좌우 기울기 각도 조절

### 🚀 설치 방법

#### 1. 저장소 복제 (Git Clone)
```bash
git clone https://github.com/DINKIssTyle/DINKIssTyle-3D-Wins-Ubuntu.git
cd DINKIssTyle-3D-Wins-Ubuntu
```

#### 2. 로컬 설치
**대화형 설치 스크립트 사용:**
```bash
./install.sh
```

**수동 설치:**
```bash
make install
```

#### 3. 확장 기능 활성화
설치 후 GNOME Shell을 재시작하거나 로그아웃 후 다시 로그인한 뒤, 아래 명령어로 활성화하세요.
```bash
gnome-extensions enable dkst-3d-wins@dinkisstyle.com
```

### 🛠️ 설정 열기
아래 명령어를 통해 상세 설정을 변경할 수 있습니다.
```bash
gnome-extensions prefs dkst-3d-wins@dinkisstyle.com
```

---

*Created by DINKIssTyle. Copyright (C) 2026 DINKI'ssTyle. All rights reserved.*
