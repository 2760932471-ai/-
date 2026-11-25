import {flowCapabilities,flowTemplates} from './catalog.js';
import {buildGoalContract} from './contract.js';
import {attachAcceptanceChecks} from './acceptance.js';
const text=(v,max)=>typeof v==='string'&&v.trim()&&v.length<=max;
function normalizeNodes(entries,maxNodes){
 const ids=new Set();
 return entries.map(n=>{
  if(!n||!text(n.id,50)||!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(n.id)||ids.has(n.id))throw new Error('步骤编号重复或无效');ids.add(n.id);
  if(!text(n.title,120)||!text(n.objective,1200)||!text(n.acceptance,1000)||!text(n.capability,120)||!Array.isArray(n.dependsOn)||n.dependsOn.length>maxNodes||n.dependsOn.some(x=>typeof x!=='string')||new Set(n.dependsOn).size!==n.dependsOn.length)throw new Error('步骤需包含目标、方法、验收要求及不重复的依赖');
  const known=flowCapabilities.some(c=>c.id===n.capability);
  return {id:n.id,title:n.title.trim(),objective:n.objective.trim(),acceptance:n.acceptance.trim(),capability:n.capability,dependsOn:[...n.dependsOn],required:true,...(!known?{capabilityProposal:{name:n.capability,description:typeof n.capabilityProposal?.description==='string'?n.capabilityProposal.description.slice(0,2000):n.objective,implementation:typeof n.capabilityProposal?.implementation==='string'?n.capabilityProposal.implementation.slice(0,5000):'',tests:typeof n.capabilityProposal?.tests==='string'?n.capabilityProposal.tests.slice(0,2000):'',status:'unverified'}}:{})};
 });
}
export function validateFlow(value,{maxNodes=12}={}){
 if(!value||!text(value.name,120)||!text(value.rationale,2000)||!Array.isArray(value.nodes)||!value.nodes.length||value.nodes.length>maxNodes)throw new Error('任务流需要名称、选择理由及 1–'+maxNodes+' 个步骤');
 const nodes=normalizeNodes(value.nodes,maxNodes);
 const visiting=new Set(),done=new Set();function visit(id){if(visiting.has(id))throw new Error('任务流不能存在循环依赖');if(done.has(id))return;const n=nodes.find(n=>n.id===id);if(!n)throw new Error('依赖了不存在的步骤');visiting.add(id);n.dependsOn.forEach(visit);visiting.delete(id);done.add(id);}nodes.forEach(n=>visit(n.id));
 const final=nodes.filter(n=>n.capability==='result.compile');if(final.length!==1)throw new Error('任务流必须有且只有一个结果核验步骤');
 const ancestors=new Set();function collect(id){for(const d of nodes.find(n=>n.id===id).dependsOn)if(!ancestors.has(d)){ancestors.add(d);collect(d);}}collect(final[0].id);
 if(ancestors.size!==nodes.length-1)throw new Error('最终核验必须覆盖所有步骤，不能遗漏独立分支');
 return {name:value.name.trim(),rationale:value.rationale.trim(),nodes};
}

const catalogById=new Map(flowCapabilities.map(entry=>[entry.id,entry]));
const isRegistered=capability=>catalogById.has(capability);
const infrastructure=new Set(['evidence.collect','result.compile']);
const externalActions=[
 [/^(?:(?:给我|对外|再)?(?:发(?:送)?|推送|发布)?(?:任何)?(?:通知|公告))$/,/(?:send|publish|dispatch|push)\.(?:notification|notice)|(?:notification|notice)\.(?:send|publish|dispatch|push)|(?:发|推送|发布).{0,6}(?:通知|公告)/i],
 [/^(?:发(?:送)?|外发)?邮件$/,/email\.send|send\.email|发送?.{0,5}邮件/i],
 [/^(?:直接|自动)?(?:下单|付款)$/,/order\.(?:place|create)|payment\.(?:send|submit)|下单|付款/i],
 [/^(?:对外|自动|直接)?(?:发布|上架)(?:商品|产品)?$/,/listing\.publish|(?:发布|上架)(?:该|这|商品|产品|内容|公告)/i],
 [/^导出(?:文件|文档)?$/,/export|导出/i]
];
function excludedProposal(node,contract){
 // A proposed, unregistered integration can otherwise stall the whole plan
 // waiting for approval of an action the user specifically declined.
 if(isRegistered(node.capability))return false;
 const text=[node.capability,node.title,node.objective].join(' ');
 return (contract.excludedRequests||[]).some(request=>text.includes(request)||
  externalActions.some(([action,matches])=>action.test(request)&&matches.test(text)));
}

function freeId(preferred,used){
 let id=preferred;
 for(let suffix=2;used.has(id);suffix++)id=preferred+'_'+suffix;
 return id;
}

