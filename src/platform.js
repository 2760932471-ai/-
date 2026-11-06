import {initialKnowledge,createKnowledgeManager} from './knowledge.js';
import {initialSources,createSourceManager} from './sources.js';
import {defaultEmployees} from './workforce/employees.js';
import {createTeamManager} from './workforce/team.js';
import {runEmployee} from './workforce/runtime.js';
import {callModel} from './workforce/model.js';
import {executeSkill} from './workforce/skills.js';
import {randomUUID} from 'node:crypto';
import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {createGoal,goalAction,tickGoal} from './goals.js';
import {defaultConfigs,publicConfig,validateConfig,invokeAgent} from './agents/registry.js';
import {financeFields,testSample} from './agents/builtins.js';
const now=()=>new Date().toISOString();
const event=(g,text,card)=>g.messages.push({id:randomUUID(),role:'coordinator',author:'数字员工',text,card,at:now()});
const conflict=message=>Object.assign(new Error(message),{status:409});
export async function createPlatform(dataDir,{invoke=invokeAgent,modelCall=callModel,sourceTransport,embed,embeddingConfig}={}){
 await mkdir(dataDir,{recursive:true});const file=path.join(dataDir,'platform.json');
 let data;try{data=JSON.parse(await readFile(file,'utf8'));if(data.schemaVersion!==1||!Array.isArray(data.goals)||!Array.isArray(data.agents)||!Array.isArray(data.runs))throw new Error('平台存储格式错误');}catch(e){if(e.code!=='ENOENT')throw e;let goals=[];try{goals=JSON.parse(await readFile(path.join(dataDir,'goals.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}data={schemaVersion:1,agents:defaultConfigs(),goals,runs:[],requests:{}};}
 data.employees??=defaultEmployees();data.models??=[];data.sources??=initialSources();data.materials??=[];data.knowledge??=initialKnowledge();
 for(const doc of data.knowledge.documents)if(doc.index.status==='indexing')doc.index={status:'failed',error:'服务重启中断索引，请重试'};
 for(const s of data.sources)if(s.syncing){s.syncing=false;s.lastSync={status:"failed",at:now(),error:"服务重启中断同步，请重试"};}
 let chain=Promise.resolve(),pumping=false;
 async function transaction(fn){const op=chain.then(async()=>{const next=structuredClone(data);const result=await fn(next);await writeFile(file+'.tmp',JSON.stringify(next),{mode:0o600});await rename(file+'.tmp',file);data=next;return structuredClone(result);});chain=op.catch(()=>{});return op;}
 await transaction(d=>{for(const r of d.runs)if(r.status==='running'){r.status='interrupted';r.error='服务重启中断了本次调用，请确认后重试';r.finishedAt=now();const g=d.goals.find(g=>g.id===r.goalId);if(g?.runtime?.runId===r.id)g.runtime={...g.runtime,status:'failed',error:r.error};}});
 const findGoal=(d,id)=>{const g=d.goals.find(g=>g.id===id);if(!g)throw Object.assign(new Error('目标不存在'),{status:404});return g;};
 const findAgent=(d,id)=>{const a=d.agents.find(a=>a.id===id);if(!a)throw Object.assign(new Error('Agent不存在'),{status:404});return a;};
 const sources=createSourceManager({getData:()=>data,transaction,transport:sourceTransport});
 const knowledge=createKnowledgeManager({getData:()=>data,transaction,embed,configuration:embeddingConfig});
 const team=createTeamManager({getData:()=>data,transaction,enqueue,inputs,event,sources,knowledge});
 function enqueue(d,agentId,input,meta={},override){
  if(d.runs.filter(r=>['queued','running'].includes(r.status)).length>=100)throw new Error('运行队列已满，请稍后再试');
  const config=structuredClone(override||findAgent(d,agentId));if(!config.enabled)throw new Error(config.name+'已停用');
  const run={id:randomUUID(),agentId,agentName:config.name,configVersion:config.revision,config,status:'queued',input,createdAt:now(),...meta};d.runs.unshift(run);return run;
 }
 function inputs(g){return {...g.skillData,knowledge:g.knowledge,references:sources.resolve(g),goal:g.text,kind:g.kind,scope:g.scope,facts:g.facts,proposal:g.proposal,financials:g.financials||undefined,conversation:g.messages.slice(-12).map(m=>({author:m.author,text:m.text})),observations:g.artifacts.filter(a=>a.version===g.version).map(a=>({title:a.title,body:a.body,evidence:a.evidence}))};}
 function schedule(d,g){
  if(g.mode==='team')return team.schedule(d,g);
  if(g.mode!=='platform'||g.paused||g.stage!=='draft'||['queued','running','failed','needs_input','waiting_resume'].includes(g.runtime?.status))return;
  const list=g.kind==='listing'?['product',...(g.members.includes('insight')?['insight']:[])]:['insight'];
  const completed=g.runtime?.completed||[];const id=list.find(id=>!completed.includes(id));
  if(!id){goalAction(g,{kind:'draft'});g.artifacts.pop();g.runtime={status:'completed',completed};return;}
  if(!g.members.includes(id)){g.runtime={status:'failed',error:`计划缺少必要能力：${id}`,completed};return;}
  try{const run=enqueue(d,id,inputs(g),{goalId:g.id,goalVersion:g.version,purpose:'draft'});g.runtime={status:'queued',runId:run.id,completed};event(g,`已调度${run.agentName}，使用配置v${run.configVersion}。`);}
  catch(e){g.runtime={status:'failed',completed,error:e.message};}
 }
 function applyRun(d,r){
  if(r.purpose==='model_test'){const model=d.models.find(m=>m.id===r.agentId);if(model&&model.revision===r.configVersion)model.lastTest={revision:model.revision,status:r.status,at:now(),error:r.error};}
  if(!r.goalId)return;
  const g=d.goals.find(g=>g.id===r.goalId);if(!g)return;
  if(r.purpose==='chat'){
   const source=g.messages.find(m=>m.id===r.messageId);if(!source)return;
   const artifact=r.result?.executionType==='model'?r.result.artifacts.at(-1):r.result?.artifacts[0];
   const text=g.version!==r.goalVersion?'目标资料已更新，本次回复基于旧版本，请按当前资料重新提问。':r.status==='failed'?`调用失败：${r.error}。请检查配置后重新提问。`:r.result.summary+(r.result.missing.length?'\n待补充：'+r.result.missing.join('、'):'')+(artifact?'\n\n'+artifact.body:'');
   g.messages.push({id:randomUUID(),role:'agent',author:r.agentName,text,replyTo:source.id,runId:r.id,at:now()});return;
  }
  if(g.mode==='team')return team.apply(d,g,r);
  if(g.version!==r.goalVersion||g.stage!=='draft'||g.runtime?.runId!==r.id){r.status='discarded';r.error='目标版本或阶段已改变，此结果未写入目标';return;}
  if(g.paused){r.status='waiting_resume';g.runtime.status='waiting_resume';return;}
  if(r.error){g.runtime={...g.runtime,status:'failed',error:r.error};const t=g.tasks.find(t=>t.status==='active');if(t)t.status='waiting';event(g,`${r.agentName}执行失败：${r.error}`,'draft');return;}
  if(r.result.status==='needs_input'){r.status='needs_input';g.runtime={...g.runtime,status:'needs_input',missing:r.result.missing,error:r.result.summary};const t=g.tasks.find(t=>t.status==='active');if(t)t.status='waiting';event(g,`${r.result.summary}\n需要补充：${r.result.missing.join('、')}`,'facts');return;}
  r.status='succeeded';
  if(r.agentId==='insight'&&g.kind==='analysis')g.analysis=r.result.metrics;
  for(const a of r.result.artifacts)g.artifacts.push({...a,id:randomUUID(),goalId:g.id,taskId:g.tasks[g.kind==='listing'?2:1].id,version:g.version,status:'draft',agent:r.agentId,runId:r.id,configVersion:r.configVersion});
  g.runtime={status:'idle',completed:[...(g.runtime.completed||[]),r.agentId]};
  event(g,`${r.agentName}：${r.result.summary}`,'draft');schedule(d,g);
 }
 async function create(input){return transaction(d=>{
  if(!/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestId||''))throw new Error('缺少有效创建请求编号');
  const signature=JSON.stringify({...input,requestId:undefined});
  if(Object.hasOwn(d.requests,input.requestId)){const old=d.requests[input.requestId];if(old.signature!==signature)throw conflict('同一创建请求不能更换内容');return findGoal(d,old.goalId);}
  const isTeam=Array.isArray(input.employeeIds);
  const required=input.kind==='listing'?'product':'insight';
  if(!isTeam&&!input.members?.includes(required))throw new Error(`请邀请${required==='product'?'商品运营':'经营分析'} Agent 参与此目标`);
  for(const id of isTeam?[]:input.members){if(!findAgent(d,id).enabled)throw new Error('所选Agent已停用');}
  const g=isTeam?team.create(d,input):createGoal(input);if(!isTeam){g.mode='platform';g.runtime={status:'idle',completed:[]};}
  if(input.scope){for(const k of ['store','sku','product']){if(typeof input.scope[k]!=='string'||!input.scope[k].trim()||input.scope[k].length>120)throw new Error('请填写有效的店铺、SKU / 数据范围和商品名称');g.scope[k]=input.scope[k].trim();}g.scope.platform='用户指定范围（未连接平台）';}
  if(input.proposal){const price=Number(input.proposal.price);if(!Number.isFinite(price)||price<=0||price>100000||Math.abs(price*100-Math.round(price*100))>1e-6)throw new Error('售价必须是有效正数，最多2位小数');g.proposal={title:String(input.proposal.title||g.scope.product).slice(0,120),price};}
  if(!isTeam)g.messages[1].text='目标、任务与协作空间已保存到服务端。请确认资料和计划；代码型 Agent 将处理录入数据。店铺发布仍使用模拟连接器。';
  d.goals.unshift(g);d.requests[input.requestId]={goalId:g.id,signature};return g;
 });}
 async function action(id,input){return transaction(d=>{
  const g=findGoal(d,id);const kind=input.kind;
  if(g.mode==='team'){if(['plan','complete'].includes(kind))sources.resolve(g,d);if(kind==='complete')for(const r of d.runs.filter(r=>r.goalId===g.id&&r.goalVersion===g.version&&r.purpose==='draft'&&r.status==='succeeded'))knowledge.assertRecall(r.input.knowledgeRecall,d);return team.action(d,g,input);}
  if(kind==='message'&&g.mode==='platform'){const mentioned=d.agents.filter(a=>g.members.includes(a.id)&&typeof input.text==='string'&&input.text.includes('@'+a.name.replace(' Agent','')));if(mentioned.length>1)throw new Error('本轮请选择一位接收者，或删除多个@交给数字员工协调');if(mentioned.length===1){if(input.target&&input.target!=='coordinator'&&input.target!==mentioned[0].id)throw new Error('@成员与接收者不一致，请确认发送给谁');input={...input,target:mentioned[0].id};}}
  if(g.mode!=='platform'){goalAction(g,input);return g;}
  if(['facts','ledger','plan','revise','reject','approve','retry','complete'].includes(kind)&&input.expectedVersion!==g.version)throw conflict('目标版本已改变，请重新检查当前内容');
  if(kind==='ledger'){
   if(g.paused)throw new Error('请先恢复目标');if(!['plan','draft'].includes(g.stage))throw new Error('只能在分析准备阶段更新账单');
   if(g.kind!=='analysis')throw new Error('上新观察暂使用模拟账单，此处只接受分析目标');
   const f=input.financials||{};for(const k of financeFields){if(f[k]!==''&&f[k]!==null&&f[k]!==undefined&&(!Number.isFinite(Number(f[k]))||Number(f[k])<0||Number(f[k])>1e12))throw new Error('账单金额需为非负数或留空');}
   if(typeof f.source!=='string'||!f.source.trim()||f.source.length>500||typeof f.window!=='string'||!f.window.trim()||f.window.length>120)throw new Error('请填写账单来源和统计期间');
   g.financials={...Object.fromEntries(financeFields.map(k=>[k,f[k]===''||f[k]===undefined||f[k]===null?null:Number(f[k])])),source:f.source.trim(),window:f.window.trim()};g.version++;g.stage='plan';g.artifacts.forEach(a=>{if(a.status==='draft')a.status='superseded';});g.runtime={status:'idle',completed:[]};event(g,'账单已保存；确认当前计划后开始计算。','plan');
  }else if(kind==='facts'){
   if(g.paused)throw new Error('请先恢复目标');if(!['facts','plan','draft'].includes(g.stage))throw new Error('此阶段请通过内容变更流程修改资料');
   const f=input.facts;if(!f)throw new Error('请提交商品资料');
   for(const k of ['material','connector','source'])if(typeof f[k]!=='string'||!f[k].trim()||f[k].length>500)throw new Error('请填写材质、接口 / 适用规格和来源');
   if(f.cost===''||f.stock===''||f.cost===null||f.stock===null||!Number.isFinite(Number(f.cost))||Number(f.cost)<0||Number(f.cost)>1e9||!Number.isInteger(Number(f.stock))||Number(f.stock)<0||Number(f.stock)>1e9)throw new Error('请填写有效的成本和非负整数库存');
   if(input.confirmed!==true)throw new Error('请确认所填资料来源');
   g.facts={material:f.material.trim(),connector:f.connector.trim(),source:f.source.trim(),cost:Number(f.cost),stock:Number(f.stock),confirmed:true,confirmedBy:'工作空间用户',confirmedAt:now()};g.version++;g.stage='plan';g.runtime={status:'idle',completed:[]};g.artifacts.forEach(a=>{if(a.status==='draft')a.status='superseded';});event(g,'商品资料已保存并确认。请确认计划后开始自动处理。','plan');
  }else if(kind==='retry'){
   if(g.paused)throw new Error('请先恢复目标');if(g.stage!=='draft'||!['failed','needs_input'].includes(g.runtime?.status))throw new Error('当前没有可重试的Agent步骤');g.runtime={status:'idle',completed:g.runtime.completed||[]};schedule(d,g);
  }else{
   if(kind==='draft')throw new Error('确认计划后由后端自动调用Agent生成草案');
   if(['revise','reject'].includes(kind)){
    if(kind==='reject'&&input.approvalId!==g.approval?.id)throw conflict('审批已变化，请重新打开');
    if(kind==='revise'&&Math.abs(Number(input.price)*100-Math.round(Number(input.price)*100))>1e-6)throw new Error('售价最多2位小数');
   }
   goalAction(g,input);
   if(['revise','reject'].includes(kind))g.runtime={status:'idle',completed:[]};
   if(kind==='approve'){goalAction(g,{kind:'execute'});event(g,'批准后已自动提交到模拟店铺连接器，等待核验。','verify');}
   if(kind==='pause'&&!g.paused&&g.runtime?.status==='waiting_resume'){const r=d.runs.find(r=>r.id===g.runtime.runId);applyRun(d,r);}
   if(kind==='plan'||kind==='pause')schedule(d,g);
  }
  // Recompute task projections without triggering additional actions.
  const currentIndex=g.kind==='analysis'?({plan:0,draft:1,review:2,completed:3}[g.stage]):null;
  if(currentIndex!==null&&currentIndex!==undefined)g.tasks.forEach((t,i)=>t.status=i<currentIndex?'completed':i===currentIndex?(g.paused?'paused':g.stage==='plan'?'confirmation':g.stage==='review'?'acceptance':['failed','needs_input'].includes(g.runtime?.status)?'waiting':'active'):'pending');
  if(g.kind==='listing'&&g.stage==='plan'){g.tasks[0].status='completed';g.tasks[1].status=g.paused?'paused':'confirmation';for(const t of g.tasks.slice(2))t.status='pending';}
  g.updatedAt=now();return g;
 });}
 async function pump(){
  if(pumping)return;
  const hasQueue=data.runs.some(r=>r.status==='queued'&&(!r.goalId||r.purpose==='chat'||!data.goals.find(g=>g.id===r.goalId)?.paused));
  const hasGoal=data.goals.some(g=>(!g.repliesPaused&&g.queue.length)||(['platform','team'].includes(g.mode)&&!g.paused&&g.stage==='draft'&&!['queued','running','failed','needs_input','waiting_resume'].includes(g.runtime?.status)));
  if(!hasQueue&&!hasGoal)return;pumping=true;
  try{
   await transaction(d=>{for(const g of d.goals){if(g.mode==='team'){schedule(d,g);team.pumpMessages(d,g);continue;}if(g.mode!=='platform'){tickGoal(g);continue;}schedule(d,g);
    if(!g.repliesPaused&&g.queue.length){const job=g.queue.shift();const source=g.messages.find(m=>m.id===job.source);let id=job.target;
     if(id==='coordinator')id=/利润|成本|费用|亏损/.test(source.text)?'insight':g.kind==='listing'?'product':'insight';
     if(job.intent!=='discuss'||!g.members.includes(id)||g.stage==='completed'){
      g.queue.unshift(job);tickGoal(g);const last=g.messages.at(-1);last.text=last.text.replace('（演示回复）','');
     }else try{enqueue(d,id,{...inputs(g),question:source.text},{goalId:g.id,goalVersion:g.version,purpose:'chat',messageId:source.id});}catch(e){event(g,e.message);}
    }
   }});
   // Claim only one call per pump. Goal pipelines remain sequential and nonblocking for HTTP routes.
   const run=await transaction(d=>{for(const old of d.runs){if(old.status==='queued'&&old.purpose==='draft'){const g=findGoal(d,old.goalId);if(g.version!==old.goalVersion||g.stage!=='draft'){old.status='discarded';old.finishedAt=now();old.error='目标已变更，未调用旧版本任务';}}}const r=d.runs.slice().reverse().find(r=>r.status==='queued'&&(!r.goalId||r.purpose==='chat'||!findGoal(d,r.goalId).paused));if(!r)return null;r.status='running';r.startedAt=now();const g=d.goals.find(g=>g.runtime?.runId===r.id);if(g)g.runtime.status='running';return r;});
   if(run){let result,error;try{if(run.goalId)sources.resolve(findGoal(data,run.goalId));if(run.config.employee){
     const e=data.employees.find(e=>e.id===run.agentId);if(!e?.enabled)throw new Error('员工已停用');
     if(run.input.knowledge?.baseIds?.length){
      const recall=await knowledge.search({...run.input.knowledge,query:run.input.question||run.input.goal,sku:run.input.scope?.sku||''});
      run.input.knowledgeRecall=recall;await transaction(d=>{const r=d.runs.find(r=>r.id===run.id);r.input.knowledgeRecall=recall;(r.trace??=[]).push({phase:'retrieval',status:'succeeded',algorithm:recall.algorithm,hits:recall.hits.length,at:now()});});
     }

     result=await runEmployee(run.config.employee,run.config.model,run.input,{modelCall,onStep:step=>transaction(d=>{const r=d.runs.find(r=>r.id===run.id);(r.trace??=[]).push(step);}),shouldContinue:()=>{const g=data.goals.find(g=>g.id===run.goalId);if(g)sources.resolve(g);knowledge.assertRecall(run.input.knowledgeRecall);return data.employees.find(e=>e.id===run.agentId)?.enabled&&(!g||g.version===run.goalVersion&&(!g.paused||run.purpose==='chat'));}});
    }else if(run.config.modelTest){const answer=await modelCall(run.config.model,[{role:'user',content:'请回复：模型连接正常。'}],[]);result={status:'succeeded',summary:'模型连接测试通过',missing:[],artifacts:[{title:'连接测试',body:answer.message.content||'收到有效响应',evidence:'所配置模型接口实际响应'}],metrics:{}};}
    else if(run.config.skillId)result=await executeSkill(run.config.skillId,run.input);
    else{const currentConfig=data.agents.find(a=>a.id===run.agentId);if(!currentConfig?.enabled)throw new Error('Agent在运行前已停用');result=await invoke(run.config,run.input);}}catch(e){error=e.name==='TimeoutError'||e.name==='AbortError'?'Agent调用超时，可检查配置后重试':run.config.adapter==='http'?(String(e.message).startsWith('Agent')||String(e.message).startsWith('该Agent')||String(e.message).startsWith('服务端')?e.message:'外部Agent请求失败，请检查连接和服务端配置'):e.message;}
    await transaction(d=>{const r=d.runs.find(r=>r.id===run.id);r.finishedAt=now();r.durationMs=Date.parse(r.finishedAt)-Date.parse(r.startedAt);r.status=error?'failed':result.status;r.error=error||null;r.result=result||null;if(!error&&r.goalId){try{sources.resolve(findGoal(d,r.goalId),d);knowledge.assertRecall(r.input.knowledgeRecall,d);}catch(e){r.error=e.message;r.status='failed';r.result=null;}}applyRun(d,r);});
   }
  }finally{pumping=false;}
 }
 return {
  goals:()=>structuredClone(data.goals),agents:()=>data.agents.map(publicConfig),runs:()=>data.runs.map(({config,input,result,...r})=>r),
  run:id=>{const r=data.runs.find(r=>r.id===id);if(!r)throw Object.assign(new Error('运行记录不存在'),{status:404});const {config,...safe}=r;return structuredClone(safe);},
  create,action,pump,workforce:team,sources,knowledge,
  saveAgent:(id,input)=>transaction(d=>{const prev=findAgent(d,id);const next=validateConfig(input,prev);d.agents[d.agents.indexOf(prev)]=next;return publicConfig(next);}),
  testAgent:(id,input)=>transaction(d=>{if(input!==undefined&&(!input||typeof input!=='object'||Array.isArray(input)))throw new Error('测试输入必须为JSON对象');const run=enqueue(d,id,input??testSample(id),{purpose:'test'});return {id:run.id,status:run.status};}),
  sample:id=>{findAgent(data,id);return testSample(id);},
  close:()=>chain
 };
}
