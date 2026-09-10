# 기술 문서 · Whale + Google Meet Relay

[간단 사용법으로 돌아가기](../README.md) · [English](technical.en.md)

## 서비스별 동작과 포트

| 경로 | 영상 소스 | 기본 사용 주소 |
| --- | --- | --- |
| Whale 확장 | 회의의 기존 미디어 트랙 복제 | `http://127.0.0.1:18745/` |
| Google Meet | 사용자가 선택한 Chrome 탭 캡처 | `http://127.0.0.1:18747/?source=meet` |
| Whale 수동 중계 | Console에서 `sender.js` 실행 | `http://127.0.0.1:18744/` |

Meet용 18747은 기존 Whale 서버와 함께 테스트하기 위한 선택입니다. 서버의 `--port`와 확장 팝업의 **Local server port**를 맞추면 다른 포트도 사용할 수 있습니다. Whale 자동 주입 스크립트는 기존 18745를 사용합니다.

`main`은 Whale 버전이며 Google Meet 작업은 `feature/google-meet` 브랜치에 있습니다. Meet와 Whale은 서버 내부에서 서로 다른 메시지 채널을 사용합니다. 같은 서비스의 송신 창은 하나만 사용하세요.

Meet 캡처는 `getDisplayMedia()`로 시작합니다. 사용자가 직접 버튼을 누르고 공유 대상을 매번 선택해야 합니다. 창·전체 화면 선택은 거부하며, 선택한 브라우저 탭이 실제 Meet인지 URL로 자동 판별하지는 않습니다. 회의 UI가 포함되고 사용자 마이크는 캡처하지 않습니다. 탭 오디오 공유를 켜도 실제 오디오 트랙이 없으면 안내를 표시합니다. [화면 캡처 API](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia)

### 확장으로 Meet 열기

이 브랜치의 `extension` 폴더를 Chrome에서 **Load unpacked**로 설치하면 **Whale + Meet Local Relay 0.4.0**이 표시됩니다. Meet 링크를 저장하고 **Open class**로 엽니다. **Local server port**를 `18747`로 바꾼 뒤 **Google Meet · 탭 중계 열기**를 누르세요. 확장은 로컬 Python 서버를 실행하지 않습니다.

### Meet 검증

자동 테스트 26개로 Whale 회귀, 채널 분리, 링크·포트, 공유 취소, 오디오 누락, 수신자 분리와 트랙 정리를 점검했습니다. Chrome의 `tests/meet-loopback.html`에서 합성 영상의 실제 WebRTC 640×360 수신·디코딩과 중지 후 원본 트랙 보존을 확인했습니다. 실제 Meet 회의의 화면·음성 수신 및 Windows·Wave 호환성은 아직 확인이 필요합니다.

## 실행 설정

<details>
<summary><strong>매번 cls-whale 한 명령으로 실행하기</strong></summary>

#### Windows PowerShell

`notepad $PROFILE`로 프로필을 열고 아래 함수를 추가합니다. 경로와 링크를 실제 값으로 바꾸세요. 프로필 파일이 없으면 먼저 아래 두 명령으로 만듭니다.

```powershell
New-Item -ItemType Directory -Force (Split-Path $PROFILE)
New-Item -ItemType File $PROFILE
```

프로필에 추가할 내용:

```powershell
function cls-whale {
    $env:WHALE_MEETING_URL = 'https://whaleon.us/o/YOUR-LINK'
    & 'C:\Projects\whale-on-relay\cls-whale.ps1' @args
}
```

저장 후 `. $PROFILE`을 실행합니다.

```powershell
cls-whale
cls-whale | Set-Clipboard
```

#### macOS zsh

`~/.zshrc`에 실제 경로와 수업 링크를 넣은 함수를 추가합니다.

```zsh
cls-whale() {
  WHALE_MEETING_URL='https://whaleon.us/o/YOUR-LINK' \
    python3 "$HOME/Projects/whale-on-relay/launch.py" "$@"
}
```

저장 후 `source ~/.zshrc`를 실행합니다.

```zsh
cls-whale
cls-whale | pbcopy
```

이 방식은 서버를 준비하고 Whale에서 수업 링크를 연 다음 주소를 출력합니다. 확장에 저장한 링크와 CLI 설정은 서로 별개입니다. 확장에서 회의를 열었다면 `--no-open`만 사용해도 됩니다.

