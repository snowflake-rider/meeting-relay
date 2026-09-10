from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
import json, threading

ROOT = Path(__file__).parent
messages = {'sender': [], 'receiver': []}
lock = threading.Lock()
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args): pass
    def headers_out(self, status=200, content_type='application/json'):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        origin = self.headers.get('Origin', '')
        if origin in ('https://one.whaleon.naver.com', 'http://127.0.0.1:18744'):
            self.send_header('Access-Control-Allow-Origin', origin)
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
    def do_OPTIONS(self): self.headers_out()
    def do_GET(self):
        route = self.path.split('?')[0]
        if route == '/':
            self.headers_out(content_type='text/html; charset=utf-8')
            self.wfile.write((ROOT / 'relay.html').read_bytes())
        elif route in ('/poll/sender', '/poll/receiver'):
            with lock:
                result = messages[route.rsplit('/', 1)[1]][:]
                messages[route.rsplit('/', 1)[1]].clear()
            self.headers_out(); self.wfile.write(json.dumps(result).encode())
        elif route == '/health':
            self.headers_out(); self.wfile.write(b'{"ok":true}')
        else: self.headers_out(404)
    def do_POST(self):
        if self.headers.get('Origin', '') not in ('https://one.whaleon.naver.com', 'http://127.0.0.1:18744'):
            self.headers_out(403); return
        if self.path == '/reset':
            with lock:
                messages['sender'].clear()
                messages['receiver'].clear()
            self.headers_out(); self.wfile.write(b'{}'); return
        role = self.path.rsplit('/', 1)[-1]
        if self.path not in ('/send/sender', '/send/receiver'):
            self.headers_out(404); return
        size = int(self.headers.get('Content-Length', 0))
        if size > 100000: self.headers_out(413); return
        item = json.loads(self.rfile.read(size))
        with lock: messages[role].append(item)
        self.headers_out(); self.wfile.write(b'{}')
print('Chrome player: http://127.0.0.1:18744/ — Stop server with Ctrl+C', flush=True)
ThreadingHTTPServer(('127.0.0.1', 18744), Handler).serve_forever()
