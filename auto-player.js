const video=document.querySelector('video'),statusEl=document.querySelector('#status');
const channel=new URLSearchParams(location.search).get('source')==='meet'?'meet':'whale';
const sourceName=channel==='meet'?'Meet 탭':'웨일 회의';
if(channel==='meet'){document.title='Google Meet → Local Relay';statusEl.textContent='Meet 탭 연결 대기';}
const session=crypto.randomUUID();let pc=null,epoch=null,running=true,sound=false,audios=[],started=0,badSince=null,mediaBadSince=null,decodeBadSince=null,lastMediaStats=null,mediaStalled=false,mediaChecking=null;
const send=async payload=>{const response=await fetch('/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:'sender',session,payload,channel}),keepalive:true,signal:AbortSignal.timeout(5000)});if(!response.ok)throw Error('서버 연결 확인 필요');};
const clear=()=>{const old=pc;pc=null;old?.close();badSince=null;mediaBadSince=decodeBadSince=lastMediaStats=null;mediaStalled=false;mediaChecking=null;audios.forEach(a=>a.srcObject=null);audios=[];video.srcObject=null;};
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
// Media health is independent of ICE. Do not infer failure from an unchanged image:
// a static presentation can legitimately produce few or no new RTP packets.
async function inspectMedia(){
  const current=pc;
  if(!current||current.connectionState!=='connected'||!running||video.paused){
    mediaBadSince=decodeBadSince=lastMediaStats=null;mediaStalled=false;return;
  }
  const track=video.srcObject?.getVideoTracks()[0];
  if(track&&(track.muted||track.readyState==='ended')){
    mediaBadSince??=Date.now();
  }else mediaBadSince=null;
  mediaStalled=mediaBadSince!==null&&Date.now()-mediaBadSince>=20000;
  if(!current.getStats||mediaChecking===current)return;
  mediaChecking=current;
  try{
    const report=await current.getStats();
    if(pc!==current||!running||video.paused)return;
    const stats=[...report.values()].find(s=>s.type==='inbound-rtp'&&(s.kind==='video'||s.mediaType==='video'));
    if(stats&&Number.isFinite(stats.framesReceived)&&Number.isFinite(stats.framesDecoded)){
      const previous=lastMediaStats;
      // Only diagnose a stuck decoder when COMPLETE frames keep arriving but none decode.
      // Counter resets, source changes and idle/static slides reset the suspicion window.
      if(previous&&stats.id===previous.id&&stats.framesReceived>previous.received&&stats.framesDecoded===previous.decoded){
        decodeBadSince??=Date.now();
      }else decodeBadSince=null;
      lastMediaStats={id:stats.id,received:stats.framesReceived,decoded:stats.framesDecoded};
      if(decodeBadSince!==null&&Date.now()-decodeBadSince>=20000)mediaStalled=true;
    }else{decodeBadSince=null;lastMediaStats=null;}
  }catch{decodeBadSince=null;lastMediaStats=null;}
  finally{if(mediaChecking===current)mediaChecking=null;}
}
function heartbeat(){
  if(!running)return;
  const state=pc?.connectionState;
  const retry=mediaStalled||!pc||['failed','closed'].includes(state)||(state==='disconnected'&&badSince!==null&&Date.now()-badSince>=8000)||
    (['new','connecting'].includes(state)&&Date.now()-started>=20000);
  if(retry&&pc){clear();statusEl.textContent='연결 복구 중';}
  send({hello:true,...(retry&&epoch?{restart:epoch}:{})}).catch(()=>statusEl.textContent='서버 연결 확인 필요');
}
setInterval(()=>{void inspectMedia().finally(heartbeat);},2500);
send({hello:true}).catch(()=>{});
(async()=>{while(true){try{if(running){const r=await fetch('/poll?role=receiver&session='+session+'&channel='+channel,{signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error('서버 연결 확인 필요');for(const m of await r.json())if(m.payload.offer)await accept(m.payload);}}catch(e){if(running)statusEl.textContent=e.message;}await new Promise(r=>setTimeout(r,500));}})();
