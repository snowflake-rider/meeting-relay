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
