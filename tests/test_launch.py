import contextlib
import importlib.util
import io
import json
from urllib.error import HTTPError, URLError
from http.client import RemoteDisconnected
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('launch', Path(__file__).resolve().parents[1] / 'launch.py')
launch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launch)


class LauncherTests(unittest.TestCase):
    def test_windows_custom_path_with_spaces(self):
        with tempfile.TemporaryDirectory(prefix='whale test ') as folder:
            exe = Path(folder) / 'whale.exe'
            exe.touch()
            with patch.dict(os.environ, {'WHALE_PATH': str(exe)}, clear=True), patch.object(launch.sys, 'platform', 'win32'), patch.object(launch.subprocess, 'Popen') as spawn:
                launch.open_meeting('https://whaleon.us/o/example')
                self.assertEqual(spawn.call_args.args[0], [str(exe), 'https://whaleon.us/o/example'])

    def test_windows_standard_install(self):
        with tempfile.TemporaryDirectory() as folder:
            exe = Path(folder) / 'Naver/Naver Whale/Application/whale.exe'
            exe.parent.mkdir(parents=True)
            exe.touch()
            with patch.dict(os.environ, {'LOCALAPPDATA': folder}, clear=True), patch.object(launch.shutil, 'which', return_value=None):
                self.assertEqual(launch.find_windows_whale(), str(exe))

    def test_missing_whale(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(launch.shutil, 'which', return_value=None):
            with self.assertRaisesRegex(RuntimeError, 'WHALE_PATH'):
                launch.find_windows_whale()

    def test_windows_detached_server(self):
        with patch.object(launch.sys, 'platform', 'win32'), patch.object(launch.subprocess, 'DETACHED_PROCESS', 8, create=True), patch.object(launch.subprocess, 'CREATE_NEW_PROCESS_GROUP', 512, create=True):
            self.assertEqual(launch.server_process_options(), {'creationflags': 520})

    def test_existing_server_is_reused(self):
        with patch.object(launch, 'ready', return_value=True), patch.object(launch.subprocess, 'Popen') as spawn:
            launch.ensure_server()
            spawn.assert_not_called()

    def test_no_open_outputs_only_url(self):
        output = io.StringIO()
        with patch.object(launch.sys, 'argv', ['launch.py', '--no-open']), patch.object(launch, 'ensure_server') as ensure, patch.object(launch, 'open_meeting') as browser, contextlib.redirect_stdout(output):
            self.assertEqual(launch.main(), 0)
            ensure.assert_called_once()
            browser.assert_not_called()
        self.assertEqual(output.getvalue(), launch.PLAYER + '\n')

    def test_old_server_requires_separate_port(self):
        body = json.dumps({'app':'whale-auto-relay','version':2,'ok':True,'features':['meet-tab-capture']}).encode()
        with patch.object(launch, 'urlopen', return_value=io.BytesIO(body)):
            with self.assertRaisesRegex(RuntimeError, '18749'):
                launch.ready()

    def test_missing_project_error_is_actionable(self):
        for error in (HTTPError('http://127.0.0.1/health',503,'Unavailable',{},None), RemoteDisconnected()):
            with patch.object(launch, 'urlopen', side_effect=error):
                with self.assertRaisesRegex(RuntimeError, 'restart'):
                    launch.ready()

    def test_matching_server_identity_is_reused(self):
        body = json.dumps({'app':'whale-auto-relay','version':2,'ok':True,
                           'features':['disk-recording'], 'identity':launch.identity(launch.ROOT)}).encode()
        with patch.object(launch, 'urlopen', return_value=io.BytesIO(body)), patch.object(launch.subprocess, 'Popen') as spawn:
            launch.ensure_server()
            spawn.assert_not_called()

    def test_stale_missing_or_other_checkout_identity_is_rejected(self):
        current = launch.identity(launch.ROOT)
        for value in (None, {**current, 'root': '/another/worktree'}, {**current, 'fingerprint':'outdated'}):
            body = json.dumps({'app':'whale-auto-relay','version':2,'ok':True,
                               'features':['disk-recording'], 'identity':value}).encode()
            with patch.object(launch, 'urlopen', return_value=io.BytesIO(body)), patch.object(launch.subprocess, 'Popen') as spawn:
                with self.assertRaisesRegex(RuntimeError, 'restart'):
                    launch.ensure_server()
                spawn.assert_not_called()

    def test_offline_server_is_not_ready(self):
        with patch.object(launch, 'urlopen', side_effect=URLError('connection refused')):
            self.assertFalse(launch.ready())

    def test_mac_open_unchanged(self):
        with patch.object(launch.sys, 'platform', 'darwin'), patch.object(launch.subprocess, 'run') as run:
            launch.open_meeting('https://whaleon.us/o/example')
            self.assertEqual(run.call_args.args[0], ['open', '-b', 'com.naver.Whale', 'https://whaleon.us/o/example'])


if __name__ == '__main__':
    unittest.main()
