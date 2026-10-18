import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readLedger} from '../shared-site/worker/read-ledger.mjs';
import {sealSnapshot,viewingState} from './snapshot-crypto.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
export async function buildReadonly({origin,password,viewerPassword=password,output=path.join(here,'dist'),fetcher=fetch}){
 const url=new URL(origin);if(url.protocol!=='https:'||url.pathname!=='/'||url.search||url.hash)throw Error('请输入管理端 HTTPS 根网址');
 if(!password||!viewerPassword)throw Error('缺少发布密钥');
 const response=await fetcher(new URL('/login',url),{method:'POST',redirect:'manual',headers:{Origin:url.origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({password}),signal:AbortSignal.timeout(60000)});
 if(response.status!==303)throw Error(`管理端登录失败 HTTP ${response.status}`);
 const cookie=response.headers.get('set-cookie')?.split(';')[0];if(!cookie)throw Error('管理端未返回会话');
 const saved=await readLedger({request:async route=>{const r=await fetcher(new URL(route,url),{headers:{Cookie:cookie},redirect:'error',signal:AbortSignal.timeout(60000)});if(!r.ok)throw Object.assign(Error(`读取云端失败 HTTP ${r.status}`),{status:r.status});return r.json();}});
 if(!saved.payload||!Number.isSafeInteger(saved.revision)||saved.revision<1)throw Error('云端尚无已确认账本，本次不发布');
 const {manifest,files}=await sealSnapshot(viewingState(saved.payload),viewerPassword,{revision:saved.revision});
 await fs.mkdir(path.join(output,'data'),{recursive:true});
 for(const [name,bytes] of files)await fs.writeFile(path.join(output,name),bytes);
 for(const name of ['index.html','viewer.css','snapshot-crypto.mjs'])await fs.copyFile(path.join(here,name),path.join(output,name));
 await fs.writeFile(path.join(output,'viewer.mjs'),(await fs.readFile(path.join(here,'viewer.mjs'),'utf8')).replace('../shared-site/worker/product-fields.mjs','./product-fields.mjs'));
 for(const name of ['product-fields.mjs','products-core.mjs'])await fs.copyFile(path.join(here,'../shared-site/worker',name),path.join(output,name));
 await fs.writeFile(path.join(output,'snapshot.json'),JSON.stringify(manifest));await fs.writeFile(path.join(output,'.nojekyll'),'');
 return {revision:manifest.revision,parts:manifest.parts.length,published:manifest.published};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(await buildReadonly({origin:process.env.LEDGER_ORIGIN||'https://hstc-amz-cw.akolojutet24.chatgpt.site/',password:process.env.LEDGER_PASSWORD,viewerPassword:process.env.VIEWER_PASSWORD||process.env.LEDGER_PASSWORD,output:process.env.READONLY_OUTPUT})));}catch(error){console.error(error.message);process.exitCode=1;}
}
