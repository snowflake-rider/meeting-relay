import importlib.util
import json
from pathlib import Path
import threading
import unittest
from http.server import ThreadingHTTPServer
from urllib.request import Request, urlopen
from urllib.error import HTTPError

spec = importlib.util.spec_from_file_location('relay_server_test', Path(__file__).resolve().parents[1] / 'auto_server.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), module.Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f'http://127.0.0.1:{cls.server.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown(); cls.server.server_close(); cls.thread.join()

    def setUp(self):
        with module.LOCK: module.QUEUES.clear()

    def request(self, path, data=None, origin=None):
        headers = {'Origin': origin or self.base}
        if data is not None: headers['Content-Type'] = 'application/json'
        req = Request(self.base + path, data=None if data is None else json.dumps(data).encode(), headers=headers)
        with urlopen(req) as response: return response.read()

    def test_whale_and_meet_queues_are_isolated(self):
        for channel in ('whale', 'meet'):
            self.request('/send', {'to':'sender','session':'test','channel':channel,'payload':{'hello':channel}})
        self.assertEqual(json.loads(self.request('/poll?role=sender'))[0]['payload']['hello'], 'whale')
        self.assertEqual(json.loads(self.request('/poll?role=sender&channel=meet'))[0]['payload']['hello'], 'meet')

    def test_receiver_channels_are_isolated(self):
        self.request('/send', {'to':'receiver','session':'same','channel':'meet','payload':{'offer':{}}})
        self.assertEqual(json.loads(self.request('/poll?role=receiver&session=same')), [])
        self.assertEqual(len(json.loads(self.request('/poll?role=receiver&session=same&channel=meet'))), 1)

    def test_unknown_channel_and_cross_origin_rejected(self):
        for path, data, origin, status in [('/poll?role=sender&channel=bad',None,None,400),('/send',{'channel':[], 'to':'sender'},None,400),('/capture',None,'https://evil.example',403)]:
            with self.assertRaises(HTTPError) as error: self.request(path,data,origin)
            self.assertEqual(error.exception.code,status)
            error.exception.close()

    def test_capture_routes_and_health(self):
        for path in ('/capture','/capture.js','/capture-sender.js','/capture.css'):
            self.assertTrue(self.request(path))
        self.assertIn('meet-tab-capture', json.loads(self.request('/health'))['features'])
