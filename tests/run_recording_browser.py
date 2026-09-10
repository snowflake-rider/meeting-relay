"""Serve a synthetic recording integration test; open the printed URL in Chrome."""
from pathlib import Path
import sys
from http.server import ThreadingHTTPServer
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from auto_server import Handler
from recording_http import attach_recordings

class TestHandler(Handler):
    def do_GET(self):
        if self.path=='/test':
            scripts='\n'.join((ROOT/name).read_text() for name in ('recording-upload.js','recording.js'))
            html=(ROOT/'tests/recording-browser.html').read_text().replace('/* RECORDING_SCRIPTS */',scripts)
            self.reply(html.encode(),content_type='text/html; charset=utf-8')
        else:super().do_GET()

server=ThreadingHTTPServer(('127.0.0.1',0),TestHandler)
attach_recordings(server,ROOT/'.runtime/browser-test-recordings')
print(f'http://127.0.0.1:{server.server_port}/test',flush=True)
server.serve_forever()
