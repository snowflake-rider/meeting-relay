/* Sequential, acknowledged upload. Retrying the same sequence never duplicates bytes. */
async function createDiskUpload(mime) {
  async function request(path, body, token, raw = false) {
    const response = await fetch(path, {method:body === undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':raw?'application/octet-stream':'application/json','X-Recording-Token':token},body:body===undefined?undefined:raw?body:JSON.stringify(body),signal:AbortSignal.timeout(15000),keepalive:path.endsWith('/abort')});
    const data = await response.json();
    if (!response.ok) throw Error(data.error || '녹화 저장 서버 오류');
    return data;
  }
  const settings=await request('/recording/settings');
  const job=await request('/recording/start',{mime},settings.token);
  let sequence=0;
  return {
    job,
    async append(blob){
      for(let offset=0;offset<blob.size;offset+=4*1024*1024){
        const chunk=blob.slice(offset,offset+4*1024*1024);
        for(let attempt=0;;attempt++){
          try{await request(`/recording/${job.id}/chunk?seq=${sequence}`,chunk,settings.token,true);break;}
          catch(error){if(attempt===2)throw error;await new Promise(r=>setTimeout(r,400*(attempt+1)));}
        }
        sequence++;
      }
    },
    heartbeat:()=>request(`/recording/${job.id}/heartbeat`,{},settings.token),
    finish:()=>request(`/recording/${job.id}/finish`,{chunks:sequence},settings.token),
    abort:()=>request(`/recording/${job.id}/abort`,{},settings.token),
    status:()=>request(`/recording/${job.id}/status`)
  };
}
