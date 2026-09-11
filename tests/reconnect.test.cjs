const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');

for(const state of ['disconnected','connecting']) test(`Whale retries ${state} without refresh`,async()=>{
  const timers=[],sent=[],originals=[],urls=[],events={};let incoming=[];
  const track=kind=>({kind,readyState:'live',stopped:false,stop(){this.stopped=true;this.readyState='ended';},clone(){return track(kind);}});
  const sourceVideo=track('video'),sourceAudio=track('audio');originals.push(sourceVideo,sourceAudio);
  const source={videoWidth:1920,videoHeight:1080,srcObject:{getVideoTracks:()=>[sourceVideo]}};
  const label={},button={},host={style:{},isConnected:false,attachShadow(){return{set innerHTML(v){},querySelector:s=>s==='span'?label:button};},remove(){this.isConnected=false;}};
  class Peer{
    constructor(){this.connectionState='new';this.iceGatheringState='complete';this.senders=[];}
    addTrack(t){this.senders.push({track:t,getParameters:()=>({encodings:[{}]}),setParameters:async()=>{}});}
    getSenders(){return this.senders;}
    async createOffer(){return{type:'offer',sdp:'test'};}
    async setLocalDescription(d){this.localDescription=d;}
    async setRemoteDescription(d){this.remoteDescription=d;this.connectionState='connected';}
    close(){this.connectionState='closed';}
  }
  let serial=0;
  const context={window:{addEventListener:(name,fn)=>{events[name]=fn;},removeEventListener(){},dispatchEvent(){}},CustomEvent:class{},location:{pathname:'/in/test'},document:{createElement:()=>host,body:{append(){host.isConnected=true;}},querySelectorAll:s=>s==='video'?[source]:[{srcObject:{getAudioTracks:()=>[sourceAudio]}}]},
    RTCPeerConnection:Peer,MediaStream:class{},crypto:{randomUUID:()=>String(++serial)},AbortSignal:{timeout:()=>null},
    setTimeout:fn=>{timers.push(fn);return 1;},clearTimeout(){},console,
    fetch:async(url,options)=>{urls.push(url);if(options?.method){sent.push(JSON.parse(options.body));return{ok:true,json:async()=>({})};}const result=incoming;incoming=[];return{ok:true,json:async()=>result};}};
  let now=0;context.Date={now:()=>now};
  const flush=()=>new Promise(r=>setImmediate(r));
  incoming=[{session:'A',payload:{hello:true}},{session:'B',payload:{hello:true}}];
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../extension/relay.js'),'utf8'),context);
  await flush();await flush();
  const relay=context.window.__whaleAutoRelay;
  assert.equal(relay.peers.size,2);
  assert.equal(sent.length,2);
  assert.notEqual(sent[0].payload.epoch,sent[1].payload.epoch);
  const first=relay.peers.get('A');
  first.pc.connectionState=state;
  const before=sent.length;
  for(let i=0;i<20;i++) {
    now+=2500;
    incoming=[{session:'A',payload:{hello:true}}];
    timers.shift()();await flush();await flush();
  }
  assert.ok(sent.length>before,'No fresh offer after 20 heartbeats while disconnected');
  relay.stop();

});

