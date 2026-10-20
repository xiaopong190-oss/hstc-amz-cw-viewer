import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export async function checkUpdate({origin,token,publishedURL,fetcher=fetch}){
 const url=new URL(origin),published=new URL(publishedURL);
 if(url.origin!=='https://hstc-amz-cw.akolojutet24.chatgpt.site'||published.origin!=='https://xiaopong190-oss.github.io')throw Error('更新来源不在允许范围');
 if(!token)throw Error('未配置只读发布凭据');
 async function get(target,headers={}){const r=await fetcher(target,{headers,redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error(`版本检查失败 HTTP ${r.status}`);const raw=await r.text();if(raw.length>65536)throw Error('版本目录超过 64 KiB，已中断');return JSON.parse(raw);}
 const cloud=await get(new URL('/api/readonly/ledger/manifest?protocol=records.v1',url),{Authorization:'Bearer '+token});
 if(!Number.isSafeInteger(cloud.revision)||cloud.revision<1||!Number.isSafeInteger(cloud.parts)||cloud.parts<1||cloud.parts>4096)throw Error('云端版本或分块数量超限，已中断');
 published.searchParams.set('check',String(Date.now()));const current=await get(published);
 if(!Number.isSafeInteger(current.revision)||current.revision<1)throw Error('展示端版本无效，已中断');
 if(cloud.revision<current.revision)throw Error('云端版本倒退，已中断并保留展示数据');
 return {changed:cloud.revision>current.revision};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const result=await checkUpdate({origin:process.env.LEDGER_ORIGIN,token:process.env.READONLY_EXPORT_TOKEN,publishedURL:'https://xiaopong190-oss.github.io/hstc-amz-cw-viewer/snapshot.json'});if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,`changed=${result.changed}\n`);console.log(result.changed?'云端已有更新，准备发布':'版本未变化，跳过下载和发布');}
 catch(error){console.error('::error::'+error.message);process.exitCode=1;}
}
