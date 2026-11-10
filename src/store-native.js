import {createHash,createHmac} from 'node:crypto';
import {validateDestination} from './agents/registry.js';
const error=(message,outcome='not_sent')=>Object.assign(new Error(message),{status:400,outcome,storeSafe:true});
export function platformId(value){if(typeof value!=='string'||!/^[1-9]\d{0,18}$/.test(value)||BigInt(value)>9223372036854775807n)throw error('商品 / 店铺 ID 必须是准确的正整数字符串');return value;}
export function parsePlatformJSON(raw){return JSON.parse(raw,(_key,value,context)=>{if(typeof value==='number'&&Number.isInteger(value)&&!Number.isSafeInteger(value)){if(!context?.source||!/^\d+$/.test(context.source))throw error('平台 ID 超出数字精度，请升级 Node.js');return context.source;}return value;});}
export function topSignature(params,secret){return createHash('md5').update(secret+Object.keys(params).sort().map(k=>k+params[k]).join('')+secret).digest('hex').toUpperCase();}
export function douyinSignature(params,secret){return createHmac('sha256',secret).update(secret+'app_key'+params.app_key+'method'+params.method+'param_json'+params.param_json+'timestamp'+params.timestamp+'v2'+secret).digest('hex');}
export function createNativeStoreTransport({fetch:request=fetch,resolve,env=process.env,now=()=>Date.now()}={}){
 async function call(c,method,business,write=false){
  if(write&&!env.PLATFORM_TOKEN)throw error('真实店铺写入需要服务器设置 PLATFORM_TOKEN 并通过访问令牌登录');
  const keys=['appKeyEnv','appSecretEnv','accessTokenEnv'].map(k=>env[c[k]]);if(keys.some(k=>!k))throw error('服务器缺少店铺应用凭证或授权令牌，请配置三个环境变量后重试');
  const [appKey,secret,token]=keys,base=c.platform==='taobao'?'https://eco.taobao.com/router/rest':'https://openapi-fxg.jinritemai.com/'+method.replaceAll('.','/');
  const signal=AbortSignal.timeout(20000),abort=new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(error('平台请求超时',write?'unknown':'not_sent')),{once:true}));
  try{await Promise.race([validateDestination(base,resolve),abort]);}catch{throw error('请在 AGENT_ALLOWED_HOSTS 和环境网络策略中允许该平台官方 API 域名');}
  let url=base,body,headers;
  if(c.platform==='taobao'){
   const timestamp=new Date(now()+8*3600000).toISOString().slice(0,19).replace('T',' ');
   const params={method,app_key:appKey,session:token,timestamp,format:'json',v:'2.0',sign_method:'md5',...business};params.sign=topSignature(params,secret);body=new URLSearchParams(params).toString();headers={'Content-Type':'application/x-www-form-urlencoded'};
  }else{
   body=typeof business==='string'?business:JSON.stringify(business,Object.keys(business).sort());const params={app_key:appKey,method,timestamp:String(Math.floor(now()/1000)),v:'2',sign_method:'hmac-sha256',access_token:token};params.sign=douyinSignature({...params,param_json:body},secret);url+='?'+new URLSearchParams(params);headers={'Content-Type':'application/json','x-open-no-old-err-code':'1'};
  }
  let result;
  try{
   signal.throwIfAborted();const response=await Promise.race([request(url,{method:'POST',headers,body,signal,redirect:'error'}),abort]);
   if(!response.ok)throw error('平台返回 HTTP '+response.status,write?'unknown':'not_sent');
   const reader=response.body.getReader(),chunks=[];let size=0;while(true){const {done,value}=await Promise.race([reader.read(),abort]);if(done)break;size+=value.length;if(size>2000000){await reader.cancel();throw error('平台响应超过 2MB',write?'unknown':'not_sent');}chunks.push(value);}
   const raw=Buffer.concat(chunks).toString('utf8');if([secret,token].some(k=>raw.includes(k)))throw error('平台响应包含凭证，已拒绝记录',write?'unknown':'not_sent');result=parsePlatformJSON(raw);
  }catch(e){throw e.storeSafe?e:error('平台响应未能确认，请检查连接并回查商品状态',write?'unknown':'not_sent');}
  const code=c.platform==='taobao'?result.error_response?.code:result.code;
  if(c.platform==='taobao'?!!result.error_response:code!==10000){const safeCode=String(code??'UNKNOWN').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,40);throw error('平台拒绝请求（代码 '+safeCode+'），请核对授权有效期、商品权限与商品审核状态',write?'rejected':'not_sent');}
  const value=c.platform==='taobao'?result[method.replace(/^taobao\./,'').replaceAll('.','_')+'_response']:result.data;
  if(value===undefined)throw error('平台响应缺少业务结果',write?'unknown':'not_sent');return value;
 }
 function product(c,p){
  const id=platformId(String(c.platform==='taobao'?p.num_iid:(p.product_id_str||p.product_id))),raw=c.platform==='taobao'?p.approve_status:p.status;
  const state=c.platform==='taobao'?({onsale:'online',instock:'offline'}[raw]||'unknown'):({0:'online',1:'offline',2:'deleted'}[raw]||'unknown');
  return {id,title:String(p.title||p.name||id).slice(0,300),state,quantity:c.platform==='taobao'&&Number.isSafeInteger(p.num)?p.num:null,price:c.platform==='taobao'?String(p.price||''):'',updatedAt:String(p.modified||p.update_time||''),reviewStatus:c.platform==='douyin'?p.check_status:null};
 }
 const fields='num_iid,title,approve_status,num,price,modified,nick';
 return async(c,operation,input={})=>{
  if(c.driver!=='official'||!['taobao','douyin'].includes(c.platform))throw error('此店铺尚未选择官方接口直连');
  if(operation==='identity'){
   const r=await call(c,c.platform==='taobao'?'taobao.shop.seller.get':'shop.reputation',c.platform==='taobao'?{fields:'sid,title,nick'}:{}),s=c.platform==='taobao'?r.shop:r;
   if(!s)throw error('平台未返回店铺身份');return {shopId:platformId(String(c.platform==='taobao'?s.sid:s.shop_id)),name:String(s.title||s.shop_name||'').slice(0,160)};
  }
  if(operation==='list'){
   const page=Number(input.page||1);if(!Number.isInteger(page)||page<1||page>100)throw error('页码应为 1–100');if(!['online','offline'].includes(input.state))throw error('请选择在售或仓库商品');
   const r=await call(c,c.platform==='taobao'?(input.state==='online'?'taobao.items.onsale.get':'taobao.items.inventory.get'):'product.listV2',c.platform==='taobao'?{fields,page_no:String(page),page_size:'20'}:{page,size:20,status:input.state==='online'?0:1});
   const rows=c.platform==='taobao'?(r.items?.item||[]):(r.data||[]);if(!Array.isArray(rows))throw error('平台商品列表格式无效');return {items:rows.map(p=>product(c,p)),page,total:Number(c.platform==='taobao'?r.total_results:r.total)||0};
  }
  const id=platformId(input.productId);
  if(operation==='detail'){const r=await call(c,c.platform==='taobao'?'taobao.item.seller.get':'product.detail',c.platform==='taobao'?{num_iid:id,fields}:{product_id:id});const p=product(c,c.platform==='taobao'?r.item:r);if(p.id!==id)throw error('平台返回的商品 ID 与请求不符');return p;}
  if(!['online','offline'].includes(operation))throw error('不支持的商品操作');
  if(c.platform==='taobao'){
   if(operation==='online'&&(!Number.isSafeInteger(input.quantity)||input.quantity<=0))throw error('淘宝上架需要当前有效库存，禁止猜测数量');
   await call(c,'taobao.item.update.'+(operation==='online'?'listing':'delisting'),{num_iid:id,...(operation==='online'?{num:String(input.quantity)}:{})},true);
  }else await call(c,'product.'+(operation==='online'?'setOnline':'setOffline'),'{"product_id":'+id+'}',true);
  return {accepted:true};
 };
}
export const nativeStoreTransport=createNativeStoreTransport();
