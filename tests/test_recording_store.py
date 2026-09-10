import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import unittest
from unittest.mock import patch
from recording_store import RecordingStore


class RecordingStoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.store = RecordingStore(self.tmp.name)

    def test_default_webm_order_and_idempotent_retry(self):
        job = self.store.begin('video/webm;codecs=vp8,opus')
        self.assertEqual(job['format'], 'webm')
        self.store.append(job['id'],0,b'first')
        self.store.append(job['id'],0,b'first')
        with self.assertRaises(ValueError): self.store.append(job['id'],0,b'different')
        with self.assertRaises(ValueError): self.store.append(job['id'],2,b'later')
        self.store.append(job['id'],1,b'last')
        self.store.finish(job['id'],2)
        self.assertEqual(self.store.file(job['id'],'webm').read_bytes(),b'firstlast')

    def test_settings_snapshot_and_missing_ffmpeg(self):
        with patch('recording_store.shutil.which', return_value='/mock/ffmpeg'):
            self.store.configure('mp4')
            job = self.store.begin('video/webm')
        self.store.configure('webm')
        self.assertEqual(self.store.status(job['id'])['format'],'mp4')
        with patch('recording_store.shutil.which', return_value=None):
            with self.assertRaises(ValueError): self.store.configure('mp4')
        self.assertEqual(self.store.settings()['format'],'webm')

    def test_interrupted_data_survives_restart(self):
        job = self.store.begin('video/webm')
        self.store.append(job['id'],0,b'partial')
        recovered = RecordingStore(self.tmp.name)
        self.assertEqual(recovered.status(job['id'])['state'],'interrupted')
        self.assertEqual(recovered.file(job['id'],'partial').read_bytes(),b'partial')

    def test_failed_conversion_keeps_webm(self):
        job = self.store.begin('video/webm')
        self.store.append(job['id'],0,b'original')
        self.store.finish(job['id'],1)
        with patch('recording_store.subprocess.run',side_effect=OSError('encoder missing')):
            self.store._convert(job['id'],'ffmpeg')
        self.assertEqual(self.store.status(job['id'])['state'],'conversion_failed')
        self.assertEqual(self.store.file(job['id'],'webm').read_bytes(),b'original')

    def test_disk_full_and_path_validation(self):
        job = self.store.begin('video/webm')
        with patch('recording_store.shutil.disk_usage',return_value=type('Disk',(),{'free':0})()):
            with self.assertRaises(ValueError): self.store.append(job['id'],0,b'data')
        with self.assertRaises(ValueError): self.store.file('../settings.json','webm')
        self.assertEqual(self.store.status(job['id'])['bytes'],0)

    @unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'),'FFmpeg and ffprobe required')
    def test_real_webm_to_h264_aac_mp4(self):
        fixture=Path(self.tmp.name)/'fixture.webm'
        subprocess.run(['ffmpeg','-nostdin','-v','error','-f','lavfi','-i','color=c=blue:s=160x90:r=10','-f','lavfi','-i','sine=frequency=440','-t','0.5','-c:v','libvpx','-c:a','libopus',str(fixture)],check=True,timeout=20)
        self.store.configure('mp4')
        job=self.store.begin('video/webm')
        data=fixture.read_bytes()
        for seq,offset in enumerate(range(0,len(data),1024)):self.store.append(job['id'],seq,data[offset:offset+1024])
        self.store.finish(job['id'],seq+1)
        deadline=time.monotonic()+20
        while self.store.status(job['id'])['state']=='converting' and time.monotonic()<deadline:time.sleep(.05)
        self.assertEqual(self.store.status(job['id'])['state'],'complete')
        output=self.store.file(job['id'],'mp4')
        result=subprocess.check_output(['ffprobe','-v','error','-show_entries','stream=codec_name','-of','json',str(output)],text=True)
        self.assertEqual({s['codec_name'] for s in json.loads(result)['streams']},{'h264','aac'})
        self.assertEqual(self.store.file(job['id'],'webm').read_bytes(),data)
