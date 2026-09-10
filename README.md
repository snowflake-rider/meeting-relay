<div align="center">

<img src="docs/banner.svg" alt="Whale + Google Meet Relay" width="100%">

**한국어** · [English](README.en.md)

**Whale ON·Google Meet 강의를 내 작업 공간에서 보세요.**

확대 · 스크린샷 · 녹화 · Windows / macOS

[시작하기](#시작하기) · [Google Meet](#google-meet) · [Whale ON](#whale-on) · [기술 문서](docs/technical.md)

</div>

> **Google Meet 지원은 `feature/google-meet` 브랜치의 개발 기능입니다.** 합성 영상 중계 테스트는 통과했으며 실제 Meet 회의의 영상·음성은 확인 중입니다. `main`에는 기존 Whale 버전이 유지됩니다.

## 시작하기

**Python 3.9 이상**과 **Chrome**이 필요합니다. Whale ON을 사용하려면 **Whale**도 설치하세요.

```sh
git clone --branch feature/google-meet https://github.com/snowflake-rider/whale-on-relay.git
cd whale-on-relay
```

이미 받았다면 해당 브랜치의 프로젝트 폴더에서 실행하세요. 서버와 수신 브라우저는 **같은 컴퓨터**에 있어야 합니다.

**추천 작업 공간:** [Wave Terminal 설치](https://www.waveterm.dev/download) 후 터미널 옆에 **Web 위젯**을 추가하고 플레이어 주소를 입력하세요. Wave에서 영상이나 다운로드가 안 되면 Chrome을 사용하세요. macOS는 `brew install --cask wave`로도 설치할 수 있습니다. Wave 내 호환성은 아직 검증하지 않았습니다.

## Google Meet

**1. 서버 실행** — 프로젝트 폴더에서:

Windows PowerShell:

```powershell
.\cls-whale.ps1 --source meet --no-open --port 18747
```

macOS:

```sh
python3 launch.py --source meet --no-open --port 18747
```

**2. 탭 선택** — Chrome에서 Meet 회의에 입장하고 [중계 시작 페이지](http://127.0.0.1:18747/capture)를 엽니다. 시작 버튼을 직접 눌러 **Meet 탭**을 선택하고 **탭 오디오 공유**를 켜세요.

**3. 시청** — 아래 주소를 Chrome 또는 Wave에 붙여 넣습니다.

```text
http://127.0.0.1:18747/?source=meet
```

Meet는 **확장 없이도 사용 가능**합니다. 회의 탭과 중계 시작 페이지를 계속 열어두세요. 회의 UI도 포함되며, 자신의 마이크는 녹음하지 않습니다.

## Whale ON

**1. 확장 설치** — Whale에서 `whale://extensions` → **개발자 모드** → **Load unpacked** → 프로젝트의 **`extension` 폴더**를 선택합니다.

**2. 수업 입장** — 확장 아이콘을 눌러 링크 입력 → **Save link → Open class**. 확장 설치 전에 열려 있던 회의는 다시 입장하세요.

**3. 서버 실행** — 프로젝트 폴더에서:

```powershell
# Windows PowerShell
.\cls-whale.ps1 --no-open
```

```sh
# macOS
python3 launch.py --no-open
```

**4. 시청** — [Whale 플레이어](http://127.0.0.1:18745/)를 엽니다. 시청 중에는 Whale 회의를 열어두세요.

## 플레이어 조작

| 기능 | 조작 |
| --- | --- |
| 연결 상태 | 초록 **LIVE** / 빨강 **OFF** |
| 재생·일시정지 | `Space` |
| 확대·이동 | `+` / `−`, 휠·핀치, 드래그 / `0`으로 초기화 |
| 스크린샷 | 카메라 버튼 또는 `S` |
| 녹화·저장 | ● 또는 `R` → 다시 누르면 저장 / ↓로 다시 다운로드 |
| 소리 | 스피커 버튼 — 기본 음소거 |
| 전체 화면 | `F` |

**녹화는 약 256 MiB에서 자동 중지·저장합니다.** 탭을 닫기 전에 녹화를 중지하고 파일을 저장하세요. 재생 음소거·일시정지는 녹화에 영향을 주지 않습니다.

## 더 알아보기

**[기술 문서 →](docs/technical.md)** 구조·포트·검증 범위, `cls-whale` 단축 명령, 확장으로 Meet 열기, 녹화 상세, 수동 중계, 문제 해결과 개발 테스트를 정리했습니다.
