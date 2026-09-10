/* Records received tracks, not the zoomed viewport. Never stops meeting tracks. */
function createRelayRecorder(video, getAudios, callbacks) {
  let active = null;
  const tracks = () => [...new Set([
    ...(video.srcObject?.getVideoTracks() || []),
    ...(video.srcObject?.getAudioTracks() || []),
    ...getAudios().flatMap(a => a.srcObject?.getAudioTracks() || [])
  ])].filter(t => t.readyState === 'live');
  const update = state => callbacks.onState(state);
  function cleanup(s) {
    clearInterval(s.timer);
    s.clones.forEach(t => t.stop());
    s.nodes.forEach(n => n.disconnect());
    s.context?.close().catch(() => {});
    if (active === s) active = null;
  }
  function stop(reason = '') {
    const s = active;
    if (!s || s.stopping) return;
    s.stopping = true;
    s.reason = reason;
    update({status: 'saving'});
    if (s.recorder?.state !== 'inactive' && s.recorder) s.recorder.stop();
    // If audio setup is pending, start() finishes cleanup after it resumes.
  }
  async function start() {
    if (active) return;
    if (typeof MediaRecorder === 'undefined') throw new Error('이 브라우저는 녹화를 지원하지 않습니다. Chrome을 사용하세요.');
    const originals = tracks();
    if (!originals.some(t => t.kind === 'video')) throw new Error('영상이 연결된 뒤 녹화를 시작하세요.');
    const s = {originals, clones: [], nodes: [], chunks: [], bytes: 0, stopping: false};
    active = s;
    update({status: 'starting'});
    try {
      const stream = new MediaStream();
      const v = originals.find(t => t.kind === 'video').clone();
      s.clones.push(v); stream.addTrack(v);
      const audio = originals.filter(t => t.kind === 'audio');
      if (audio.length) {
        const AudioEngine = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AudioEngine) throw new Error('오디오 녹화를 지원하지 않는 브라우저입니다.');
        s.context = new AudioEngine();
        const destination = s.context.createMediaStreamDestination();
        for (const original of audio) {
          const clone = original.clone(); s.clones.push(clone);
          const node = s.context.createMediaStreamSource(new MediaStream([clone]));
          node.connect(destination); s.nodes.push(node);
        }
        const mixed = destination.stream.getAudioTracks()[0];
        s.clones.push(mixed); stream.addTrack(mixed);
        await s.context.resume();
        if (s.context.state !== 'running') throw new Error('오디오 녹화를 시작하지 못했습니다. 다시 시도하세요.');
      }
      if (s.stopping) { cleanup(s); update({status: 'idle'}); return; }
      const types = audio.length ? ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'] : ['video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
      const mimeType = types.find(type => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error('지원되는 녹화 형식이 없습니다. Chrome을 사용하세요.');
      s.recorder = new MediaRecorder(stream, {mimeType, videoBitsPerSecond: 5000000});
      s.recorder.ondataavailable = event => {
        if (!event.data.size) return;
        s.chunks.push(event.data); s.bytes += event.data.size;
        if (s.bytes >= 256 * 1024 * 1024) stop('256 MB 한도에 도달해 자동 저장했습니다. 새 녹화를 시작할 수 있습니다.');
      };
      s.recorder.onerror = event => { s.reason = '녹화 오류: ' + (event.error?.message || '브라우저 오류'); stop(s.reason); };
      s.recorder.onstop = () => {
        const blob = new Blob(s.chunks, {type: s.recorder.mimeType || mimeType});
        s.chunks = [];
        cleanup(s);
        update({status: 'idle'});
        if (blob.size) callbacks.onFile(blob, blob.type.startsWith('video/mp4') ? 'mp4' : 'webm', s.reason);
        else callbacks.onError(s.reason || '저장할 녹화 데이터가 없습니다.');
      };
      s.recorder.start(1000);
      s.started = Date.now();
      update({status: 'recording', seconds: 0, audio: Boolean(audio.length)});
      s.timer = setInterval(() => {
        if (s.stopping) return;
        const current = tracks();
        if (current.length !== originals.length || current.some(t => !originals.includes(t))) {
          stop('영상·오디오 연결이 바뀌어 녹화를 저장했습니다. 다시 연결되면 새 녹화를 시작하세요.');
          return;
        }
        update({status: 'recording', seconds: Math.floor((Date.now() - s.started) / 1000), audio: Boolean(audio.length)});
      }, 500);
    } catch (error) { cleanup(s); update({status: 'idle'}); throw error; }
  }
  return {start, stop, get active() { return Boolean(active); }};
}
