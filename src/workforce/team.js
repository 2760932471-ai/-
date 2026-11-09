import {matchMembers,matchingKey} from './matching.js';
import {validateCopyBrief} from './content.js';
import {discussionMembers,contextSettings,mentionedEmployees,mentionsEveryone,selectConversation,updateContext} from './conversation.js';
import {assertPlanCurrent,planningSignature,validatePlan,checkTeamInputs} from './planning.js';
import {validateExternal,publicExternal,externalDefinitions,externalBlockers} from './external.js';
import {recipes,matchingRecipes} from './commerce.js';
import {randomUUID} from 'node:crypto';
import {createGoal} from '../goals.js';
import {validateEmployee,employeeReadiness,workforceView} from './employees.js';
import {validateModel,publicModel} from './model.js';
import {skillSample,skillDefinitions,skillInputHint} from './skills.js';
import {financeFields,isSelectionGoal} from '../agents/builtins.js';
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
 function selectionTeam(d){return ['research','selection','coordination'].map(role=>d.employees.find(e=>e.roleId===role&&e.skillIds.includes(({research:'product.compare',selection:'selection.score',coordination:'task.brief'})[role])&&employeeReadiness(e,models(d),d.externalSkills.map(publicExternal)).ready)?.id).filter(Boolean);}
 function receipt(g,e,text,extra={}){g.messages.push({id:randomUUID(),role:'agent',employeeId:e.id,author:e.name,text,goalVersion:g.version,at:stamp(),...extra});}
 function installLocalMatches(d,text){
  for(const recipe of matchingRecipes(text))if(!d.employees.some(e=>e.recipeId===recipe.id||recipe.skillIds.every(id=>e.skillIds.includes(id)))){
   d.employees.push({id:randomUUID(),recipeId:recipe.id,name:recipe.employeeName,roleId:recipe.roleId,skillIds:recipe.skillIds,enabled:true,mode:'skills',modelId:null,instructions:recipe.output+'；保留来源，不执行业务写入',maxSteps:5,revision:1});
  }
 }
 function needsMatching(d,g){return g.mode==='team'&&g.teamSelection==='auto'&&g.stage==='plan'&&!g.paused&&!g.planProposal&&(!g.executionPlan||g.executionPlan.source==='auto-match')&&g.matching?.key!==matchingKey(d,g);}
 function autoAssign(d,g,{initial=false}={}){
  if(g.teamSelection!=='auto'||g.stage!=='plan'||g.paused||g.planProposal||(g.executionPlan&&g.executionPlan.source!=='auto-match'))return false;
  installLocalMatches(d,g.text);const key=matchingKey(d,g);
  if(g.matching?.key===key&&g.executionPlan)return false;
  const matched=matchMembers(d,g.text),selected=JSON.stringify([matched.steps,matched.missing,matched.steps.map(s=>{const e=employee(d,s.employeeId);return [e.revision,e.modelId?d.models.find(m=>m.id===e.modelId)?.revision:null];})]);
  if(g.matching?.selected===selected&&g.executionPlan){g.matching.key=key;return false;}
  const oldPeople=discussionMembers(g);
  if(!initial&&(!g.matching||g.matching.selected!==selected))revise(g);
  g.matching={...matched,key,selected,at:stamp()};g.members=matched.employeeIds;
  // Keep prior discussion membership. If full, reserve room for the new execution team.
  g.participants=[...new Set([...g.members,...oldPeople])].slice(0,24);
  g.kind=matched.intent==='listing'?'listing':'analysis';g.intent=matched.intent;
  if(matched.intent==='selection'){
   g.proposal=null;if(['DEMO-JF-001','全店汇总','店铺汇总（演示）'].includes(g.scope.sku))g.scope.sku='待比较候选';
   if(['角阀','角阀 · 样例商品','经营分析'].includes(g.scope.product))g.scope.product='候选商品';
  }
  g.tasks=['确认分工与资料',...matched.steps.map(s=>s.employeeName+'交付'),'负责人验收'].map((title,i)=>({id:randomUUID(),goalId:g.id,title,owner:g.members[Math.max(0,Math.min(i-1,g.members.length-1))]||'coordinator',dependsOn:i?i-1:null,status:'pending'}));
  g.executionPlan={...matched,id:randomUUID(),source:'auto-match',mode:'rules',goalVersion:g.version,signature:planningSignature(d,g),checks:[],createdAt:stamp()};
  event(g,'总控已自动安排团队，无需手动改组。\n'+matched.steps.map((s,i)=>(i+1)+'. '+s.employeeName+'：'+s.objective+'；'+s.reasons.join('；')).join('\n')+(matched.missing.length?'\n能力缺口：'+matched.missing.join('；'):''));update(g);return true;
 }
 async function syncPending(d){
  for(const g of d.goals){
   if(g.mode!=='team'||g.contentDraft)continue;
   if(!g.teamSelection){g.teamSelection=g.stage==='plan'&&!g.executionPlan&&!g.planProposal?'auto':'manual';}
   if(needsMatching(d,g)){autoAssign(d,g);try{await kickoff(d,g);}catch(error){g.collaboration=null;g.matching.checkError='资料检查未完成，请核对资料来源后重试';event(g,g.matching.checkError,'facts');}}
  }
 }
 async function kickoff(d,g){
  if(g.stage!=='plan'||g.paused)fail('请先回到未暂停的计划阶段');
  const signature=planningSignature(d,g);if(g.collaboration?.goalVersion===g.version&&g.collaboration.signature===signature)return g;
  const steps=g.members.map(id=>{const e=employee(d,id);return {employeeId:id,employeeName:e.name,skillIds:g.executionPlan?.steps.find(s=>s.employeeId===id)?.skillIds||e.skillIds};});
  const checks=await checkTeamInputs(d,g,steps,inputs);
  for(const step of steps){const ready=employeeReadiness(employee(d,step.employeeId),models(d),d.externalSkills.map(publicExternal));if(!ready.ready)checks.push({employeeId:step.employeeId,employeeName:step.employeeName,skillId:null,name:'员工配置',status:'missing',missing:ready.blockers,detail:'配置未就绪'});}
  g.collaboration={goalVersion:g.version,signature,steps,checks,createdAt:stamp()};if(g.executionPlan?.source==='auto-match')g.executionPlan.checks=checks;
  event(g,'已完成本地能力与输入检查，协作顺序：'+steps.map(s=>s.employeeName).join(' → ')+'。前一步的正式成果会传给后续员工，最后由负责人验收。'+(isSelectionGoal(g.text)?'\n当前支持对已提供的候选做比较和评分；没有自动搜索全网或 1688。请提供至少两款候选的参数、价格和可核对来源；评分需要你提供依据。':''));
  for(const step of steps){const rows=checks.filter(c=>c.employeeId===step.employeeId);receipt(g,employee(d,step.employeeId),'能力检查 · 本地规则\n'+rows.map(c=>c.name+'：'+(c.status==='missing'?'待补 '+c.missing.join('、'):c.status==='runtime'?c.detail:'输入校验通过')).join('\n')+(steps.indexOf(step)?'\n执行时接收前序员工的交付物。':''),{workflow:'check'});}
  return g;
 }
 function regroup(d,g){
  if(g.stage!=='plan'||g.paused||!isSelectionGoal(g.text))fail('仅可对待确认的选品目标重新匹配团队');
  const ids=selectionTeam(d);if(ids.length!==3)fail('市场研究、选品与运营协调员工需先配置就绪');
  revise(g);g.members=ids;g.participants=[...new Set([...discussionMembers(g),...ids])];if(g.participants.length>24)fail('讨论成员已满，请先整理成员');g.kind='analysis';g.intent='selection';g.proposal=null;
  if(['DEMO-JF-001','全店汇总','店铺汇总（演示）'].includes(g.scope.sku))g.scope.sku='待比较候选';
  if(/^(角阀|经营分析)/.test(g.scope.product))g.scope.product='候选商品';
  g.tasks=['确认分工与资料',...ids.map(id=>employee(d,id).name+'交付'),'负责人验收'].map((title,i)=>({id:randomUUID(),goalId:g.id,title,owner:ids[Math.max(0,Math.min(i-1,ids.length-1))],dependsOn:i?i-1:null,status:'pending'}));update(g);
  event(g,'已按你的操作重新匹配选品执行团队；历史消息和资料保留，旧成员仍可参与讨论。');
 }
 function update(g){
  const completed=g.runtime?.completed||[];
  g.tasks.forEach((t,i)=>{t.status=i===0?(g.stage==='plan'?'confirmation':'completed'):i===g.tasks.length-1?(g.stage==='completed'?'completed':g.stage==='review'?'acceptance':'pending'):completed.includes(t.owner)?'completed':g.stage==='draft'&&g.members.find(id=>!completed.includes(id))===t.owner?(g.paused?'paused':['failed','needs_input'].includes(g.runtime.status)?'waiting':'active'):'pending';});
 }
 function schedule(d,g){
  if(g.paused||g.stage!=='draft'||['queued','running','failed','needs_input','waiting_resume'].includes(g.runtime.status))return;
  const completed=g.runtime.completed||[],id=g.members.find(id=>!completed.includes(id));
  if(!id){g.stage='review';g.runtime={status:'completed',completed};event(g,'所选员工已完成本轮交付，请人工验收；未执行真实业务写入。','review');update(g);return;}
  try{assertPlanCurrent(d,g);const run=enqueueEmployee(d,id,inputs(g),{goalId:g.id,goalVersion:g.version,purpose:'draft',assignment:g.executionPlan?.steps.find(s=>s.employeeId===id)});run.upstreamArtifactIds=(run.input.observations||[]).map(a=>a.id).filter(Boolean);g.runtime={status:'queued',completed,runId:run.id};if(g.collaboration)receipt(g,employee(d,id),(run.upstreamArtifactIds.length?'已接收 '+run.upstreamArtifactIds.length+' 份前序成果：'+run.input.observations.map(a=>a.title).join('、'):'已接收目标与已保存业务资料')+'。任务已排队，完成后在群内交付。',{workflow:'handoff',runId:run.id,upstreamArtifactIds:run.upstreamArtifactIds});event(g,`已交给${run.agentName}：${run.config.employee.mode==='model'?'模型选择已装配Skill':'按装配顺序执行代码 / 外部能力'}。`);}
  catch(e){g.runtime={status:'failed',completed,error:e.message};}
  update(g);
 }
 function create(d,input){
  const ids=[...new Set(input.employeeIds||[])];if((!ids.length&&input.teamSelection!=='auto')||ids.length>8)fail('请选择1–8名员工');ids.forEach(id=>requireReady(d,id));if(input.startCollaboration)ids.sort((a,b)=>Number(employee(d,a).roleId==='coordination')-Number(employee(d,b).roleId==='coordination'));
  const g=createGoal({...input,members:['product','insight'],permission:'draft'});
  g.knowledge={baseIds:d.knowledge.bases.filter(b=>b.id==='kb-default'&&b.enabled).map(b=>b.id),mode:'bm25',topK:5};g.mode='team';g.teamSelection=input.teamSelection==='auto'?'auto':'manual';g.intent=isSelectionGoal(input.text)?'selection':null;g.members=ids;g.participants=[...ids];g.coordinator='团队执行协调';g.stage='plan';g.permission='draft';g.criterion='按确认资料完成所选员工的交付，人工验收；不执行真实发布、调价或投放';g.runtime={status:'idle',completed:[]};
  const titles=['确认分工与资料',...ids.map(id=>employee(d,id).name+'交付'),'负责人验收'];
  g.tasks=titles.map((title,i)=>({id:randomUUID(),goalId:g.id,title,owner:ids[Math.max(0,Math.min(i-1,ids.length-1))],dependsOn:i?i-1:null,status:'pending'}));
  g.messages[1].text='已建立员工协作目标。请先填写资料，再确认分工；员工按选择顺序交接成果，模型模式可自主选择已装配Skill。';update(g);return g;
 }
 function revise(g){g.version++;g.planProposal=null;g.executionPlan=null;g.stage='plan';g.runtime={status:'idle',completed:[]};g.artifacts.forEach(a=>{if(a.status==='draft')a.status='superseded';});event(g,'资料已保存为新版本，请重新确认计划。','plan');}
 function action(d,g,input){
  const k=input.kind;
  if(['knowledge','references','facts','ledger','inputs','plan','retry','complete','revise','adoptPlan','discardPlan','replan','kickoff','regroupSelection','setTeam'].includes(k)&&input.expectedVersion!==g.version)fail('目标版本已改变，请重新检查',409);
  if(k==='message'){
   const text=String(input.text||'').trim();if(!text||text.length>2000)fail('请输入1–2000字的消息');if(g.queue.length>=24)fail('待回复队列已满');
   const invites=input.inviteIds||[];if(!Array.isArray(invites)||invites.length>4)fail('一次最多邀请 4 位员工');invites.forEach(id=>requireReady(d,id));
   const people=[...new Set([...discussionMembers(g),...invites])];if(people.length>24)fail('讨论成员最多 24 人');const mentioned=mentionedEmployees(text,people.map(id=>employee(d,id)),input.mentionIds||[]);
   const everyone=mentionsEveryone(text);
   if(!everyone&&mentioned.length&&input.target&&input.target!=='coordinator'&&(mentioned.length!==1||input.target!==mentioned[0]))fail('@成员与接收者不一致，请改为数字员工协调或只选一位');
   const recipients=everyone?[...new Set([...people.filter(id=>employeeReadiness(employee(d,id),models(d),d.externalSkills.map(publicExternal)).ready),...mentioned])]:mentioned.length?mentioned:[input.target||'coordinator'];if(!recipients.length)fail('本群暂无可回复员工，请先邀请或启用员工');for(const target of recipients)if(target!=='coordinator'&&!people.includes(target))fail('请先邀请该员工加入本目标讨论');
   if(g.queue.length+recipients.length>24)fail('待回复队列已满');
   const intent=input.intent||'discuss';if(!['discuss','context','change'].includes(intent))fail('消息用途无效');
   if(input.replyTo){const ref=g.messages.find(m=>m.id===input.replyTo),c=contextSettings(g);if(!ref)fail('引用消息不存在');if(c.excludedIds.includes(ref.id)||g.messages.indexOf(ref)<=g.messages.findIndex(m=>m.id===c.startAfter))fail('该消息已排除或属于旧话题，请将必要背景重新说明');}
   if(invites.some(id=>!mentioned.includes(id)))fail('新邀请员工必须出现在本条 @ 消息中');g.participants=people;
   const m={id:randomUUID(),role:'human',author:'你',text,at:stamp(),goalVersion:g.version,replyTo:input.replyTo||null,targets:recipients,intent,mentionAll:everyone,skippedTargets:everyone?people.filter(id=>!recipients.includes(id)):[]};g.messages.push(m);
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
   if(k==='setTeam'){
    if(g.stage!=='plan')fail('只可在计划阶段调整执行成员');
    if(!['auto','manual'].includes(input.teamSelection))fail('请选择总控自动匹配或手动指定');
    if(input.text!==undefined){const text=String(input.text).trim();if(!text||text.length>2000)fail('目标说明需为 1–2000 字');g.text=text;}
    if(input.teamSelection==='auto'){g.teamSelection='auto';g.executionPlan=null;g.planProposal=null;g.matching=null;autoAssign(d,g);}
    else{const ids=[...new Set(input.employeeIds||[])];if(!ids.length||ids.length>8)fail('请选择 1–8 名员工');ids.forEach(id=>requireReady(d,id));revise(g);g.teamSelection='manual';g.matching=null;const old=discussionMembers(g);g.members=ids;g.participants=[...new Set([...ids,...old])].slice(0,24);g.tasks=['确认分工与资料',...ids.map(id=>employee(d,id).name+'交付'),'负责人验收'].map((title,i)=>({id:randomUUID(),goalId:g.id,title,owner:ids[Math.max(0,Math.min(i-1,ids.length-1))],dependsOn:i?i-1:null,status:'pending'}));event(g,'已保留你指定的执行成员，总控不会自动替换。');}
   }else if(k==='kickoff'){
    if(g.stage!=='plan')fail('只可在计划阶段检查分工');
   }else if(k==='regroupSelection'){regroup(d,g);
   }else if(k==='replan'){
    if(g.stage!=='draft'||!['failed','needs_input'].includes(g.runtime.status))fail('只有失败或待补资料的任务可以重新安排分工');revise(g);event(g,'已保留业务资料并回到计划阶段；旧草案保留为历史，请重新安排分工。');
   }else if(k==='adoptPlan'){
    if(g.stage!=='plan')fail('仅可在计划确认前采用分工');const p=g.planProposal;
    if(!p||p.id!==input.proposalId||p.goalVersion!==g.version||p.signature!==planningSignature(d,g))fail('分工草案或员工配置已变化，请重新生成',409);
    g.members.forEach(id=>requireReady(d,id));const approved=validatePlan(p,g.members.map(id=>employee(d,id)));
    g.teamSelection='manual';g.matching=null;g.version++;g.executionPlan={...p,...approved,goalVersion:g.version,adoptedAt:stamp()};g.planProposal=null;g.members=approved.steps.map(s=>s.employeeId);g.executionPlan.signature=planningSignature(d,g);
    g.tasks=[{id:randomUUID(),title:'确认分工与资料',owner:g.members[0]},...approved.steps.map(s=>({id:randomUUID(),title:employee(d,s.employeeId).name+'交付',owner:s.employeeId})),{id:randomUUID(),title:'负责人验收',owner:g.members.at(-1)}].map((t,i)=>({...t,goalId:g.id,dependsOn:i?i-1:null,status:'pending'}));
    g.runtime={status:'idle',completed:[]};event(g,'已采用总控分工。请补齐所列资料后确认计划，采用分工本身不会开始执行。');
   }else if(k==='discardPlan'){
    if(!g.planProposal||g.planProposal.id!==input.proposalId)fail('草案已变化，请刷新');g.planProposal=null;
   }else if(k==='inputs'){
    if(!['plan','draft'].includes(g.stage))fail('当前阶段不能修改Skill业务资料');const context=input.data;
    if(!context||typeof context!=='object'||Array.isArray(context)||Object.keys(context).some(k=>!['candidates','unitCosts','inventory','commerce','campaign','replenishment','traffic','serviceQuestion','copyBrief'].includes(k)))fail('只接受已定义的业务资料字段');
    if(context.candidates&&(!Array.isArray(context.candidates)||context.candidates.length>50||context.candidates.some(c=>!c||typeof c!=='object'||Array.isArray(c))))fail('候选商品最多50项且每项需为对象');
    for(const key of ['unitCosts','inventory'])if(context[key]&&(typeof context[key]!=='object'||Array.isArray(context[key])))fail('成本或库存资料格式错误');
    for(const key of ['commerce','campaign','replenishment','traffic'])if(context[key]&&(typeof context[key]!=='object'||Array.isArray(context[key])))fail('业务输入必须为对象');if(context.serviceQuestion!==undefined&&(typeof context.serviceQuestion!=='string'||context.serviceQuestion.length>2000))fail('客户问题最多2000字');
    if(context.copyBrief!==undefined)context.copyBrief=validateCopyBrief(context.copyBrief);
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
    if(g.stage!=='plan')fail('当前计划已确认');if(g.teamSelection==='auto'&&g.matching?.missing.length)fail('总控尚未匹配完整能力：'+g.matching.missing.join('；'));if(g.planProposal)fail('请先采用或放弃待审分工，再确认执行');if(g.collaboration&&g.collaboration.signature!==planningSignature(d,g))fail('员工能力配置已变化，请先重新检查分工与资料',409);assertPlanCurrent(d,g);g.members.forEach(id=>requireReady(d,id));g.stage='draft';g.runtime={status:'idle',completed:[]};event(g,'分工已确认，开始按顺序交接成果。');schedule(d,g);
   }else if(k==='retry'){
    if(g.stage!=='draft'||!['failed','needs_input'].includes(g.runtime.status))fail('没有可重试步骤');g.runtime={status:'idle',completed:g.runtime.completed||[]};schedule(d,g);
   }else if(k==='complete'){
    if(g.stage!=='review')fail('请等待员工完成交付');g.stage='completed';g.artifacts.filter(a=>a.version===g.version).forEach(a=>a.status='accepted');event(g,'负责人已验收，本目标结束。');
   }else fail('团队任务不支持此操作；当前仅交付草案，不执行店铺写入');
  }
  if(g.mode==='team')update(g);g.updatedAt=stamp();return g;
 }
 function apply(d,g,r){
  if(g.version!==r.goalVersion||g.stage!=='draft'||g.runtime.runId!==r.id){r.status='discarded';r.error='目标版本已变化，此结果未应用';return;}
  if(g.paused){r.status='waiting_resume';g.runtime.status='waiting_resume';return;}
  if(r.error||r.result?.status==='needs_input'){
   const status=r.error?'failed':'needs_input';r.status=status;g.runtime={...g.runtime,status,error:r.error||r.result.summary,missing:r.result?.missing||[]};event(g,`${r.agentName}：${g.runtime.error}`,'facts');update(g);return;
  }
  r.status='succeeded';if(r.result.metrics?.profit!==undefined)g.analysis=r.result.metrics;
  for(const a of r.result.artifacts)g.artifacts.push({...a,id:randomUUID(),goalId:g.id,taskId:g.tasks.find(t=>t.owner===r.agentId&&t.title.endsWith('交付'))?.id,version:g.version,status:'draft',agent:r.agentId,agentName:r.agentName,runId:r.id,configVersion:r.configVersion});
  if(g.collaboration){const delivered=g.artifacts.filter(a=>a.runId===r.id);receipt(g,employee(d,r.agentId),'交付完成：'+r.result.summary+'\n'+delivered.map(a=>a.title+'：'+a.body.slice(0,360)+(a.body.length>360?'…（查看完整交付物）':'')).join('\n\n'),{workflow:'delivery',runId:r.id,artifactIds:delivered.map(a=>a.id),upstreamArtifactIds:r.upstreamArtifactIds||[]});}
  event(g,r.result.summary,'draft');g.runtime={status:'idle',completed:[...(g.runtime.completed||[]),r.agentId]};schedule(d,g);
 }
 function pumpMessages(d,g){
  if(g.repliesPaused||!g.queue.length)return;const job=g.queue.shift(),source=g.messages.find(m=>m.id===job.source);
  if(contextSettings(g).startAfter&&g.messages.findIndex(m=>m.id===source.id)<=g.messages.findIndex(m=>m.id===contextSettings(g).startAfter))return;
  if(job.intent!=='discuss'){event(g,'已记录背景或变更请求。业务事实请在资料页更新，确认后生成新版本。');return;}
  if(job.target==='coordinator'&&/进度|做到哪|下一步|还缺|缺什么|缺哪些/.test(source.text)){
   const completed=g.runtime?.completed||[],next=g.members.find(id=>!completed.includes(id));
   const labels={plan:'等待负责人确认计划',draft:'正在执行分工',review:'已交付，等待人工验收',completed:'负责人已验收'};
   const snapshot=g.planProposal||g.executionPlan||g.collaboration,missing=g.runtime?.missing?.length?g.runtime.missing:snapshot?.goalVersion===g.version?snapshot.checks.filter(c=>c.status==='missing').flatMap(c=>c.missing):[];
   event(g,`当前：${g.paused?'目标暂停；':''}${labels[g.stage]||g.stage}。已完成 ${completed.length} / ${g.members.length} 名员工的本轮交付。${next&&g.stage!=='completed'?'下一位：'+(d.employees.find(e=>e.id===next)?.name||({product:'商品运营',insight:'经营分析',content:'内容营销',service:'客户服务'}[next])||next)+'。':''}${missing.length?'待补资料（最近检查）：'+[...new Set(missing)].join('；')+'。':'尚无待补项记录，未记录不代表资料已完整核验。'}${g.runtime?.error?'当前阻塞：'+g.runtime.error+'。':''}请在任务页查看分工、在资料页保存业务事实；这次进度查询没有重跑能力。`);
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
  const question=people.map(id=>employee(d,id).name).sort((a,b)=>b.length-a.length).reduce((text,name)=>text.replaceAll('@'+name,'').replaceAll('＠'+name,''),source.text).replace(/(?<![a-zA-Z0-9_.+%-])[@＠](?:所有员工|所有人|全体成员|all(?=$|[\s，。！？、,:：;；]))/gi,'').trim();
  try{enqueueEmployee(d,id,{...inputs(g),...selected,question},{goalId:g.id,goalVersion:g.version,purpose:'chat',messageId:source.id,contextRevision:contextSettings(g).revision});}catch(e){event(g,e.message);}

 }
 return {create,action,schedule,apply,pumpMessages,kickoff,autoAssign,syncPending,needsMatching,installLocalMatches,
  context:(id,text)=>{const g=getData().goals.find(g=>g.id===id)||fail('目标不存在');return {...contextSettings(g),...selectConversation(g,{text:text||g.text})};},
  view:()=>({...workforceView(getData(),models(getData()),getData().externalSkills.map(publicExternal)),recipes:recipes.map(r=>({...r,employeeId:getData().employees.find(e=>e.recipeId===r.id)?.id||null}))}),
  recommend:text=>{const d=getData();if(isSelectionGoal(text)){const ids=selectionTeam(d);return {method:'选品目标关键词匹配',intent:'selection',recipes:[],employeeIds:ids,missing:ids.length===3?[]:['市场研究、选品或运营协调员工'],labels:ids.map(id=>employee(d,id).name)};}const matches=matchingRecipes(String(text||''));return {method:'关键词与已装配能力匹配',recipes:matches,employeeIds:[...new Set(matches.flatMap(r=>d.employees.filter(e=>e.skillIds.some(id=>r.skillIds.includes(id))&&employeeReadiness(e,models(d),d.externalSkills.map(publicExternal)).ready).slice(0,1).map(e=>e.id)))],missing:matches.filter(r=>!d.employees.some(e=>e.skillIds.some(id=>r.skillIds.includes(id))&&employeeReadiness(e,models(d),d.externalSkills.map(publicExternal)).ready)).map(r=>r.name)};},
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
