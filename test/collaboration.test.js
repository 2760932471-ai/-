import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {createPlatform} from '../src/platform.js';
import {previewGoal} from '../src/agents/builtins.js';
import {skillSample} from '../src/workforce/skills.js';
const text='寻找市面上性价比高的淋浴头';
const input={text,kind:'analysis',permission:'draft',requestId:'selection-collaboration-01',employeeIds:['employee-coordination','employee-research','employee-selection'],startCollaboration:true,scope:{store:'测试店',sku:'待比较候选',product:'淋浴头'}};
async function setup(t){const dir=await mkdtemp('/tmp/collaboration-');t.after(()=>rm(dir,{recursive:true,force:true}));return {dir,p:await createPlatform(dir)};}
test('selection intent selects a real team, kickoff persists missing inputs without fabricating work',async t=>{
 const {p,dir}=await setup(t);assert.equal(previewGoal(text).intent,'selection');
 const recommendation=p.workforce.recommend(text);assert.deepEqual(recommendation.employeeIds,['employee-research','employee-selection','employee-coordination']);
 let g=await p.create(input);assert.deepEqual(g.members,recommendation.employeeIds);assert.equal(g.stage,'plan');assert.equal(g.artifacts.length,0);assert.equal(p.runs().length,0);assert(g.collaboration.checks.some(c=>c.status==='missing'));assert(g.messages.some(m=>m.text.includes('网络搜索需先连接')));
 const count=g.messages.length;g=await p.action(g.id,{kind:'kickoff',expectedVersion:g.version});assert.equal(g.messages.length,count);
 assert.equal((await p.create(input)).id,g.id);const restarted=await createPlatform(dir);assert.equal(restarted.goals()[0].messages.length,count);
 await p.action(g.id,{kind:'plan',expectedVersion:g.version});await p.pump();g=p.goals()[0];assert.equal(g.runtime.status,'needs_input');assert.equal(g.artifacts.length,0);assert.equal(g.messages.filter(m=>m.workflow==='delivery').length,0);assert.equal(p.runs().length,1);
});
test('actual comparison is passed to scoring and included in coordinator output, receipts refer to real artifacts',async t=>{
 const {p}=await setup(t);let g=await p.create(input);g=await p.action(g.id,{kind:'inputs',expectedVersion:g.version,data:{candidates:skillSample('selection.score').candidates}});assert(g.collaboration.checks.every(c=>c.status==='ready'));
 await p.action(g.id,{kind:'plan',expectedVersion:g.version});for(let i=0;i<5;i++)await p.pump();g=p.goals()[0];assert.equal(g.stage,'review');
 const deliveries=g.messages.filter(m=>m.workflow==='delivery');assert.equal(deliveries.length,3);assert.deepEqual(deliveries.map(m=>m.employeeId),g.members);
 for(const m of deliveries)for(const id of m.artifactIds)assert(g.artifacts.some(a=>a.id===id&&a.runId===m.runId));
 const comparison=g.artifacts.find(a=>a.agent==='employee-research');const score=g.artifacts.find(a=>a.title==='候选商品加权评分');assert(score.body.includes(comparison.body));assert(deliveries[1].upstreamArtifactIds.includes(comparison.id));
 const summary=g.artifacts.find(a=>a.title==='任务交付摘要');assert(summary.body.includes(score.body));assert(summary.body.includes('市场研究数字员工'));assert(summary.body.includes('不是模型验证的市场事实'));
 const deliveryCount=deliveries.length;await p.pump();assert.equal(p.goals()[0].messages.filter(m=>m.workflow==='delivery').length,deliveryCount);
});
test('old listing goal can explicitly switch to selection while retaining conversation and version protection',async t=>{
 const {p}=await setup(t);let g=await p.create({...input,startCollaboration:false,kind:'listing',employeeIds:['employee-merchandise','employee-creative','employee-profit','employee-coordination'],scope:{store:'测试店',sku:'DEMO-JF-001',product:'角阀'}});const original=g.messages.map(m=>m.id);
 g=await p.action(g.id,{kind:'regroupSelection',expectedVersion:g.version});assert.equal(g.kind,'analysis');assert.equal(g.scope.sku,'待比较候选');assert(g.participants.includes('employee-merchandise'));assert(original.every(id=>g.messages.some(m=>m.id===id)));assert.equal(g.collaboration.goalVersion,g.version);
 await assert.rejects(()=>p.action(g.id,{kind:'regroupSelection',expectedVersion:1}),/版本已改变/);
});
test('pause stops queued work and new input invalidates queued deliveries',async t=>{
 const {p}=await setup(t);let g=await p.create(input);g=await p.action(g.id,{kind:'inputs',expectedVersion:g.version,data:{candidates:skillSample('selection.score').candidates}});await p.action(g.id,{kind:'plan',expectedVersion:g.version});await p.action(g.id,{kind:'pause'});await p.pump();g=p.goals()[0];assert.equal(g.messages.filter(m=>m.workflow==='delivery').length,0);assert.equal(g.runtime.status,'queued');await p.action(g.id,{kind:'pause'});await p.pump();assert.equal(p.goals()[0].messages.filter(m=>m.workflow==='delivery').length,1);
 g=p.goals()[0];const oldVersion=g.version;g=await p.action(g.id,{kind:'inputs',expectedVersion:g.version,data:{candidates:skillSample('selection.score').candidates}});await p.pump();g=p.goals()[0];assert.equal(g.stage,'plan');assert.equal(g.messages.filter(m=>m.workflow==='delivery'&&m.goalVersion>oldVersion).length,0);
});
test('configuration changes require a fresh check but never prevent saving discussion or business data',async t=>{
 const {p}=await setup(t);let g=await p.create(input);const e=p.workforce.view().employees.find(e=>e.id==='employee-research');await p.workforce.saveEmployee(e.id,{...e,enabled:false});
 g=await p.action(g.id,{kind:'message',text:'先记录讨论，不改业务资料',target:'coordinator'});assert(g.messages.some(m=>m.text==='先记录讨论，不改业务资料'));
 await assert.rejects(()=>p.action(g.id,{kind:'plan',expectedVersion:g.version}),/重新检查/);
 g=await p.action(g.id,{kind:'inputs',expectedVersion:g.version,data:{candidates:skillSample('selection.score').candidates}});assert(g.collaboration.checks.some(c=>c.name==='员工配置'&&c.status==='missing'));assert.equal(g.skillData.candidates.length,2);
});
