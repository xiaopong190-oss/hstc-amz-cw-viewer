// Assemble a single revision from bounded requests; never mix revisions.
export async function readLedger({request,revision=null,progress=()=>{}}){
  async function get(path){
    for(let attempt=0;;attempt++){
      try{return await request(path);}catch(error){
        if(attempt>=1||error.name==='AbortError'||error.code==='snapshot_changed'||error.status&&error.status<500)throw error;
      }
    }
  }
  for(let attempt=0;attempt<2;attempt++){
    try{
      const manifest=await get('/api/ledger/manifest?protocol=records.v1'+(revision!==null?'&revision='+encodeURIComponent(revision):''));
      if(manifest.legacy)return get('/api/ledger');
      if(manifest.unchanged)return manifest;
      if(!Number.isSafeInteger(manifest.parts)||manifest.parts<1||manifest.parts>4096||typeof manifest.upload!=='string')throw Error('云端分块目录无效，请下载备份后重试');
      const parts=new Array(manifest.parts);let next=0,finished=0;
      await Promise.all(Array.from({length:Math.min(3,parts.length)},async()=>{
        while(next<parts.length){
          const index=next++,part=await get('/api/ledger/part?upload='+encodeURIComponent(manifest.upload)+'&part='+index);
          if(part.revision!==manifest.revision||part.part!==index||typeof part.data!=='string')throw Error('云端分块不完整，请重试');
          parts[index]=part.data;progress(++finished,parts.length);
        }
      }));
      return {revision:manifest.revision,payload:manifest.format==='records.v1'?assembleRecords(parts):JSON.parse(parts.join(''))};
    }catch(error){if(error.code!=='snapshot_changed'||attempt===1)throw error;}
  }
}
import {assembleRecords} from './record-transfer.mjs';
