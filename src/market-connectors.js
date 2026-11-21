import {randomUUID} from 'node:crypto';
import {requestIntegration} from './integration-transport.js';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), {status}); };
function required(value, label, max = 200) {
 if (typeof value !== 'string' || !value.trim() || value.length > max) fail(label + '缺失或过长');
 return value.trim();
}
function normalize(row) {
 const id = required(row?.id, '来源商品 ID');
 const title = required(row.title, '商品名称');
 if (!Number.isSafeInteger(row.priceFen) || row.priceFen <= 0 || row.currency !== 'CNY') fail('请由来源返回人民币分计价的有效商品价格');
 return {id, title, priceFen: row.priceFen, currency:'CNY',
  rights: row.rights === 'resale' ? 'resale' : row.rights === 'promotion' ? 'promotion' : 'unknown',
  channels: Array.isArray(row.channels) ? row.channels.filter(s=>typeof s==='string' && s.length<=50).slice(0,30) : [],
  fulfillment: typeof row.fulfillment==='string' ? row.fulfillment.trim().slice(0,500) : '',
  terms:typeof row.terms==='string'?row.terms.trim().slice(0,1500):'',
  validUntil:typeof row.validUntil==='string'?row.validUntil.slice(0,40):''};
}
export function offerBlocker(offer, platform) {
 if(offer.rights!=='resale') return offer.rights==='promotion'?'仅限推广赚佣，缺少转售授权':'来源未提供转售授权';
 if(!offer.channels.includes(platform)) return '授权未覆盖目标销售平台';
 if(!offer.fulfillment) return '来源未提供履约方式';
 if(!offer.terms) return '缺少使用条件与售后条款';
 if(offer.validUntil&&(!Number.isFinite(Date.parse(offer.validUntil))||Date.parse(offer.validUntil)<=Date.now())) return '报价已过期或期限格式无效';
 return '';
}
export function createMarketConnectors({getData,transaction,request=requestIntegration}) {
 const source=(d,id)=>{const s=d.sources.find(s=>s.id===id);if(!s?.enabled||s.kind!=='supplier'||s.mode!=='http'||!s.offerPlatform)fail('请配置支持选品的供应商接口');return s;};
 const store=(d,id)=>{const s=d.stores?.find(s=>s.id===id);if(!s?.enabled||s.driver!=='gateway'||!s.endpoint||!s.shopId)fail('请选择已启用的销售网关');return s;};
 function authorized(s){
  if(!s.listingEnabled)fail('请在销售店铺连接中启用确认后发布新商品');
  const t=s.lastTest;
  if(t?.revision!==s.revision||t.status!=='succeeded'||!t.scopes.includes('listing.create')||(t.expiresAt&&Date.parse(t.expiresAt)<=Date.now()))fail('请检查目标店铺授权，网关需返回 listing.create 权限');
 }
 async function call(c,operation,fields){
  const {value}=await request(c.endpoint,{schemaVersion:1,operation,platform:c.offerPlatform||c.platform,...fields},{secretEnv:c.secretEnv});
  if(value?.schemaVersion!==1)fail('连接器响应版本无效');return value;
 }
 async function search({sourceId,storeId,query}){
  const s=source(getData(),sourceId),target=store(getData(),storeId);
  const result=await call(s,'offer.search',{query:required(query,'搜索词',160),limit:20});
  if(!Array.isArray(result.items))fail('来源未返回商品列表');
  const rows=result.items.slice(0,20).map(normalize);
  return {items:rows.map(o=>({...o,blocker:offerBlocker(o,target.platform)}))};
 }
 async function prepare({sourceId,storeId,offerId,priceFen}){
  const s=source(getData(),sourceId),t=store(getData(),storeId);
  if(!Number.isSafeInteger(priceFen)||priceFen<=0)fail('请填写实际销售价格');
  const id=required(offerId,'商品 ID');
  const offer=normalize((await call(s,'offer.get',{offerId:id})).item);
  if(offer.id!==id)fail('来源返回了其他商品');
  const blocked=offerBlocker(offer,t.platform);if(blocked)fail(blocked);
  return transaction(d=>{
   if(source(d,sourceId).revision!==s.revision||store(d,storeId).revision!==t.revision)fail('连接配置已变更，请重新选品',409);
   const drafts=d.channelListings??=[];
   const prior=drafts.find(x=>x.sourceId===sourceId&&x.storeId===storeId&&x.offer.id===id);
   if(prior&&prior.status!=='draft')fail('该商品已有发布记录，请核对店铺',409);
   const row={id:prior?.id||randomUUID(),revision:(prior?.revision||0)+1,sourceId,storeId,sourceRevision:s.revision,storeRevision:t.revision,offer,priceFen,sourceName:s.name,storeName:t.name,status:'draft'};
   if(prior)drafts[drafts.indexOf(prior)]=row;else drafts.unshift(row);
   return row;
  });
 }
 async function publish({id,revision,confirmed}){
  if(confirmed!==true)fail('请确认店铺与售价');
  function check(d){
   const row=d.channelListings?.find(x=>x.id===id);if(!row||row.status!=='draft'||row.revision!==revision)fail('草稿状态已变化，请刷新',409);
   const s=source(d,row.sourceId),t=store(d,row.storeId);authorized(t);
   if(s.revision!==row.sourceRevision||t.revision!==row.storeRevision)fail('连接配置已变更，请重新准备草稿');
   return {row,s,t};
  }
  const {row,s,t}=check(getData());
  const latest=normalize((await call(s,'offer.get',{offerId:row.offer.id})).item);
  const blocked=offerBlocker(latest,t.platform);if(blocked)fail(blocked);
  if(JSON.stringify(latest)!==JSON.stringify(row.offer))fail('商品或授权已变化，请重新准备草稿');
  await transaction(d=>{check(d).row.status='submitting';});
  let listingId='';
  try {
   const receipt=await call(t,'listing.create',{shopId:t.shopId,idempotencyKey:row.id,offer:latest,sourcePlatform:s.offerPlatform,priceFen:row.priceFen});
   if(receipt.shopId===t.shopId&&receipt.status==='published')listingId=required(receipt.listingId,'发布回执');
  } catch { /* A write may have reached the channel. Keep it out of the retry queue. */ }
  return transaction(d=>{
   const saved=d.channelListings.find(x=>x.id===id);
   saved.status=listingId?'published':'unknown';saved.listingId=listingId;return saved;
  });
 }
 return {search,prepare,publish};
}
