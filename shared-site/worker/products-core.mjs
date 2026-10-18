export const requiredColumns=['亚马逊商城','开始日期','结束日期','ASIN','货币代码','已售商品数量','退货商品数量','净销售额','净收入（总计）'];
const metrics=['已售商品数量','退货商品数量','已售商品净数量','销售额','净销售额','商品推广费用（总计）','月度仓储费（总计）','净收入（总计）'];
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const productColumnAliases={
  'amazon store':'亚马逊商城','start date':'开始日期','end date':'结束日期','parent asin':'父 ASIN','asin':'ASIN','fnsku':'FNSKU','msku':'MSKU','currency code':'货币代码',
  'average sales price':'平均销售价格','units sold':'已售商品数量','units returned':'退货商品数量','net units sold':'已售商品净数量','sales':'销售额','net sales':'净销售额','net proceeds total':'净收入（总计）','net proceeds per net unit sold':'每件售出净商品的净收入'
};
const productFeeAliases={
 'base fulfillment fee':'基本配送费用','base monthly storage fee':'基本月度仓储费','coupon participation fee':'优惠券参与费','coupon performance-based fee':'基于优惠券绩效的费用','fba inventory reimbursement':'亚马逊物流库存退款赔偿','fba disposal order fee':'亚马逊物流弃置订单费用','fba fulfillment fees':'亚马逊物流配送费用','fba inbound placement service fee':'亚马逊物流入库配置服务费','fuel and logistics-related surcharge':'燃油和物流相关附加费','liquidation processing fee':'批量清货处理费','liquidation referral fee':'批量清货销售佣金','monthly inventory storage fee':'月度仓储费','referral fee refunds':'销售佣金退款','referral fee':'销售佣金','refund administration fee':'退款管理费用','returns processing fee for non-apparel and non-shoes':'非服装和非鞋靴类商品的退货处理费','storage utilization surcharge':'仓储利用率附加费','sponsored products charge':'商品推广费用','aged inventory surcharge':'超龄库存附加费','cost of goods sold':'商品成本','miscellaneous cost':'其他成本'
};
export function normalizeProductColumn(value){
 const name=String(value).replace(/^\uFEFF/,'').trim(),lower=name.toLowerCase().replace(/\s+/g,' ');
 if(Object.hasOwn(productColumnAliases,lower))return productColumnAliases[lower];
 const match=lower.match(/^(.*?) (per unit|quantity|total)$/);
 if(match&&Object.hasOwn(productFeeAliases,match[1]))return productFeeAliases[match[1]]+({'per unit':'（每件商品）',quantity:' 数量',total:'（总计）'}[match[2]]);
 return name;
}
export function isProductReport(header){const names=header.map(normalizeProductColumn);return requiredColumns.every(key=>names.includes(key));}
function day(text){
  const match=String(text).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(!match)throw Error('商品报表日期必须为 MM/DD/YYYY');
  const [,m,d,y]=match,check=new Date(Date.UTC(+y,+m-1,+d));
  if(check.getUTCFullYear()!==+y||check.getUTCMonth()!==+m-1||check.getUTCDate()!==+d)throw Error('商品报表包含无效日期');
  return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
}
export function parseProducts(matrix){
  const rows=matrix.filter(row=>row.some(value=>String(value).trim()));
  const originalHeader=rows[0]?.map(value=>String(value).replace(/^\uFEFF/,'').trim())||[];
  const header=originalHeader.map(normalizeProductColumn);
  if(!isProductReport(header))throw Error('不是支持的 ASIN 商品汇总表，请选择包含商城、期间、ASIN、净收入等字段的报表');
  if(new Set(header).size!==header.length)throw Error('报表存在重复列名');
  if(header.some(key=>['__proto__','prototype','constructor'].includes(key)))throw Error('报表包含不支持的列名');
  if(rows.length<2)throw Error('商品报表没有数据');
  const items=[],identities=new Map();let site,from,to,currency,duplicateRows=0;
  for(const [index,row] of rows.slice(1).entries()){
    if(row.length!==header.length)throw Error(`第 ${index+2} 行列数与表头不同`);
    const raw=Object.fromEntries(header.map((key,i)=>[key,String(row[i]??'').trim()]));
    const current={site:raw['亚马逊商城'].toUpperCase(),from:day(raw['开始日期']),to:day(raw['结束日期']),currency:raw['货币代码'].toUpperCase()};
    if(!/^[A-Z]{2}$/.test(current.site)||!/^[A-Z]{3}$/.test(current.currency)||current.from>current.to)throw Error('站点、币种或日期范围无效');
    if(!site)({site,from,to,currency}=current);
    if(Object.keys(current).some(key=>current[key]!==({site,from,to,currency})[key]))throw Error('本次仅支持相同站点、币种与期间的单份商品报表，请分别导出再导入');
    const asin=raw.ASIN.toUpperCase();if(!/^[A-Z0-9]{10}$/.test(asin))throw Error(`第 ${index+2} 行 ASIN 无效`);
    const identity=JSON.stringify([asin,raw.MSKU||'',raw.FNSKU||'']),signature=JSON.stringify(raw);
    if(identities.has(identity)){
      if(identities.get(identity)===signature){duplicateRows++;continue;}
      throw Error(`第 ${index+2} 行与已有记录的 ASIN、MSKU、FNSKU 相同但数值不同，请核对报表；不同 MSKU 可分别导入`);
    }
    identities.set(identity,signature);
    const values={};
    for(const key of metrics){
      const value=raw[key];if(!value){values[key]=null;continue;}
      if(!/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)||!Number.isFinite(+value)||Math.abs(+value)>Number.MAX_SAFE_INTEGER/100)throw Error(`第 ${index+2} 行“${key}”不是有效数字`);
      values[key]=+value;
    }
    for(const key of ['已售商品数量','退货商品数量'])if(!Number.isSafeInteger(values[key])||values[key]<0)throw Error(`第 ${index+2} 行销量或退货量无效`);
    items.push({asin,parentAsin:raw['父 ASIN']||'',msku:raw.MSKU||'',raw,values});
  }
  return {site,from,to,currency,header,items,...(duplicateRows?{duplicateRows}:{}),...(originalHeader.some((value,i)=>value!==header[i])?{originalHeader}:{})};
}
export function reportKey(report){return JSON.stringify([report.account,report.site,report.from,report.to,report.currency]);}
export function addReport(state,parsed,{account,site,source,replace=false}){
  account=String(account||'').trim();if(!account)throw Error('请填写店铺名');
  if(site!==parsed.site)throw Error('选择的站点与商品报表不一致');
  const report={...parsed,account,source:String(source||''),importedAt:new Date().toISOString()};
  const key=reportKey(report),existing=state.productReports||[];
  const same=existing.find(item=>reportKey(item)===key);
  if(same&&!replace)throw Error('该店铺、站点和期间已有商品报表，请确认替换，不能重复累加');
  return {...state,productReports:[...existing.filter(item=>reportKey(item)!==key),report]};
}
export function mergeProducts(current,incoming){
  const reports=[...(current.productReports||[])],mappings=[...(current.productMappings||[])];
  for(const report of incoming.productReports||[])if(!reports.some(item=>reportKey(item)===reportKey(report)))reports.push(report);
  for(const mapping of incoming.productMappings||[])if(!mappings.some(item=>item.account===mapping.account&&item.site===mapping.site&&item.sku===mapping.sku))mappings.push(mapping);
  return {productReports:reports,productMappings:mappings};
}
export function productsAfterDeletion(state,{mode,account,site}){
  if(!['all','account','site'].includes(mode)||mode!=='all'&&!account||mode==='site'&&!site)throw Error('删除范围不完整');
  const keep=item=>!(mode==='all'||item.account===account&&(mode==='account'||item.site===site));
  return {productReports:(state.productReports||[]).filter(keep),productMappings:(state.productMappings||[]).filter(keep)};
}
export function mapSku(state,{account,site,sku,asin}){
  sku=String(sku||'').trim();asin=String(asin||'').trim().toUpperCase();
  if(!account||!site||!sku||!/^[A-Z0-9]{10}$/.test(asin))throw Error('请选择店铺、站点、SKU 和 ASIN');
  const mapping={account,site,sku,asin};
  return {...state,productMappings:[...(state.productMappings||[]).filter(item=>!(item.account===account&&item.site===site&&item.sku===sku)),mapping]};
}
export function productMatches(state,report,asin){
  const skus=new Set((state.productMappings||[]).filter(item=>item.account===report.account&&item.site===report.site&&item.asin===asin).map(item=>item.sku));
  return state.tx.filter(row=>row.acct===report.account&&row.site===report.site&&row.date>=report.from&&row.date<=report.to&&skus.has(row.sku));
}
export function validProducts(state){
  if(state.productReports!==undefined&&!Array.isArray(state.productReports))return false;
  if(state.productMappings!==undefined&&!Array.isArray(state.productMappings))return false;
  if((state.productReports?.length||0)>200||(state.productMappings?.length||0)>20000)return false;
  const keys=new Set();
  for(const report of state.productReports||[]){
    if(!object(report)||typeof report.account!=='string'||!report.account.trim()||!Array.isArray(report.header)||!Array.isArray(report.items)||!report.items.length||!report.header.every(key=>typeof key==='string')||!isProductReport(report.header))return false;
    if(typeof report.source!=='string'||typeof report.site!=='string'||typeof report.currency!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(report.from)||!/^\d{4}-\d{2}-\d{2}$/.test(report.to)||report.from>report.to)return false;
    const id=reportKey(report);if(keys.has(id))return false;keys.add(id);
    try{
      const checked=parseProducts([report.header,...report.items.map(item=>{if(!object(item)||!object(item.raw))throw Error('invalid');return report.header.map(key=>item.raw[key]??'');})]);
      if(checked.site!==report.site||checked.from!==report.from||checked.to!==report.to||checked.currency!==report.currency)return false;
      if(checked.items.length!==report.items.length||checked.items.some((row,i)=>row.asin!==report.items[i].asin||(row.msku||'')!==(report.items[i].msku||'')||JSON.stringify(row.values)!==JSON.stringify(report.items[i].values)))return false;
    }catch{return false;}
  }
  const mappingKeys=new Set();
  for(const mapping of state.productMappings||[]){
    if(!object(mapping)||typeof mapping.account!=='string'||!mapping.account.trim()||typeof mapping.site!=='string'||!/^[A-Z]{2}$/.test(mapping.site)||typeof mapping.sku!=='string'||!mapping.sku.trim()||!/^[A-Z0-9]{10}$/.test(mapping.asin))return false;
    const key=JSON.stringify([mapping.account,mapping.site,mapping.sku]);if(mappingKeys.has(key))return false;mappingKeys.add(key);
  }
  return true;
}
