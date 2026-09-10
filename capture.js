'use strict';
const startButton = document.getElementById('start');
const stopButton = document.getElementById('stop');
const status = document.getElementById('status');
const audioNote = document.getElementById('audio-note');
const preview = document.getElementById('preview');
const player = document.getElementById('player');
player.href = location.origin + '/?source=meet'; player.textContent = player.href;
let stream = null, sender = null, generation = 0;
async function request(path, body) {
  const response = await fetch(path, {method:body === undefined ? 'GET' : 'POST', headers:body === undefined ? {} : {'Content-Type':'application/json'}, body:body === undefined ? undefined : JSON.stringify(body), signal:AbortSignal.timeout(3000)});
  if (!response.ok) throw new Error('Server ' + response.status);
  return response.json();
}
function stop() {
  generation++;
  sender?.stop(); sender = null;
  stream?.getTracks().forEach(t => t.stop()); stream = null;
  preview.srcObject = null;
  startButton.disabled = false; stopButton.disabled = true;
  status.textContent = '중계를 중지했습니다. Meet 회의는 유지됩니다.';
  audioNote.textContent = '';
}
startButton.onclick = async () => {
  if (startButton.disabled) return;
  if (!navigator.mediaDevices?.getDisplayMedia) { status.textContent = 'Chrome에서 이 페이지를 열어주세요. 탭 공유를 지원하지 않습니다.'; return; }
  const token = ++generation;
  startButton.disabled = true;
  status.textContent = '선택 창에서 Meet 탭과 탭 오디오 공유를 선택하세요.';
  let selected;
  try {
    // Must run directly from the user gesture, before any network awaits.
    selected = await navigator.mediaDevices.getDisplayMedia({video:{displaySurface:'browser',frameRate:{ideal:30,max:30}},audio:{suppressLocalAudioPlayback:false},selfBrowserSurface:'exclude',surfaceSwitching:'exclude',monitorTypeSurfaces:'exclude',systemAudio:'exclude'});
    if (token !== generation) { selected.getTracks().forEach(t => t.stop()); return; }
    const video = selected.getVideoTracks()[0];
    if (!video || video.getSettings().displaySurface !== 'browser') throw new Error('전체 화면이나 창 대신 Chrome 탭을 선택하세요.');
    const health = await request('/health');
    if (!health.features?.includes('meet-tab-capture')) throw new Error('Google Meet 기능 브랜치의 서버를 실행하세요.');
    if (token !== generation || video.readyState !== 'live') { selected.getTracks().forEach(t => t.stop()); stop(); return; }
    stream = selected; preview.srcObject = stream; preview.play().catch(() => {});
    stopButton.disabled = false;
    audioNote.textContent = stream.getAudioTracks().length ? '탭 오디오 포함 · 미리보기는 음소거입니다.' : '오디오가 없습니다. 소리가 필요하면 중지 후 탭 오디오 공유를 켜고 다시 선택하세요.';
    video.addEventListener('ended', stop, {once:true});
    sender = createCaptureSender(stream, {request, onStatus(text) { status.textContent = text; }});
  } catch (error) {
    selected?.getTracks().forEach(t => t.stop());
    if (token !== generation) return;
    stop();
    status.textContent = error.name === 'NotAllowedError' ? '탭 공유가 취소되었거나 허용되지 않았습니다. 다시 선택할 수 있습니다.' : error.name === 'InvalidStateError' ? '이 탭을 화면 앞에 두고 시작 버튼을 직접 클릭하세요.' : error.message;
  }
};
stopButton.onclick = stop;
document.getElementById('copy').onclick = async () => {
  try { await navigator.clipboard.writeText(player.href); status.textContent = '플레이어 주소를 복사했습니다.'; }
  catch { status.textContent = '위 주소를 직접 복사하세요.'; }
};
addEventListener('pagehide', stop);
addEventListener('beforeunload', event => { if (stream) { event.preventDefault(); event.returnValue = ''; } });
