import {draftRole} from './role-design.js';
import {contentPacks} from './content.js';
import {externalDefinitions,externalBlockers} from './external.js';
import {roles,capabilities} from './catalog.js';
import {skillDefinitions,skillSample} from './skills.js';
export const roleSkills={merchandise:['product.validate','product.draft'],creative:['content.outline','content.review'],profit:['finance.calculate'],coordination:['task.brief'],selection:['selection.score','product.compare'],research:['product.compare'],supply:['inventory.coverage'],analysis:['finance.calculate'],risk:['content.review'],growth:['traffic.funnel'],campaign:['campaign.discount'],service:['service.triage']};
const profileOptions={
 tones:[{id:'standard',name:'自然专业'},{id:'concise',name:'简明直接'},{id:'empathetic',name:'温和关怀'}],
 channels:[{id:'general',name:'通用'},{id:'taobao',name:'淘宝'},{id:'douyin',name:'抖音'}]
};
const roleCatalog=[...roles,{id:'custom',name:'自定义岗位',responsibility:'',delivery:''}];
const profileLimits={persona:300,strategy:800,position:120,audience:300,responsibilities:1600,deliverable:600,boundaries:800};
const standardProfile={tone:'standard',channel:'general',...Object.fromEntries(Object.keys(profileLimits).map(k=>[k,'']))};
export function designRole(input,externals=[]){
 return draftRole(input,roleCatalog,[...skillDefinitions,...externalDefinitions(externals).filter(s=>!s.blockers?.length)],roleSkills);
}
export function defaultEmployees(){
 const basics=['merchandise','creative','profit','coordination','research','selection','growth','campaign','supply','service','analysis','risk']
  .map(roleId=>({id:'employee-'+roleId,roleId,name:roles.find(r=>r.id===roleId).name,skillIds:roleSkills[roleId]}));
 const writers=contentPacks.map(p=>({id:p.employeeId,specialty:p.id,roleId:'creative',name:p.employeeName,skillIds:[p.skillId],instructions:p.description}));
 return [...basics,...writers].map(e=>({
  enabled:true,mode:'skills',modelId:null,maxSteps:5,revision:1,...e,skillIds:[...e.skillIds],
  instructions:e.instructions||e.skillIds.map(id=>skillDefinitions.find(s=>s.id===id).description).join('；')
 }));
}
function validateProfile(value,previous){
 if(value!==undefined&&(!value||Array.isArray(value)||typeof value!=='object'))throw new Error('请填写有效的员工人设与策略');
 const profile={...standardProfile,...previous,...value};
 if(!profileOptions.tones.some(t=>t.id===profile.tone))throw new Error('请选择有效的沟通风格');
 if(!profileOptions.channels.some(c=>c.id===profile.channel))throw new Error('请选择有效的平台策略');
 const labels={persona:'人设说明',strategy:'策略说明',position:'岗位定位',audience:'服务对象',responsibilities:'职责安排',deliverable:'交付物',boundaries:'职责边界'};
 const validated={tone:profile.tone,channel:profile.channel};
 for(const [key,limit] of Object.entries(profileLimits)){
  if(typeof profile[key]!=='string'||profile[key].trim().length>limit)throw new Error(labels[key]+'最多 '+limit+' 字');
  validated[key]=profile[key].trim();
 }
 return validated;
}
export function validateEmployee(input,previous,externals=[]){
 if(previous&&input.revision!==previous.revision)throw new Error('员工配置已更新，请重新打开');
 const role=roleCatalog.find(r=>r.id===input.roleId);if(!role)throw new Error('请选择有效岗位');
 const name=String(input.name||'').trim(),instructions=String(input.instructions||'').trim();
 if(['所有员工','所有人','全体成员','all'].includes(name.toLowerCase()))throw new Error('该名称保留给群聊全体提及，请换一个员工名称');
 if(!name||name.length>80||instructions.length>4000)throw new Error('名称必填且不超过80字，职责指令不超过4000字');
 if(!['skills','model'].includes(input.mode))throw new Error('请选择模型驱动或规则试运行');
 if(!Array.isArray(input.skillIds)||input.skillIds.length>10||input.skillIds.some(id=>![...skillDefinitions,...externalDefinitions(externals)].some(s=>s.id===id)))throw new Error('只能装配已实现的 Skill，最多10项');
 const maxSteps=Number(input.maxSteps);if(!Number.isInteger(maxSteps)||maxSteps<1||maxSteps>8)throw new Error('执行循环上限为1–8轮');
 if(typeof input.enabled!=='boolean')throw new Error('请选择员工启用状态');
 const profile=validateProfile(input.profile,previous?.profile);
 return {id:previous?.id,recipeId:previous?.recipeId,specialty:previous?.specialty,name,roleId:role.id,instructions,profile,mode:input.mode,modelId:input.modelId||null,skillIds:[...new Set(input.skillIds)],enabled:input.enabled,maxSteps,revision:(previous?.revision||0)+1};
}
export function employeeReadiness(employee,models,externals=[]){
 const blockers=[];for(const id of employee.skillIds.filter(id=>id.startsWith('external_')))blockers.push(...externalBlockers(externals.find(s=>s.id===id)).map(b=>id+'：'+b));if(!employee.enabled)blockers.push('员工已停用');if(!employee.skillIds.length)blockers.push('未装配已实现的Skill');
 if(employee.mode==='model'){
  const m=models.find(m=>m.id===employee.modelId);
  if(!m)blockers.push('尚未选择模型连接');
  else{if(!m.credentialConfigured)blockers.push(m.provider==='codex-local'?'本机Codex桥接未启用或未配置工作空间令牌':'服务器未配置模型密钥');if(m.lastTest?.status!=='succeeded'||m.lastTest.revision!==m.revision)blockers.push('当前模型配置尚未通过连接测试');}
 }
 return {ready:blockers.length===0,blockers,label:blockers.length?'待配置':employee.mode==='model'?'模型驱动':employee.skillIds.some(id=>id.startsWith('external_'))?'外部能力编排':'规则试运行'};
}
export function workforceView(data,models,externals=[]){return {contentPacks,profileOptions,roles:roleCatalog.map(r=>({...r,defaultSkillIds:roleSkills[r.id]||[]})),capabilities,externals,skills:[...skillDefinitions.map(s=>({...s,sample:skillSample(s.id)})),...externalDefinitions(externals)],models,employees:data.employees.map(e=>({...e,profile:{...standardProfile,...e.profile},readiness:employeeReadiness(e,models,externals)}))};}
