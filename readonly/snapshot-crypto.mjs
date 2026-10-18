const enc=new TextEncoder(),dec=new TextDecoder();
const MAX=128*1024*1024;
const b64=bytes=>{let s='';for(let i=0;i<bytes.length;i+=16384)s+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(s);};
const un64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
async function key(password,salt,iterations){const material=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
const aad=(m,index)=>enc.encode(JSON.stringify([m.format,m.revision,m.published,m.encoding,m.parts.length,index]));
export async function sealSnapshot(state,password,{revision,published=new Date().toISOString(),chunkSize=256*1024}={}){
 if(!password||!Number.isSafeInteger(revision)||revision<0||chunkSize<1024)throw Error('发布参数无效');
 let bytes=enc.encode(JSON.stringify(state));if(bytes.length>MAX)throw Error('快照超过 128 MB');
 const compressed=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
 const salt=crypto.getRandomValues(new Uint8Array(16)),iterations=600000,k=await key(password,salt,iterations);
 const manifest={format:'hstc.readonly.v1',revision,published,encoding:'gzip',salt:b64(salt),iterations,parts:[]};
 for(let offset=0;offset<compressed.length;offset+=chunkSize)manifest.parts.push({file:`data/part-${manifest.parts.length}.bin`});
 const files=new Map();
 for(let i=0;i<manifest.parts.length;i++){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(manifest,i)},k,compressed.subarray(i*chunkSize,(i+1)*chunkSize)));
  files.set(manifest.parts[i].file,ciphertext);Object.assign(manifest.parts[i],{iv:b64(iv),sha256:hex(new Uint8Array(await crypto.subtle.digest('SHA-256',ciphertext)))});
 }
 return {manifest,files};
}
export async function openSnapshot(manifest,password,load){
 if(manifest?.format!=='hstc.readonly.v1'||manifest.encoding!=='gzip'||!Number.isSafeInteger(manifest.revision)||manifest.revision<0||!Number.isFinite(Date.parse(manifest.published))||manifest.iterations!==600000||!Array.isArray(manifest.parts)||manifest.parts.length<1||manifest.parts.length>1024)throw Error('快照目录无效');
 const salt=un64(manifest.salt);if(salt.length!==16)throw Error('加密参数无效');const k=await key(password,salt,manifest.iterations),decoded=[];let size=0;
 for(let i=0;i<manifest.parts.length;i++){
  const p=manifest.parts[i];if(p.file!==`data/part-${i}.bin`||! /^[a-f0-9]{64}$/.test(p.sha256))throw Error('快照文件地址无效');
  const iv=un64(p.iv);if(iv.length!==12)throw Error('加密参数无效');const bytes=new Uint8Array(await load(p.file));size+=bytes.length;if(size>MAX||bytes.length>1024*1024)throw Error('快照过大');
  if(hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))!==p.sha256)throw Error('快照尚未完整更新，请稍后重试');
  try{decoded.push(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:aad(manifest,i)},k,bytes));}catch{throw Error('M 码不正确或快照校验失败');}
 }
 const reader=new Blob(decoded).stream().pipeThrough(new DecompressionStream('gzip')).getReader();let total=0;const chunks=[];
 for(;;){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;if(total>MAX){await reader.cancel();throw Error('解压数据超过限制');}chunks.push(value);}
 const state=JSON.parse(dec.decode(await new Blob(chunks).arrayBuffer()));
 if(!state||!Array.isArray(state.tx)||!Array.isArray(state.productReports)||!state.tx.every(row=>row&&typeof row==='object')||!state.productReports.every(report=>report&&Array.isArray(report.items)))throw Error('快照数据格式无效');return state;
}
// Only fields needed for viewing are published; omit transaction fingerprints and import settings.
export function viewingState(state){
 return {tx:(state.tx||[]).map(({date,acct,site,cur,amount,cat,type,desc,order,sku,status,f})=>({date,acct,site,cur,amount,cat,type,desc,order,sku,status,f})),productReports:state.productReports||[],set:{base:state.set?.base||'USD',rates:Object.fromEntries(Object.entries(state.set?.rates||{}).filter(([code,value])=>/^[A-Z]{3}$/.test(code)&&Number.isFinite(Number(value))&&Number(value)>0).map(([code,value])=>[code,Number(value)]))}};
}
