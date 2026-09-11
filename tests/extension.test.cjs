const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');

test('relay clones tracks, isolates receivers, and stops without ending meeting tracks',async()=>{
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
  const flush=()=>new Promise(r=>setImmediate(r));
  incoming=[{session:'A',payload:{hello:true}},{session:'B',payload:{hello:true}}];
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../extension/relay.js'),'utf8'),context);
  await flush();await flush();
  const relay=context.window.__whaleAutoRelay;
  assert.equal(relay.peers.size,2);
  assert.equal(sent.length,2);
  assert.notEqual(sent[0].payload.epoch,sent[1].payload.epoch);
  const first=relay.peers.get('A');
  assert.notEqual(first.tracks[0],sourceVideo);
  incoming=[{session:'A',payload:{stop:true}}];timers.shift()();await flush();
  assert.equal(relay.peers.has('A'),false);
  assert.equal(relay.peers.has('B'),true);
  assert.ok(first.tracks.every(t=>t.stopped));
  events['whale-relay-config']({detail:'18749'});
  assert.equal(relay.peers.size,0);
  timers.shift()();await flush();
  assert.ok(urls.at(-1).startsWith('http://127.0.0.1:18749/'));
  events['whale-relay-config']({detail:'https://evil.example'});
  timers.shift()();await flush();
  assert.ok(urls.at(-1).startsWith('http://127.0.0.1:18749/'));
  relay.stop();
  assert.ok(originals.every(t=>!t.stopped));
  assert.equal(context.window.__whaleAutoRelay,undefined);
});

test('isolated settings bridge restores port and ignores stale async storage reads',async()=>{
  const events={},sent=[],pending=[];let change;
  const context={window:{addEventListener:(n,f)=>events[n]=f,dispatchEvent:e=>sent.push(e.detail)},
    CustomEvent:class{constructor(type,options){this.detail=options.detail;}},
    chrome:{storage:{local:{get:()=>new Promise(r=>pending.push(r))},onChanged:{addListener:f=>change=f}}}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../extension/config.js'),'utf8'),context);
  pending.shift()({relayPort:18749});await new Promise(r=>setImmediate(r));
  assert.deepEqual(sent,['18749']);
  events['whale-relay-ready']();
  change({relayPort:{newValue:18747}},'local');
  pending.shift()({relayPort:18749});await new Promise(r=>setImmediate(r));
  assert.deepEqual(sent,['18749','18747']);
  change({relayPort:{newValue:'https://evil.example'}},'local');
  assert.equal(sent.length,2);
  change({relayPort:{}},'local');
  assert.equal(sent.at(-1),'18745');
});
