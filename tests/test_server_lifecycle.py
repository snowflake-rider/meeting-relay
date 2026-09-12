import signal
import unittest
from unittest.mock import Mock, patch
from server_lifecycle import serve


class ServerLifecycleTests(unittest.TestCase):
    def test_keyboard_interrupt_closes_recordings_and_socket(self):
        server=Mock()
        server.serve_forever.side_effect=KeyboardInterrupt
        with patch('server_lifecycle.signal.signal'):
            serve(server)
        server.recordings.close.assert_called_once()
        server.server_close.assert_called_once()

    def test_sigterm_also_cleans_up(self):
        server=Mock()
        handlers={}
        def install(sig,handler):
            previous=handlers.get(sig)
            handlers[sig]=handler
            return previous
        server.serve_forever.side_effect=lambda:handlers[signal.SIGTERM](signal.SIGTERM,None)
        with patch('server_lifecycle.signal.signal',side_effect=install):
            with self.assertRaises(SystemExit):serve(server)
        server.recordings.close.assert_called_once()
        server.server_close.assert_called_once()
