const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'../capture-sender.js'),'utf8');
const page = fs.readFileSync(path.join(__dirname,'../capture.js'),'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
function track(kind) {return {kind,readyState:'live',stopped:false,stop(){this.stopped=true;},clone(){return track(kind);},getSettings(){return {displaySurface:'browser'};},addEventListener(){}};}
class Peer {
  constructor(){this.iceGatheringState='complete';this.connectionState='new';}
  addTrack(){}
  async createOffer(){return {type:'offer',sdp:'test'};}
  async setLocalDescription(d){this.localDescription=d;}
  async setRemoteDescription(d){this.remoteDescription=d;this.connectionState='connected';}
  close(){this.connectionState='closed';}
}
test('Meet sender isolates receivers and protects selected capture tracks',async()=>{
  let incoming=[{session:'A',payload:{hello:true}},{session:'B',payload:{hello:true}}];
  const sent=[], originals=[track('video'),track('audio')];
  const context=vm.createContext({MediaStream:class{},RTCPeerConnection:Peer,crypto:require('node:crypto').webcrypto,Date,setInterval(){return 1;},clearInterval(){},setTimeout,clearTimeout});
  vm.runInContext(source,context);
  const sender=context.createCaptureSender({getTracks:()=>originals},{onStatus(){},request:async(url,body)=>{if(body){sent.push(body);return {};}assert.match(url,/channel=meet/);const result=incoming;incoming=[];return result;}});
  await flush();assert.equal(sender.peers.size,2);assert.ok(sent.every(m=>m.channel==='meet'));
  const a=sender.peers.get('A');
  incoming=[{session:'A',payload:{answer:{type:'answer'},epoch:'wrong'}}];await sender.tick();assert.equal(a.pc.remoteDescription,undefined);
  incoming=[{session:'A',payload:{answer:{type:'answer'},epoch:a.epoch}}];await sender.tick();assert.equal(a.pc.connectionState,'connected');
  incoming=[{session:'A',payload:{stop:true}}];await sender.tick();assert.equal(sender.peers.size,1);assert.ok(a.tracks.every(t=>t.stopped));
  sender.stop();assert.equal(sender.peers.size,0);assert.ok(originals.every(t=>!t.stopped));
});
test('a late sender poll after stop cannot create peers',async()=>{
  let resolve;
  const context=vm.createContext({MediaStream:class{},RTCPeerConnection:Peer,crypto:require('node:crypto').webcrypto,Date,setInterval(){return 1;},clearInterval(){},setTimeout,clearTimeout});
  vm.runInContext(source,context);
  const sender=context.createCaptureSender({getTracks:()=>[track('video')]},{onStatus(){},request:()=>new Promise(r=>resolve=r)});
  sender.stop();resolve([{session:'A',payload:{hello:true}}]);await flush();assert.equal(sender.peers.size,0);
});
async function pageHarness(surface='browser',audio=true,reject=false){
  const elements={},listeners={},video=track('video'),sound=track('audio');video.getSettings=()=>({displaySurface:surface});
  const stream={getTracks:()=>audio?[video,sound]:[video],getVideoTracks:()=>[video],getAudioTracks:()=>audio?[sound]:[]};
  let senderStopped=false,senderStarted=false,captureOptions;
  const context=vm.createContext({document:{getElementById:id=>elements[id]||=( {disabled:false,textContent:'',play:async()=>{}} )},location:{origin:'http://127.0.0.1:18747'},navigator:{mediaDevices:{getDisplayMedia:async options=>{captureOptions=options;if(reject)throw Object.assign(Error('cancel'),{name:'NotAllowedError'});return stream;}},clipboard:{writeText:async()=>{}}},AbortSignal,fetch:async()=>({ok:true,json:async()=>({features:['meet-tab-capture']})}),createCaptureSender:()=>{senderStarted=true;return {stop(){senderStopped=true;}};},addEventListener:(event,fn)=>listeners[event]=fn});
  vm.runInContext(page,context);await elements.start.onclick();
  return {elements,video,sound,listeners,get senderStarted(){return senderStarted;},get senderStopped(){return senderStopped;},captureOptions};
}
test('capture requests tab audio, shows missing audio, and stops owned tracks',async()=>{
  const h=await pageHarness('browser',false);
  assert.equal(h.senderStarted,true);assert.match(h.elements['audio-note'].textContent,/오디오가 없습니다/);
  assert.equal(h.captureOptions.selfBrowserSurface,'exclude');
  h.elements.stop.onclick();assert.ok(h.video.stopped&&h.senderStopped);assert.equal(h.elements.start.disabled,false);
});
test('whole-window captures are rejected and disposed',async()=>{
  const h=await pageHarness('window');assert.equal(h.senderStarted,false);assert.ok(h.video.stopped&&h.sound.stopped);assert.match(h.elements.status.textContent,/Chrome 탭/);
});
test('cancelled selection can be retried',async()=>{
  const h=await pageHarness('browser',true,true);assert.equal(h.senderStarted,false);assert.equal(h.elements.start.disabled,false);assert.match(h.elements.status.textContent,/취소/);
});
