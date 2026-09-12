const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const flush=()=>new Promise(r=>setImmediate(r));
async function harness(){
  const elements={},sent=[],timers=[];let now=0,failPoll=false;
  class Peer{
    constructor(){this.connectionState='new';this.iceGatheringState='complete';}
    close(){this.connectionState='closed';this.onconnectionstatechange?.();}
    async setRemoteDescription(){} async createAnswer(){return {type:'answer'};}
    async setLocalDescription(d){this.localDescription=d;}
  }
  const context=vm.createContext({document:{querySelector:s=>elements[s]??=({play:async()=>{}})},
    location:{search:''},URLSearchParams,crypto:{randomUUID:()=> 'session'},RTCPeerConnection:Peer,
    MediaStream:class{},Audio:class{},Date:{now:()=>now},AbortSignal,
    addEventListener(){},setInterval(){},clearTimeout(){},setTimeout:f=>{timers.push(f);},
    fetch:async(url,options)=>{if(options?.method){sent.push(JSON.parse(options.body).payload);return {ok:true};}
      if(failPoll)throw Error('temporary failure');return {ok:true,json:async()=>[]};}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../auto-player.js'),'utf8'),context);await flush();
  return {context,elements,sent,timers,advance:ms=>now+=ms,fail:()=>failPoll=true,
    run:code=>vm.runInContext(code,context)};
}
test('receiver restarts a prolonged disconnect but tolerates a brief disconnect',async()=>{
 const h=await harness();await h.run("accept({epoch:'one',offer:{}})");
 h.run("pc.connectionState='disconnected';pc.onconnectionstatechange()");
 h.advance(7000);h.run('heartbeat()');await flush();assert.equal(h.sent.at(-1).restart,undefined);
 h.advance(2000);h.run('heartbeat()');await flush();assert.equal(h.sent.at(-1).restart,'one');assert.equal(h.run('pc'),null);
 await h.run("accept({epoch:'two',offer:{}})");h.run("pc.connectionState='connected';pc.onconnectionstatechange();heartbeat()");
 await flush();assert.equal(h.sent.at(-1).restart,undefined);
});
test('receiver requests recovery for stalled negotiation and preserves healthy media on poll failure',async()=>{
 const h=await harness();await h.run("accept({epoch:'one',offer:{}})");h.advance(21000);h.run('heartbeat()');await flush();assert.equal(h.sent.at(-1).restart,'one');
 await h.run("accept({epoch:'two',offer:{}})");h.run("pc.connectionState='connected'");const peer=h.run('pc');
 h.fail();h.timers.shift()();await flush();assert.equal(h.run('pc'),peer);
 h.elements['#stop'].onclick();await h.run("accept({epoch:'late',offer:{}})");assert.equal(h.run('pc'),null);
});

async function mediaHarness(){
 const h=await harness();await h.run("accept({epoch:'media',offer:{}})");
 h.run("pc.connectionState='connected';pc.onconnectionstatechange()");
 const track={readyState:'live',muted:false};
 h.elements.video.paused=false;h.elements.video.srcObject={getVideoTracks:()=>[track]};
 const peer=h.run('pc');
 let received=10,decoded=10;
 peer.getStats=async()=>new Map([['v',{id:'v',type:'inbound-rtp',kind:'video',framesReceived:received,framesDecoded:decoded}]]);
 return {...h,track,peer,stats:(r,d)=>{received=r;decoded=d;},sample:async(ms=2500)=>{
   h.advance(ms);await h.run('inspectMedia()');h.run('heartbeat()');await flush();
 }};
}
for(const state of ['muted','ended'])test(`receiver recovers connected transport with prolonged ${state} video`,async()=>{
 const h=await mediaHarness();if(state==='muted')h.track.muted=true;else h.track.readyState='ended';
 await h.sample();await h.sample(19000);assert.equal(h.run('pc'),h.peer);
 await h.sample(1000);assert.equal(h.run('pc'),null);assert.equal(h.sent.at(-1).restart,'media');
});
test('media recovery tolerates brief mute and static slides with no RTP progress',async()=>{
 const h=await mediaHarness();h.track.muted=true;await h.sample();await h.sample(10000);
 h.track.muted=false;await h.sample();
 for(let i=0;i<30;i++)await h.sample();
 assert.equal(h.run('pc'),h.peer);assert.ok(h.sent.every(p=>!p.restart));
});
test('media recovery respects intentional pause and resets suspicion when decoding resumes',async()=>{
 const h=await mediaHarness();h.track.muted=true;await h.sample();
 h.elements.video.paused=true;await h.sample(60000);assert.equal(h.run('pc'),h.peer);
 h.elements.video.paused=false;h.track.muted=false;await h.sample();
 for(let i=1;i<5;i++){h.stats(10+i,10);await h.sample();}
 h.stats(16,11);await h.sample();
 for(let i=0;i<8;i++){h.stats(17+i,12+i);await h.sample();}
 assert.equal(h.run('pc'),h.peer);assert.ok(h.sent.every(p=>!p.restart));
});
test('receiver restarts a decoder stalled while complete RTP frames continue arriving',async()=>{
 const h=await mediaHarness();await h.sample();
 for(let i=1;i<=9;i++){h.stats(10+i,10);await h.sample();}
 assert.equal(h.run('pc'),null);assert.equal(h.sent.at(-1).restart,'media');
});
test('late media stats from an old peer cannot reset a new peer',async()=>{
 const h=await mediaHarness();let resolve;h.peer.getStats=()=>new Promise(r=>resolve=r);
 const pending=h.run('inspectMedia()');
 await h.run("accept({epoch:'replacement',offer:{}})");const replacement=h.run('pc');
 resolve(new Map());await pending;h.run('heartbeat()');await flush();
 assert.equal(h.run('pc'),replacement);assert.equal(h.sent.at(-1).restart,undefined);
});
