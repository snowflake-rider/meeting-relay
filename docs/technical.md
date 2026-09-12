# 기술 문서 · Meeting Relay

[간단 사용법으로 돌아가기](../README.md) · [English](technical.en.md)

## 서비스별 동작과 포트

| 경로 | 영상 소스 | 기본 사용 주소 |
| --- | --- | --- |
| Whale 확장 | 회의의 기존 미디어 트랙 복제 | `http://127.0.0.1:18745/` |
| Google Meet | 사용자가 선택한 Chrome 탭 캡처 | `http://127.0.0.1:18747/?source=meet` |
| Whale 수동 중계 | Console에서 `sender.js` 실행 | `http://127.0.0.1:18744/` |

Meet용 18747은 기존 Whale 서버와 함께 테스트하기 위한 선택입니다. 서버의 `--port`와 확장 팝업의 **Local server port**를 맞추면 다른 포트도 사용할 수 있습니다. Whale 송신도 저장한 포트에 맞춰 연결을 전환합니다. 기본값은 18745입니다. 포트는 링크 저장과 별도로 자동 저장됩니다. 수신 플레이어도 새 주소로 여세요.

`main`에 Whale 중계, 실험적 Google Meet 지원과 선택적 MP4 변환이 포함됩니다. Meet와 Whale은 서버 내부에서 서로 다른 메시지 채널을 사용합니다. 같은 서비스의 송신 창은 하나만 사용하세요.

Meet 캡처는 `getDisplayMedia()`로 시작합니다. 사용자가 직접 버튼을 누르고 공유 대상을 매번 선택해야 합니다. 창·전체 화면 선택은 거부하며, 선택한 브라우저 탭이 실제 Meet인지 URL로 자동 판별하지는 않습니다. 회의 UI가 포함되고 사용자 마이크는 캡처하지 않습니다. 탭 오디오 공유를 켜도 실제 오디오 트랙이 없으면 안내를 표시합니다. [화면 캡처 API](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia)

### 확장으로 Meet 열기

이 브랜치의 `extension` 폴더를 Chrome에서 **Load unpacked**로 설치하면 **Whale + Meet Local Relay 0.5.3**이 표시됩니다. Meet 링크를 저장하고 **Open class**로 엽니다. **Local server port**를 `18747`로 바꾼 뒤 **Google Meet · 탭 중계 열기**를 누르세요. 확장은 로컬 Python 서버를 실행하지 않습니다.

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
    & 'C:\Projects\meeting-relay\cls-whale.ps1' @args
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
    python3 "$HOME/Projects/meeting-relay/launch.py" "$@"
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

## 녹화 · 디스크 저장과 선택적 MP4

WebM이 기본입니다. 확장의 내장 설정 화면과 플레이어 ⚙는 같은 서버의 `/recording/settings`를 사용합니다. 별도 브라우저에서도 같은 포트에 연결하면 설정이 공유됩니다. 새로고침 시 서버 값을 읽으며 **녹화 시작 시 설정을 고정**합니다.

1. 브라우저가 영상과 혼합 오디오를 WebM 청크로 만듭니다.
2. 최대 4 MiB씩 순서 번호를 붙여 서버로 보내고, 디스크 저장 응답을 받은 청크를 메모리에서 해제합니다.
3. 서버는 `.part` 파일에 기록합니다. 동일 순서·내용 재전송은 중복 기록하지 않습니다.
4. 마지막 청크까지 받은 후 WebM을 완성합니다.
5. MP4를 선택했다면 FFmpeg로 H.264/AAC 변환 후 전체 디코딩 검사를 거쳐 최종 파일을 공개합니다.

총 파일 크기에 256 MiB 제한은 없습니다. 대신 **브라우저 저장 대기열이 약 32 MiB를 넘으면 녹화를 중지하고 남은 청크를 저장**합니다. 브라우저 자체의 청크 크기·내부 버퍼까지 엄격하게 제한하는 것은 아닙니다. 서버는 디스크 여유 공간이 부족하면 추가 기록을 거부합니다. 16GB 이상/장시간 실제 녹화는 아직 검증하지 않았습니다.

### 저장 위치와 복구

기본 위치는 `.runtime/recordings/<녹화 ID>/`이며, 수동 서버는 `.runtime/recordings-manual/`을 사용합니다. `RELAY_RECORDINGS_DIR` 환경 변수로 서버 시작 전에 위치를 바꿀 수 있습니다. 같은 디렉터리를 여러 서버 프로세스가 동시에 사용하지 마세요.

- `source.webm.part`: 진행 중이거나 중단된 원본
- `source.webm`: 정상 종료된 WebM 원본
- `recording.mp4`: 변환·검사를 마친 MP4
- `metadata.json`, `conversion.log`: 상태와 변환 오류 기록

**성공한 경우에도 WebM을 보존합니다.** 따라서 WebM과 MP4 둘 다 보관할 디스크 공간이 필요합니다. 파일 목록은 재시작 후에도 복원되며 미완료 녹화는 `interrupted`로 표시됩니다. 미완료 파일의 재생 가능성이나 강제 종료 전 마지막 청크 복구를 보장하지 않습니다. 일반 `/tmp`가 아닌 위 저장 폴더를 사용합니다.

### FFmpeg 설치