</details>

<details>
<summary><strong>실행 옵션 · Whale 위치 · 로그인 자동 실행</strong></summary>

| 옵션 | 동작 |
| :--- | :--- |
| `--meeting URL` | 지정한 수업 링크를 Whale에서 엽니다. `WHALE_MEETING_URL`보다 우선합니다. |
| `--no-open` | 서버만 준비하고 주소를 출력합니다. 수업 링크가 필요 없습니다. |
| `--check` | 실행 중인 서버를 확인하고 주소만 출력합니다. 서버나 브라우저를 시작하지 않습니다. |

Windows에서는 PATH와 일반적인 Whale 설치 폴더를 찾습니다. 사용자 지정 경로라면:

```powershell
$env:WHALE_PATH = 'D:\Apps\Whale\Application\whale.exe'
.\cls-whale.ps1 --no-open
```

터미널을 닫아도 서버가 유지되도록 구현했습니다. PC 재시작 후에는 명령을 다시 실행하세요. **Windows 로그인 자동 실행은 제공하지 않습니다.**

macOS에서 로그인 자동 실행을 원하면 `python3 setup_auto.py install` 또는 `setup.command`를 실행합니다. 제거는 `python3 setup_auto.py uninstall` 또는 `stop-auto.command`입니다. 폴더를 옮기면 다시 설정하세요.

</details>

## 녹화

영상이 연결된 뒤 오른쪽 **●** 또는 **R**을 누릅니다. 녹화 중에는 빨간 표시와 경과 시간이 보입니다. 다시 누르면 녹화를 끝내고 파일 다운로드를 요청합니다. 자동 다운로드가 막히면 **↓**로 다시 저장하세요.

