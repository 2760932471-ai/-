import {randomUUID} from 'node:crypto';
import {nativeStoreTransport} from './store-native.js';
const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status});};
const timestamp=()=>new Date().toISOString();
const snapshot=p=>JSON.stringify([p.id,p.title,p.state,p.quantity,p.updatedAt,p.reviewStatus]);
export function createStoreOperations({getData,transaction,nativeStoreCall=nativeStoreTransport}){
 const active=new Set();
 const config=(id,write=false)=>{const c=getData().stores?.find(s=>s.id===id);if(!c)fail('店铺不存在',404);if(!c.enabled||c.driver!=='official')fail('请启用店铺并选择官方接口直连');if(write&&!c.writesEnabled)fail('请在店铺配置中启用人工确认后上下架');return structuredClone(c);};
 const find=(shop,id)=>{const o=getData().storeOperations?.find(o=>o.storeId===shop&&o.id===id);if(!o)fail('操作记录不存在',404);return structuredClone(o);};
 const current=c=>{const s=config(c.id);if(s.revision!==c.revision)fail('店铺配置已变化，请重新读取商品');};
 async function identity(c){const r=await nativeStoreCall(c,'identity');if(r.shopId!==c.shopId)fail('授权对应的店铺 ID 不匹配，已停止操作');current(c);return r;}
 const update=(id,patch)=>transaction(d=>{const o=d.storeOperations.find(o=>o.id===id);Object.assign(o,patch,{updatedAt:timestamp()});return o;});
 const history=shop=>{if(!getData().stores?.some(s=>s.id===shop))fail('店铺不存在',404);return structuredClone((getData().storeOperations||[]).filter(o=>o.storeId===shop).slice(0,100));};
 async function list(shop,input){const c=config(shop);await identity(c);const r=await nativeStoreCall(c,'list',input);current(c);return r;}
 async function prepare(shop,input){
  const c=config(shop,true);if(!['online','offline'].includes(input.action)||typeof input.productId!=='string')fail('请选择商品和上下架动作',400);
  await identity(c);const p=await nativeStoreCall(c,'detail',{productId:input.productId});current(c);if(!['online','offline'].includes(p.state))fail('商品状态无法操作，请先在商家后台处理');if(p.state===input.action)fail('商品已处于目标状态，无需重复操作');
  if(c.platform==='taobao'&&input.action==='online'&&(!Number.isSafeInteger(p.quantity)||p.quantity<=0))fail('商品库存不足或未读取到有效库存，请先在商家后台补充');
  if(c.platform==='douyin'&&input.action==='online'&&![3,7].includes(p.reviewStatus))fail('抖店商品尚未审核通过，请先处理审核状态');
  return transaction(d=>{if(d.stores.find(s=>s.id===shop)?.revision!==c.revision)fail('店铺配置已变化');if((d.storeOperations||[]).some(o=>o.storeId===shop&&o.product.id===p.id&&['submitting','unknown','verifying'].includes(o.status)))fail('该商品有待核验操作，请先回查或人工核对');const o={id:randomUUID(),storeId:shop,storeName:c.name,platform:c.platform,shopId:c.shopId,configRevision:c.revision,product:p,action:input.action,status:'prepared',createdAt:timestamp(),updatedAt:timestamp(),expiresAt:new Date(Date.now()+300000).toISOString()};(d.storeOperations??=[]).unshift(o);return o;});
 }
 async function verify(shop,id){const o=find(shop,id);if(!['submitting','verifying','unknown'].includes(o.status))return o;if(active.has(id))return o;active.add(id);try{const c=config(shop);if(c.shopId!==o.shopId||c.platform!==o.platform)fail('店铺身份配置已变化，不能核验旧操作');await identity(c);try{const p=await nativeStoreCall(c,'detail',{productId:o.product.id});current(c);return await update(id,{status:p.state===o.action?'succeeded':o.status==='unknown'?'unknown':'verifying',observed:p,verifiedAt:timestamp(),message:p.state===o.action?'已回查平台，商品处于目标状态':'平台尚未显示目标状态；请稍后回查，或核对商家后台。不会自动重复提交'});}catch{ return await update(id,{status:o.status==='unknown'?'unknown':'verifying',message:'回查暂未成功；仅可继续回查，不会重新提交'});}}finally{active.delete(id);}}
 async function confirm(shop,id,input){
  let o=find(shop,id);if(input.confirmed!==true)fail('请明确确认具体商品操作',400);if(o.status!=='prepared')return o;if(active.has(id))return o;active.add(id);
  let dispatched=false;
  try{
   const c=config(shop,true);if(c.revision!==o.configRevision||Date.parse(o.expiresAt)<=Date.now())fail('确认已过期或配置已变化，请重新选择商品');await identity(c);
   const p=await nativeStoreCall(c,'detail',{productId:o.product.id});if(snapshot(p)!==snapshot(o.product))fail('商品状态、库存或信息已变化，请刷新后重新确认');current(c);
   await transaction(d=>{const row=d.storeOperations.find(x=>x.id===id),s=d.stores.find(x=>x.id===shop);if(row.status!=='prepared'||s.revision!==c.revision||!s.enabled||!s.writesEnabled)fail('操作或配置已变化');if(d.storeOperations.some(x=>x.id!==id&&x.storeId===shop&&x.product.id===o.product.id&&['submitting','unknown','verifying'].includes(x.status)))fail('该商品另有待核验操作');row.status='submitting';row.submittedAt=timestamp();row.updatedAt=timestamp();});
   // Persist the dispatch marker before a platform write. A restart must never resend it.
   dispatched=true;const result=await nativeStoreCall(c,o.action,{productId:o.product.id,quantity:p.quantity});if(result?.accepted!==true)throw new Error('未确认平台受理');await update(id,{status:'verifying',message:'平台已受理，正在回查实际商品状态'});
  }catch(e){await update(id,{status:!dispatched||e.outcome==='not_sent'?'not_sent':e.outcome==='rejected'?'rejected':'unknown',message:!dispatched?e.message:e.storeSafe?e.message:'提交结果未能确认，请回查商品状态，不会自动重试'});}finally{active.delete(id);}
  o=find(shop,id);if(o.status==='verifying'){try{return await verify(shop,id);}catch{return o;}}return o;
 }
 async function resolve(shop,id,input){const o=find(shop,id);if(!['unknown','verifying'].includes(o.status)||active.has(id))fail('此操作不能人工结束');if(input.confirmed!==true||typeof input.note!=='string'||input.note.trim().length<10||input.note.length>500)fail('请填写至少 10 字的商家后台核对结果',400);active.add(id);try{return await update(id,{status:'closed',message:'管理员已人工核对并结束；不代表平台执行成功',resolution:input.note.trim(),resolvedAt:timestamp()});}finally{active.delete(id);}}
 return {list,history,prepare,confirm,verify,resolve};
}
