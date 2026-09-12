const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
test('disk uploader splits large blobs and retries the same sequence before advancing',async()=>{
 const requests=[];let failed=false;
 const context=vm.createContext({AbortSignal,Error,JSON,setTimeout(fn){fn();},fetch:async(url,options)=>{
  requests.push({url,options});
  if(url==='/recording/settings')return {ok:true,json:async()=>({token:'secret'})};
  if(url==='/recording/start')return {ok:true,json:async()=>({id:'test'})};
  if(url.includes('chunk?seq=0')&&!failed){failed=true;throw Error('response lost');}
  return {ok:true,json:async()=>({state:'complete'})};
 }});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../recording-upload.js'),'utf8'),context);
 const upload=await context.createDiskUpload('video/webm');
 await upload.heartbeat();
 assert.equal(requests.at(-1).url,'/recording/test/heartbeat');
 assert.equal(requests.at(-1).options.headers['X-Recording-Token'],'secret');
 await upload.append(new Blob([new Uint8Array(5*1024*1024)]));await upload.finish();
 const chunks=requests.filter(r=>r.url.includes('/chunk'));
 assert.deepEqual(chunks.map(r=>r.url),['/recording/test/chunk?seq=0','/recording/test/chunk?seq=0','/recording/test/chunk?seq=1']);
 assert.ok(chunks.every(r=>r.options.body.size<=4*1024*1024));
 assert.equal(JSON.parse(requests.at(-1).options.body).chunks,2);
 assert.equal(chunks[0].options.headers['X-Recording-Token'],'secret');
});
