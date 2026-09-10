const video=document.querySelector('video'),statusEl=document.querySelector('#status');
const session=crypto.randomUUID();let pc=null,epoch=null,running=true,sound=false,audios=[];
const send=payload=>fetch('/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:'sender',session,payload}),keepalive:true});
const clear=()=>{pc?.close();pc=null;audios.forEach(a=>a.srcObject=null);audios=[];video.srcObject=null;};
const gather=p=>new Promise(resolve=>{if(p.iceGatheringState==='complete')return resolve();const done=()=>{clearTimeout(timer);p.removeEventListener('icegatheringstatechange',changed);resolve();};const changed=()=>{if(p.iceGatheringState==='complete')done();};const timer=setTimeout(done,4000);p.addEventListener('icegatheringstatechange',changed);});
async function accept(message){
  clear();epoch=message.epoch;const current=new RTCPeerConnection({iceServers:[]});pc=current;
  current.ontrack=e=>{if(e.track.kind==='video'){video.srcObject=new MediaStream([e.track]);video.play().catch(()=>statusEl.textContent='영상의 재생 버튼을 눌러주세요');}else{const a=new Audio();a.autoplay=true;a.muted=!sound;a.srcObject=new MediaStream([e.track]);audios.push(a);a.play().catch(()=>{});}};
  current.onconnectionstatechange=()=>{if(pc!==current)return;if(['failed','disconnected','closed'].includes(current.connectionState))statusEl.textContent='연결 복구 중';};
  await current.setRemoteDescription(message.offer);await current.setLocalDescription(await current.createAnswer());await gather(current);
  if(pc===current&&running)await send({answer:current.localDescription,epoch});
}
video.onplaying=video.onresize=()=>statusEl.textContent=`영상 재생 중 · ${video.videoWidth} × ${video.videoHeight}`;
document.querySelector('#sound').onclick=()=>{sound=!sound;audios.forEach(a=>{a.muted=!sound;a.play().catch(()=>{})});document.querySelector('#sound').textContent=sound?'소리 끄기':'소리 켜기';};
document.querySelector('#full').onclick=()=>{if(video.requestFullscreen)video.requestFullscreen();else video.webkitEnterFullscreen?.();};
document.querySelector('#stop').onclick=()=>{running=!running;document.querySelector('#stop').textContent=running?'중계 끊기':'다시 연결';if(!running){send({stop:true}).catch(()=>{});clear();statusEl.textContent='중계 종료';}else{statusEl.textContent='웨일 회의 연결 대기';send({hello:true}).catch(()=>{});}};
addEventListener('pagehide',()=>{send({stop:true}).catch(()=>{});clear();});
setInterval(()=>{if(running)send({hello:true}).catch(()=>statusEl.textContent='서버 연결 확인 필요');},2500);
send({hello:true}).catch(()=>{});
(async()=>{while(true){try{if(running){const r=await fetch('/poll?role=receiver&session='+session);if(!r.ok)throw Error('서버 연결 확인 필요');for(const m of await r.json())if(m.payload.offer)await accept(m.payload);}}catch(e){statusEl.textContent=e.message;clear();}await new Promise(r=>setTimeout(r,500));}})();
