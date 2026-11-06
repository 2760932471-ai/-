import {callLocalCodex} from './codex-local.js';
import {validateDestination} from '../agents/registry.js';
export function validateModel(input,previous){
 const name=String(input.name||'').trim(),model=String(input.model||'').trim(),endpoint=String(input.endpoint||'').trim(),secretEnv=String(input.secretEnv||'').trim();
 const provider=input.provider||'api';if(!['api','codex-local'].includes(provider))throw new Error('不支持的模型接入方式');
 if(provider==='codex-local'){if(!name||name.length>80||model.length>120)throw new Error('请填写连接名称；模型标识可留空');if(previous&&input.revision!==previous.revision)throw new Error('模型配置已更新，请重新打开');const timeoutMs=Number(input.timeoutMs||120000);if(!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>300000)throw new Error('本机Codex超时范围为1000–300000毫秒');return {id:previous?.id,provider,name,model,endpoint:'',secretEnv:'',timeoutMs,revision:(previous?.revision||0)+1,lastTest:null};}
 if(!name||name.length>80||!model||model.length>120)throw new Error('请填写模型连接名称和模型标识');
 let u;try{u=new URL(endpoint);}catch{throw new Error('请填写完整的 HTTPS Chat Completions 接口地址');}
 if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)throw new Error('模型接口必须使用无凭证和参数的 HTTPS 地址');
 if(!/^MODEL_SECRET_[A-Z0-9_]{1,60}$/.test(secretEnv))throw new Error('密钥引用须为 MODEL_SECRET_ 开头的服务器环境变量名');
 if(previous&&input.revision!==previous.revision)throw new Error('模型配置已更新，请重新打开');
 const timeoutMs=Number(input.timeoutMs||30000);if(!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>60000)throw new Error('超时需在1000–60000毫秒之间');
 return {id:previous?.id,provider,name,model,endpoint,secretEnv,timeoutMs,revision:(previous?.revision||0)+1,lastTest:null};
}
export function publicModel(model){return {...model,credentialConfigured:model.provider==='codex-local'?process.env.ENABLE_CODEX_LOCAL==='1'&&!!process.env.PLATFORM_TOKEN:!!process.env[model.secretEnv]};}
export async function callModel(model,messages,tools=[],options={}){
 if(model.provider==='codex-local')return callLocalCodex(model,messages,tools,options);
 const key=process.env[model.secretEnv];if(!key)throw new Error('模型密钥尚未配置：'+model.secretEnv);
 const signal=AbortSignal.timeout(model.timeoutMs),abort=new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
 await Promise.race([validateDestination(model.endpoint,options.resolve),abort]);signal.throwIfAborted();
 const response=await (options.fetch||fetch)(model.endpoint,{method:'POST',redirect:'error',signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify({model:model.model,messages,max_tokens:Number.isInteger(options.maxOutputTokens)?Math.max(256,Math.min(4000,options.maxOutputTokens)):1600,...(tools.length?{tools,tool_choice:'auto'}:{})})});
 if(!response.ok)throw new Error('模型服务 HTTP '+response.status+'；错误正文未记录');
 let size=0;const parts=[],reader=response.body.getReader();
 while(true){const {done,value}=await Promise.race([reader.read(),abort]);if(done)break;size+=value.length;if(size>256000){await reader.cancel();throw new Error('模型响应超过256KB');}parts.push(value);}
 let data;try{data=JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw new Error('模型返回的不是有效JSON');}
 if(JSON.stringify(data).includes(key))throw new Error('模型响应包含密钥，已拒绝保存');
 const message=data.choices?.[0]?.message;if(!message||(!message.content&&!message.tool_calls?.length)||message.content&&typeof message.content!=='string')throw new Error('模型未返回有效消息或工具调用');
 if(message.tool_calls&&(!Array.isArray(message.tool_calls)||message.tool_calls.length>4))throw new Error('单轮工具调用超过4个或格式无效');
 return {message:{role:'assistant',content:message.content||null,...(message.tool_calls?{tool_calls:message.tool_calls}:{})},usage:data.usage||null};
}
