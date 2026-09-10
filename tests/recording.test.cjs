const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../recording.js'), 'utf8');
function track(kind) { return {kind, readyState:'live', stopped:false, clone(){return track(kind);}, stop(){this.stopped=true;this.readyState='ended';}}; }
function harness({audio=false, supported=true}={}) {
  class Stream { constructor(ts=[]){this.ts=ts;} addTrack(t){this.ts.push(t);} getVideoTracks(){return this.ts.filter(t=>t.kind==='video');} getAudioTracks(){return this.ts.filter(t=>t.kind==='audio');} }
  let instance, tick;
  class Recorder {
    static isTypeSupported(type){return supported && type.startsWith('video/webm');}
    constructor(stream,opts){this.stream=stream;this.mimeType=opts.mimeType;this.state='inactive';instance=this;}
    start(){this.state='recording';}
    stop(){this.state='inactive';this.ondataavailable({data:new Blob(['final'],{type:this.mimeType})});this.onstop();}
  }
  class AudioEngine {
    constructor(){this.state='suspended';}
    createMediaStreamDestination(){return {stream:new Stream([track('audio')])};}
    createMediaStreamSource(){return {connect(){},disconnect(){}};}
    async resume(){this.state='running';}
    async close(){this.state='closed';}
  }
  const v=track('video'), a=track('audio'), video={srcObject:new Stream([v])};
  const audios=audio?[{srcObject:new Stream([a])},{srcObject:new Stream([track('audio')])}]:[];
  const files=[], states=[], errors=[];
  const ctx=vm.createContext({MediaStream:Stream,MediaRecorder:Recorder,AudioContext:AudioEngine,Blob,Date,setInterval(fn){tick=fn;return 1;},clearInterval(){}});
  vm.runInContext(source,ctx);
  const controller=ctx.createRelayRecorder(video,()=>audios,{onFile(...args){files.push(args);},onState(s){states.push(s);},onError(e){errors.push(e);}});
  return {controller,video,v,a,files,states,errors,get recorder(){return instance;},tick(){tick();}};
}
test('final chunk is saved and stopping never ends source tracks',async()=>{
  const h=harness();await h.controller.start();h.controller.stop();
  assert.equal(await h.files[0][0].text(),'final');assert.equal(h.files[0][1],'webm');
  assert.equal(h.v.stopped,false);assert.equal(h.controller.active,false);
  assert.ok(h.recorder.stream.getVideoTracks()[0].stopped);
});
test('all incoming audio is mixed into one recorded track',async()=>{
  const h=harness({audio:true});await h.controller.start();
  assert.equal(h.recorder.stream.getAudioTracks().length,1);
  h.controller.stop();assert.equal(h.a.stopped,false);
});
test('source replacement finalizes the recording',async()=>{
  const h=harness();await h.controller.start();h.video.srcObject=null;h.tick();
  assert.equal(h.controller.active,false);assert.equal(h.files.length,1);
});
test('unsupported formats clean up without stopping original stream',async()=>{
  const h=harness({supported:false});await assert.rejects(h.controller.start());
  assert.equal(h.controller.active,false);assert.equal(h.v.stopped,false);
});
test('size threshold stops and saves rather than growing indefinitely',async()=>{
  const h=harness();await h.controller.start();
  h.recorder.ondataavailable({data:{size:256*1024*1024}});
  assert.equal(h.controller.active,false);assert.match(h.files[0][2],/256 MB/);
});
test('duplicate starts do not create a second recording',async()=>{
  const h=harness();await h.controller.start();const first=h.recorder;
  await h.controller.start();assert.equal(h.recorder,first);h.controller.stop();
});
