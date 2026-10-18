import test from 'node:test';
import assert from 'node:assert/strict';
import {sealSnapshot,openSnapshot,viewingState} from '../readonly/snapshot-crypto.mjs';
import {filterTransactions,currencyTotals,escapeHTML} from '../readonly/viewer.mjs';
import {buildReadonly} from '../readonly/build.mjs';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const state={tx:[{date:'2026-10-01',acct:'A',site:'US',cur:'USD',amount:100,cat:'income',key:'private-fingerprint'},{date:'2026-10-02',acct:'B',site:'CA',cur:'CAD',amount:-10,cat:'expense'}],productReports:[]};
test('encrypted snapshot roundtrip, wrong code and tampered metadata fail closed',async()=>{
 const data=viewingState(state),sealed=await sealSnapshot(data,'test-only-secret',{revision:4});
 const load=file=>sealed.files.get(file);assert.deepEqual(await openSnapshot(sealed.manifest,'test-only-secret',load),JSON.parse(JSON.stringify(data)));
 assert.equal(JSON.stringify(data).includes('private-fingerprint'),false);
 await assert.rejects(openSnapshot(sealed.manifest,'wrong',load),/M 码/);
 await assert.rejects(openSnapshot({...sealed.manifest,revision:5},'test-only-secret',load),/校验/);
 const changed=new Uint8Array(load('data/part-0.bin'));changed[0]^=1;
 await assert.rejects(openSnapshot(sealed.manifest,'test-only-secret',()=>changed),/完整更新/);
});
test('multipart encrypted snapshots preserve product reports and empty ledgers',async()=>{
 const payload={tx:[],productReports:[{account:'A',site:'US',items:Array.from({length:500},(_,i)=>({asin:String(i),raw:{title:crypto.randomUUID()}}))}]};
 const {manifest,files}=await sealSnapshot(payload,'test-only-secret',{revision:1,chunkSize:1024});assert.ok(manifest.parts.length>2);assert.deepEqual(await openSnapshot(manifest,'test-only-secret',p=>files.get(p)),payload);
 const empty=await sealSnapshot({tx:[],productReports:[]},'test-only-secret',{revision:2});assert.deepEqual(await openSnapshot(empty.manifest,'test-only-secret',p=>empty.files.get(p)),{tx:[],productReports:[]});
});
test('invalid manifests and arbitrary fetch paths are rejected before loading',async()=>{
 const sealed=await sealSnapshot({tx:[],productReports:[]},'test-only-secret',{revision:1});let calls=0;
 await assert.rejects(openSnapshot({...sealed.manifest,iterations:1},'test-only-secret',()=>calls++),/目录/);
 const manifest=structuredClone(sealed.manifest);manifest.parts[0].file='https://attacker.test/key';await assert.rejects(openSnapshot(manifest,'test-only-secret',()=>calls++),/地址/);assert.equal(calls,0);
});
test('view filtering, per-currency totals and HTML escaping',()=>{
 assert.equal(filterTransactions(state.tx,{account:'A',from:'2026-10-01',to:'2026-10-01'}).length,1);
 assert.equal(filterTransactions(state.tx,{site:'CA',currency:'USD'}).length,0);
 const totals=currencyTotals([...state.tx,{cur:'USD',amount:-70,cat:'withdraw'}]);assert.equal(totals.length,2);assert.equal(totals[0].net,100);assert.equal(totals[0].transfer,70);assert.equal(totals[1].net,-10);
 assert.equal(escapeHTML('<img src=x onerror="alert(1)">'),'&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});
test('publisher reads only confirmed snapshot and outputs no plaintext or credentials',async()=>{
 const output=await mkdtemp(path.join(os.tmpdir(),'ledger-view-'));const requests=[];
 try{const fetcher=async(url,options={})=>{requests.push({path:new URL(url).pathname,method:options.method||'GET'});if(new URL(url).pathname==='/login')return new Response(null,{status:303,headers:{'set-cookie':'ledger_session=mock; HttpOnly'}});if(new URL(url).pathname==='/api/ledger/manifest')return Response.json({legacy:true});return Response.json({revision:7,payload:state});};
 const result=await buildReadonly({origin:'https://example.test/',password:'secret-only-test',output,fetcher});assert.equal(result.revision,7);assert.deepEqual(requests.map(r=>r.method),['POST','GET','GET']);
 const manifest=JSON.parse(await readFile(path.join(output,'snapshot.json')));assert.equal(JSON.stringify(manifest).includes('secret-only-test'),false);assert.equal(JSON.stringify(manifest).includes('private-fingerprint'),false);
 const unlocked=await openSnapshot(manifest,'secret-only-test',p=>readFile(path.join(output,p)));assert.equal(unlocked.tx.length,2);
 assert.ok((await readFile(path.join(output,'index.html'),'utf8')).includes('只读模式'));
 }finally{await rm(output,{recursive:true,force:true});}
});
test('publisher aborts on missing cloud revision without publishing an empty replacement',async()=>{
 const fetcher=async url=>new URL(url).pathname==='/login'?new Response(null,{status:303,headers:{'set-cookie':'ledger_session=mock'}}):new URL(url).pathname==='/api/ledger/manifest'?Response.json({legacy:true}):Response.json({revision:0,payload:null});
 await assert.rejects(buildReadonly({origin:'https://example.test/',password:'test',fetcher}),/不发布/);
});
