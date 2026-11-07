import {discussionMembers,contextSettings,mentionedEmployees,selectConversation,updateContext} from './conversation.js';
import {assertPlanCurrent,planningSignature,validatePlan} from './planning.js';
import {validateExternal,publicExternal,externalDefinitions,externalBlockers} from './external.js';
import {recipes,matchingRecipes} from './commerce.js';
import {randomUUID} from 'node:crypto';
import {createGoal} from '../goals.js';
import {validateEmployee,employeeReadiness,workforceView} from './employees.js';
import {validateModel,publicModel} from './model.js';
import {skillSample,skillDefinitions,skillInputHint} from './skills.js';
import {financeFields} from '../agents/builtins.js';
const stamp=()=>new Date().toISOString();
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
export function createTeamManager({getData,transaction,enqueue,inputs,event,sources,knowledge}){
 const models=d=>d.models.map(publicModel);
 const employee=(d,id)=>d.employees.find(e=>e.id===id)||fail('员工不存在',404);
 function requireReady(d,id){const e=employee(d,id),r=employeeReadiness(e,models(d),d.externalSkills.map(publicExternal));if(!r.ready)fail(e.name+'：'+r.blockers.join('；'));return e;}
 function enqueueEmployee(d,id,input,meta){
  let e=requireReady(d,id);if(meta.purpose==='draft'&&meta.assignment){e={...e,skillIds:meta.assignment.skillIds};input={...input,assignment:meta.assignment};}const model=e.mode==='model'?d.models.find(m=>m.id===e.modelId):null;
  return enqueue(d,id,input,{...meta}, {id:e.id,name:e.name,revision:e.revision,employee:structuredClone(e),model:model?structuredClone(model):null,externalSkills:d.externalSkills.filter(s=>e.skillIds.includes(s.id)),enabled:true,adapter:e.mode});
 }
 function update(g){
  const completed=g.runtime?.completed||[];
  g.tasks.forEach((t,i)=>{t.status=i===0?(g.stage==='plan'?'confirmation':'completed'):i===g.tasks.length-1?(g.stage==='completed'?'completed':g.stage==='review'?'acceptance':'pending'):completed.includes(t.owner)?'completed':g.stage==='draft'&&g.members.find(id=>!completed.includes(id))===t.owner?(g.paused?'paused':['failed','needs_input'].includes(g.runtime.status)?'waiting':'active'):'pending';});
 }
 function schedule(d,g){
  if(g.paused||g.stage!=='draft'||['queued','running','failed','needs_input','waiting_resume'].includes(g.runtime.status))return;
  const completed=g.runtime.completed||[],id=g.members.find(id=>!completed.includes(id));
  if(!id){g.stage='review';g.runtime={status:'completed',completed};event(g,'所选员工已完成本轮交付，请人工验收；未执行真实业务写入。','review');update(g);return;}
  try{assertPlanCurrent(d,g);const run=enqueueEmployee(d,id,inputs(g),{goalId:g.id,goalVersion:g.version,purpose:'draft',assignment:g.executionPlan?.steps.find(s=>s.employeeId===id)});g.runtime={status:'queued',completed,runId:run.id};event(g,`已交给${run.agentName}：${run.config.employee.mode==='model'?'模型选择已装配Skill':'按装配顺序执行代码 / 外部能力'}。`);}
  catch(e){g.runtime={status:'failed',completed,error:e.message};}
  update(g);
 }
 function create(d,input){
  const ids=[...new Set(input.employeeIds||[])];if(!ids.length||ids.length>8)fail('请选择1–8名员工');ids.forEach(id=>requireReady(d,id));
  const g=createGoal({...input,members:['product','insight'],permission:'draft'});
  g.knowledge={baseIds:d.knowledge.bases.filter(b=>b.id==='kb-default'&&b.enabled).map(b=>b.id),mode:'bm25',topK:5};g.mode='team';g.members=ids;g.participants=[...ids];g.coordinator='团队执行协调';g.stage='plan';g.permission='draft';g.criterion='按确认资料完成所选员工的交付，人工验收；不执行真实发布、调价或投放';g.runtime={status:'idle',completed:[]};
  const titles=['确认分工与资料',...ids.map(id=>employee(d,id).name+'交付'),'负责人验收'];
  g.tasks=titles.map((title,i)=>({id:randomUUID(),goalId:g.id,title,owner:ids[Math.max(0,Math.min(i-1,ids.length-1))],dependsOn:i?i-1:null,status:'pending'}));
  g.messages[1].text='已建立员工协作目标。请先填写资料，再确认分工；员工按选择顺序交接成果，模型模式可自主选择已装配Skill。';update(g);return g;
 }
 function revise(g){g.version++;g.planProposal=null;g.executionPlan=null;g.stage='plan';g.runtime={status:'idle',completed:[]};g.artifacts.forEach(a=>{if(a.status==='draft')a.status='superseded';});event(g,'资料已保存为新版本，请重新确认计划。','plan');}
 function action(d,g,input){
  const k=input.kind;
  if(['knowledge','references','facts','ledger','inputs','plan','retry','complete','revise','adoptPlan','discardPlan','replan'].includes(k)&&input.expectedVersion!==g.version)fail('目标版本已改变，请重新检查',409);
  if(k==='message'){
   const text=String(input.text||'').trim();if(!text||text.length>2000)fail('请输入1–2000字的消息');if(g.queue.length>=24)fail('待回复队列已满');
   const people=discussionMembers(g),mentioned=mentionedEmployees(text,people.map(id=>employee(d,id)),input.mentionIds||[]);
   if(mentioned.length&&input.target&&input.target!=='coordinator'&&(mentioned.length!==1||input.target!==mentioned[0]))fail('@成员与接收者不一致，请改为数字员工协调或只选一位');
   const recipients=mentioned.length?mentioned:[input.target||'coordinator'];for(const target of recipients)if(target!=='coordinator'&&!people.includes(target))fail('请先邀请该员工加入本目标讨论');
   if(g.queue.length+recipients.length>24)fail('待回复队列已满');
   const intent=input.intent||'discuss';if(!['discuss','context','change'].includes(intent))fail('消息用途无效');
   if(input.replyTo){const ref=g.messages.find(m=>m.id===input.replyTo),c=contextSettings(g);if(!ref)fail('引用消息不存在');if(c.excludedIds.includes(ref.id)||g.messages.indexOf(ref)<=g.messages.findIndex(m=>m.id===c.startAfter))fail('该消息已排除或属于旧话题，请将必要背景重新说明');}
   const m={id:randomUUID(),role:'human',author:'你',text,at:stamp(),goalVersion:g.version,replyTo:input.replyTo||null,targets:recipients,intent};g.messages.push(m);
   for(const target of recipients)g.queue.push({source:m.id,target,intent});
  }else if(k==='inviteDiscussion'){
   const e=requireReady(d,input.employeeId),people=discussionMembers(g);if(people.length>=24&&!people.includes(e.id))fail('讨论成员最多 24 人');g.participants=[...new Set([...people,e.id])];event(g,e.name+'已加入讨论，可 @ 提问；执行计划的成员和授权范围未改变。');
  }else if(k==='chatContext'){
   updateContext(g,input);event(g,input.reset?'已开始新话题，历史记录仍保留；旧话题不会自动带入后续回复。':'上下文设置已保存，后续提问按新设置筛选。');
  }else if(k==='pauseReplies'){g.repliesPaused=!g.repliesPaused;}
  else if(k==='pause'){
   if(g.stage==='completed')fail('目标已结束');g.paused=!g.paused;event(g,g.paused?'目标已暂停；当前调用返回后保留结果，不再启动后续调用。':'目标已恢复。');
   if(!g.paused&&g.runtime.status==='waiting_resume'){const r=d.runs.find(r=>r.id===g.runtime.runId);apply(d,g,r);}else schedule(d,g);
  }else{
   if(g.paused)fail('请先恢复目标');
   if(k==='replan'){
    if(g.stage!=='draft'||!['failed','needs_input'].includes(g.runtime.status))fail('只有失败或待补资料的任务可以重新安排分工');revise(g);event(g,'已保留业务资料并回到计划阶段；旧草案保留为历史，请重新安排分工。');
   }else if(k==='adoptPlan'){
    if(g.stage!=='plan')fail('仅可在计划确认前采用分工');const p=g.planProposal;
    if(!p||p.id!==input.proposalId||p.goalVersion!==g.version||p.signature!==planningSignature(d,g))fail('分工草案或员工配置已变化，请重新生成',409);
    g.members.forEach(id=>requireReady(d,id));const approved=validatePlan(p,g.members.map(id=>employee(d,id)));
    g.version++;g.executionPlan={...p,...approved,goalVersion:g.version,adoptedAt:stamp()};g.planProposal=null;g.members=approved.steps.map(s=>s.employeeId);g.executionPlan.signature=planningSignature(d,g);
    g.tasks=[{id:randomUUID(),title:'确认分工与资料',owner:g.members[0]},...approved.steps.map(s=>({id:randomUUID(),title:employee(d,s.employeeId).name+'交付',owner:s.employeeId})),{id:randomUUID(),title:'负责人验收',owner:g.members.at(-1)}].map((t,i)=>({...t,goalId:g.id,dependsOn:i?i-1:null,status:'pending'}));
    g.runtime={status:'idle',completed:[]};event(g,'已采用总控分工。请补齐所列资料后确认计划，采用分工本身不会开始执行。');
   }else if(k==='discardPlan'){
    if(!g.planProposal||g.planProposal.id!==input.proposalId)fail('草案已变化，请刷新');g.planProposal=null;
   }else if(k==='inputs'){
    if(!['plan','draft'].includes(g.stage))fail('当前阶段不能修改Skill业务资料');const context=input.data;
    if(!context||typeof context!=='object'||Array.isArray(context)||Object.keys(context).some(k=>!['candidates','unitCosts','inventory','commerce','campaign','replenishment','traffic','serviceQuestion'].includes(k)))fail('只接受已定义的业务资料字段');
    if(context.candidates&&(!Array.isArray(context.candidates)||context.candidates.length>50||context.candidates.some(c=>!c||typeof c!=='object'||Array.isArray(c))))fail('候选商品最多50项且每项需为对象');
    for(const key of ['unitCosts','inventory'])if(context[key]&&(typeof context[key]!=='object'||Array.isArray(context[key])))fail('成本或库存资料格式错误');
    for(const key of ['commerce','campaign','replenishment','traffic'])if(context[key]&&(typeof context[key]!=='object'||Array.isArray(context[key])))fail('业务输入必须为对象');if(context.serviceQuestion!==undefined&&(typeof context.serviceQuestion!=='string'||context.serviceQuestion.length>2000))fail('客户问题最多2000字');
    g.skillData=structuredClone(context);revise(g);
   }else if(k==='knowledge'){
    if(!['plan','draft'].includes(g.stage))fail('当前阶段不能修改知识检索范围');g.knowledge=knowledge.validateScope(input.knowledge,d);revise(g);
   }else if(k==='references'){
    if(input.confirmed!==true)fail('请核对所选资料与商品一致');
    if(!['plan','draft'].includes(g.stage))fail('当前阶段请新建跟进目标，不能覆盖已交付资料');
    g.references=sources.select(d,g,input.references);revise(g);event(g,'已确认 '+g.references.length+' 项参考资料；商品事实仍需单独核对。','facts');
   }else if(k==='facts'){
    if(g.kind!=='listing'||!['plan','draft'].includes(g.stage))fail('当前阶段不允许修改商品资料');const f=input.facts||{};
    for(const key of ['material','connector','source'])if(typeof f[key]!=='string'||!f[key].trim()||f[key].length>500)fail('请填写商品材质、接口与来源');
    if(input.confirmed!==true||f.cost===''||f.stock===''||f.cost===null||f.stock===null||!Number.isFinite(Number(f.cost))||Number(f.cost)<0||Number(f.cost)>1e9||!Number.isInteger(Number(f.stock))||Number(f.stock)<0||Number(f.stock)>1e9)fail('请确认资料并填写有效成本与整数库存');
    g.facts={material:f.material.trim(),connector:f.connector.trim(),source:f.source.trim(),cost:Number(f.cost),stock:Number(f.stock),confirmed:true};revise(g);
   }else if(k==='ledger'){
    if(g.kind!=='analysis'||!['plan','draft'].includes(g.stage))fail('只能在分析准备阶段更新账单');const f=input.financials||{};
    if(typeof f.source!=='string'||!f.source.trim()||f.source.length>500||typeof f.window!=='string'||!f.window.trim()||f.window.length>120)fail('请填写来源与统计期间');
    const financials={source:f.source.trim(),window:f.window.trim()};for(const key of financeFields){const v=f[key];if(v===''||v==null)financials[key]=null;else if(typeof v==='boolean'||!Number.isFinite(Number(v))||Number(v)<0||Number(v)>1e12)fail('账单金额无效');else financials[key]=Number(v);}g.financials=financials;revise(g);
   }else if(k==='revise'){
    if(g.kind!=='listing'||!['plan','draft'].includes(g.stage))fail('当前阶段无法修改发布草案');const price=Number(input.price),title=String(input.title||'').trim();if(!title||title.length>120||!Number.isFinite(price)||price<=0||price>100000||Math.abs(price*100-Math.round(price*100))>1e-6)fail('请填写有效标题与两位小数售价');g.proposal={title,price};revise(g);
   }else if(k==='plan'){
    if(g.stage!=='plan')fail('当前计划已确认');if(g.planProposal)fail('请先采用或放弃待审分工，再确认执行');assertPlanCurrent(d,g);g.members.forEach(id=>requireReady(d,id));g.stage='draft';g.runtime={status:'idle',completed:[]};event(g,'分工已确认，开始按顺序交接成果。');schedule(d,g);
   }else if(k==='retry'){
    if(g.stage!=='draft'||!['failed','needs_input'].includes(g.runtime.status))fail('没有可重试步骤');g.runtime={status:'idle',completed:g.runtime.completed||[]};schedule(d,g);
   }else if(k==='complete'){
    if(g.stage!=='review')fail('请等待员工完成交付');g.stage='completed';g.artifacts.filter(a=>a.version===g.version).forEach(a=>a.status='accepted');event(g,'负责人已验收，本目标结束。');
   }else fail('团队任务不支持此操作；当前仅交付草案，不执行店铺写入');
  }
  update(g);g.updatedAt=stamp();return g;
 }
 function apply(d,g,r){
  if(g.version!==r.goalVersion||g.stage!=='draft'||g.runtime.runId!==r.id){r.status='discarded';r.error='目标版本已变化，此结果未应用';return;}
  if(g.paused){r.status='waiting_resume';g.runtime.status='waiting_resume';return;}
  if(r.error||r.result?.status==='needs_input'){
   const status=r.error?'failed':'needs_input';r.status=status;g.runtime={...g.runtime,status,error:r.error||r.result.summary,missing:r.result?.missing||[]};event(g,`${r.agentName}：${g.runtime.error}`,'facts');update(g);return;
  }
  r.status='succeeded';if(r.result.metrics?.profit!==undefined)g.analysis=r.result.metrics;
  for(const a of r.result.artifacts)g.artifacts.push({...a,id:randomUUID(),goalId:g.id,taskId:g.tasks.find(t=>t.owner===r.agentId&&t.title.endsWith('交付'))?.id,version:g.version,status:'draft',agent:r.agentId,runId:r.id,configVersion:r.configVersion});
  event(g,r.result.summary,'draft');g.runtime={status:'idle',completed:[...(g.runtime.completed||[]),r.agentId]};schedule(d,g);
 }
 function pumpMessages(d,g){
  if(g.repliesPaused||!g.queue.length)return;const job=g.queue.shift(),source=g.messages.find(m=>m.id===job.source);
  if(contextSettings(g).startAfter&&g.messages.findIndex(m=>m.id===source.id)<=g.messages.findIndex(m=>m.id===contextSettings(g).startAfter))return;
  if(job.intent!=='discuss'){event(g,'已记录背景或变更请求。业务事实请在资料页更新，确认后生成新版本。');return;}
  if(job.target==='coordinator'&&/进度|做到哪|下一步|还缺|缺什么|缺哪些/.test(source.text)){
   const completed=g.runtime?.completed||[],next=g.members.find(id=>!completed.includes(id));
   const labels={plan:'等待负责人确认计划',draft:'正在执行分工',review:'已交付，等待人工验收',completed:'负责人已验收'};
   const snapshot=g.planProposal||g.executionPlan,missing=g.runtime?.missing?.length?g.runtime.missing:snapshot?.goalVersion===g.version?snapshot.checks.filter(c=>c.status==='missing').flatMap(c=>c.missing):[];
   event(g,`当前：${g.paused?'目标暂停；':''}${labels[g.stage]||g.stage}。已完成 ${completed.length} / ${g.members.length} 名员工的本轮交付。${next&&g.stage!=='completed'?'下一位：'+employee(d,next).name+'。':''}${missing.length?'待补资料（最近检查）：'+[...new Set(missing)].join('；')+'。':'尚无待补项记录，未记录不代表资料已完整核验。'}${g.runtime?.error?'当前阻塞：'+g.runtime.error+'。':''}请在任务页查看分工、在资料页保存业务事实；这次进度查询没有重跑能力。`);
   return;
  }
  const people=discussionMembers(g),previous=g.messages.slice(0,g.messages.indexOf(source)).reverse().find(m=>m.role==='human'&&m.resolvedTargets?.length&&!contextSettings(g).excludedIds.includes(m.id)&&g.messages.indexOf(m)>g.messages.findIndex(x=>x.id===contextSettings(g).startAfter));
  const reply=g.messages.find(m=>m.id===source.replyTo),desired=matchingRecipes(source.text).flatMap(r=>r.skillIds);
  let id=job.target;
  if(id==='coordinator'){
   id=reply?.employeeId||reply?.resolvedTargets?.[0];
   if(!id&&desired.length)id=people.find(id=>employee(d,id).skillIds.some(s=>desired.includes(s)));
   if(!id&&!desired.length&&/^(那|这个|刚才|继续|再|为什么|怎么)|上一条/.test(source.text)&&previous?.resolvedTargets?.length>1){event(g,'上一轮有多位员工参与，请 @ 一位员工或引用他的回复后继续提问。');return;}
   if(!id&&/^(那|这个|刚才|继续|再|为什么|怎么)|上一条/.test(source.text))id=previous?.resolvedTargets?.[0];
   if(!people.includes(id))id=people.find(id=>employee(d,id).roleId==='coordination')||people[0];
  }
  source.resolvedTargets=[...new Set([...(source.resolvedTargets||[]),id])];
  let e;try{e=requireReady(d,id);}catch(error){event(g,error.message);return;}
  if(/你是谁|你能做什么|能做哪些|介绍一下自己|需要哪些资料/.test(source.text)){
   const defs=[...skillDefinitions,...externalDefinitions(d.externalSkills.map(publicExternal))];
   g.messages.push({id:randomUUID(),role:'agent',employeeId:id,author:e.name,text:'我目前可以处理：\n'+e.skillIds.map(id=>{const s=defs.find(s=>s.id===id);return '- '+s.name+'：'+s.description+'\n  所需资料：'+skillInputHint(id);}).join('\n')+'\n可在资料页补齐输入，或继续 @ 我讨论。基础代码员工按已装配规则处理，不具备通用模型的自由对话能力。',replyTo:source.id,goalVersion:g.version,status:'succeeded',at:stamp()});return;
  }
  const selected=selectConversation(g,source);
  const question=people.map(id=>employee(d,id).name).sort((a,b)=>b.length-a.length).reduce((text,name)=>text.replaceAll('@'+name,''),source.text).trim();
  try{enqueueEmployee(d,id,{...inputs(g),...selected,question},{goalId:g.id,goalVersion:g.version,purpose:'chat',messageId:source.id,contextRevision:contextSettings(g).revision});}catch(e){event(g,e.message);}

 }
 return {create,action,schedule,apply,pumpMessages,
  context:(id,text)=>{const g=getData().goals.find(g=>g.id===id)||fail('目标不存在');return {...contextSettings(g),...selectConversation(g,{text:text||g.text})};},
  view:()=>({...workforceView(getData(),models(getData()),getData().externalSkills.map(publicExternal)),recipes:recipes.map(r=>({...r,employeeId:getData().employees.find(e=>e.recipeId===r.id)?.id||null}))}),
  recommend:text=>{const d=getData(),matches=matchingRecipes(String(text||''));return {method:'关键词与已装配能力匹配',recipes:matches,employeeIds:[...new Set(matches.flatMap(r=>d.employees.filter(e=>e.skillIds.some(id=>r.skillIds.includes(id))&&employeeReadiness(e,models(d),d.externalSkills.map(publicExternal)).ready).slice(0,1).map(e=>e.id)))],missing:matches.filter(r=>!d.employees.some(e=>e.skillIds.some(id=>r.skillIds.includes(id))&&employeeReadiness(e,models(d),d.externalSkills.map(publicExternal)).ready)).map(r=>r.name)};},
  install:recipeId=>transaction(d=>{const r=recipes.find(r=>r.id===recipeId)||fail('业务工作包不存在');const old=d.employees.find(e=>e.recipeId===r.id);if(old)return old;const e={id:randomUUID(),recipeId:r.id,name:r.employeeName,roleId:r.roleId,skillIds:r.skillIds,enabled:true,mode:'skills',modelId:null,instructions:r.output+'；先核验输入，保留证据，不执行业务写入',maxSteps:5,revision:1};d.employees.push(e);return e;}),
  saveExternal:(id,input)=>transaction(d=>{const previous=id?d.externalSkills.find(s=>s.id===id):null;if(id&&!previous)fail('外部能力不存在',404);const next=validateExternal(input,previous);next.id=previous?.id||'external_'+randomUUID().replaceAll('-','');if(previous)d.externalSkills[d.externalSkills.indexOf(previous)]=next;else d.externalSkills.push(next);return publicExternal(next);}),
  testExternal:(id,input)=>transaction(d=>{const s=d.externalSkills.find(s=>s.id===id)||fail('外部能力不存在',404);const r=enqueue(d,id,input||{goal:'验证只读结构化输出，不执行任何业务写入'},{purpose:'external_test'},{id,name:s.name,revision:s.revision,externalTest:true,external:s,enabled:s.enabled,adapter:'external'});return {id:r.id,status:r.status};}),
  saveEmployee:(id,input)=>transaction(d=>{const previous=id?employee(d,id):null,next=validateEmployee(input,previous,d.externalSkills.map(publicExternal));if(next.modelId&&!d.models.some(m=>m.id===next.modelId))fail('所选模型不存在');next.id=previous?.id||randomUUID();if(previous)d.employees[d.employees.indexOf(previous)]=next;else d.employees.push(next);return next;}),
  saveModel:(id,input)=>transaction(d=>{const previous=id?d.models.find(m=>m.id===id):null;if(id&&!previous)fail('模型不存在',404);const next=validateModel(input,previous);next.id=previous?.id||randomUUID();if(previous)d.models[d.models.indexOf(previous)]=next;else d.models.push(next);return publicModel(next);}),
  testModel:id=>transaction(d=>{const model=d.models.find(m=>m.id===id)||fail('模型不存在',404);return enqueue(d,id,{goal:'连接测试'},{purpose:'model_test'},{id,name:model.name,revision:model.revision,model,modelTest:true,enabled:true,adapter:'model'});}).then(r=>({id:r.id,status:r.status})),
  testEmployee:id=>transaction(d=>{const e=employee(d,id);const sample=skillSample(e.skillIds[0]);const r=enqueueEmployee(d,id,sample,{purpose:'employee_test'});return {id:r.id,status:r.status};}),
  testSkill:(id,input)=>transaction(d=>{if(!skillDefinitions.some(s=>s.id===id))fail('Skill不存在',404);const r=enqueue(d,id,input??skillSample(id),{purpose:'skill_test'},{id,name:skillDefinitions.find(s=>s.id===id).name,revision:1,skillId:id,enabled:true,adapter:'skill'});return {id:r.id,status:r.status};})
 };
}
