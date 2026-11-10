import {validateDestination} from './agents/registry.js';
export async function requestIntegration(endpoint,payload,{secretEnv='',headers={},fetch:request=fetch,resolve,allowEmpty=false}={}){
 const signal=AbortSignal.timeout(20000),abort=new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('连接超时，请稍后重试')),{once:true}));
 try{await Promise.race([validateDestination(endpoint,resolve),abort]);}catch{throw new Error('连接域名必须加入 AGENT_ALLOWED_HOSTS，并解析到公网地址');}
 const key=secretEnv?process.env[secretEnv]:'';if(secretEnv&&!key)throw new Error('服务端尚未配置密钥环境变量');
 const response=await request(endpoint,{method:'POST',redirect:'error',signal,headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream',...(key?{Authorization:'Bearer '+key}:{}),...headers},body:JSON.stringify(payload)});
 if(!response.ok)throw new Error('连接服务返回 HTTP '+response.status);
 if(allowEmpty&&[202,204].includes(response.status))return {value:null,session:response.headers.get('mcp-session-id')};
 const chunks=[];let size=0;const reader=response.body.getReader();
 while(true){const {done,value}=await Promise.race([reader.read(),abort]);if(done)break;size+=value.length;if(size>256000){await reader.cancel();throw new Error('连接响应超过 256KB');}chunks.push(value);if(response.headers.get('content-type')?.includes('text/event-stream')){const text=Buffer.concat(chunks).toString('utf8');if(text.split(/\r?\n\r?\n/).slice(0,-1).some(block=>{try{return JSON.parse(block.replace(/^.*?data: ?/s,'')).id===payload.id;}catch{return false;}})){await reader.cancel();break;}}}
 const raw=Buffer.concat(chunks).toString('utf8');if(key&&raw.includes(key))throw new Error('响应包含敏感凭证，已拒绝使用');
 let value;try{if(!raw.trim()&&allowEmpty)value=null;else if(response.headers.get('content-type')?.includes('text/event-stream'))value=raw.split(/\r?\n\r?\n/).flatMap(block=>{try{return [JSON.parse(block.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trim()).join('\n'))];}catch{return [];}}).find(x=>x.id===payload.id);else value=JSON.parse(raw);if(value===undefined)throw new Error();}catch{throw new Error('连接未返回有效 JSON 结果');}
 return {value,session:response.headers.get('mcp-session-id')};
}
export async function searchTransport(config,{query,site},{request=requestIntegration}={}){
 if(config.provider==='tavily'){const {value}=await request('https://api.tavily.com/search',{query,max_results:8,search_depth:'basic',include_answer:false,...(site?{include_domains:[site]}:{})},{secretEnv:config.secretEnv});return value.results;}
 const init=await request(config.endpoint,{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'ai-workforce',version:'0.14.0'}}},{secretEnv:config.secretEnv});
 if(init.value?.error||!init.value?.result?.protocolVersion)throw new Error('MCP 初始化失败');
 const headers={'MCP-Protocol-Version':init.value.result.protocolVersion,...(init.session?{'Mcp-Session-Id':init.session}:{})};
 await request(config.endpoint,{jsonrpc:'2.0',method:'notifications/initialized'},{secretEnv:config.secretEnv,headers,allowEmpty:true});
 const listed=await request(config.endpoint,{jsonrpc:'2.0',id:2,method:'tools/list',params:{}},{secretEnv:config.secretEnv,headers});const tool=listed.value?.result?.tools?.find(t=>t.name===config.toolName);if(!tool)throw new Error('MCP 未提供所配置的搜索工具');
 if(tool.annotations?.destructiveHint===true||tool.annotations?.readOnlyHint===false)throw new Error('该 MCP 工具声明可写入，不能作为只读搜索');
 const called=await request(config.endpoint,{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:config.toolName,arguments:{[config.queryField||'query']:site?'site:'+site+' '+query:query}}},{secretEnv:config.secretEnv,headers});const r=called.value?.result;if(called.value?.error||!r||r.isError)throw new Error('MCP 搜索调用失败');
 if(r.structuredContent)return r.structuredContent.results||r.structuredContent;
 for(const item of r.content||[])if(item.type==='text'){try{const x=JSON.parse(item.text);return x.results||x;}catch{}}
 throw new Error('MCP 搜索需返回结构化 results 数组，含 title、url、content 或 snippet');
}
export async function storeTransport(config,{request=requestIntegration}={}){return (await request(config.endpoint,{schemaVersion:1,operation:'connection_status',platform:config.platform,shopId:config.shopId},{secretEnv:config.secretEnv})).value;}
