import tempfile
import unittest
from pathlib import Path
from server_identity import identity


class IdentityTests(unittest.TestCase):
    def test_runtime_changes_invalidate_but_recordings_and_docs_do_not(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'extension').mkdir()
            asset = root / 'auto-player.js'
            asset.write_text('old player')
            original = identity(root)
            (root / 'README.md').write_text('new documentation')
            (root / '.runtime').mkdir()
            (root / '.runtime' / 'recording.webm').write_bytes(b'video')
            self.assertEqual(identity(root), original)
            asset.write_text('new player')
            changed = identity(root)
            self.assertNotEqual(changed, original)
            (root / 'extension' / 'relay.js').write_text('new sender')
            self.assertNotEqual(identity(root), changed)

    def test_running_server_reports_startup_identity_after_disk_update(self):
        import threading
        from http.server import ThreadingHTTPServer
        from unittest.mock import patch
        import auto_server
        import launch

        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'extension').mkdir()
            for name in auto_server.REQUIRED_ASSETS:
                (root / name).write_text('original')
            server = ThreadingHTTPServer(('127.0.0.1', 0), auto_server.Handler)
            server.relay_identity = identity(root)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            base = f'http://127.0.0.1:{server.server_port}/'
            try:
                with patch.object(auto_server, 'ROOT', root), patch.object(launch, 'ROOT', root), patch.object(launch, 'PLAYER', base):
                    thread.start()
                    self.assertTrue(launch.ready())
                    (root / 'auto-player.js').write_text('updated recovery code')
                    with self.assertRaisesRegex(RuntimeError, 'restart'):
                        launch.ready()
            finally:
                server.shutdown()
                server.server_close()
                thread.join()
