const dimensions=new Set(['亚马逊商城','开始日期','结束日期','父 ASIN','ASIN','FNSKU','MSKU','货币代码']);
export const defaultProductFields=['已售商品数量','退货商品数量','净销售额','商品推广费用（总计）','月度仓储费（总计）','净收入（总计）'];
export function productFields(report){return report.header.filter(key=>!dimensions.has(key));}
export function productFieldValue(row,key){
  const text=String(row.raw[key]??'').trim();
  if(!text||! /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(text))return null;
  const value=Number(text);return Number.isFinite(value)&&Math.abs(value)<=Number.MAX_SAFE_INTEGER/100?value:null;
}
export function formatProductField(row,key,currency){
  const value=productFieldValue(row,key);if(value===null)return '—';
  if(key.includes('数量'))return value.toLocaleString('en-US');
  return `${currency} ${value.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:Math.abs(value)>0&&Math.abs(value)<0.01?6:2})}`;
}
export function productRatio(row,key,report,mode='sales'){
  if(key.includes('每件')||key.includes('平均'))return '—';
  const value=productFieldValue(row,key);if(value===null)return '—';
  let denominator,label;
  if(mode==='share'||key.includes('数量')){
    const values=report.items.map(item=>productFieldValue(item,key));
    if(values.some(item=>item===null))return '—';
    denominator=values.reduce((sum,item)=>sum+item,0);label='占本报表同项';
  }else{denominator=productFieldValue(row,'净销售额');label='占本商品净销售额';}
  if(denominator===null||denominator<=0&&mode!=='share'&&!key.includes('数量')||denominator===0)return '—';
  const ratio=value/denominator*100;
  return Number.isFinite(ratio)?`${ratio.toFixed(2)}% · ${label}`:'—';
}
