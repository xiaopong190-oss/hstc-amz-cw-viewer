import {compactSnapshot,sha256} from './key-core.mjs';
const encoder=new TextEncoder();
const size=value=>encoder.encode(JSON.stringify(value)).length;
export function splitRecords(payload,limit=480000){
 const state=compactSnapshot(payload),{tx,productReports=[],productMappings=[],...base}=state;
 const parts=[{kind:'base',value:base}];
 if(size(parts[0])>limit)throw Error('账本设置过大，请下载备份后检查设置');
 function pack(rows,make){let batch=[],bytes=size(make([]));for(const row of rows){const amount=size(row)+1;if(amount+size(make([]))>limit)throw Error('一条记录过大，无法分批保存，请保留备份');if(bytes+amount>limit){parts.push(make(batch));batch=[];bytes=size(make([]));}batch.push(row);bytes+=amount;if(parseInt(sha256(JSON.stringify(row)).slice(0,4),16)%64===0){parts.push(make(batch));batch=[];bytes=size(make([]));}}if(batch.length)parts.push(make(batch));}
 pack(tx,rows=>({kind:'tx',rows}));
 productReports.forEach((report,group)=>{const {items,...meta}=report;pack(items,items=>({kind:'report',group,report:{...meta,items}}));});
 pack(productMappings,rows=>({kind:'mappings',rows}));
 if(parts.length>4096||parts.reduce((sum,part)=>sum+size(part),0)>128*1024*1024)throw Error('本次账本超过 128 MB，请保留备份后联系维护者扩容');
 return parts;
}
export function assembleRecords(parts){
 let state=null;const tx=[],mappings=[],reports=new Map();
 for(const raw of parts){const part=typeof raw==='string'?JSON.parse(raw):raw;
  if(part.kind==='base'){if(state)throw Error('云端账本设置重复');state=part.value;}
  else if(part.kind==='tx')for(const row of part.rows)tx.push(row);
  else if(part.kind==='mappings')for(const row of part.rows)mappings.push(row);
  else if(part.kind==='report'){if(!reports.has(part.group))reports.set(part.group,{...part.report,items:[]});for(const item of part.report.items)reports.get(part.group).items.push(item);}
  else throw Error('云端记录类型无效');
 }
 if(!state)throw Error('云端账本设置缺失');
 return {...state,tx,productReports:[...reports.entries()].sort((a,b)=>a[0]-b[0]).map(([,report])=>report),productMappings:mappings};
}
let pending=null;
export async function writeLedger({payload,revision,request,progress=()=>{}}){
 const parts=splitRecords(payload),hashes=parts.map(part=>sha256(JSON.stringify(part))),fingerprint=sha256(hashes.join('|'));
 const bytes=parts.map(size);
 async function send(method,path,body){for(let attempt=0;;attempt++){try{return await request(method,path,body);}catch(error){if(attempt||error.name==='AbortError'||error.status&&error.status<500)throw error;}}}
 for(let restart=0;restart<2;restart++){
  try{
   if(!pending||pending.revision!==revision||pending.fingerprint!==fingerprint){const result=await send('POST','/api/ledger/uploads',{revision,parts:parts.length,hashes});const reused=Array.isArray(result.reused)?result.reused:[];pending={upload:result.upload,revision,fingerprint,done:new Set(reused),reused:new Set(reused)};}
   const session=pending;let next=0;
   const result=await Promise.allSettled(Array.from({length:Math.min(3,parts.length)},async()=>{while(next<parts.length){const index=next++;if(!session.done.has(index)){await send('PUT',`/api/ledger/uploads/${session.upload}/parts/${index}`,parts[index]);session.done.add(index);}progress(session.done.size,parts.length,false,{reused:session.reused.size,uploaded:[...session.done].filter(i=>!session.reused.has(i)).reduce((n,i)=>n+bytes[i],0)});}}));
   const failure=result.find(row=>row.status==='rejected');if(failure)throw failure.reason;
   progress(parts.length,parts.length,true);
   const saved=await send('POST',`/api/ledger/uploads/${session.upload}/commit`,{});pending=null;return saved;
  }catch(error){if(error.status===404&&restart===0){pending=null;continue;}if(error.code==='missing_parts'&&restart===0){pending.done.clear();pending.reused.clear();continue;}if(error.code==='40001')pending=null;throw error;}
 }
}
