import json
import tempfile
import threading
import unittest
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from http.server import ThreadingHTTPServer
from auto_server import Handler
from recording_http import attach_recordings


class RecordingHTTPTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
        attach_recordings(self.server,self.tmp.name)
        self.base=f'http://127.0.0.1:{self.server.server_port}'
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()

    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join();self.tmp.cleanup()

    def request(self,path,data=None,token=True,origin=None):
        headers={'Origin':origin or self.base}
        if token:headers['X-Recording-Token']=self.server.recording_token
        if data is not None and not isinstance(data,bytes):data=json.dumps(data).encode()
        return urlopen(Request(self.base+path,data=data,headers=headers))

    def test_mutation_requires_token_and_local_origin(self):
        for token,origin in [(False,None),(True,'https://one.whaleon.naver.com'),(True,'https://evil.example')]:
            with self.assertRaises(HTTPError) as e:self.request('/recording/start',{'mime':'video/webm'},token,origin)
            self.assertEqual(e.exception.code,403);e.exception.close()

    def test_upload_finalize_download(self):
        with self.request('/recording/start',{'mime':'video/webm'}) as r:id=json.load(r)['id']
        with self.request(f'/recording/{id}/chunk?seq=0',b'hello'):pass
        with self.request(f'/recording/{id}/finish',{'chunks':1}):pass
        with self.request(f'/recording/{id}/file?format=webm') as r:
            self.assertEqual(r.read(),b'hello');self.assertEqual(r.headers['Content-Length'],'5')
        with self.request('/recording/list') as r:self.assertEqual(len(json.load(r)),1)
