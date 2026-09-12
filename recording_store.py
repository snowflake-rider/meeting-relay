"""Disk-backed recording sessions. No user-controlled paths or shell commands."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import threading
import time
import uuid
from datetime import datetime, timezone

ID = re.compile(r'^[a-f0-9]{32}$')


class RecordingStore:
    def __init__(self, root, *, clock=time.monotonic, lease_seconds=120):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.conversion_lock = threading.Lock()
        self.jobs = {}
        self.clock = clock
        self.lease_seconds = lease_seconds
        self.activity = {}
        self.closed = False
        self.processes = set()
        self.threads = set()
        self.format = 'webm'
        settings = self.root / 'settings.json'
        if settings.exists():
            try: self.format = json.loads(settings.read_text()).get('format', 'webm')
            except (ValueError, OSError): pass
        if self.format not in ('webm', 'mp4'): self.format = 'webm'
        # Interrupted sessions remain on disk and can be downloaded as partial files.
        for path in self.root.glob('*/metadata.json'):
            try:
                job = json.loads(path.read_text())
                if not ID.fullmatch(job['id']): continue
                if job['state'] in ('recording', 'converting'):
                    job['state'] = 'interrupted'
                    job['error'] = 'Server restarted. Original data retained; a partial recording may not be playable.'
                self.jobs[job['id']] = job
            except (ValueError, OSError, KeyError, TypeError): continue

    def _expire(self):
        now = self.clock()
        for id, last in list(self.activity.items()):
            if now - last >= self.lease_seconds:
                job = self.jobs[id]
                if job['state'] == 'recording':
                    job['state'] = 'interrupted'
                    job['error'] = 'Recording client stopped responding. Partial WebM retained on disk.'
                    self._write(job)
                self.activity.pop(id, None)

    def heartbeat(self, id):
        with self.lock:
            self._expire()
            job = self._get(id)
            if self.closed or job['state'] != 'recording':
                raise ValueError('Recording is not accepting chunks')
            self.activity[id] = self.clock()
            return dict(job)

    def close(self):
        """Stop owned encoders before releasing server resources. Safe to call twice."""
        with self.lock:
            self.closed = True
            processes = list(self.processes)
            threads = list(self.threads)
            for job in self.jobs.values():
                if job['state'] in ('recording', 'converting'):
                    job['state'] = 'interrupted'
                    job['error'] = 'Server stopped. Original recording data retained.'
                    try: self._write(job)
                    except OSError: pass
            self.activity.clear()
        for process in processes:
            if process.poll() is None:
                try: process.terminate()
                except ProcessLookupError: pass
        for process in processes:
            try: process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill(); process.wait()
            with self.lock: self.processes.discard(process)
        for thread in threads:
            if thread is not threading.current_thread(): thread.join(timeout=6)

    def _run_encoder(self, command, log):
        with self.lock:
            if self.closed: raise RuntimeError('Recording store is closed')
            process = subprocess.Popen(command, stdin=subprocess.DEVNULL,
                                       stdout=subprocess.DEVNULL, stderr=log)
            self.processes.add(process)
        try:
            code = process.wait()
            if code: raise subprocess.CalledProcessError(code, command)
        finally:
            with self.lock: self.processes.discard(process)

    def settings(self):
        return {'format': self.format, 'ffmpeg': bool(shutil.which('ffmpeg')), 'directory': str(self.root)}

    def configure(self, format):
        if format not in ('webm', 'mp4'): raise ValueError('Choose webm or mp4')
        if format == 'mp4' and not shutil.which('ffmpeg'): raise ValueError('FFmpeg is not installed. WebM recording remains available.')
        with self.lock:
            self.format = format
            path = self.root / 'settings.json'
            temporary = path.with_suffix('.tmp')
            temporary.write_text(json.dumps({'format': format}))
            temporary.replace(path)
        return self.settings()

    def _write(self, job):
        path = self.root / job['id'] / 'metadata.json'
        temporary = path.with_suffix('.tmp')
        temporary.write_text(json.dumps(job))
        temporary.replace(path)

    def _get(self, id):
        if not ID.fullmatch(id) or id not in self.jobs: raise ValueError('Recording not found')
        return self.jobs[id]

    def begin(self, mime):
        if not isinstance(mime, str) or mime.split(';')[0] != 'video/webm': raise ValueError('WebM input required')
        with self.lock:
            if self.closed: raise ValueError('Recording store is closed')
            self._expire()
            if sum(j['state'] == 'recording' for j in self.jobs.values()) >= 3: raise ValueError('Three recordings are already active')
            if self.format == 'mp4' and not shutil.which('ffmpeg'): raise ValueError('FFmpeg missing; choose WebM in recording settings')
            if shutil.disk_usage(self.root).free < 64 * 1024 * 1024: raise ValueError('Not enough free disk space')
            id = uuid.uuid4().hex
            folder = self.root / id; folder.mkdir()
            (folder / 'source.webm.part').touch()
            job = {'id':id, 'format':self.format, 'state':'recording', 'bytes':0, 'next':0, 'last_hash':'', 'created':datetime.now(timezone.utc).isoformat(), 'error':''}
            self.jobs[id] = job; self.activity[id] = self.clock(); self._write(job)
            return dict(job)

    def append(self, id, seq, data):
        if not data or len(data) > 4 * 1024 * 1024: raise ValueError('Chunk must be 1 byte to 4 MiB')
        digest = hashlib.sha256(data).hexdigest()
        with self.lock:
            self.heartbeat(id)
            job = self._get(id)
            if seq == job['next'] - 1 and digest == job['last_hash']: return dict(job)
            if seq != job['next']: raise ValueError('Out-of-order chunk')
            if shutil.disk_usage(self.root).free < len(data) + 64 * 1024 * 1024: raise ValueError('Disk almost full; original data retained')
            path = self.root / id / 'source.webm.part'
            with path.open('r+b') as file:
                # Roll back an unacknowledged partial write before retrying.
                file.truncate(job['bytes']); file.seek(job['bytes']); file.write(data); file.flush(); os.fsync(file.fileno())
            job['bytes'] += len(data); job['next'] += 1; job['last_hash'] = digest
            self._write(job)
            return dict(job)

    def finish(self, id, chunks):
        with self.lock:
            self._expire()
            job = self._get(id)
            if job['state'] != 'recording':
                if job['state'] == 'interrupted': raise ValueError('Recording upload was interrupted')
                return dict(job)
            if chunks != job['next'] or not job['bytes']: raise ValueError('Recording upload is incomplete or empty')
            (self.root / id / 'source.webm.part').replace(self.root / id / 'source.webm')
            self.activity.pop(id, None)
            job['state'] = 'complete'; self._write(job)
            if job['format'] == 'mp4': self.convert(id)
            return dict(job)

    def abort(self, id):
        with self.lock:
            job = self._get(id)
            self.activity.pop(id, None)
            if job['state'] == 'recording':
                job['state'] = 'interrupted'; job['error'] = 'Upload interrupted. Partial WebM retained on disk.'; self._write(job)
            return dict(job)

    def convert(self, id):
        with self.lock:
            job = self._get(id)
            if self.closed: raise ValueError('Recording store is closed')
            if job['state'] == 'converting': return dict(job)
            if not (self.root / id / 'source.webm').exists(): raise ValueError('Only finalized WebM files can be converted')
            binary = shutil.which('ffmpeg')
            if not binary: raise ValueError('FFmpeg is not installed; WebM is retained')
            job['state'] = 'converting'; job['error'] = ''; self._write(job)
            thread = threading.Thread(target=self._convert, args=(id, binary), daemon=True)
            self.threads.add(thread)
            thread.start()
            return dict(job)

    def _convert(self, id, binary):
        folder = self.root / id
        temporary = folder / ('output-' + uuid.uuid4().hex + '.part.mp4')
        try:
            # One conversion at a time limits CPU pressure from simultaneous recordings.
            with self.conversion_lock:
                if shutil.disk_usage(folder).free < (folder/'source.webm').stat().st_size + 64*1024*1024:
                    raise ValueError('Insufficient free space for MP4 conversion; WebM retained')
                if self.closed: return
                command = [binary, '-nostdin', '-y', '-v', 'error', '-i', str(folder/'source.webm'), '-map', '0:v:0', '-map', '0:a:0?', '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', str(temporary)]
                with (folder/'conversion.log').open('ab') as log:
                    self._run_encoder(command, log)
                    if temporary.stat().st_size == 0: raise ValueError('Empty MP4 output')
                    # Decode the complete output before publishing it.
                    self._run_encoder([binary, '-nostdin', '-v', 'error', '-xerror', '-i', str(temporary), '-f', 'null', '-'], log)
                with self.lock:
                    if self.closed: return
                    temporary.replace(folder/'recording.mp4')
                    job = self._get(id); job['state'] = 'complete'; job['error'] = ''; self._write(job)
        except Exception as error:
            with self.lock:
                if self.closed: return
                job = self._get(id); job['state'] = 'conversion_failed'; job['error'] = f'MP4 conversion failed ({type(error).__name__}). WebM retained. See conversion.log.'; self._write(job)

        finally:
            try: temporary.unlink(missing_ok=True)
            except OSError: pass
            with self.lock: self.threads.discard(threading.current_thread())

    def status(self, id):
        with self.lock:
            self._expire()
            job = dict(self._get(id))
            folder = self.root / id
            job['webm'] = (folder/'source.webm').exists()
            job['mp4'] = (folder/'recording.mp4').exists()
            job['directory'] = str(folder)
            return job

    def list(self):
        with self.lock: return [self.status(id) for id in reversed(list(self.jobs))]

    def file(self, id, format):
        with self.lock:
            self._get(id)
            if format not in ('webm','mp4','partial'): raise ValueError('Unknown file format')
            name = {'webm':'source.webm','mp4':'recording.mp4','partial':'source.webm.part'}[format]
            path = self.root / id / name
            if not path.is_file(): raise ValueError('File is not available')
            return path
