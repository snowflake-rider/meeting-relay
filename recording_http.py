"""Same-origin recording API; loopback host plus token required for mutations."""
import hmac
import json
import re
import secrets
from urllib.parse import urlsplit, parse_qs
from recording_store import RecordingStore


def attach_recordings(server, directory):
    server.recordings = RecordingStore(directory)
    server.recording_token = secrets.token_urlsafe(32)


def handle_recordings(handler, method, root):
    url = urlsplit(handler.path)
    if not (url.path.startswith('/recording/') or url.path == '/recording-settings'):
        return False
    origin = f'http://127.0.0.1:{handler.server.server_port}'
    if handler.headers.get('Host') != origin[7:] or handler.headers.get('Origin') not in (None, origin):
        handler.reply({'error':'Recording API is local-only'},403); return True
    store = getattr(handler.server, 'recordings', None)
    if store is None:
        handler.reply({'error':'Recording storage is unavailable'},503); return True
    try:
        if method == 'GET':
            if url.path in ('/recording-settings','/recording/settings.js','/recording/settings.css'):
                name,mime = {'/recording-settings':('recording-settings.html','text/html; charset=utf-8'),'/recording/settings.js':('recording-settings.js','text/javascript; charset=utf-8'),'/recording/settings.css':('recording-settings.css','text/css; charset=utf-8')}[url.path]
                handler.reply((root/name).read_bytes(),content_type=mime)
            elif url.path == '/recording/settings':
                handler.reply({**store.settings(), 'token':handler.server.recording_token})
            elif url.path == '/recording/list': handler.reply(store.list())
            else:
                match = re.fullmatch(r'/recording/([a-f0-9]{32})/(status|file)',url.path)
                if not match: raise ValueError('Unknown recording endpoint')
                id,action = match.groups()
                if action == 'status': handler.reply(store.status(id))
                else:
                    format = parse_qs(url.query).get('format',['webm'])[0]
                    path = store.file(id,format)
                    # Stream disk data; never read a whole recording into RAM.
                    with path.open('rb') as file:
                        handler.send_response(200)
                        handler.send_header('Content-Type','video/mp4' if format == 'mp4' else 'video/webm')
                        handler.send_header('Content-Length',str(path.stat().st_size))
                        handler.send_header('Content-Disposition',f'attachment; filename="meeting-{id}.{ "mp4" if format == "mp4" else "webm"}"')
                        handler.send_header('Cache-Control','no-store'); handler.end_headers()
                        while data := file.read(256*1024): handler.wfile.write(data)
        elif method == 'POST':
            token = handler.headers.get('X-Recording-Token','')
            if not hmac.compare_digest(token,handler.server.recording_token):
                handler.reply({'error':'Refresh recording settings and try again'},403); return True
            size = int(handler.headers.get('Content-Length','0'))
            if not 0 < size <= 4*1024*1024: raise ValueError('Invalid request size')
            body = handler.rfile.read(size)
            if len(body) != size: raise ValueError('Incomplete request')
            match = re.fullmatch(r'/recording/([a-f0-9]{32})/(chunk|finish|abort|convert|heartbeat)',url.path)
            if match:
                id,action = match.groups()
                if action == 'chunk': result = store.append(id,int(parse_qs(url.query).get('seq',['-1'])[0]),body)
                elif action == 'finish': result = store.finish(id,json.loads(body)['chunks'])
                elif action == 'abort': result = store.abort(id)
                elif action == 'heartbeat': result = store.heartbeat(id)
                else: result = store.convert(id)
            elif url.path == '/recording/settings': result = store.configure(json.loads(body)['format'])
            elif url.path == '/recording/start': result = store.begin(json.loads(body)['mime'])
            else: raise ValueError('Unknown recording endpoint')
            handler.reply(result)
        else: handler.reply({},405)
    except (ValueError,TypeError,KeyError) as error: handler.reply({'error':str(error)},400)
    except OSError: handler.reply({'error':'Disk operation failed. Existing recording data is retained.'},507)
    return True