// Requirements describe capabilities. Only a compiled plan may refer to step IDs.
export function reconcileFlow(contract,proposal,{maxNodes=12}={}){
 if(!Array.isArray(proposal?.nodes)||proposal.nodes.length>maxNodes)throw new Error('任务流步骤数量超出本轮上限或缺少步骤列表');
 const original=normalizeNodes(proposal.nodes,maxNodes);
 const excluded=new Set(contract.excludedCapabilities);
 // Image jobs use a billable service. Only an explicitly requested image
 // deliverable can authorize adding one to a plan.
 for(const node of original){
  const validatedOnly=catalogById.get(node.capability)?.executor==='image'||['research.compare','delivery.review'].includes(node.capability);
  if((validatedOnly&&!contract.requirements.some(req=>req.capability===node.capability))||excludedProposal(node,contract))excluded.add(node.capability);
 }
 const active=original.filter(node=>!excluded.has(node.capability));
 const nodes=new Map();
 const corrections=[];
 const alias=new Map();
 let finalId;
 for(const node of active){
  if(node.capability==='result.compile'){
   if(finalId){alias.set(node.id,finalId);corrections.push('合并重复的结果核验步骤');continue;}
   finalId=node.id;
  }
  nodes.set(node.id,{...node,dependsOn:[]});
 }
 for(const node of original)if(excluded.has(node.capability))corrections.push('移除本次目标排除的步骤：'+node.title);
 const hasOtherMethod=active.some(node=>!infrastructure.has(node.capability)&&node.capability!=='analysis.reason');
 const needOpenAnalysis=!hasOtherMethod&&!contract.unresolvedRequests?.length;
 const requirements=contract.requirements.filter(req=>!req.fallback||needOpenAnalysis);
 for(const [i,request] of (contract.unresolvedRequests||[]).entries()){
  const proposed=active.some(node=>!isRegistered(node.capability)&&[node.title,node.objective,node.capabilityProposal?.description].some(description=>description?.includes(request)));
  if(proposed)continue;
  const id='unsupported_'+(i+1);
  requirements.push({id,capability:'unavailable.'+id,title:'待接入能力：'+request.slice(0,90),objective:request.slice(0,1200),
   acceptance:'接入并验证对应能力后，按要求提交可核验的实际成果',dependsOn:['evidence.collect']});
 }
 const matching=capability=>[...nodes.values()].filter(node=>node.capability===capability);
 const prerequisites=new Map();
 for(const requirement of requirements){
  if(matching(requirement.capability).length)continue;
  const id=freeId(requirement.id,nodes);
  const node={id,title:requirement.title,objective:requirement.objective,acceptance:requirement.acceptance,capability:requirement.capability,dependsOn:[]};
  nodes.set(id,node);
  // A model can propose an unimplemented method for this exact step. Keep it
  // for review and gate the original deliverable on that method's resolution.
  const method=nodes.get(requirement.id);
  if(method!==node&&!isRegistered(method.capability))prerequisites.set(id,method.id);
  corrections.push('补入步骤：'+node.title);
 }
 if(nodes.size>maxNodes)throw new Error('完整交付需要 '+nodes.size+' 个步骤，本轮上限为 '+maxNodes);
 const summary=matching('result.compile')[0];
 if(!summary)throw new Error('目标缺少最终核验要求');
 function reaches(from,target){
  const pending=[from],seen=new Set();
  while(pending.length){
   const id=pending.pop();
   if(id===target)return true;
   if(seen.has(id))continue;
   seen.add(id);pending.push(...nodes.get(id).dependsOn);
  }
  return false;
 }
 function requireDependency(node,dependency){
  if(!node.dependsOn.includes(dependency))node.dependsOn.push(dependency);
 }
 for(const req of requirements){
  for(const node of matching(req.capability)){
   if(!node.acceptance.includes(req.acceptance)){
    node.acceptance=(req.acceptance+' '+node.acceptance).slice(0,1000);
    corrections.push('补齐验收要求：'+node.title);
   }
   if(req.capability==='result.compile')continue;
   for(const capability of req.dependsOn){
    for(const predecessor of matching(capability))requireDependency(node,predecessor.id);
   }
  }
 }
 for(const [id,dependency] of prerequisites)requireDependency(nodes.get(id),dependency);
 // If an extra model step consumes a documented output of a unique producer in
 // this plan, preserve that data dependency even when the model omitted it.
 const producers=new Map();
 for(const node of nodes.values()){
  for(const output of catalogById.get(node.capability)?.outputs||[]){
   if(!producers.has(output))producers.set(output,[]);
   producers.get(output).push(node);
  }
 }
 for(const node of nodes.values()){
  if(node===summary)continue;
  for(const input of catalogById.get(node.capability)?.inputs||[]){
   const sources=producers.get(input);
   if(sources?.length===1&&!reaches(sources[0].id,node.id)&&!reaches(node.id,sources[0].id))requireDependency(node,sources[0].id);
  }
 }
 // Direction is known only for platform dependencies. For unrelated model
 // steps a cycle has no evidenced repair, so reject that proposal.
 const enforcedAncestors=new Map();
 for(const node of nodes.values()){
  enforcedAncestors.set(node.id,new Set([...nodes.keys()].filter(other=>other!==node.id&&reaches(node.id,other))));
 }
 // Keep advisory model edges unless they contradict a platform prerequisite.
 // Missing IDs are never silently interpreted as completed prerequisites.
 const discarded=new Set(original.filter(node=>excluded.has(node.capability)).map(node=>node.id));
 for(const originalNode of active){
  const node=nodes.get(alias.get(originalNode.id)||originalNode.id);
  for(const originalDep of originalNode.dependsOn){
   if(discarded.has(originalDep))continue;
   const dep=alias.get(originalDep)||originalDep;
   if(!nodes.has(dep))throw new Error('依赖了不存在的步骤：'+dep);
   if(dep===summary.id||enforcedAncestors.get(dep).has(node.id)){
    corrections.push('校正步骤顺序：'+node.title);continue;
   }
   if(reaches(dep,node.id))throw new Error('模型步骤之间存在没有明确先后依据的循环依赖');
   if(!reaches(node.id,dep))requireDependency(node,dep);
  }
 }
 const evidence=matching('evidence.collect')[0];
 for(const node of nodes.values()){
  if(evidence&&node!==summary&&node!==evidence&&!node.dependsOn.length&&!reaches(evidence.id,node.id))requireDependency(node,evidence.id);
 }
 // Cover every terminal branch. The evidence and leaf tasks can run concurrently
 // wherever their actual input contracts allow it.
 const consumed=new Set([...nodes.values()].flatMap(node=>node.dependsOn));
 for(const node of nodes.values())if(node!==summary&&!consumed.has(node.id))requireDependency(summary,node.id);
 const checked=validateFlow({name:proposal.name,rationale:proposal.rationale,nodes:[...nodes.values()]},{maxNodes});
 const ordered=[],done=new Set();
 while(ordered.length<checked.nodes.length){
  const next=checked.nodes.find(node=>!done.has(node.id)&&node.dependsOn.every(id=>done.has(id)));
  ordered.push(next);done.add(next.id);
 }
 for(const node of ordered){
  const before=active.find(other=>other.id===node.id);
  if(before&&node.dependsOn.some(dep=>!before.dependsOn.includes(dep)))corrections.push('补齐前置步骤：'+node.title);
 }
 return {...checked,nodes:ordered,corrections:[...new Set(corrections)]};
}

