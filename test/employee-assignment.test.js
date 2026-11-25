import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {createPlatform} from '../src/platform.js';

async function workspace(t){
 const dir=await mkdtemp('/tmp/employee-assignment-');
 t.after(()=>rm(dir,{recursive:true,force:true}));
 return {dir,platform:await createPlatform(dir,{offerSearch:async()=>[],offerDetail:async()=>null})};
}
test('delegating runs the actual configured code employee and survives retries, reloads and renamed staff',async t=>{
 const {dir,platform:p}=await workspace(t);
 const request={assignedEmployeeId:'employee-coordination',text:'整理本周业务任务简报',requestId:randomUUID()};
 const g=await p.create(request);
 assert.equal(g.mode,'team');
 assert.deepEqual(g.members,[request.assignedEmployeeId]);
 assert.equal(g.assignedEmployeeId,request.assignedEmployeeId);
 assert.equal((await p.create(request)).id,g.id);
 await assert.rejects(p.create({...request,assignedEmployeeId:'employee-profit'}),/同一创建请求/);
 for(let step=0;step<3;step++)await p.pump();
 const run=p.runs().find(r=>r.goalId===g.id);
 assert.equal(run?.agentId,request.assignedEmployeeId);
 const result=p.goals().find(x=>x.id===g.id);
 assert(result.artifacts.some(a=>a.agent===run.agentId));
 const e=p.workforce.view().employees.find(e=>e.id===g.assignedEmployeeId);
 await p.workforce.saveEmployee(e.id,{...e,name:'新的员工名称',enabled:false});
 await assert.rejects(p.create({...request,requestId:randomUUID()}),/已停用/);
 await assert.rejects(p.create({...request,assignedEmployeeId:'foreign-id',requestId:randomUUID()}),/当前空间/);
 const restored=await createPlatform(dir);
 assert.equal(restored.goals().find(x=>x.id===g.id).assignedEmployeeName,e.name);
});
test('a delegated product visual or sourcing goal uses the actual specialist flow, including short subject requests',async t=>{
 const {platform:p}=await workspace(t);
 const slots=p.flows.view().employees;
 assert.deepEqual(slots.map(s=>s.id),['flow-sourcing','flow-visual']);
 for(const slot of slots){
  const g=await p.create({assignedEmployeeId:slot.id,text:'水龙头',requestId:randomUUID()});
  await p.pump();
  const result=p.goals().find(a=>a.id===g.id);
  assert.equal(result.assignedEmployeeId,slot.id);
  assert.equal(result.mode,'flow');
  assert.equal(result.text,'水龙头');
  assert(result.flow.nodes.some(n=>slot.skillIds.includes(n.capability)));
 }
});
test('delegated merchandise work collects the real SKU and price and resumes the same task',async t=>{
 const {platform:p}=await workspace(t);
 const g=await p.create({assignedEmployeeId:'employee-merchandise',text:'核验花洒的上新资料',requestId:randomUUID()});
 assert.equal(g.scope.product,'');assert.equal(g.proposal.price,null);
 assert.equal(g.stage,'plan');
 const facts={product:'手持花洒',sku:'SH-01',price:'49.90',material:'ABS',connector:'G1/2',stock:30,cost:20,source:'本次供应商规格单'};
 await p.action(g.id,{kind:'facts',confirmed:true,facts,expectedVersion:g.version});
 for(let step=0;step<4;step++)await p.pump();
 const result=p.goals().find(x=>x.id===g.id);
 assert.equal(result.stage,'review');
 assert.equal(result.scope.sku,'SH-01');
 assert.equal(result.proposal.price,49.9);
 assert(result.artifacts.some(a=>a.agent===g.assignedEmployeeId));
});
test('a code-based art brief cannot claim that it generated a real product image',async t=>{
 const {platform:p}=await workspace(t);
 const input={assignedEmployeeId:'employee-copy-image_brief',text:'生成猫粮的淘宝主图',requestId:randomUUID()};
 await assert.rejects(p.create(input),/商品视觉设计师/);
 const brief=await p.create({...input,text:'制作猫粮的主图设计简报',requestId:randomUUID()});
 assert.equal(brief.mode,'team');
 assert.deepEqual(brief.members,[input.assignedEmployeeId]);
});
