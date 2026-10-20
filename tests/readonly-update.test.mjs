import test from 'node:test';
import assert from 'node:assert/strict';
import {checkUpdate} from '../readonly/check-update.mjs';
const base={origin:'https://hstc-amz-cw.akolojutet24.chatgpt.site/',token:'TEST',publishedURL:'https://xiaopong190-oss.github.io/hstc-amz-cw-viewer/snapshot.json'};
function options(cloud,current){return {...base,fetcher:async(url,init)=>{const admin=new URL(url).hostname.endsWith('chatgpt.site');assert.equal(init.headers.Authorization,admin?'Bearer TEST':undefined);assert.equal(init.redirect,'error');return new Response(JSON.stringify(admin?cloud:current));}};}
test('unchanged revision skips publishing; new revision requests publication',async()=>{
 assert.deepEqual(await checkUpdate(options({revision:22,parts:600},{revision:22})),{changed:false});
 assert.deepEqual(await checkUpdate(options({revision:23,parts:600},{revision:22})),{changed:true});
});
test('revision rollback, unsafe revisions and excessive chunks fail closed',async()=>{
 for(const cloud of [{revision:21,parts:1},{revision:NaN,parts:1},{revision:23,parts:4097},{revision:23,parts:0}])await assert.rejects(checkUpdate(options(cloud,{revision:22})));
});
test('network failure and oversized response abort without deployment decision',async()=>{
 await assert.rejects(checkUpdate({...base,fetcher:async()=>new Response('',{status:503})}));
 await assert.rejects(checkUpdate({...base,fetcher:async()=>new Response(' '.repeat(65537))}));
});
test('unapproved origin and missing credential are rejected before network use',async()=>{
 const fetcher=()=>{throw Error('must not fetch');};
 await assert.rejects(checkUpdate({...base,origin:'https://evil.test',fetcher}),/允许范围/);
 await assert.rejects(checkUpdate({...base,token:'',fetcher}),/凭据/);
});
