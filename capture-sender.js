/* Same signaling protocol as Whale, isolated on the Meet channel. */
function createCaptureSender(stream, {request, onStatus, Peer = RTCPeerConnection}) {
  const peers = new Map();
  let active = true, polling = false;
  function close(id) {
    const entry = peers.get(id);
    if (!entry) return;
    peers.delete(id); entry.pc.close(); entry.tracks.forEach(t => t.stop());
  }
  const send = (session, payload) => request('/send', {to:'receiver', channel:'meet', session, payload});
  const gather = pc => new Promise(resolve => {
    if (pc.iceGatheringState === 'complete') return resolve();
    const done = () => { clearTimeout(timer); pc.removeEventListener('icegatheringstatechange', changed); resolve(); };
    const changed = () => { if (pc.iceGatheringState === 'complete') done(); };
    const timer = setTimeout(done, 4000); pc.addEventListener('icegatheringstatechange', changed);
  });
  async function connect(id) {
    close(id);
    const pc = new Peer({iceServers:[]});
    const tracks = stream.getTracks().filter(t => t.readyState === 'live').map(t => t.clone());
    const entry = {pc, tracks, epoch:crypto.randomUUID(), seen:Date.now()};
    peers.set(id, entry);
    try {
      tracks.forEach(t => pc.addTrack(t, new MediaStream([t])));
      await pc.setLocalDescription(await pc.createOffer());
      await gather(pc);
      if (active && peers.get(id) === entry) await send(id, {offer:pc.localDescription, epoch:entry.epoch});
    } catch { if (peers.get(id) === entry) close(id); }
  }
  async function tick() {
    if (!active || polling) return;
    polling = true;
    try {
      const messages = await request('/poll?role=sender&channel=meet');
      if (!active) return;
      for (const message of messages) {
        let entry = peers.get(message.session);
        if (message.payload.stop) { close(message.session); continue; }
        if (message.payload.hello) {
          if (entry) entry.seen = Date.now();
          if ((!entry || ['failed','closed','disconnected'].includes(entry.pc.connectionState)) && (entry || peers.size < 3)) void connect(message.session);
        } else if (message.payload.answer && entry && entry.epoch === message.payload.epoch && !entry.pc.remoteDescription) {
          await entry.pc.setRemoteDescription(message.payload.answer);
        }
      }
      for (const [id, entry] of peers) if (Date.now() - entry.seen > 15000) close(id);
      const connected = [...peers.values()].filter(e => e.pc.connectionState === 'connected').length;
      if (active) onStatus(connected ? `플레이어 ${connected}개 연결됨` : 'Meet 탭 공유 중 · 플레이어 연결 대기');
    } catch { if (active) onStatus('서버 연결 실패 · 로컬 서버를 확인하세요'); }
    finally { polling = false; }
  }
  const timer = setInterval(tick, 750);
  void tick();
  return {peers, tick, stop() { active = false; clearInterval(timer); [...peers.keys()].forEach(close); }};
}
