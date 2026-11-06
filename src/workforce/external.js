export const externalInputFields=['goal','question','scope','facts','proposal','financials','commerce','campaign','replenishment','serviceQuestion','observations','knowledgeRecall','references'];
export function validateExternal(input,previous){
 if(previous&&input.revision!==previous.revision)throw new Error('外部能力配置已更新，请重新打开');
 const name=String(input.name||'').trim(),description=String(input.description||'').trim();
 if(!name||name.length>80||!description||description.length>1000)throw new Error('请填写能力名称和职责，分别不超过 80 / 1000 字');
 if(!['http','dify'].includes(input.provider))throw new Error('请选择通用 HTTP 或 Dify 工作流');
 let url;try{url=new URL(input.endpoint);}catch{throw new Error('请填写完整 HTTPS 接口地址');}
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.href.length>2048)throw new Error('接口需为 HTTPS，不含凭证、查询参数或片段');
 if(input.provider==='dify'&&!url.pathname.endsWith('/workflows/run'))throw new Error('Dify 接口需以 /workflows/run 结尾');
 const secretEnv=String(input.secretEnv||'');if(!/^EXTERNAL_SECRET_[A-Z0-9_]{1,60}$/.test(secretEnv))throw new Error('请填写 EXTERNAL_SECRET_ 开头的服务器变量名，不要填写密钥值');
 const timeoutMs=Number(input.timeoutMs);if(!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>120000)throw new Error('超时范围为 1000–120000 毫秒');
 if(input.readOnly!==true||typeof input.enabled!=='boolean')throw new Error('请确认外部应用只读，不执行发布、退款、采购或发送消息');
 if(!Array.isArray(input.inputFields)||!input.inputFields.length||input.inputFields.some(k=>!externalInputFields.includes(k)))throw new Error('请选择允许发送的数据字段');
 const outputKey=String(input.outputKey||'result');if(!/^[a-zA-Z][a-zA-Z0-9_]{0,60}$/.test(outputKey))throw new Error('输出字段名格式无效');
 return {id:previous?.id,name,description,provider:input.provider,endpoint:url.href,secretEnv,timeoutMs,readOnly:true,enabled:input.enabled,inputFields:[...new Set(input.inputFields)],outputKey,revision:(previous?.revision||0)+1,lastTest:null};
}
export function publicExternal(s){return {...s,credentialConfigured:!!process.env[s.secretEnv]};}
export function externalBlockers(s){
 if(!s)return ['外部能力不存在'];const issues=[];if(!s.enabled)issues.push('外部能力已停用');if(!s.credentialConfigured)issues.push('外部能力密钥未配置');if(s.lastTest?.status!=='succeeded'||s.lastTest.revision!==s.revision)issues.push('当前外部配置尚未通过协议测试');return issues;
}
export function externalDefinitions(list){return list.map(s=>({id:s.id,name:s.name,description:s.description,type:'external',requires:s.inputFields,roleIds:[],version:s.revision,sideEffect:'remote-declared-read-only',inputPolicy:'仅发送配置允许的字段；外部服务需事先核验为只读',outputSchema:'{status,summary,missing,artifacts,metrics}',sample:{goal:'测试外部只读 Agent 的结构化输出，不执行业务操作'},blockers:externalBlockers(s)}));}
