import test from 'node:test';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createPlatform} from '../src/platform.js';
import {validatePlan} from '../src/workforce/planning.js';
import {commerceSample} from '../src/workforce/commerce.js';
const make=async options=>createPlatform(await mkdtemp(path.join(os.tmpdir(),'planning-')),options);
const current=(p,id)=>p.goals().find(g=>g.id===id);
const propose=(p,g,more={})=>p.planning.propose(g.id,{expectedVersion:g.version,mode:'rules',...more});
const action=(p,g,kind,more={})=>p.action(g.id,{kind,expectedVersion:g.version,...more});
async function goal(p,members){return p.create({requestId:randomUUID(),text:'核对 SKU 盈亏并汇总结果',kind:'analysis',employeeIds:members,permission:'draft'});}
async function testedModel(p){
 const m=await p.workforce.saveModel(null,{provider:'codex-local',name:'受控模型协议测试',model:'',timeoutMs:1000});
 await p.workforce.testModel(m.id);await p.pump();return m;
}
const planned=(e,skillIds=e.skillIds)=>({summary:'按已选能力分工',steps:[{employeeId:e.id,objective:'核对真实账单',deliverable:'有计算口径的报告',skillIds}],notes:['人工验收']});
test('rules plan checks missing data, reorders coordination last, persists and never starts execution',async()=>{
 const p=await make(),e=await p.workforce.install('sku-profit');let g=await goal(p,['employee-coordination',e.id]);g=await propose(p,g);
 assert.equal(g.members[0],'employee-coordination');assert.equal(g.planProposal.steps[0].employeeId,e.id);assert.equal(p.runs().length,0);
 assert(g.planProposal.checks.some(c=>c.skillId==='commerce.sku_profit'&&c.status==='missing'));
 await assert.rejects(action(p,g,'plan'),/采用或放弃/);
 g=await action(p,g,'adoptPlan',{proposalId:g.planProposal.id});assert.equal(g.stage,'plan');assert.equal(g.members[0],e.id);assert.equal(p.runs().length,0);
 g=await action(p,g,'inputs',{data:commerceSample('commerce.sku_profit')});assert.equal(g.executionPlan,null);
 g=await propose(p,g);assert.equal(g.planProposal.checks.find(c=>c.skillId==='commerce.sku_profit').status,'ready');
 g=await action(p,g,'adoptPlan',{proposalId:g.planProposal.id});g=await action(p,g,'plan');await p.pump();await p.pump();g=current(p,g.id);assert.equal(g.stage,'review');assert(g.artifacts.some(a=>a.title==='SKU 盈亏诊断报告'));assert.equal(p.run(p.runs().find(r=>r.agentId===e.id).id).input.assignment.employeeId,e.id);
});
test('plan validation rejects invented members, duplicate steps and unmounted skills',()=>{
 const e={id:'e',skillIds:['commerce.sku_profit']};const p=planned(e);assert.equal(validatePlan(p,[e]).steps.length,1);
 assert.throws(()=>validatePlan({...p,steps:[{...p.steps[0],employeeId:'other'}]},[e]),/未选/);
 assert.throws(()=>validatePlan({...p,steps:[{...p.steps[0],skillIds:['shell.exec']}]},[e]),/已装配/);
 assert.throws(()=>validatePlan({...p,steps:[...p.steps,...p.steps]},[e,{...e,id:'other'}]),/重复/);
});
test('new facts, a stale proposal ID and employee edits cannot authorize an old plan',async()=>{
 const p=await make(),e=await p.workforce.install('sku-profit');let g=await goal(p,[e.id]);g=await propose(p,g);const old=g.planProposal;
 g=await propose(p,g);await assert.rejects(action(p,g,'adoptPlan',{proposalId:old.id}),/草案/);
 await p.workforce.saveEmployee(e.id,{...e,instructions:'变更后的职责'});await assert.rejects(action(p,g,'adoptPlan',{proposalId:g.planProposal.id}),/配置/);
 g=await propose(p,g);g=await action(p,g,'adoptPlan',{proposalId:g.planProposal.id});const latest=p.workforce.view().employees.find(x=>x.id===e.id);await p.workforce.saveEmployee(e.id,{...latest,name:'改名后的分析员'});await assert.rejects(action(p,g,'plan'),/配置已变化/);
 g=await action(p,g,'inputs',{data:commerceSample('commerce.sku_profit')});assert.equal(g.executionPlan,null);assert.equal(g.planProposal,null);
});
test('model plans only see goals and capability metadata; selected subset controls actual execution',async()=>{
 const previous=[process.env.ENABLE_CODEX_LOCAL,process.env.PLATFORM_TOKEN];process.env.ENABLE_CODEX_LOCAL='1';process.env.PLATFORM_TOKEN='test-planning';
 try{
  let e,catalog;
  const p=await make({modelCall:async(m,messages)=>{if(messages.length===1)return {message:{role:'assistant',content:'ok'}};catalog=JSON.parse(messages[1].content);return {message:{role:'assistant',content:JSON.stringify(planned(e,['commerce.sku_profit']))}};}});
  e=await p.workforce.install('sku-profit');e=await p.workforce.saveEmployee(e.id,{...e,skillIds:['commerce.sku_profit','inventory.replenish']});const m=await testedModel(p);let g=await goal(p,[e.id]);g=await action(p,g,'inputs',{data:commerceSample('commerce.sku_profit')});
  g=await propose(p,g,{mode:'model',modelId:m.id});assert.deepEqual(Object.keys(catalog).sort(),['goal','members','scope']);assert(!JSON.stringify(catalog).includes('10000,4000'));assert.equal(g.planProposal.model.name,m.name);
  g=await action(p,g,'adoptPlan',{proposalId:g.planProposal.id});await action(p,g,'plan');await p.pump();assert.equal(current(p,g.id).stage,'review');const run=p.run(p.runs().find(r=>r.goalId===g.id).id);assert.deepEqual(run.input.assignment.skillIds,['commerce.sku_profit']);assert(!run.trace.some(t=>t.skillId==='inventory.replenish'));
 }finally{for(const [i,k]of ['ENABLE_CODEX_LOCAL','PLATFORM_TOKEN'].entries())if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];}
});
test('model errors and concurrent edits preserve existing plans and reject stale responses',async()=>{
 const previous=[process.env.ENABLE_CODEX_LOCAL,process.env.PLATFORM_TOKEN];process.env.ENABLE_CODEX_LOCAL='1';process.env.PLATFORM_TOKEN='test-planning';
 try{
  let respond,entered;const started=new Promise(r=>entered=r);let e;
  const p=await make({modelCall:async(m,msg)=>{if(msg.length===1)return {message:{role:'assistant',content:'ok'}};entered();return new Promise(r=>respond=r);}});e=await p.workforce.install('sku-profit');const m=await testedModel(p);let g=await goal(p,[e.id]);g=await propose(p,g);const proposalId=g.planProposal.id;
  const generation=propose(p,g,{mode:'model',modelId:m.id});await started;await assert.rejects(propose(p,g),/正在生成/);
  g=await action(p,g,'inputs',{data:commerceSample('commerce.sku_profit')});respond({message:{role:'assistant',content:JSON.stringify(planned(e))}});await assert.rejects(generation,/更新/);assert.equal(current(p,g.id).planProposal,null);
  await assert.rejects(action(p,g,'adoptPlan',{proposalId}),/草案/);
 }finally{for(const [i,k]of ['ENABLE_CODEX_LOCAL','PLATFORM_TOKEN'].entries())if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];}
});
test('progress questions report blockers without running a business skill',async()=>{
 const p=await make(),e=await p.workforce.install('sku-profit');let g=await goal(p,[e.id]);g=await propose(p,g);
 await action(p,g,'message',{text:'现在进度怎样，还缺什么？',target:'coordinator',intent:'discuss'});await p.pump();assert.equal(p.runs().length,0);g=current(p,g.id);assert.match(g.messages.at(-1).text,/逐 SKU 账单/);assert.match(g.messages.at(-1).text,/没有重跑/);
});
test('unconfigured model is rejected without silently falling back to rules',async()=>{
 const p=await make(),e=await p.workforce.install('sku-profit');let g=await goal(p,[e.id]);g=await propose(p,g);const before=g.planProposal.id;
 await assert.rejects(propose(p,g,{mode:'model',modelId:'missing'}),/配置凭据/);assert.equal(current(p,g.id).planProposal.id,before);
});
test('approved plans survive restart and employee edits after queueing stop execution',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'planning-restart-'));let p=await createPlatform(dir);const e=await p.workforce.install('sku-profit');let g=await goal(p,[e.id]);g=await action(p,g,'inputs',{data:commerceSample('commerce.sku_profit')});g=await propose(p,g);const proposalId=g.planProposal.id;
 p=await createPlatform(dir);g=current(p,g.id);assert.equal(g.planProposal.id,proposalId);g=await action(p,g,'adoptPlan',{proposalId});p=await createPlatform(dir);g=current(p,g.id);assert.equal(g.executionPlan.id,proposalId);g=await action(p,g,'plan');await p.workforce.saveEmployee(e.id,{...e,name:'运行前变更'});await p.pump();g=current(p,g.id);assert.equal(g.runtime.status,'failed');assert.match(g.runtime.error,/配置已变化/);assert.equal(g.artifacts.length,0);g=await action(p,g,'replan');assert.equal(g.stage,'plan');assert.equal(g.executionPlan,null);assert(g.skillData.commerce.csv.includes('DEMO-A'));g=await propose(p,g);assert.equal(g.planProposal.steps[0].employeeName,'运行前变更');
});
test('invalid model output and transport errors never replace a reviewable draft',async()=>{
 const previous=[process.env.ENABLE_CODEX_LOCAL,process.env.PLATFORM_TOKEN];process.env.ENABLE_CODEX_LOCAL='1';process.env.PLATFORM_TOKEN='test-planning';
 try{
  let response='not json';const p=await make({modelCall:async(m,msg)=>{if(msg.length===1)return {message:{role:'assistant',content:'ok'}};if(response==='throw')throw new Error('private transport detail');return {message:{role:'assistant',content:response}};}});const e=await p.workforce.install('sku-profit'),m=await testedModel(p);let g=await goal(p,[e.id]);g=await propose(p,g);const id=g.planProposal.id;
  await assert.rejects(propose(p,g,{mode:'model',modelId:m.id}),/有效 JSON/);assert.equal(current(p,g.id).planProposal.id,id);
  response=JSON.stringify(planned({...e,id:'invented'}));await assert.rejects(propose(p,g,{mode:'model',modelId:m.id}),/未选员工/);assert.equal(current(p,g.id).planProposal.id,id);
  response='throw';await assert.rejects(propose(p,g,{mode:'model',modelId:m.id}),error=>error.message.includes('调用失败')&&!error.message.includes('private'));assert.equal(current(p,g.id).planProposal.id,id);
 }finally{for(const [i,k]of ['ENABLE_CODEX_LOCAL','PLATFORM_TOKEN'].entries())if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];}
});
