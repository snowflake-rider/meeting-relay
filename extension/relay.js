// All media stays in the existing meeting and local WebRTC peers.
// No camera/microphone capture, cookies, account data or remote signaling.
(() => {
  if (window.__whaleAutoRelay) return;
  const BASE = 'http://127.0.0.1:18745';
  const peers = new Map();
  let enabled = true, alive = true, sourceTrack = null;
  const host = document.createElement('div');
  host.id = 'whale-local-relay-control';
  host.style.cssText = 'position:fixed;right:16px;top:52px;z-index:2147483647';
  const shadow = host.attachShadow({mode:'open'});
  shadow.innerHTML = `<style>div{font:12px system-ui;background:#172334;color:#eef4ff;border:1px solid #526b8a;border-radius:9px;padding:8px;box-shadow:0 2px 12px #0004}button{font:inherit;margin-left:8px;border:0;border-radius:5px;padding:5px 8px;cursor:pointer}a{color:#b9d8ff;margin-left:8px}</style><div><span>로컬 중계 준비 중</span><a href="${BASE}/" target="_blank" rel="noopener">플레이어 주소</a><button>중계 끄기</button></div>`;
  const label=shadow.querySelector('span'), button=shadow.querySelector('button');
  const close = id => { const p=peers.get(id); if(p){p.pc.close();p.tracks.forEach(t=>t.stop());peers.delete(id);} };
  button.onclick=()=>{enabled=!enabled;button.textContent=enabled?'중계 끄기':'중계 켜기';if(!enabled)[...peers.keys()].forEach(close);label.textContent=enabled?'플레이어 연결 대기':'중계 꺼짐';};
  const request = async(path,body) => {
    const r=await fetch(BASE+path,body===undefined?{signal:AbortSignal.timeout(2500)}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(2500)});
    if(!r.ok)throw Error('server '+r.status);return r.json();
  };
  const send=(session,payload)=>request('/send',{to:'receiver',session,payload});
  const gather=pc=>new Promise(resolve=>{if(pc.iceGatheringState==='complete')return resolve();const done=()=>{clearTimeout(timer);pc.removeEventListener('icegatheringstatechange',changed);resolve();};const changed=()=>{if(pc.iceGatheringState==='complete')done();};const timer=setTimeout(done,4000);pc.addEventListener('icegatheringstatechange',changed);});
  const video=()=>[...document.querySelectorAll('video')].filter(v=>v.videoWidth>0&&v.srcObject?.getVideoTracks().some(t=>t.readyState==='live')).sort((a,b)=>b.videoWidth*b.videoHeight-a.videoWidth*a.videoHeight)[0];
  async function connect(session, source) {
    close(session);
    const pc=new RTCPeerConnection({iceServers:[]});
    const originals=[source.srcObject.getVideoTracks()[0],...[...document.querySelectorAll('audio')].flatMap(a=>a.srcObject?.getAudioTracks()||[])];
    const tracks=[...new Set(originals)].filter(t=>t.readyState==='live').map(t=>t.clone());
    const entry={pc,tracks,epoch:crypto.randomUUID(),seen:Date.now(),offered:false};peers.set(session,entry);
    try {
      for(const t of tracks){if(t.kind==='video')t.contentHint='detail';pc.addTrack(t,new MediaStream([t]));}
      await pc.setLocalDescription(await pc.createOffer());
      const sender=pc.getSenders().find(s=>s.track.kind==='video');const params=sender.getParameters();params.degradationPreference='maintain-resolution';params.encodings.forEach(e=>{e.maxBitrate=8000000;e.scaleResolutionDownBy=1;e.maxFramerate=30;});
      await sender.setParameters(params).catch(()=>{});await gather(pc);
      if(peers.get(session)!==entry)return;
      await send(session,{offer:pc.localDescription,epoch:entry.epoch});entry.offered=true;
    }catch(e){if(peers.get(session)===entry)close(session);}
  }
  async function tick(){
    const meeting=location.pathname.startsWith('/in/');host.hidden=!meeting;
    if(!host.isConnected&&document.body)document.body.append(host);
    if(!meeting||!enabled){[...peers.keys()].forEach(close);return;}
    const source=video();
    try{
      const messages=await request('/poll?role=sender');
      const track=source?.srcObject.getVideoTracks()[0];
      if(sourceTrack&&track!==sourceTrack){[...peers.keys()].forEach(close);}sourceTrack=track;
      for(const m of messages){
        let p=peers.get(m.session);
        if(m.payload.stop){close(m.session);continue;}
        if(m.payload.hello){
          if(p)p.seen=Date.now();
          if(source&&(!p||['failed','closed'].includes(p.pc.connectionState))&&peers.size<3)void connect(m.session,source);
        }else if(m.payload.answer&&p&&p.epoch===m.payload.epoch){
          if(!p.pc.remoteDescription)await p.pc.setRemoteDescription(m.payload.answer);
        }
      }
      for(const [id,p] of peers)if(Date.now()-p.seen>15000)close(id);
      const count=[...peers.values()].filter(p=>p.pc.connectionState==='connected').length;
      label.textContent=!source?'공유 영상 대기':count?`로컬 중계 ${count}개 연결`:'플레이어 연결 대기';
    }catch(e){label.textContent='서버 꺼짐 · 로컬 실행 명령을 실행하세요';}
  }
  window.__whaleAutoRelay={peers,stop(){alive=false;[...peers.keys()].forEach(close);host.remove();delete window.__whaleAutoRelay;}};
  (async()=>{while(alive){await tick().catch(()=>{});await new Promise(r=>setTimeout(r,750));}})();
})();
