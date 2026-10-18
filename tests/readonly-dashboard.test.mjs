import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,existsSync} from 'node:fs';
import {currencyContext,totals,periods,periodKey,periodRange,expenses,accounts,chartSVG} from '../readonly/dashboard-core.mjs';
import {viewingState} from '../readonly/snapshot-crypto.mjs';
const settings={base:'USD',rates:{USD:1,GBP:1.33,EUR:1.15}};
const rows=[{date:'2026-01-01',acct:'A',site:'US',cur:'USD',cat:'income',amount:100,type:'Order',f:{sales:150,sell:-20,fba:-30,oth:0}},{date:'2026-02-01',acct:'B',site:'UK',cur:'GBP',cat:'expense',amount:-10,type:'Refund'},{date:'2026-02-28',acct:'A',site:'US',cur:'USD',cat:'withdraw',amount:-30,type:'Transfer'},{date:'2026-03-01',acct:'A',site:'US',cur:'USD',cat:'ignore',amount:999,type:'ignored'}];
test('five KPIs and embedded fees match the original ledger engine',{skip:!existsSync(new URL('../shared-site/worker/ledger.html',import.meta.url))},()=>{
 const context=currencyContext(rows,settings),actual=totals(rows,context),html=readFileSync(new URL('../shared-site/worker/ledger.html',import.meta.url),'utf8');
 const start=html.indexOf('function stats(rows,vc)'),end=html.indexOf('function byPeriod',start),original=vm.runInNewContext('('+html.slice(start,end).trim()+')',{cv:(a,c)=>context.convert(a,c)})(rows,context);
 for(const [newKey,oldKey] of [['income','inc'],['expense','exp'],['withdraw','wd'],['net','net'],['balance','bal']])assert.equal(actual[newKey],original[oldKey]);
 assert.deepEqual(actual.counts,{...original.n});assert.equal(actual.fees.sales,original.sales);assert.equal(actual.fees.sell,original.sell);assert.equal(actual.fees.fba,original.fba);
 assert.equal(actual.net,86.7);assert.equal(actual.balance,56.7);assert.equal(actual.expense,13.3);
});
test('monthly, quarterly and annual summaries have equal totals; date boundaries include leap day',()=>{
 const context=currencyContext(rows,settings);for(const gran of ['month','quarter','year']){const ps=periods(rows,gran,context);assert.ok(Math.abs(ps.reduce((n,r)=>n+r.net,0)-86.7)<1e-10);assert.equal(ps.reduce((n,r)=>n+r.count,0),3);}
 assert.deepEqual(periodRange('2024-02'),['2024-02-01','2024-02-29']);assert.deepEqual(periodRange('2026-Q4'),['2026-10-01','2026-12-31']);assert.equal(periodKey('2026-12-31','quarter'),'2026-Q4');assert.deepEqual(periodRange('2026-13'),['','']);
});
test('missing conversion rates never silently add currencies at 1:1; single currency needs no rate',()=>{
 const context=currencyContext(rows,{base:'USD',rates:{USD:1}});assert.deepEqual(context.missing,['GBP']);assert.equal(totals(rows,context).income,null);assert.match(chartSVG(periods(rows,'month',context),'USD'),/汇率不完整/);
 assert.equal(totals([rows[1]],currencyContext([rows[1]],{})).expense,10);
});
test('withdrawals and fees do not double-count expenses; account summaries remain in native currency',()=>{
 const context=currencyContext(rows,settings),br=expenses(rows,context);assert.equal(br.length,1);assert.equal(br[0].value,13.3);assert.equal(accounts(rows).length,2);assert.equal(accounts(rows).find(r=>r.currency==='GBP').expense,10);
 const projected=viewingState({...settings,set:settings,tx:rows,productReports:[]});assert.deepEqual(projected.set,settings);assert.deepEqual(projected.tx[0].f,rows[0].f);
});
test('empty, negative-profit and many-period charts remain bounded and escape text',()=>{
 assert.match(chartSVG([],'USD'),/暂无/);const negative=periods([{...rows[0],cat:'expense',amount:-250}], 'month',currencyContext([rows[0]]));const svg=chartSVG(negative,'USD');assert.match(svg,/net-point/);assert.equal(svg.includes('NaN'),false);assert.equal(svg.includes('Infinity'),false);
 const hostile=chartSVG([{key:'<img>',income:2,expense:3,withdraw:0,net:-1}],'USD');assert.equal(hostile.includes('<img>'),false);assert.match(hostile,/&lt;img/);
});
