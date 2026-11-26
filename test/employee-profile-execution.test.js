import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPlatform} from '../src/platform.js';
import {runEmployee} from '../src/workforce/runtime.js';
import {assignFlowCapability} from '../src/taskflows/catalog.js';
import {matchMembers} from '../src/workforce/matching.js';

async function workspace(t){
 const dir=await mkdtemp(join(tmpdir(),'employee-strategy-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const p=await createPlatform(dir);
 const staff={};
 for(const [name,role,tone,channel] of [
  ['精简接待','service','concise','general'],['耐心接待','service','empathetic','general'],
  ['淘系经营','growth','standard','taobao'],['短视频经营','growth','standard','douyin']
 ]){
  const base=p.workforce.view().employees.find(e=>e.id==='employee-'+role);
  const e=await p.workforce.saveEmployee(null,{...base,name,profile:{tone,channel,position:name,deliverable:role==='service'?'接待草稿':'推广漏斗报告'}});
  staff[role==='service'?tone:channel]=e.id;
 }
 return {p,staff};
}
async function advance(p,id){
 for(let i=0;i<5;i++)await p.pump();
 return p.goals().find(row=>row.id===id);
}
const getStaff=(p,id)=>p.workforce.view().employees.find(e=>e.id===id);
const figures={impressions:1000,clicks:50,orders:0,revenue:0,spend:50,source:'同一份推广账单',period:'11月'};

test('the same service question reaches both personas through direct delegation and automatic assignment',async t=>{
 const {p,staff}=await workspace(t),question='客户问：“快递包裹破损，该怎么办？”';
 for(const [id,tone,expected] of [[staff.concise,'简明',/请先提供订单编号/],[staff.empathetic,'关怀',/包裹遇到状况/]]){
  for(const request of [{assignedEmployeeId:id,text:question},{executionMode:'flow',text:tone+'客服话术，'+question}]){
   const {id:goalId}=await p.create({...request,requestId:randomUUID()});
   const g=await advance(p,goalId);
   const file=g.artifacts.find(a=>a.title==='售后分诊单');
   assert.ok(file,JSON.stringify(g.tasks));
   assert.match(file.body,expected);
   assert.match(file.body,/物流单号和轨迹/);
   assert.match(file.body,/未承诺退款/);
   if(g.mode==='flow'){
    assert.equal(g.flow.nodes.find(n=>n.capability==='service.triage').assignment.employeeId,id);
    assert.ok(!g.flow.nodes.some(n=>n.capability==='analysis.reason'||n.capability==='evidence.collect'));
   }
  }
 }
});

test('operators preserve the original metrics, apply a channel-specific action and keep the profile used by a planned task',async t=>{
 const {p,staff}=await workspace(t),runs=[];
 for(const [channel,id] of [['淘宝',staff.taobao],['抖音',staff.douyin]]){
  const {id:goalId}=await p.create({executionMode:'flow',text:'分析'+channel+'推广漏斗',requestId:randomUUID()});
  await p.pump();const g=p.goals().find(r=>r.id===goalId);
  const step=g.flow.nodes.find(n=>n.capability==='traffic.funnel');
  assert.equal(step.assignment.employeeId,id);
  if(channel==='抖音'){
   const e=getStaff(p,id);
   await p.workforce.saveEmployee(id,{...e,profile:{...e.profile,channel:'general'}});
  }
  await p.action(g.id,{kind:'inputs',expectedVersion:g.version,data:{traffic:figures}});
  const result=await advance(p,g.id);
  assert.equal(result.flow.nodes.find(n=>n.id===step.id).assignment.profile.channel,step.assignment.profile.channel);
  const output=result.artifacts.find(a=>a.title==='推广漏斗核算');
  assert.ok(output);assert.match(output.body,/点击率 CTR：5%/);
  assert.ok(output.body.includes(channel+'运营建议'));
  runs.push(output.body);
 }
 assert.match(runs[0],/搜索词.*到手价/);assert.match(runs[1],/直播间.*商品落地页/);
 const {id}=await p.create({assignedEmployeeId:staff.douyin,text:'核查推广漏斗',requestId:randomUUID()});
 const g=p.goals().find(row=>row.id===id);
 await p.action(id,{kind:'inputs',data:{traffic:figures},expectedVersion:g.version});
 const e=getStaff(p,staff.douyin);
 assert.equal(e.profile.channel,'general');
 const changed=await advance(p,id);
 const report=changed.artifacts.find(a=>a.title==='推广漏斗核算');
 assert.ok(report);
 assert.doesNotMatch(report.body,/抖音运营建议/);

 const crossChannel=await p.create({assignedEmployeeId:staff.taobao,text:'核查抖音推广漏斗',requestId:randomUUID()});
 await p.action(crossChannel.id,{kind:'inputs',data:{traffic:figures},expectedVersion:crossChannel.version});
 const crossResult=await advance(p,crossChannel.id);
 const crossReport=crossResult.artifacts.find(a=>a.title==='推广漏斗核算');
 assert.equal(crossReport.agent,staff.taobao);
 assert.match(crossReport.body,/抖音运营建议/);
 assert.doesNotMatch(crossReport.body,/淘宝运营建议/);
});

test('generic tasks keep their usual employee, while planner and automatic legacy team use explicit preferences',async t=>{
 const {p,staff}=await workspace(t),employees=p.workforce.view().employees,d={employees,models:[],externalSkills:[]};
 assert.equal(assignFlowCapability('traffic.funnel',employees).employeeId,'employee-growth');
 assert.equal(assignFlowCapability('traffic.funnel',employees,null,'比较淘宝与抖音推广漏斗').employeeId,'employee-growth');
 assert.equal(assignFlowCapability('traffic.funnel',employees,null,'不要淘宝，仅做抖音推广漏斗').employeeId,staff.douyin);
 assert.equal(assignFlowCapability('traffic.funnel',employees,null,'由淘系经营核查这份漏斗').employeeId,staff.taobao);
 assert.ok(matchMembers(d,'用温和的口吻处理客服咨询').employeeIds.includes(staff.empathetic));
 const base=employees.find(e=>e.id==='employee-research');
 const operator={...base,id:'quarterly-research',name:'渠道调研编辑',skillIds:['web.search'],profile:{position:'渠道分析员',responsibilities:'调研公开政策'}};
 const matched=matchMembers({...d,employees:[...employees,operator]},'让渠道分析员上网查物流政策');
 assert.ok(matched.steps.some(s=>s.employeeId===operator.id&&s.skillIds.includes('web.search')));
});

test('model mode receives configured working preferences while saved input cannot override them',async t=>{
 const {p,staff}=await workspace(t);
 const employee={...getStaff(p,staff.concise),mode:'model'};
 const persona='先问一个最有帮助的问题';
 employee.profile={...employee.profile,persona};
 const result=await runEmployee(employee,{id:'test'},{employeeProfile:{tone:'empathetic'},serviceQuestion:'包裹未到'},{
  discussion:true,modelCall:async(model,messages)=>{
   const user=JSON.parse(messages[1].content);
   assert.equal(user.employeeProfile.persona,persona);
   assert.equal(user.employeeProfile.tone,'concise');
   return {message:{content:'需要先核对订单编号。'}};
  }
 });
 assert.equal(result.status,'succeeded');
});