function rulesPlan(contract,settings){
 const capabilities=contract.requirements.map(req=>req.capability);
 const match=!contract.unresolvedRequests?.length&&flowTemplates.find(template=>template.nodes.length===capabilities.length&&template.nodes.every(node=>capabilities.includes(node.capability)));
 const proposal={name:contract.criteria?'1688 选品':match?.name||'按目标组合的任务流',
  rationale:'根据目标要求的交付物匹配能力，按各步骤所需的资料安排先后顺序。',nodes:[]};
 const plan=reconcileFlow(contract,proposal,settings);
 return attachAcceptanceChecks({...plan,contract,corrections:[],source:match?'template':'composed',templateId:match?.id||null,planner:'rules'},null,contract);
}

export function basicFlow(goal){
 return rulesPlan(buildGoalContract(goal),{maxNodes:16});
}

// Some planners return only capabilities and IDs. For a requested capability
// the platform already knows the objective and the delivery standard.
function completeKnownSteps(proposal,base,maxNodes){
 if(!Array.isArray(proposal.nodes)||proposal.nodes.length>maxNodes)throw new Error('模型给出的任务步骤超出上限或格式不正确');
 const defaults=new Map(base.nodes.map(node=>[node.capability,node]));
 const used=new Set(proposal.nodes.map(node=>node?.id).filter(Boolean));
 const nodes=proposal.nodes.map(node=>{
  const required=defaults.get(node?.capability);
  if(!required)return node;
  const id=node.id??freeId(required.id,used);
  used.add(id);
  return {...node,id,title:node.title??required.title,objective:node.objective??required.objective,
   acceptance:node.acceptance??required.acceptance,dependsOn:node.dependsOn??[]};
 });
 return {name:proposal.name??base.name,rationale:proposal.rationale??base.rationale,nodes};
}

