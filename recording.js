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
    clearInterval(s.heartbeatTimer);
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
    const s = {originals, clones: [], nodes: [], queue: Promise.resolve(), pending: 0, bytes: 0, stopping: false};
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
      const types = audio.length ? ['video/webm;codecs=vp8,opus', 'video/webm'] : ['video/webm;codecs=vp8', 'video/webm'];
      const mimeType = types.find(type => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error('지원되는 녹화 형식이 없습니다. Chrome을 사용하세요.');
      s.upload = await createDiskUpload(mimeType);
      if (s.stopping) { await s.upload.abort(); cleanup(s); update({status:'idle'}); return; }
      // Keep the lease alive even when a static or suspended source emits no chunks.
      s.heartbeatTimer = setInterval(async()=>{
        if (s.heartbeatPending || s.uploadError) return;
        s.heartbeatPending = true;
        try { await s.upload.heartbeat(); }
        catch(error) { /* Chunk/finalization requests surface sustained failures. */ }
        finally { s.heartbeatPending = false; }
      }, 20000);
      s.recorder = new MediaRecorder(stream, {mimeType, videoBitsPerSecond: 5000000});
      s.recorder.ondataavailable = event => {
        if (!event.data.size || s.uploadError) return;
        s.pending += event.data.size; s.bytes += event.data.size;
        s.queue = s.queue.then(async()=>{
          if(s.uploadError)return;
          try{await s.upload.append(event.data);}
          catch(error){s.uploadError=error;stop('디스크 저장이 중단되었습니다.');}
          finally{s.pending-=event.data.size;}
        });
        if(s.pending>32*1024*1024)stop('디스크 저장 지연으로 녹화를 중지하고 남은 데이터를 저장합니다.');
      };
      s.recorder.onerror = event => { s.reason = '녹화 오류: ' + (event.error?.message || '브라우저 오류'); stop(s.reason); };
      s.recorder.onstop = async () => {
        clearInterval(s.timer);
        update({status:'saving'});
        let finalized=false;
        try{
          await s.queue;
          if(s.uploadError)throw s.uploadError;
          const job=await s.upload.finish();
          cleanup(s);update({status:'idle'});finalized=true;
          callbacks.onFile({...job,webm:true},s.reason);
          if(job.state==='converting'){
            let state=job;
            while(state.state==='converting'){
              await new Promise(r=>setTimeout(r,2000));state=await s.upload.status();
            }
            callbacks.onFile(state,s.reason,true);
          }
        }catch(error){
          if(finalized){callbacks.onError('변환 상태를 확인하지 못했습니다. ⚙에서 파일을 확인하세요.');return;}
          await s.upload.abort().catch(()=>{});cleanup(s);update({status:'idle'});
          callbacks.onError(error.message+' · 녹화 설정의 파일 목록에서 저장된 데이터를 확인하세요.');
        }
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
        update({status: 'recording', seconds: Math.floor((Date.now() - s.started) / 1000), bytes:s.bytes, audio: Boolean(audio.length)});
      }, 500);
    } catch (error) { if(s.upload)await s.upload.abort().catch(()=>{}); cleanup(s); update({status: 'idle'}); throw error; }
  }
  globalThis.addEventListener?.('pagehide',()=>{active?.upload?.abort().catch(()=>{});});
  return {start, stop, get active() { return Boolean(active); }};
}
