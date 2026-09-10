function installRelayUI(video, getAudios, getRelayState = () => ({connected:false, sound:false})) {
  if (document.querySelector('#relay-tools')) return;
  video.removeAttribute('controls');
  const stage=document.createElement('div');stage.id='relay-stage';
  video.parentNode.insertBefore(stage,video);stage.append(video);
  const tools=document.createElement('aside');tools.id='relay-tools';tools.setAttribute('aria-label','영상 도구');
  const toast=document.createElement('div');toast.id='relay-status';toast.setAttribute('role','status');
  document.body.append(tools,toast);
  let toastTimer,scale=1,x=0,y=0;
  function notify(text){toast.textContent=text;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),2200);}
  function add(id,text,label,action){const b=document.createElement('button');b.id=id;b.textContent=text;b.title=label;b.setAttribute('aria-label',label);b.onclick=action;tools.append(b);return b;}
  const connection=document.createElement('div');connection.id='relay-connection';connection.setAttribute('role','status');connection.setAttribute('aria-live','polite');tools.append(connection);
  const icon=paths=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  const speaker='<path d="M11 5 6 9H3v6h3l5 4V5Z"/>';
  const speakerOn=icon(speaker+'<path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>');
  const speakerOff=icon(speaker+'<path d="m3 3 18 18"/>');
  const play=add('toggle-play','Ⅱ','일시정지 (Space)',()=>{if(video.paused)video.play().catch(()=>notify('재생할 영상이 없습니다'));else video.pause();});
  const plus=add('zoom-in','+','확대 (+)',()=>zoom(scale*1.25));
  const reset=add('zoom-reset','100%','화면 맞춤 (0)',()=>{scale=1;x=0;y=0;render();});
  add('zoom-out','−','축소 (-)',()=>zoom(scale/1.25));
  tools.append(document.createElement('hr'));
  const snapshot=add('snapshot','','스크린샷 저장 (S)',()=>{
    if(!video.videoWidth||video.readyState<2){notify('영상이 들어온 뒤 캡처할 수 있습니다');return;}
    const c=document.createElement('canvas');c.width=video.videoWidth;c.height=video.videoHeight;
    try{c.getContext('2d').drawImage(video,0,0);c.toBlob(blob=>{if(!blob){notify('스크린샷을 만들지 못했습니다');return;}const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='whale-'+new Date().toISOString().replace(/[:.]/g,'-')+'.png';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),60000);notify('원본 해상도 PNG 저장');},'image/png');}catch(e){notify('캡처 실패: '+e.message);}
  });
  snapshot.innerHTML=icon('<path d="M9 4 7 7H4a2 2 0 0 0-2 2v10h20V9a2 2 0 0 0-2-2h-3l-2-3H9Z"/><circle cx="12" cy="13" r="4"/>');
  let lastRecordingId;
  add('recording-settings','⚙','녹화 설정 · MP4 변환',()=>window.open('/recording-settings','_blank','noopener'));
  const record = add('record','●','녹화 시작/중지 (R)',()=>{
    if(recorder.active) recorder.stop();
    else recorder.start().catch(e=>notify(e.message));
  });
  record.setAttribute('aria-pressed','false');
  const recordingLabel=document.createElement('span');recordingLabel.id='recording-time';tools.append(recordingLabel);
  const download=document.createElement('a');download.id='recording-download';download.textContent='↓';download.title='마지막 녹화 다시 저장';download.setAttribute('aria-label',download.title);download.hidden=true;tools.append(download);
  const recorder=createRelayRecorder(video,getAudios,{
    onState(state){
      const busy=state.status==='starting'||state.status==='saving';
      record.disabled=busy;record.classList.toggle('recording',state.status==='recording');record.setAttribute('aria-pressed',String(state.status==='recording'));
      record.textContent=state.status==='recording'?'■':'●';
      recordingLabel.textContent=state.status==='recording'?Math.floor(state.seconds/60)+':'+String(state.seconds%60).padStart(2,'0'):busy?'…':'';
      if(state.status==='recording'&&state.seconds===0)notify(state.audio?'녹화 시작 · 재생 음소거와 무관하게 오디오 포함':'녹화 시작 · 현재 오디오 트랙 없음');
    },
    onFile(job,reason,conversionUpdate=false){
      if(conversionUpdate&&job.id!==lastRecordingId)return;
      lastRecordingId=job.id;
      const format=job.mp4?'mp4':'webm';
      download.href=`/recording/${job.id}/file?format=${format}`;download.download='meeting-'+job.id+'.'+format;download.hidden=false;
      if(job.state==='converting')notify('WebM 저장 완료 · MP4 변환 중. ⚙에서 상태를 확인하세요.');
      else if(job.state==='conversion_failed')notify('MP4 변환 실패 · WebM 보존. ⚙에서 재시도하세요.');
      else {download.click();notify(reason||'녹화 파일 저장 완료 · ↓로 다운로드');}
    },
    onError:notify
  });
  addEventListener('beforeunload',e=>{if(recorder.active){e.preventDefault();e.returnValue='';}});
  for(const [id,title] of [['sound','소리 켜기/끄기'],['full','전체 화면 (F)'],['stop','중계 끊기/다시 연결']]){const b=document.getElementById(id);if(b){b.title=title;b.setAttribute('aria-label',title);tools.append(b);}}
  const soundButton=document.querySelector('#sound');
  let previousConnected,previousSound;
  function syncIndicators(){
    const state=getRelayState();
    const connected=Boolean(state.connected&&video.srcObject?.getVideoTracks().some(t=>t.readyState==='live'&&!t.muted));
    if(connected!==previousConnected){
      previousConnected=connected;connection.dataset.connected=String(connected);
      connection.innerHTML='<span class="connection-dot" aria-hidden="true"></span><span>'+(connected?'LIVE':'OFF')+'</span>';
      connection.title=connected?'영상 연결됨':'영상 연결 끊김 / 연결 대기';connection.setAttribute('aria-label',connection.title);
    }
    const enabled=Boolean(state.sound);
    // Receiver click handlers may replace button text; restore the icon immediately.
    if(soundButton&&(enabled!==previousSound||!soundButton.querySelector('svg'))){
      previousSound=enabled;soundButton.innerHTML=enabled?speakerOn:speakerOff;
      soundButton.title=enabled?'소리 켜짐 · 눌러서 끄기':'소리 꺼짐 · 눌러서 켜기';
      soundButton.setAttribute('aria-label',soundButton.title);soundButton.setAttribute('aria-pressed',String(enabled));
    }
  }
  soundButton?.addEventListener('click',()=>{if(video.paused)getAudios().forEach(a=>a.pause());syncIndicators();});
  syncIndicators();
  const indicatorTimer=setInterval(syncIndicators,500);
  addEventListener('pagehide',()=>clearInterval(indicatorTimer),{once:true});
  const full=document.querySelector('#full');if(full)full.onclick=()=>{if(document.fullscreenElement)document.exitFullscreen();else if(document.documentElement.requestFullscreen)document.documentElement.requestFullscreen().catch(()=>notify('전체 화면을 사용할 수 없습니다'));else video.webkitEnterFullscreen?.();};
  function bounds(){const w=stage.clientWidth,h=stage.clientHeight;const fit=video.videoWidth?Math.min(w/video.videoWidth,h/video.videoHeight):1;return{mx:Math.max(0,video.videoWidth*fit*scale-w)/2,my:Math.max(0,video.videoHeight*fit*scale-h)/2};}
  function render(){const b=bounds();x=Math.max(-b.mx,Math.min(b.mx,x));y=Math.max(-b.my,Math.min(b.my,y));video.style.transform=`translate(${x}px,${y}px) scale(${scale})`;reset.textContent=Math.round(scale*100)+'%';reset.setAttribute('aria-label',`확대 ${Math.round(scale*100)}%, 눌러서 화면 맞춤`);plus.disabled=scale>=8;}
  function zoom(next,cx=stage.clientWidth/2,cy=stage.clientHeight/2){next=Math.max(1,Math.min(8,next));const ratio=next/scale;x=(cx-stage.clientWidth/2)*(1-ratio)+x*ratio;y=(cy-stage.clientHeight/2)*(1-ratio)+y*ratio;scale=next;render();}
  stage.addEventListener('wheel',e=>{e.preventDefault();zoom(scale*Math.exp(-e.deltaY*(e.ctrlKey ? .012 : .002)),e.clientX,e.clientY);},{passive:false});
  const points=new Map();let previous=null;
  const gesture=()=>{const ps=[...points.values()];return ps.length>1?{cx:(ps[0].x+ps[1].x)/2,cy:(ps[0].y+ps[1].y)/2,d:Math.hypot(ps[0].x-ps[1].x,ps[0].y-ps[1].y)}:ps.length?{cx:ps[0].x,cy:ps[0].y,d:0}:null;};
  stage.onpointerdown=e=>{points.set(e.pointerId,{x:e.clientX,y:e.clientY});stage.setPointerCapture(e.pointerId);previous=gesture();};
  stage.onpointermove=e=>{if(!points.has(e.pointerId))return;points.set(e.pointerId,{x:e.clientX,y:e.clientY});const g=gesture();if(previous){if(g.d&&previous.d)zoom(scale*g.d/previous.d,g.cx,g.cy);else{x+=g.cx-previous.cx;y+=g.cy-previous.cy;render();}}previous=g;};
  stage.onpointerup=stage.onpointercancel=e=>{points.delete(e.pointerId);previous=gesture();};
  let gestureScale=1;
  stage.addEventListener('gesturestart',e=>{e.preventDefault();gestureScale=scale;},{passive:false});
  stage.addEventListener('gesturechange',e=>{e.preventDefault();zoom(gestureScale*e.scale,e.clientX||stage.clientWidth/2,e.clientY||stage.clientHeight/2);},{passive:false});
  stage.ondblclick=()=>{scale=1;x=y=0;render();};
  const sync=()=>{play.textContent=video.paused?'▶':'Ⅱ';play.title=video.paused?'재생 (Space)':'일시정지 (Space)';play.setAttribute('aria-label',play.title);getAudios().forEach(a=>{if(video.paused)a.pause();else a.play().catch(()=>{});});};
  video.addEventListener('pause',sync);video.addEventListener('play',sync);video.addEventListener('resize',render);addEventListener('resize',render);
  const status=document.getElementById('status');if(status)new MutationObserver(()=>{if(!status.textContent.startsWith('영상 재생'))notify(status.textContent);}).observe(status,{childList:true,subtree:true,characterData:true});
  document.addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey||/INPUT|TEXTAREA/.test(e.target.tagName))return;const k=e.key.toLowerCase();if(k===' '){e.preventDefault();play.click();}else if(k==='+'||k==='=')zoom(scale*1.25);else if(k==='-')zoom(scale/1.25);else if(k==='0')reset.click();else if(k==='s')document.querySelector('#snapshot').click();else if(k==='f')full?.click();else if(k==='r')record.click();});
  sync();render();notify('휠·핀치로 확대 · 드래그로 이동 · 0으로 화면 맞춤');
}