macOS Homebrew: `brew install ffmpeg`. Windows는 [FFmpeg 공식 다운로드 안내](https://ffmpeg.org/download.html)에서 Windows 빌드를 선택하고 `ffmpeg.exe`를 PATH에 추가한 뒤 서버를 다시 실행하세요. `ffmpeg -version`으로 확인합니다. H.264 변환에는 `libx264`, 오디오에는 AAC 인코더가 필요합니다.

FFmpeg가 없으면 설정 저장 시 안내하며 WebM은 계속 사용 가능합니다. 변환은 서버에서 한 번에 하나씩 실행합니다. 변환 실패 시 원본을 보존하고 파일 목록의 **MP4 변환**으로 재시도할 수 있습니다. 설정의 저장 디렉터리 경로에서 파일을 직접 열 수도 있습니다.

### 보안·검증 범위

녹화 API는 정확한 loopback Host와 같은 origin만 허용합니다. 쓰기에는 서버별 임의 토큰을 요구하고, 파일 경로는 서버가 생성한 ID로만 지정합니다. 확장은 localhost 설정 페이지를 프레임으로 표시하므로 추가 host 권한 없이 설정을 공유합니다. 로컬 컴퓨터의 다른 사용자/프로세스에 대한 인증 경계는 아닙니다.

브라우저의 합성 영상으로 WebM·MP4 디스크 저장과 다운로드를 확인했습니다. FFmpeg 실제 변환 테스트는 H.264/AAC 출력을 검사합니다. 자동 테스트는 중복·순서, 설정 고정, 저장 실패, 재시작 복원과 원본 보존을 검사합니다. Windows 실제 녹화, 설치된 확장 내부 프레임, 장시간 녹화·강제 종료 복구는 추가 검증 대상입니다.

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
node --test tests/extension.test.cjs tests/popup.test.cjs tests/recording.test.cjs tests/recording-upload.test.cjs tests/capture.test.cjs tests/reconnect.test.cjs tests/player-recovery.test.cjs
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

### 프로젝트 폴더를 옮긴 뒤 접속 오류

실행 중인 서버는 시작 당시의 프로젝트 경로를 사용합니다. 폴더 이동 전 서버를 종료하고, 이동 후 새 경로에서 다시 실행하세요. 필수 파일이 없거나 읽을 수 없으면 `/health`와 파일 요청이 복구 안내를 포함한 HTTP 503을 반환합니다. 실행기는 이 서버를 정상으로 재사용하지 않습니다.

확장 0.5.3 업데이트 후 확장 관리에서 새로고침하고 Whale 회의에 다시 입장해야 새 포트 설정 전달 코드가 적용됩니다. 수업 중에는 기존 18745 연결을 유지하고 쉬는 시간에 업데이트할 수 있습니다.

### 자동 재연결

Whale·Meet 송신은 연결 끊김이 8초 지속되거나 연결 협상이 20초를 넘으면 다음 연결 요청에서 재시도합니다. 수신 플레이어도 같은 조건에서 해당 연결의 epoch를 지정해 재시작을 요청합니다. 오래된 요청은 새 연결을 끊지 않습니다. 일시적인 시그널링 조회 실패는 정상 재생 중인 연결을 유지합니다. 실제 복구 시간은 브라우저 타이머 지연에 따라 늘어날 수 있습니다. 연결 교체 시 진행 중인 녹화는 기존 트랙 변경 처리에 따라 저장·종료되므로 다시 녹화를 시작하세요. 확장을 새로고침하고 회의에 다시 입장한 뒤 플레이어를 새로고침해야 업데이트가 적용됩니다.


## 연결·녹화 복구 (0.5.3)

- 실행기는 서버 시작 시 기록한 프로젝트 경로·실행 파일 지문을 비교합니다. 다른 worktree나 수정 전 서버가 같은 포트를 쓰면 재사용을 거부합니다. 녹화를 마친 뒤 해당 서버를 종료하고 현재 프로젝트에서 다시 실행하거나 빈 포트를 사용하세요. 실행기가 기존 서버를 강제 종료하지 않습니다.
- Whale은 영상뿐 아니라 오디오 트랙의 추가·교체·제거도 감지하여 연결을 갱신합니다. 원본 회의 트랙은 중지하지 않습니다. 연결 교체 시 진행 중인 녹화는 종료되므로 새 녹화를 시작하세요.
- 연결 상태가 정상이어도 영상 트랙이 20초 이상 muted/ended이거나, 완성된 프레임 수신은 계속되는데 디코딩이 멈춘 경우 재연결합니다. 일시정지와 정적인 슬라이드만으로 재연결하지 않습니다. 브라우저의 타이머 지연으로 복구가 늦어질 수 있습니다.
- 녹화 클라이언트는 청크와 별도로 20초마다 생존 신호를 보냅니다. 120초 이상 활동이 없는 세션은 다음 녹화/API 조회 시 interrupted로 정리하여 녹화 슬롯을 반환합니다. 이미 기록한 부분 파일은 보존합니다. 브라우저 절전으로 신호도 중단되면 녹화가 만료될 수 있습니다.
- 서버를 Ctrl+C 또는 SIGTERM으로 종료하면 진행 중인 FFmpeg를 종료하고 회수합니다. 변환 시도마다 다른 임시 파일을 사용합니다. SIGKILL·전원 차단은 정리 코드를 실행할 수 없으므로 이 경우 프로세스 정리를 보장하지 않습니다.

이번 변경은 코드·모의 미디어 상태·로컬 HTTP·FFmpeg 테스트로 확인했습니다. 실제 강의 영상과 Windows 브라우저에서의 검증은 포함하지 않았습니다.
