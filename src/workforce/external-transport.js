import {validateDestination,validateOutput} from '../agents/registry.js';
import {externalInputFields} from './external.js';
export async function invokeExternal(config,input,{fetch:request=fetch,resolve}={}){
 if(!config.enabled||!config.readOnly)throw new Error('外部能力未启用或未确认只读');
 const key=process.env[config.secretEnv];if(!key)throw new Error('外部能力密钥尚未配置');
 const allowed=Object.fromEntries(config.inputFields.filter(k=>externalInputFields.includes(k)&&Object.hasOwn(input,k)).map(k=>[k,input[k]]));
 const signal=AbortSignal.timeout(config.timeoutMs),abort=new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('外部能力调用超时')),{once:true}));
 try{
  await Promise.race([validateDestination(config.endpoint,resolve),abort]);
  const payload=config.provider==='dify'?{inputs:{context:JSON.stringify(allowed)},response_mode:'blocking',user:'ai-workbench'}:{schemaVersion:1,skillId:config.id,configVersion:config.revision,input:allowed};
  const response=await request(config.endpoint,{method:'POST',redirect:'error',signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify(payload)});
  if(!response.ok)throw new Error();const reader=response.body.getReader(),parts=[];let size=0;
  while(true){const {done,value}=await Promise.race([reader.read(),abort]);if(done)break;size+=value.length;if(size>256000){await reader.cancel();throw new Error();}parts.push(value);}
  const raw=Buffer.concat(parts).toString('utf8');if(raw.includes(key))throw new Error();let data=JSON.parse(raw),output=data;
  if(config.provider==='dify'){if(data.data?.status!=='succeeded')throw new Error();output=data.data.outputs?.[config.outputKey];if(typeof output==='string')output=JSON.parse(output);}
  const result=validateOutput(output);return {...result,remote:{provider:config.provider,configVersion:config.revision,workflowRunId:config.provider==='dify'?String(data.workflow_run_id||'').slice(0,120):null}};
 }catch{throw new Error('外部 Agent 调用失败：请检查授权域名、密钥、工作流状态、超时或输出协议；未保存错误响应正文。');}
}
