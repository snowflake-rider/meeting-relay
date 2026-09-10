"""Loopback-only signaling and player for the Whale extension (port 18745)."""
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from collections import deque
from urllib.parse import urlsplit, parse_qs
import json
import re
import threading
import time

ROOT = Path(__file__).resolve().parent
ORIGINS = {'https://one.whaleon.naver.com', 'http://127.0.0.1:18745'}
QUEUES = {}
LOCK = threading.Lock()
SESSION = re.compile(r'^[a-zA-Z0-9-]{1,64}$')


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, value, status=200, content_type='application/json'):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        origin = self.headers.get('Origin')
        if origin in ORIGINS:
            self.send_header('Access-Control-Allow-Origin', origin)
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(value if isinstance(value, bytes) else json.dumps(value).encode())

    def allowed(self):
        return self.headers.get('Host') == '127.0.0.1:18745' and self.headers.get('Origin') in ORIGINS | {None}

    def do_OPTIONS(self):
        self.reply({}, 200 if self.allowed() else 403)

    def do_GET(self):
        if not self.allowed():
            self.reply({}, 403); return
        url = urlsplit(self.path)
        if url.path == '/':
            self.reply((ROOT / 'auto-player.html').read_bytes(), content_type='text/html; charset=utf-8')
        elif url.path == '/player.js':
            self.reply((ROOT / 'auto-player.js').read_bytes(), content_type='text/javascript; charset=utf-8')
        elif url.path == '/health':
            self.reply({'ok': True, 'app': 'whale-auto-relay', 'version': 2})
        elif url.path == '/poll':
            query = parse_qs(url.query)
            role = query.get('role', [''])[0]
            session = query.get('session', [''])[0]
            if role not in ('sender', 'receiver') or (role == 'receiver' and not SESSION.fullmatch(session)):
                self.reply({}, 400); return
            key = 'sender' if role == 'sender' else session
            with LOCK:
                entry = QUEUES.pop(key, (0, []))
            self.reply(list(entry[1]))
        else:
            self.reply({}, 404)

    def do_POST(self):
        if not self.allowed() or self.headers.get('Origin') not in ORIGINS:
            self.reply({}, 403); return
        try:
            size = int(self.headers.get('Content-Length', 0))
            if not 0 < size <= 100000:
                self.reply({}, 413); return
            message = json.loads(self.rfile.read(size))
            if self.path != '/send' or message.get('to') not in ('sender', 'receiver') or not SESSION.fullmatch(message.get('session', '')) or not isinstance(message.get('payload'), dict):
                self.reply({}, 400); return
        except (ValueError, TypeError, AttributeError):
            self.reply({}, 400); return
        key = 'sender' if message['to'] == 'sender' else message['session']
        now = time.monotonic()
        with LOCK:
            for old, (stamp, _) in list(QUEUES.items()):
                if now - stamp > 30:
                    del QUEUES[old]
            if key not in QUEUES and len(QUEUES) >= 32:
                self.reply({}, 429); return
            queue = QUEUES.get(key, (now, deque(maxlen=64)))[1]
            queue.append({'session': message['session'], 'payload': message['payload']})
            QUEUES[key] = (now, queue)
        self.reply({'ok': True})


if __name__ == '__main__':
    print('Whale Auto Relay: http://127.0.0.1:18745/', flush=True)
    ThreadingHTTPServer(('127.0.0.1', 18745), Handler).serve_forever()
