import {validateDestination} from './agents/registry.js';
const failure=message=>Object.assign(new Error(message),{sourceSafe:true});
export async function pullSource(source,{fetch:request=fetch,resolve}={}){
 const signal=AbortSignal.timeout(15000);
 const abort=new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(failure('来源接口超时，请重试')),{once:true}));
 try{await Promise.race([validateDestination(source.endpoint,resolve),abort]);}catch{throw failure('来源域名需加入 AGENT_ALLOWED_HOSTS，且只能解析到公网地址');}
 const key=source.secretEnv?process.env[source.secretEnv]:null;
 if(source.secretEnv&&!key)throw failure('服务器未配置来源密钥环境变量');
 const response=await request(source.endpoint,{method:'POST',redirect:'error',signal,headers:{'Content-Type':'application/json',...(key?{Authorization:'Bearer '+key}:{})},body:JSON.stringify({schemaVersion:1,operation:'list_materials',kind:source.kind,limit:50})});
 if(!response.ok)throw failure('来源服务返回 HTTP '+response.status);
 const reader=response.body.getReader(),chunks=[];let size=0;
 while(true){const {done,value}=await Promise.race([reader.read(),abort]);if(done)break;size+=value.length;if(size>256000){await reader.cancel();throw failure('来源响应超过 256KB，请缩小返回批次');}chunks.push(value);}
 const raw=Buffer.concat(chunks).toString('utf8');
 if(key&&raw.includes(key))throw failure('来源返回包含敏感凭证，已拒绝保存');
 try{return JSON.parse(raw);}catch{throw failure('来源接口未返回有效 JSON');}
}
