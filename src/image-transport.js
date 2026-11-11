import {validateDestination} from './agents/registry.js';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
const safe=(message,outcome='failed')=>Object.assign(new Error(message),{imageSafe:true,outcome});
export function imageCredentialState(c){return !!(process.env.PLATFORM_TOKEN&&c.secretEnv&&process.env[c.secretEnv]);}
export function imageFiles(root){const dir=path.join(root,'generated-images');const file=id=>{if(!/^[a-zA-Z0-9_-]{8,100}$/.test(id))throw safe('图片标识无效');return path.join(dir,id+'.png');};return {save:async(id,base64)=>{await mkdir(dir,{recursive:true});await writeFile(file(id),Buffer.from(base64,'base64'),{mode:0o600});},read:async id=>(await readFile(file(id))).toString('base64')};}
async function bytes(response,limit,signal){if(!response.body)throw safe('服务未返回图片内容','unknown');const chunks=[],reader=response.body.getReader();let size=0;const abort=new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(safe('图片请求超时','unknown')),{once:true}));while(true){const {done,value}=await Promise.race([reader.read(),abort]);if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw safe('图片服务响应超过大小上限','unknown');}chunks.push(value);}return Buffer.concat(chunks);}
export function validPNG(base64){if(typeof base64!=='string'||base64.length>28000000||!base64.length||!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))throw safe('服务未返回有效的 PNG 图片','unknown');const b=Buffer.from(base64,'base64');if(b.length<24||b.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||b.toString('ascii',12,16)!=='IHDR')throw safe('服务返回的内容不是 PNG 图片','unknown');return {width:b.readUInt32BE(16),height:b.readUInt32BE(20)};}
function imageProvider(config){const p=config.provider||'openai';if(!['openai','gemini'].includes(p))throw safe('图片服务类型无效');if(p==='gemini'&&(config.endpoint!=='https://generativelanguage.googleapis.com/v1beta'||!/^gemini-[a-zA-Z0-9._-]+$/.test(config.model)))throw safe('Gemini 需使用官方 v1beta 地址与有效模型名称');return p;}
function geminiResult(out){
 if(out.promptFeedback?.blockReason)throw safe('Gemini 未生成图片：请求被内容审核拦截，请调整描述');
 const candidate=out.candidates?.[0];if(candidate?.finishReason&&candidate.finishReason!=='STOP')throw safe('Gemini 未完成图片生成，请检查内容限制或模型响应');
 const part=candidate?.content?.parts?.find(p=>!p.thought&&(p.inlineData||p.inline_data));const inline=part?.inlineData||part?.inline_data;
 if(!inline)throw safe('Gemini 只返回了文字或空结果，没有生成图片。请确认选择的是支持图片输出的模型');
 if((inline.mimeType||inline.mime_type)!=='image/png')throw safe('Gemini 返回的图片不是当前支持的 PNG 格式','unknown');return inline.data;
}
async function referenceImage(url,{request,resolve,signal}){const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password)throw safe('商品参考图地址无效');const check=new URL(u);check.search='';check.hash='';await validateDestination(check.href,resolve);const r=await request(u.href,{redirect:'error',signal});if(!r.ok)throw safe('商品参考图读取失败');const buffer=await bytes(r,10000000,signal),mime=r.headers.get('content-type')?.split(';')[0];if(!['image/png','image/jpeg','image/webp'].includes(mime))throw safe('参考图需为 PNG、JPEG 或 WebP');return {buffer,mime};}
export async function generateImage(config,input,{fetch:request=fetch,resolve}={}){
 if(!imageCredentialState(config))throw safe('请在完整后端配置 IMAGE_SECRET_ 生图密钥和 PLATFORM_TOKEN');const key=process.env[config.secretEnv],provider=imageProvider(config);
 const endpoint=provider==='gemini'?config.endpoint+'/models/'+config.model+':generateContent':config.endpoint.replace(/\/$/,'')+(input.referenceUrl?'/images/edits':'/images/generations'),signal=AbortSignal.timeout(180000);let dispatched=false;
 try{
  await validateDestination(endpoint,resolve);let body,headers;const ref=input.referenceUrl?await referenceImage(input.referenceUrl,{request,resolve,signal}):null;
  if(provider==='gemini'){
   const aspectRatio={'1024x1024':'1:1','1024x1536':'2:3','1536x1024':'3:2'}[input.size];if(!aspectRatio)throw safe('请选择支持的图片比例');
   headers={'Content-Type':'application/json','x-goog-api-key':key};body=JSON.stringify({contents:[{role:'user',parts:[{text:input.prompt},...(ref?[{inlineData:{mimeType:ref.mime,data:ref.buffer.toString('base64')}}]:[])]}],generationConfig:{responseModalities:['TEXT','IMAGE'],imageConfig:{aspectRatio}}});
  }else{
   headers={Authorization:'Bearer '+key};if(ref){body=new FormData();for(const [k,v]of Object.entries({model:config.model,prompt:input.prompt,n:'1',size:input.size,quality:'medium',output_format:'png'}))body.append(k,v);body.append('image',new Blob([ref.buffer],{type:ref.mime}),'product.'+ref.mime.split('/')[1]);}
   else{headers['Content-Type']='application/json';body=JSON.stringify({model:config.model,prompt:input.prompt,n:1,size:input.size,quality:'medium',output_format:'png'});}
  }
  dispatched=true;const response=await request(endpoint,{method:'POST',headers,body,signal,redirect:'error'});
  if(!response.ok)throw safe('生图服务返回 HTTP '+response.status+'；请检查额度、模型和权限',response.status>=500?'unknown':'failed');const raw=(await bytes(response,30000000,signal)).toString('utf8');if(raw.includes(key))throw safe('响应包含敏感凭证，已拒绝保存','unknown');let out;try{out=JSON.parse(raw);}catch{throw safe('生图服务未返回有效 JSON','unknown');}const base64=provider==='gemini'?geminiResult(out):out.data?.[0]?.b64_json;const dimensions=validPNG(base64);if(!dimensions.width||!dimensions.height||dimensions.width>8192||dimensions.height>8192)throw safe('返回图片尺寸无效','unknown');return {base64,...dimensions};
 }catch(e){throw e.imageSafe?e:safe(dispatched?'出图结果未能确认，可能已产生费用。不会自动重新提交':'尚未发起生图，请检查服务域名、参考图域名和网络配置',dispatched?'unknown':'failed');}
}
export async function testImageConnection(config,{fetch:request=fetch,resolve}={}){
 if(imageProvider(config)!=='gemini')throw safe('当前只读连接检查适用于 Gemini');if(!imageCredentialState(config))throw safe('请先配置 IMAGE_SECRET_GEMINI 或指定的密钥变量，以及 PLATFORM_TOKEN');
 const key=process.env[config.secretEnv],endpoint=config.endpoint+'/models/'+config.model,signal=AbortSignal.timeout(20000);
 try{await validateDestination(endpoint,resolve);const response=await request(endpoint,{headers:{'x-goog-api-key':key},signal,redirect:'error'});if(!response.ok)throw safe('Gemini 连接检查返回 HTTP '+response.status+'；请检查密钥、模型是否可用及项目权限');const raw=(await bytes(response,256000,signal)).toString('utf8');if(raw.includes(key))throw safe('响应包含敏感凭证，已拒绝保存');const value=JSON.parse(raw);if(value.name!=='models/'+config.model||!value.supportedGenerationMethods?.includes('generateContent'))throw safe('Gemini 未返回匹配的可调用模型');return {model:config.model};}catch(e){throw e.imageSafe?e:safe('Gemini 连接检查未完成，请检查网络域名和服务配置');}
}
