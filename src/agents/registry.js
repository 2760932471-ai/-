import { builtins, seeds } from './builtins.js';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
export function validateConfig(input,previous){
 if(!previous)throw new Error('Agent不存在');
 if(input.revision!==previous.revision)throw new Error('配置版本已更新，请重新打开后编辑');
 const config={...previous};
 for(const key of ['name','role','instructions','endpoint','secretEnv'])if(input[key]!==undefined){if(typeof input[key]!=='string')throw new Error('配置字段格式错误');config[key]=input[key].trim();}
 if(!config.name||config.name.length>80||config.role.length>500||config.instructions.length>4000)throw new Error('名称必填且不超过80字，职责不超过500字，指令不超过4000字');
 config.adapter=input.adapter??config.adapter;if(!['builtin','http'].includes(config.adapter))throw new Error('不支持的适配器');
 if(typeof input.enabled!=='boolean')throw new Error('请选择启用状态');config.enabled=input.enabled;
 config.timeoutMs=Number(input.timeoutMs);if(!Number.isInteger(config.timeoutMs)||config.timeoutMs<1000||config.timeoutMs>60000)throw new Error('超时范围为1000–60000毫秒');
 if(config.secretEnv&&!/^AGENT_SECRET_[A-Z0-9_]{1,60}$/.test(config.secretEnv))throw new Error('密钥变量名必须以AGENT_SECRET_开头，只能包含大写字母、数字和下划线');
 if(config.endpoint){let u;try{u=new URL(config.endpoint);}catch{throw new Error('请输入有效的HTTPS Agent地址');}if(u.protocol!=='https:'||u.username||u.password||u.hash||u.search||isIP(u.hostname))throw new Error('Agent地址需为HTTPS域名，不允许凭证、查询参数、片段或IP地址');}
 if(config.adapter==='http'&&!config.endpoint)throw new Error('HTTP Agent必须配置服务地址');
 const key=config.id==='product'?'minGrossMargin':'targetProfitRate';
 const value=Number(input.settings?.[key]);if(!Number.isFinite(value)||value<0||value>100)throw new Error('阈值必须在0–100之间');
 config.settings={[key]:value};config.revision++;config.updatedAt=new Date().toISOString();return config;
}
export function publicConfig(c){return {...c,credentialConfigured:!!(c.secretEnv&&process.env[c.secretEnv]),sampleAvailable:!!builtins[c.id],color:'neutral'};}
function publicAddress(address){if(isIP(address)===4){const [a,b]=address.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19));}const s=address.toLowerCase();return isIP(address)===6&&s!=='::1'&&s!=='::'&&!s.startsWith('fc')&&!s.startsWith('fd')&&!s.startsWith('fe8')&&!s.startsWith('fe9')&&!s.startsWith('fea')&&!s.startsWith('feb')&&!s.startsWith('::ffff:');}
export async function validateDestination(endpoint,resolve=lookup){
 const url=new URL(endpoint);const allowed=(process.env.AGENT_ALLOWED_HOSTS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||isIP(url.hostname)||!allowed.includes(url.hostname.toLowerCase()))throw new Error('该Agent域名未在服务端AGENT_ALLOWED_HOSTS中授权');
 const records=await resolve(url.hostname,{all:true});if(!records.length||records.some(r=>!publicAddress(r.address)))throw new Error('Agent地址不能指向本机、内网或保留网络');
 return url;
}
export function validateOutput(output){
 if(!output||!['succeeded','needs_input'].includes(output.status)||typeof output.summary!=='string'||output.summary.length>6000)throw new Error('Agent返回格式错误：需要status和summary');
 if(!Array.isArray(output.artifacts)||output.artifacts.length>8||!Array.isArray(output.missing)||output.missing.length>30||output.missing.some(x=>typeof x!=='string'||x.length>500))throw new Error('Agent返回格式错误：artifacts或missing');
 for(const a of output.artifacts)if(!a||typeof a.title!=='string'||a.title.length>200||typeof a.body!=='string'||a.body.length>30000||typeof a.evidence!=='string'||a.evidence.length>2000)throw new Error('Agent交付物格式错误');
 if(output.status==='succeeded'&&!output.artifacts.length)throw new Error('成功结果必须包含可审阅的交付物');
 return {status:output.status,summary:output.summary,missing:output.missing,artifacts:output.artifacts.map(a=>({title:a.title,body:a.body,evidence:a.evidence})),metrics:output.metrics&&typeof output.metrics==='object'?output.metrics:{}};
}
export async function invokeAgent(config,input,options={}){
 if(!config.enabled)throw new Error('Agent已停用，请启用后重试');
 if(config.adapter==='builtin')return validateOutput(await builtins[config.id](input,config));
 const signal=AbortSignal.timeout(config.timeoutMs);
 const abort=new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
 await Promise.race([validateDestination(config.endpoint,options.resolve),abort]);
 signal.throwIfAborted();
 const key=config.secretEnv?process.env[config.secretEnv]:null;
 if(config.secretEnv&&!key)throw new Error('服务端尚未设置所选密钥环境变量');
 const response=await (options.fetch||fetch)(config.endpoint,{method:'POST',redirect:'error',signal,headers:{'Content-Type':'application/json',...(key?{Authorization:`Bearer ${key}`}:{})},body:JSON.stringify({schemaVersion:1,agentId:config.id,configVersion:config.revision,instructions:config.instructions,settings:config.settings,input})});
 if(!response.ok)throw new Error(`Agent服务返回HTTP ${response.status}；响应正文未写入日志`);
 const reader=response.body.getReader();const chunks=[];let size=0;while(true){const {done,value}=await Promise.race([reader.read(),abort]);if(done)break;size+=value.length;if(size>256000){await reader.cancel();throw new Error('Agent响应超过256KB限制');}chunks.push(value);}
 let output;try{output=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new Error('Agent响应不是有效JSON');}
 // Never persist an echoed credential, even if a remote service mistakenly returns it.
 if(key&&JSON.stringify(output).includes(key))throw new Error('Agent响应包含敏感凭证，已拒绝保存');
 return validateOutput(output);
}
export function defaultConfigs(){return structuredClone(seeds);}
