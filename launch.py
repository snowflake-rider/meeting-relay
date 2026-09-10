"""Start/reuse local signaling, open the class in Whale, print only the player URL."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent
PLAYER = 'http://127.0.0.1:18745/'
MEETING = os.environ.get('WHALE_MEETING_URL', '')


def find_windows_whale():
    override = os.environ.get('WHALE_PATH')
    if override:
        if Path(override).is_file():
            return override
        raise RuntimeError('WHALE_PATH does not point to whale.exe.')
    executable = shutil.which('whale.exe')
    if executable:
        return executable
    for variable in ('LOCALAPPDATA', 'ProgramFiles', 'ProgramFiles(x86)'):
        base = os.environ.get(variable)
        if base:
            candidate = Path(base) / 'Naver' / 'Naver Whale' / 'Application' / 'whale.exe'
            if candidate.is_file():
                return str(candidate)
    raise RuntimeError('Whale not found. Install Whale or set $env:WHALE_PATH to whale.exe. Use --no-open to open the meeting yourself.')


def open_meeting(meeting):
    if sys.platform == 'win32':
        subprocess.Popen([find_windows_whale(), meeting], stdin=subprocess.DEVNULL,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    elif sys.platform == 'darwin':
        subprocess.run(['open', '-b', 'com.naver.Whale', meeting], check=True,
                       stdout=subprocess.DEVNULL)
    else:
        raise RuntimeError('Automatic Whale launch supports macOS and Windows. Use --no-open.')


def server_process_options():
    if sys.platform == 'win32':
        return {'creationflags': subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP}
    return {'start_new_session': True}


def ready():
    try:
        with urlopen(PLAYER + 'health', timeout=1) as response:
            data = json.load(response)
    except HTTPError as error:
        raise RuntimeError('18745번 포트가 다른 서비스에 사용 중입니다.') from error
    except (URLError, TimeoutError):
        return False
    except (ValueError, UnicodeError) as error:
        raise RuntimeError('18745번 포트에서 중계 서버가 아닌 응답을 받았습니다.') from error
    if not isinstance(data, dict) or data.get('app') != 'whale-auto-relay' or data.get('version') != 2 or data.get('ok') is not True:
        raise RuntimeError('18745번 포트의 서비스가 이 중계 서버와 일치하지 않습니다.')
    return True


def ensure_server():
    if ready():
        return
    runtime = ROOT / '.runtime'
    runtime.mkdir(exist_ok=True)
    with (runtime / 'launcher-server.log').open('ab') as log:
        child = subprocess.Popen([sys.executable, str(ROOT / 'auto_server.py')],
                                 cwd=ROOT, stdin=subprocess.DEVNULL, stdout=log,
                                 stderr=log, **server_process_options())
    for _ in range(30):
        if ready():
            return
        if child.poll() is not None:
            break
        time.sleep(0.1)
    raise RuntimeError('서버를 시작하지 못했습니다. .runtime/launcher-server.log를 확인하세요.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--no-open', action='store_true', help='서버만 준비하고 주소 출력; 웨일은 열지 않음')
    parser.add_argument('--check', action='store_true', help='실행 중인 서버 확인만 수행; 서버/브라우저를 시작하지 않음')
    parser.add_argument('--meeting', default=MEETING, help='Whale meeting URL (or set WHALE_MEETING_URL)')
    args = parser.parse_args()
    try:
        if args.check:
            if not ready():
                raise RuntimeError('중계 서버가 꺼져 있습니다. cls-whale을 실행하세요.')
        else:
            if not args.no_open and not args.meeting.startswith(('https://whaleon.us/', 'https://one.whaleon.naver.com/')):
                raise RuntimeError('Set WHALE_MEETING_URL or pass --meeting with your https://whaleon.us/ meeting link. Use --no-open if already in the meeting.')
            ensure_server()
            if not args.no_open:
                open_meeting(args.meeting)
        print(PLAYER)
    except (RuntimeError, OSError, subprocess.CalledProcessError) as error:
        print('cls-whale: ' + str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
