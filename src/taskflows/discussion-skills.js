import {randomUUID} from 'node:crypto';
import {attachedSkillText,employeeProfileForTask,privateWebSubject,requestParts,resolveCatalogSkillRequests,serviceQuestionFromGoal,webSkillInput,workspaceSourcesOnly} from '../../public/goal-language.js';
import {generalInput} from '../workforce/general-skills.js';
import {skillInputHint} from '../workforce/skills.js';
import {assignFlowCapability,flowCapabilities} from './catalog.js';

const localSkills=flowCapabilities.filter(cap=>cap.executor==='skill');
const purpose='flow_skill';
const now=()=>new Date().toISOString();
function inputKeys(definition){return (definition?.inputs||[]).flatMap(path=>path.split(/\s+或\s+/)).map(path=>path.split(/[.\s]/)[0]);}
function pendingRuns(d,g){return d.runs.filter(r=>r.purpose===purpose&&r.goalId===g.id&&r.goalVersion===g.version&&r.status==='needs_input'&&!r.resumedBy&&!r.scopeBlocked);}

function workspaceOnly(text){
 const {requested,excluded}=requestParts(attachedSkillText(text)?.title||text);
 return workspaceSourcesOnly(requested,excluded);
}
export function discussionSkillRequest(text){
 const attached=attachedSkillText(text);
 const title=attached?.title||text;
 // A mention of a tool in a question, example or quotation isn't a request to run it.
 const intent=title.replace(/[“「『"][^”」』"]*[”」』"]/gu,'').trim();
 if(/^(?:你|你们|系统|总控)?(?:会不会|能不能|能否|是否|可以吗|会用|支持吗|会|能)|^(?:请问|为什么|如何|什么是|比如|例如|举例|示例|引用|[“「『"])/.test(intent)||/(?:怎么用|可以吗|支持吗|用过吗|执行了吗)[？?。！!]*$/.test(intent))return null;
 if(/^(?:不要|不用|不必|先不|暂不|别|无需|不能|禁止)/.test(title.trim())&&!/(?:但是|而是|然后|改为)/.test(title))return null;
 if(/^(?:附件|文档|资料|示例|邮件|客户原话).{0,8}(?:写|提到|如下|说|记载)/.test(title.trim()))return null;
 const command=/(?:请|帮我|替我|麻烦|顺便|再帮|再算|再做|追加|调用|运行|执行)|^(?:按.{1,12})?(?:重新|再)?(?:计算|算算|算一下|核算|测算|检查|整理|分析|总结|汇总|提炼|比较|统计|搜(?:索|一下|一搜)?|查(?:找|一下|一查)?|找(?:找|一下)?|上网|联网|读取|打开|起草|写|审核|生成)/;
 if(!command.test(intent)&&!localSkills.some(s=>s.name===intent||s.id===intent))return null;
 const skills=resolveCatalogSkillRequests(title,localSkills,{reportBlockedWeb:true}).filter(req=>localSkills.some(def=>def.id===req.capability));
 return skills.length?{title,skills,attached}:null;
}

function runNote(g,r,text,artifacts=[]){
 const note={id:randomUUID(),role:'coordinator',author:'目标总控',text,replyTo:r.messageId,runId:r.id,goalVersion:r.goalVersion,at:now()};
 if(artifacts.length)note.artifactIds=artifacts.map(a=>a.id);
 g.messages.push(note);g.updatedAt=note.at;
}

export function applyDiscussionSkill(d,g,run){
 if(g.version!==run.goalVersion||g.stage==='completed'){
  run.status='discarded';run.result=null;run.error='原任务版本已变更或已验收，未写入追加结果。';
  runNote(g,run,run.error);return;
 }
 if(run.error){runNote(g,run,'「'+run.config.name+'」执行失败。'+run.error);return;}
 const result=run.result;
 if(result.status==='needs_input'){
  const missing=(result.missing||[]).join('、')||result.summary;
  const question=result.question||'请在本任务的资料页补充：'+skillInputHint(run.config.skillId)+'。';
  runNote(g,run,'「'+run.config.name+'」需要资料。'+(missing.includes(question)?missing:missing+'\n'+question));return;
 }
 const artifacts=(result.artifacts||[]).map(a=>({...a,id:randomUUID(),goalId:g.id,version:g.version,status:'draft',origin:'discussion_skill',
  agent:'taskflow',agentName:run.agentName,runId:run.id,taskId:run.messageId}));
 g.artifacts.push(...artifacts);
 runNote(g,run,'已完成「'+run.config.name+'」。'+(artifacts[0]?.body?'\n\n'+artifacts[0].body.slice(0,550):result.summary),artifacts);
}

export function createDiscussionSkills({inputs,enqueue}){
 function queue(d,g,message,request,previous=null,extra={}){
  for(const rule of request.skills){
   const def=localSkills.find(skill=>skill.id===rule.capability);
   if(!def)continue;
   const duplicate=d.runs.find(r=>r.goalId===g.id&&r.goalVersion===g.version&&r.purpose===purpose&&r.config.skillId===def.id&&['queued','running'].includes(r.status)&&g.messages.find(m=>m.id===r.messageId)?.text===message.text);
   if(duplicate){if(previous)previous.resumedBy=duplicate.id;continue;}
   const assignment=assignFlowCapability(def.id,d.employees,g.assignedEmployeeId,request.title);
   const web=def.id.startsWith('web.');
   let work,restricted=false;
   if(web){
    work=webSkillInput(def.id,request.title,extra);
    restricted=workspaceOnly(g.text)||workspaceOnly(request.title)||workspaceOnly(work.query||'')||privateWebSubject([request.title,work.query,work.url].join(' '));
   }else{
    work={...inputs(g),goal:request.title};
    work.question=def.id.startsWith('service.')?(serviceQuestionFromGoal(request.title)||g.skillData?.serviceQuestion||''):request.title;
    if(assignment.profile)work.employeeProfile=employeeProfileForTask(assignment.profile,request.title);
    if(request.attached?.capability===def.id)Object.assign(work,generalInput(def.id,request.attached.raw,'当前讨论中提供的资料'));
    Object.assign(work,extra);
   }
   const run=enqueue(d,assignment.employeeId||def.id,restricted?{}:work,{goalId:g.id,goalVersion:g.version,messageId:message.id,purpose,agentName:assignment.employeeName},
    {skillId:def.id,name:def.name,enabled:true,revision:1,adapter:'skill'});
   if(restricted){
    run.scopeBlocked=true;run.status='needs_input';run.finishedAt=now();
    run.result={status:'needs_input',summary:'这次请求涉及内部资料或任务限定了资料来源。',question:'请提供工作空间内的资料，或另开一个只涉及公开信息的检索任务。',artifacts:[]};
    applyDiscussionSkill(d,g,run);
   }
   if(previous)previous.resumedBy=run.id;
  }
 }
 function resume(d,g,run,extra){
  const message=g.messages.find(m=>m.id===run.messageId);
  if(!message||run.resumedBy)return;
  const request=discussionSkillRequest(message.text);
  if(request)queue(d,g,message,{...request,skills:request.skills.filter(rule=>rule.capability===run.config.skillId)},run,extra);
 }
 function onInputs(d,g,changed){
  for(const run of d.runs.filter(r=>r.purpose===purpose&&r.goalId===g.id&&r.goalVersion===g.version&&!r.scopeBlocked&&!r.resumedBy&&['queued','needs_input'].includes(r.status))){
   const keys=inputKeys(localSkills.find(s=>s.id===run.config.skillId));
   const updated=Object.fromEntries(changed.filter(key=>keys.includes(key)).map(key=>[key,g.skillData[key]]));
   if(!Object.keys(updated).length)continue;
   if(run.status==='needs_input')resume(d,g,run,updated);
   else if(!run.config.skillId.startsWith('web.'))Object.assign(run.input,updated);
  }
 }
 function reply(d,g,text,replyTo){
  let pending=pendingRuns(d,g);
  if(replyTo)pending=pending.filter(r=>r.messageId===replyTo||g.messages.some(m=>m.id===replyTo&&m.runId===r.id));
  if(pending.length!==1||(!replyTo&&g.flow.nodes.some(n=>n.status==='needs_input'&&n.question)))return null;
  if(/^(?:好[的啊]?|继续(?:执行)?|知道了|暂停|进展如何|谢谢)[！!。？?\s]*$/.test(text))return null;
  const run=pending[0];
  if(run.config.skillId==='table.profile'&&!/[\r\n,]/.test(text))return null;
  if(run.config.skillId==='document.outline'&&!replyTo&&(!text.includes('\n')&&text.length<12||/[?？]$/.test(text)))return null;
  let extra;
  if(run.config.skillId==='web.read'){
   if(!/^https?:\/\/\S+$/i.test(text.trim()))return null;
   extra=webSkillInput('web.read',text);
  }else if(run.config.skillId==='web.search'){
   if(!replyTo&&!/^(?:关键词|搜索主题)[：:]/.test(text))return null;
   extra={query:text.replace(/^(?:关键词|搜索主题)[：:]\s*/,'').trim()};
  }else extra=generalInput(run.config.skillId,text,'任务讨论中补充的资料');
  return extra?{runId:run.id,extra}:null;
 }
 return {queue,resume,onInputs,reply};
}