- **수신 원본 영상**을 녹화합니다. 플레이어의 확대·이동·도구 모음은 들어가지 않습니다.
- 시작 시 존재하는 **오디오 트랙을 하나로 합쳐 녹음**합니다. 재생 음소거나 시청 일시정지는 녹화에 영향을 주지 않습니다. 마이크·화면 캡처 권한은 요청하지 않습니다.
- 브라우저가 지원하는 형식을 확인해 **WebM을 우선 사용**하고, 필요하면 지원되는 MP4로 대체합니다. Windows Chrome에서도 브라우저 녹화 API를 사용하므로 FFmpeg 설치는 필요 없습니다. [MediaRecorder 안내](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
- 데이터를 메모리에 모으므로 **약 256 MiB에서 자동 중지·저장**합니다. 한도는 청크가 들어올 때 확인합니다. 다음 구간은 새 녹화를 시작하세요. 무제한 장시간 녹화는 아닙니다.
- 영상·오디오 트랙이 끊기거나 바뀌면 현재 녹화를 마무리합니다. 재연결 후 새 녹화를 시작하세요.
- **탭을 닫거나 새로고침하기 전에 중지·저장하세요.** 녹화 중 이탈 경고를 요청하지만 강제 종료·브라우저 충돌 시 저장 전 데이터가 사라질 수 있습니다. 마지막 파일 링크는 다음 녹화 완료 또는 페이지 종료까지 유지됩니다.

Windows 및 Wave 안에서의 실제 녹화·오디오·다운로드는 기기 확인이 필요합니다. 자동 테스트로는 오디오 혼합, 마지막 청크 저장, 연결 변경, 용량 한도와 원본 트랙 보존을 점검합니다.

## 동작 구조

```mermaid
flowchart LR
    A[Whale ON 회의] -->|트랙 복제| B[Whale 확장]
    B <-->|연결 정보| C[Python · 127.0.0.1:18745]
    C <-->|연결 정보| D[수신 플레이어]
    B ==>|WebRTC 영상·오디오| D
    D -->|사용자가 녹화 시작| E[로컬 녹화 파일]
```

확장은 `one.whaleon.naver.com`에서 회의의 미디어 트랙을 복제합니다. Python은 플레이어와 연결 정보를 제공하며 영상을 녹화하지 않습니다. **녹화는 수신 브라우저에서 사용자가 시작할 때만** 수행합니다. 외부 ICE 서버를 설정하지 않습니다.

독립 HLS 주소를 추출하는 기능은 아닙니다. Whale에서 실제 회의에 입장해야 합니다. 수업 링크 저장에는 확장의 `storage` 권한을 사용합니다. NAVER의 공식 제품이 아닌 독립 프로젝트입니다.

## 문제 해결

| 증상 | 확인할 내용 |
| :--- | :--- |
| PowerShell이 스크립트를 차단함 | `py -3 .\launch.py --no-open`으로 직접 실행하세요. `py`가 없으면 `python`을 사용합니다. |
| Python을 찾지 못함 | Python 3.9 이상 설치 후 터미널을 다시 엽니다. `py -3 --version` 또는 `python3 --version`으로 확인합니다. |
| Whale을 찾지 못함 | `WHALE_PATH`를 설정하거나 `--no-open`으로 실행하고 확장에서 회의를 엽니다. |
| 로컬 중계 표시가 없음 | 확장을 활성화하고 회의에 다시 입장합니다. 자동 주입이 안 되면 아래 수동 방식을 사용합니다. |
| 공유 영상 대기 | 발표자가 영상 또는 화면 공유를 시작해야 합니다. |
| 서버 연결 실패 | 실행 명령을 다시 사용하고 [서버 상태](http://127.0.0.1:18745/health)를 확인합니다. 로그는 `.runtime/launcher-server.log`에 있습니다. |
| 포트 사용 중 | 18745를 사용하는 서비스를 확인하세요. 실행기는 다른 서비스를 임의로 종료하지 않습니다. |
| Wave에서 저장이 안 됨 | Chrome에서 같은 주소를 열어 녹화하세요. 완료된 파일은 ↓로 다시 다운로드할 수 있습니다. |

개인 Windows PC에서 프로필·스크립트를 허용하려면 `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`를 사용할 수 있습니다. 다운로드한 스크립트는 내용을 확인한 뒤 `Unblock-File .\cls-whale.ps1`이 필요할 수 있습니다. 관리 PC는 조직 정책을 따르세요. [Microsoft 실행 정책 안내](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies)

<details>
<summary><strong>수동 중계 — 확장이 회의 창에서 동작하지 않을 때</strong></summary>

1. Windows는 `py -3 .\relay_server.py`, macOS는 `python3 relay_server.py` 또는 `start.command`를 실행하고 터미널을 켜둡니다.
2. `sender.js` 전체를 복사합니다.
3. **실제 Whale 회의 창**에서 Windows `Ctrl+Shift+I` 또는 macOS `⌘⌥I`로 개발자 도구를 열고 Console에서 실행합니다.
4. `LOCAL_RELAY_READY`가 나오면 수신 브라우저에서 `http://127.0.0.1:18744/`를 엽니다.

수동 중계는 **18744**, 확장 중계는 **18745**입니다. 수동 중계는 수신 탭 하나만 사용하세요. 재연결은 수신 탭 닫기 → `sender.js` 재실행 → 플레이어 다시 열기 순서입니다. 수동 서버 종료는 `Ctrl+C`입니다.

</details>

## 개발과 검증 범위

```sh
python3 -m unittest discover -s tests -p 'test_*.py'
node --test tests/extension.test.cjs tests/popup.test.cjs tests/recording.test.cjs tests/capture.test.cjs
```

Windows에서는 `python3` 대신 `py -3`을 사용합니다. Node.js는 JavaScript 테스트에만 필요합니다. `recording.js`, `player-ui.js`, `player-ui.css`를 수정한 뒤 **`python3 build_player_ui.py`**로 두 플레이어 HTML을 갱신하세요.

| 항목 | 확인 범위 |
| :--- | :--- |
| 수동 중계 | macOS Chrome·cmux 1080p 재생 확인 |
| 플레이어 | 테스트 영상의 확대·이동·일시정지·PNG 저장 확인 |
| 실행기·확장 | 경로 탐색, 서버 재사용, 트랙 복제·보존, 수업 링크 저장·검증 테스트 |
| 녹화 | macOS Chrome 합성 영상에서 640×360 VP8 + Opus WebM 생성·파일 검사 완료. 로직 테스트로 마지막 청크·오디오 혼합·연결 변경·메모리 한도·원본 트랙 보존 점검 |
| 추가 기기 확인 | 실제 회의 확장 자동 주입·재연결, Windows·Wave 재생·녹화·다운로드, 로그인 자동 실행, 핀치 |

한 번에 Whale 회의 하나를 사용하세요. 개인 수업 링크는 확장 또는 로컬 셸 설정에 저장하며 프로젝트에는 포함하지 않습니다.