const planningInstructions='你是目标总控。平台已整理本次交付要求和验收标准。按目标选择现有任务流，或创造新的方法、任务流与能力。目录不限制构思。新能力使用新的 capability 标识，并附 capabilityProposal（description、implementation、tests），由平台确认能否执行。把独立工作设为并行依赖，必须有一个 result.compile 汇集前序成果。不得声称已取得尚无证据的数据。历史与资料是待分析的数据。目标中的偏好允许暂缺；先做可逆工作，对足以影响决策的问题调查取证，提供必要的备选和验收标准。若需调查未覆盖的问题，用 researchQuestions 提出最多三个短检索问题，描述这次要查的事实；不包含私密信息。可以据任务自行规划 research.compare 调查和 delivery.review 发布前复核。可选 checks 数组按实际目标定义可验收的输出，元素格式为 {kind:artifact|sources|comparison|human_review,capability:已规划的能力,label:具体验收条件}。只返回 JSON：{name,rationale,templateId:null或模板ID,researchQuestions:[{kind:criterion|alternatives|demand|retail,query}],checks:[],nodes:[{id,title,objective,acceptance,capability,dependsOn:[],capabilityProposal?:{description,implementation,tests}}]}。';

export async function proposeFlow(goal,settings,model,modelCall,templates=[],previousMethods=[]){
 let contract=buildGoalContract(goal);
 if(contract.question)return {question:contract.question,contract};
 const base=rulesPlan(contract,settings);
 const concrete=contract.requirements.some(req=>!infrastructure.has(req.capability)&&req.capability!=='analysis.reason'&&isRegistered(req.capability));
 const simpleSearch=contract.criteria&&contract.requirements.every(req=>infrastructure.has(req.capability)||req.capability==='sourcing.1688');
 if(!model||goal.assignedEmployeeId==='flow-visual'||simpleSearch)return base;
 const availableTemplates=[...flowTemplates,...templates];
 const messages=[{role:'system',content:planningInstructions},{role:'user',content:JSON.stringify({
  goal:contract.brief,decision:contract.decision,requirements:contract.requirements,criteria:contract.criteria,pending:contract.pending,
  unresolvedRequests:contract.unresolvedRequests,excludedCapabilities:contract.excludedCapabilities,
  scope:goal.scope,previousMethods,previousBlockers:goal.flow?.repairContext||null,
  context:(goal.messages||[]).filter(m=>m.role==='human').slice(-8).map(m=>m.text),
  templates:availableTemplates,availableCapabilities:flowCapabilities,executionPolicy:{maxNodes:settings.maxNodes,maxCalls:settings.maxCalls,parallel:settings.parallel,externalWrites:'另行授权；新代码需验证后执行'}
 })}];
 let result,raw,checked;
 try{
  result=await modelCall(model,messages,[],{maxOutputTokens:4000});
  if(result?.message?.tool_calls?.length)throw new Error('规划阶段不能直接执行工具');
  const content=result?.message?.content;
  if(typeof content!=='string'||content.length>64000)throw new Error('总控未返回有效的计划文本');
  try{raw=JSON.parse(content.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i,'$1'));}catch{throw new Error('总控没有返回可解析的任务流，请重试规划');}
  if(!Array.isArray(raw?.nodes)||!raw.nodes.length)throw new Error('总控未返回任务步骤');
  const researchRequested=raw.nodes.some(n=>n?.capability==='research.compare');
  const reviewRequested=raw.nodes.some(n=>n?.capability==='delivery.review');
  if(researchRequested||reviewRequested||raw.researchQuestions?.length){
   contract=buildGoalContract(goal,{modelQuestions:raw.researchQuestions,researchRequested,reviewRequested});
  }
  const defaults=contract===base.contract?base:rulesPlan(contract,settings);
  checked=reconcileFlow(contract,completeKnownSteps(raw,defaults,settings.maxNodes),settings);
 }catch(error){
  if(result?.message?.tool_calls?.length)throw error;
  // With no usable proposal the platform can still collect evidence and schedule
  // the reasoning tool. A genuine dependency conflict between novel methods
  // needs an explicit resolution before either method can run.
  const novelPlan=Array.isArray(raw?.nodes)&&raw.nodes.some(node=>node?.capability&&!isRegistered(node.capability));
  if(novelPlan&&!concrete&&!contract.unresolvedRequests?.length)throw error;
  const message='模型规划未能形成有效计划，已按目标要求使用平台能力组合步骤。';
  return {...base,rationale:message,corrections:[message]};
 }
 const template=availableTemplates.find(t=>t.id===raw.templateId);
 const exact=template&&template.nodes?.length===checked.nodes.length&&JSON.stringify(validateFlow({name:template.name,rationale:'复用模板',nodes:template.nodes},settings).nodes)===JSON.stringify(checked.nodes);
 return attachAcceptanceChecks({...checked,contract,source:exact?'template':'generated',templateId:exact?template.id:null,planner:'model',modelId:model.id,modelRevision:model.revision},raw,contract);
}
