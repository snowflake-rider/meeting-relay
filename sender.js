// Run in the Console of the ACTIVE Whale ON meeting window.
// Start the server first. Close old receiver tabs before rerunning this script.
(async () => {
  window.__localRelay?.stop();
  const base = 'http://127.0.0.1:18744';
  const post = (path, message) => fetch(base + path, {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(message)
  }).then(r => { if (!r.ok) throw Error('Local server: HTTP ' + r.status); });
  await post('/reset', {});
  const source = [...document.querySelectorAll('video')]
    .filter(v => v.srcObject?.getVideoTracks().some(t => t.readyState === 'live'))
    .sort((a,b) => b.videoWidth*b.videoHeight - a.videoWidth*a.videoHeight)[0];
  if (!source) throw Error('No live video. Run this inside the active Whale ON meeting.');
  const originals = [source.srcObject.getVideoTracks()[0],
    ...[...document.querySelectorAll('audio')].flatMap(a => a.srcObject?.getAudioTracks() || [])];
  const tracks = [...new Set(originals)].filter(t => t.readyState === 'live').map(t => t.clone());
  const pc = new RTCPeerConnection({iceServers: []});
  let running = true, pending = [];
  window.__localRelay = {pc, tracks, stop() {
    running = false; pc.close(); tracks.forEach(t => t.stop());
  }};
  for (const track of tracks) {
    if (track.kind === 'video') track.contentHint = 'detail';
    pc.addTrack(track, new MediaStream([track]));
  }
  const send = m => post('/send/receiver', m);
  pc.onicecandidate = e => { if (e.candidate) send({candidate:e.candidate.toJSON()}).catch(console.error); };
  pc.onconnectionstatechange = () => console.log('LOCAL_RELAY', pc.connectionState);
  await pc.setLocalDescription(await pc.createOffer());
  const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
  const params = videoSender.getParameters();
  params.degradationPreference = 'maintain-resolution';
  params.encodings.forEach(e => {e.maxBitrate=8000000; e.maxFramerate=30; e.scaleResolutionDownBy=1;});
  try { await videoSender.setParameters(params); } catch(e) { console.warn('Default video quality used:', e.message); }
  await send({offer:pc.localDescription});
  console.log('LOCAL_RELAY_READY', source.videoWidth, source.videoHeight,
    'Open Chrome: ' + base);
  while (running) {
    try {
      const list = await (await fetch(base + '/poll/sender')).json();
      if (!running) break;
      for (const m of list) {
        if (m.answer) {
          await pc.setRemoteDescription(m.answer);
          for (const c of pending) await pc.addIceCandidate(c);
          pending = [];
        } else if (m.candidate) {
          if (pc.remoteDescription) await pc.addIceCandidate(m.candidate);
          else pending.push(m.candidate);
        } else if (m.stop) window.__localRelay.stop();
      }
    } catch(e) { console.warn('LOCAL_RELAY', e.message); }
    await new Promise(r => setTimeout(r, 500));
  }
})().catch(e => { window.__localRelay?.stop(); console.error('LOCAL_RELAY_ERROR', e); });
