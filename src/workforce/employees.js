import {roles,capabilities} from './catalog.js';
import {skillDefinitions,skillSample} from './skills.js';
export const roleSkills={merchandise:['product.validate','product.draft'],creative:['content.outline','content.review'],profit:['finance.calculate'],coordination:['task.brief'],selection:['selection.score','product.compare'],research:['product.compare'],supply:['inventory.coverage'],analysis:['finance.calculate'],risk:['content.review']};
export function defaultEmployees(){return ['merchandise','creative','profit','coordination'].map(id=>({id:'employee-'+id,roleId:id,name:roles.find(r=>r.id===id).name,enabled:true,mode:'skills',modelId:null,skillIds:roleSkills[id],instructions:roles.find(r=>r.id===id).responsibility,maxSteps:5,revision:1}));}
export function validateEmployee(input,previous){
 if(previous&&input.revision!==previous.revision)throw new Error('员工配置已更新，请重新打开');
 const role=roles.find(r=>r.id===input.roleId);if(!role)throw new Error('请选择有效岗位');
 const name=String(input.name||'').trim(),instructions=String(input.instructions||'').trim();
 if(!name||name.length>80||instructions.length>4000)throw new Error('名称必填且不超过80字，职责指令不超过4000字');
 if(!['skills','model'].includes(input.mode))throw new Error('请选择模型驱动或规则试运行');
 if(!Array.isArray(input.skillIds)||input.skillIds.length>10||input.skillIds.some(id=>!skillDefinitions.some(s=>s.id===id)))throw new Error('只能装配已实现的 Skill，最多10项');
 const maxSteps=Number(input.maxSteps);if(!Number.isInteger(maxSteps)||maxSteps<1||maxSteps>8)throw new Error('执行循环上限为1–8轮');
 if(typeof input.enabled!=='boolean')throw new Error('请选择员工启用状态');
 return {id:previous?.id,name,roleId:role.id,instructions,mode:input.mode,modelId:input.modelId||null,skillIds:[...new Set(input.skillIds)],enabled:input.enabled,maxSteps,revision:(previous?.revision||0)+1};
}
export function employeeReadiness(employee,models){
 const blockers=[];if(!employee.enabled)blockers.push('员工已停用');if(!employee.skillIds.length)blockers.push('未装配已实现的Skill');
 if(employee.mode==='model'){
  const m=models.find(m=>m.id===employee.modelId);
  if(!m)blockers.push('尚未选择模型连接');
  else{if(!m.credentialConfigured)blockers.push(m.provider==='codex-local'?'本机Codex桥接未启用或未配置工作空间令牌':'服务器未配置模型密钥');if(m.lastTest?.status!=='succeeded'||m.lastTest.revision!==m.revision)blockers.push('当前模型配置尚未通过连接测试');}
 }
 return {ready:blockers.length===0,blockers,label:blockers.length?'待配置':employee.mode==='model'?'模型驱动':'规则试运行'};
}
export function workforceView(data,models){return {roles:roles.map(r=>({...r,defaultSkillIds:roleSkills[r.id]||[]})),capabilities,skills:skillDefinitions.map(s=>({...s,sample:skillSample(s.id)})),models,employees:data.employees.map(e=>({...e,readiness:employeeReadiness(e,models)}))};}
