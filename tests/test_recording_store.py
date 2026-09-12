import json
from pathlib import Path
import shutil
import subprocess
import sys
import threading
import tempfile
import time
import unittest
from unittest.mock import patch, Mock
from recording_store import RecordingStore


class RecordingStoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.store = RecordingStore(self.tmp.name)
        self.addCleanup(self.store.close)

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
        with patch('recording_store.subprocess.Popen',side_effect=OSError('encoder missing')):
            self.store._convert(job['id'],'ffmpeg')
        self.assertEqual(self.store.status(job['id'])['state'],'conversion_failed')
        self.assertEqual(self.store.file(job['id'],'webm').read_bytes(),b'original')

    def test_disk_full_and_path_validation(self):
        job = self.store.begin('video/webm')
        with patch('recording_store.shutil.disk_usage',return_value=type('Disk',(),{'free':0})()):
            with self.assertRaises(ValueError): self.store.append(job['id'],0,b'data')
        with self.assertRaises(ValueError): self.store.file('../settings.json','webm')
        self.assertEqual(self.store.status(job['id'])['bytes'],0)

    def test_abandoned_slots_expire_but_heartbeat_keeps_static_recording_alive(self):
        now = [0]
        store = RecordingStore(self.tmp.name, clock=lambda: now[0])
        self.addCleanup(store.close)
        jobs = [store.begin('video/webm') for _ in range(3)]
        for job in jobs: store.append(job['id'], 0, b'preserved')
        now[0] = 100
        store.heartbeat(jobs[0]['id'])
        now[0] = 121
        new = store.begin('video/webm')
        self.assertEqual(store.status(jobs[0]['id'])['state'], 'recording')
        self.assertEqual(store.status(jobs[1]['id'])['state'], 'interrupted')
        self.assertEqual(store.file(jobs[1]['id'], 'partial').read_bytes(), b'preserved')
        with self.assertRaises(ValueError): store.heartbeat(jobs[1]['id'])
        with self.assertRaises(ValueError): store.finish(jobs[1]['id'], 1)
        self.assertEqual(store.status(new['id'])['state'], 'recording')

    def test_close_terminates_real_child_and_retains_original(self):
        job = self.store.begin('video/webm')
        self.store.append(job['id'], 0, b'preserved')
        self.store.finish(job['id'], 1)
        started = threading.Event()
        real_popen = subprocess.Popen
        children = []
        def launch(command, **kwargs):
            child = real_popen([sys.executable, '-c', 'import time; time.sleep(60)'], **kwargs)
            children.append(child); started.set()
            return child
        with patch('recording_store.shutil.which', return_value='fake-ffmpeg'), patch('recording_store.subprocess.Popen', side_effect=launch):
            self.store.convert(job['id'])
            self.assertTrue(started.wait(5))
            self.store.close()
        self.assertIsNotNone(children[0].poll())
        self.assertFalse(self.store.processes)
        self.assertFalse(self.store.threads)
        self.assertEqual(self.store.status(job['id'])['state'], 'interrupted')
        self.assertEqual(self.store.file(job['id'], 'webm').read_bytes(), b'preserved')
        self.store.close()
        with self.assertRaises(ValueError): self.store.convert(job['id'])

    def test_close_kills_encoder_that_ignores_terminate(self):
        process = Mock()
        process.poll.return_value = None
        process.wait.side_effect = [subprocess.TimeoutExpired('encoder', 5), 0]
        self.store.processes.add(process)
        self.store.close()
        process.terminate.assert_called_once()
        process.kill.assert_called_once()
        self.assertEqual(process.wait.call_count, 2)

    def test_conversion_retries_use_distinct_temporary_files(self):
        job = self.store.begin('video/webm')
        self.store.append(job['id'], 0, b'original')
        self.store.finish(job['id'], 1)
        outputs = []
        def fail(command, log):
            outputs.append(command[-1])
            Path(command[-1]).write_bytes(b'incomplete')
            raise OSError('conversion failed')
        with patch.object(self.store, '_run_encoder', side_effect=fail):
            self.store._convert(job['id'], 'fake')
            self.store._convert(job['id'], 'fake')
        self.assertNotEqual(outputs[0], outputs[1])
        self.assertTrue(all(not Path(output).exists() for output in outputs))
        self.assertEqual(self.store.file(job['id'], 'webm').read_bytes(), b'original')

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
