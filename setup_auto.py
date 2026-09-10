"""One-time, per-user macOS launch agent. No sudo, no browser permissions."""
import os
from pathlib import Path
import plistlib
import subprocess
import sys

if sys.platform != 'darwin':
    raise SystemExit('Login startup setup is macOS-only. On Windows, run cls-whale.ps1 instead.')

ROOT = Path(__file__).resolve().parent
LABEL = 'local.whale-relay.signaling'
PLIST = Path.home() / 'Library' / 'LaunchAgents' / (LABEL + '.plist')
SERVICE = f'gui/{os.getuid()}/{LABEL}'


def main():
    uninstall = sys.argv[1:] == ['uninstall']
    if PLIST.exists():
        current = plistlib.loads(PLIST.read_bytes())
        if current.get('ProgramArguments', [None, None])[1] != str(ROOT / 'auto_server.py'):
            raise SystemExit('Another installation owns this service. Use its stop-auto.command first.')
        subprocess.run(['launchctl', 'bootout', SERVICE], capture_output=True)
    if uninstall:
        PLIST.unlink(missing_ok=True)
        print('Automatic relay server stopped. Project files remain.'); return
    runtime = ROOT / '.runtime'
    runtime.mkdir(exist_ok=True)
    PLIST.parent.mkdir(parents=True, exist_ok=True)
    PLIST.write_bytes(plistlib.dumps({
        'Label': LABEL,
        'ProgramArguments': [sys.executable, str(ROOT / 'auto_server.py')],
        'WorkingDirectory': str(ROOT),
        'RunAtLoad': True,
        'KeepAlive': True,
        'ThrottleInterval': 15,
        'StandardOutPath': str(runtime / 'server.log'),
        'StandardErrorPath': str(runtime / 'server-error.log'),
    }))
    subprocess.run(['launchctl', 'bootstrap', f'gui/{os.getuid()}', str(PLIST)], check=True)
    print('Server starts now and at login: http://127.0.0.1:18745/')
    print('Next: Whale extensions → Load unpacked → select this project’s extension folder.')
    print('To remove automatic startup, run stop-auto.command.')


if __name__ == '__main__':
    main()
