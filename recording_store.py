"""Disk-backed recording sessions. No user-controlled paths or shell commands."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import threading
import uuid
from datetime import datetime, timezone

ID = re.compile(r'^[a-f0-9]{32}$')


class RecordingStore:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.conversion_lock = threading.Lock()
        self.jobs = {}
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
            if sum(j['state'] == 'recording' for j in self.jobs.values()) >= 3: raise ValueError('Three recordings are already active')
            if self.format == 'mp4' and not shutil.which('ffmpeg'): raise ValueError('FFmpeg missing; choose WebM in recording settings')
            if shutil.disk_usage(self.root).free < 64 * 1024 * 1024: raise ValueError('Not enough free disk space')
            id = uuid.uuid4().hex
            folder = self.root / id; folder.mkdir()
            (folder / 'source.webm.part').touch()
            job = {'id':id, 'format':self.format, 'state':'recording', 'bytes':0, 'next':0, 'last_hash':'', 'created':datetime.now(timezone.utc).isoformat(), 'error':''}
            self.jobs[id] = job; self._write(job)
            return dict(job)

    def append(self, id, seq, data):
        if not data or len(data) > 4 * 1024 * 1024: raise ValueError('Chunk must be 1 byte to 4 MiB')
        digest = hashlib.sha256(data).hexdigest()
        with self.lock:
            job = self._get(id)
            if job['state'] != 'recording': raise ValueError('Recording is not accepting chunks')
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
            job = self._get(id)
            if job['state'] != 'recording': return dict(job)
            if chunks != job['next'] or not job['bytes']: raise ValueError('Recording upload is incomplete or empty')
            (self.root / id / 'source.webm.part').replace(self.root / id / 'source.webm')
            job['state'] = 'complete'; self._write(job)
            if job['format'] == 'mp4': self.convert(id)
            return dict(job)

    def abort(self, id):
        with self.lock:
            job = self._get(id)
            if job['state'] == 'recording':
                job['state'] = 'interrupted'; job['error'] = 'Upload interrupted. Partial WebM retained on disk.'; self._write(job)
            return dict(job)

    def convert(self, id):
        with self.lock:
            job = self._get(id)
            if job['state'] == 'converting': return dict(job)
            if not (self.root / id / 'source.webm').exists(): raise ValueError('Only finalized WebM files can be converted')
            binary = shutil.which('ffmpeg')
            if not binary: raise ValueError('FFmpeg is not installed; WebM is retained')
            job['state'] = 'converting'; job['error'] = ''; self._write(job)
            threading.Thread(target=self._convert, args=(id, binary), daemon=True).start()
            return dict(job)

    def _convert(self, id, binary):
        folder = self.root / id
        try:
            # One conversion at a time limits CPU pressure from simultaneous recordings.
            with self.conversion_lock:
                if shutil.disk_usage(folder).free < (folder/'source.webm').stat().st_size + 64*1024*1024:
                    raise ValueError('Insufficient free space for MP4 conversion; WebM retained')
                temporary = folder / 'output.part.mp4'
                command = [binary, '-nostdin', '-y', '-v', 'error', '-i', str(folder/'source.webm'), '-map', '0:v:0', '-map', '0:a:0?', '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', str(temporary)]
                with (folder/'conversion.log').open('ab') as log:
                    subprocess.run(command, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=log, check=True)
                    if temporary.stat().st_size == 0: raise ValueError('Empty MP4 output')
                    # Decode the complete output before publishing it.
                    subprocess.run([binary, '-nostdin', '-v', 'error', '-xerror', '-i', str(temporary), '-f', 'null', '-'], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=log, check=True)
                temporary.replace(folder/'recording.mp4')
                with self.lock:
                    job = self._get(id); job['state'] = 'complete'; job['error'] = ''; self._write(job)
        except Exception as error:
            with self.lock:
                job = self._get(id); job['state'] = 'conversion_failed'; job['error'] = f'MP4 conversion failed ({type(error).__name__}). WebM retained. See conversion.log.'; self._write(job)

    def status(self, id):
        with self.lock:
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
