const video=document.querySelector('video'),statusEl=document.querySelector('#status');
const channel=new URLSearchParams(location.search).get('source')==='meet'?'meet':'whale';
const sourceName=channel==='meet'?'Meet 탭':'웨일 회의';
if(channel==='meet'){document.title='Google Meet → Local Relay';statusEl.textContent='Meet 탭 연결 대기';}
const session=crypto.randomUUID();let pc=null,epoch=null,running=true,sound=false,audios=[],started=0,badSince=null;
const send=async payload=>{const response=await fetch('/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:'sender',session,payload,channel}),keepalive:true,signal:AbortSignal.timeout(5000)});if(!response.ok)throw Error('서버 연결 확인 필요');};
const clear=()=>{const old=pc;pc=null;old?.close();badSince=null;audios.forEach(a=>a.srcObject=null);audios=[];video.srcObject=null;};
const gather=p=>new Promise(resolve=>{if(p.iceGatheringState==='complete')return resolve();const done=()=>{clearTimeout(timer);p.removeEventListener('icegatheringstatechange',changed);resolve();};const changed=()=>{if(p.iceGatheringState==='complete')done();};const timer=setTimeout(done,4000);p.addEventListener('icegatheringstatechange',changed);});
async function accept(message){
  if(!running)return;
  clear();epoch=message.epoch;started=Date.now();const current=new RTCPeerConnection({iceServers:[]});pc=current;
  current.ontrack=e=>{if(pc!==current||!running)return;if(e.track.kind==='video'){video.srcObject=new MediaStream([e.track]);video.play().catch(()=>statusEl.textContent='영상의 재생 버튼을 눌러주세요');}else{const a=new Audio();a.autoplay=true;a.muted=!sound;a.srcObject=new MediaStream([e.track]);audios.push(a);a.play().catch(()=>{});}};
  current.onconnectionstatechange=()=>{if(pc!==current)return;badSince=current.connectionState==='disconnected'?(badSince??Date.now()):null;if(['failed','disconnected','closed'].includes(current.connectionState))statusEl.textContent='연결 복구 중';};
  try{await current.setRemoteDescription(message.offer);await current.setLocalDescription(await current.createAnswer());await gather(current);}
  catch(error){if(pc===current)clear();throw error;}
  if(pc===current&&running)await send({answer:current.localDescription,epoch});
}
video.onplaying=video.onresize=()=>statusEl.textContent=`영상 재생 중 · ${video.videoWidth} × ${video.videoHeight}`;
document.querySelector('#sound').onclick=()=>{sound=!sound;audios.forEach(a=>{a.muted=!sound;a.play().catch(()=>{})});document.querySelector('#sound').textContent=sound?'소리 끄기':'소리 켜기';};
document.querySelector('#full').onclick=()=>{if(video.requestFullscreen)video.requestFullscreen();else video.webkitEnterFullscreen?.();};
document.querySelector('#stop').onclick=()=>{running=!running;document.querySelector('#stop').textContent=running?'중계 끊기':'다시 연결';if(!running){send({stop:true}).catch(()=>{});clear();statusEl.textContent='중계 종료';}else{statusEl.textContent=sourceName+' 연결 대기';send({hello:true}).catch(()=>{});}};
addEventListener('pagehide',()=>{send({stop:true}).catch(()=>{});clear();});
function heartbeat(){
  if(!running)return;
  const state=pc?.connectionState;
  const retry=!pc||['failed','closed'].includes(state)||(state==='disconnected'&&badSince!==null&&Date.now()-badSince>=8000)||
    (['new','connecting'].includes(state)&&Date.now()-started>=20000);
  if(retry&&pc){clear();statusEl.textContent='연결 복구 중';}
  send({hello:true,...(retry&&epoch?{restart:epoch}:{})}).catch(()=>statusEl.textContent='서버 연결 확인 필요');
}
setInterval(heartbeat,2500);
send({hello:true}).catch(()=>{});
(async()=>{while(true){try{if(running){const r=await fetch('/poll?role=receiver&session='+session+'&channel='+channel,{signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error('서버 연결 확인 필요');for(const m of await r.json())if(m.payload.offer)await accept(m.payload);}}catch(e){if(running)statusEl.textContent=e.message;}await new Promise(r=>setTimeout(r,500));}})();
