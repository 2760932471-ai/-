import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPlatform} from '../src/platform.js';
import {assignFlowCapability, flowCapabilities} from '../src/taskflows/catalog.js';
import {defaultEmployees} from '../src/workforce/employees.js';
import {requestedSkills} from '../public/goal-language.js';

test('dispatch uses installed skills and stable role preferences, independent of employee order',()=>{
 const team=defaultEmployees();
 assert.equal(assignFlowCapability('product.compare',team).employeeId,'employee-selection');
 assert.deepEqual(assignFlowCapability('product.compare',team),assignFlowCapability('product.compare',[...team].reverse()));
 assert.equal(assignFlowCapability('product.compare',team,'employee-research').employeeId,'employee-research');
 assert.equal(assignFlowCapability('product.compare',team,'employee-profit').employeeId,'employee-selection');
 assert.equal(assignFlowCapability('copy.selling_points',team).employeeId,'employee-copy-selling_points');
});

test('unavailable employees and invented capabilities are never assigned work',()=>{
 const unusable=defaultEmployees().map(e=>({...e,enabled:false}));
 const candidate=defaultEmployees().find(e=>e.id==='employee-profit');
 unusable.push({...candidate,readiness:{ready:false}},{...candidate,mode:'model'});
 const fallback=assignFlowCapability('finance.calculate',unusable,'employee-profit');
 assert.equal(fallback.executor,'skill');
 assert.equal(fallback.employeeId,null);
 assert.equal(assignFlowCapability('unknown.action',[{...candidate,skillIds:['unknown.action']}]).executor,'unverified');
});

test('flow-specialist selection cannot override the execution capability of a dependent step',()=>{
 const catalog=Object.fromEntries(flowCapabilities.map(c=>[c.id,c]));
 for(const capability of flowCapabilities){
  assert.ok(capability.inputs.length&&capability.outputs.length&&capability.executor&&capability.roleIds.length,capability.id);
 }
 assert.ok(catalog['sourcing.profit'].inputs.every(input=>catalog['sourcing.1688'].outputs.includes(input)));
 const profit=assignFlowCapability('sourcing.profit',[],'flow-visual');
 assert.equal(profit.employeeId,'flow-sourcing');
 assert.equal(profit.executor,'profit');
 assert.equal(assignFlowCapability('image.main',[],'flow-sourcing').employeeId,'flow-visual');
 assert.equal(assignFlowCapability('analysis.reason').executor,'model');
 assert.equal(assignFlowCapability('result.compile').employeeId,null);
});

test('flow execution rechecks the assignee when a specialist is disabled after planning',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'flow-assignment-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const platform=await createPlatform(dir);
 const goal=await platform.create({executionMode:'flow',text:'为猫粮制作商品标题',requestId:randomUUID()});
 const current=()=>platform.goals().find(g=>g.id===goal.id);
 await platform.pump();
 const title=current().flow.nodes.find(n=>n.capability==='copy.titles');
 const specialist=platform.workforce.view().employees.find(e=>e.id===title.assignment.employeeId);
 assert.equal(specialist.id,'employee-copy-titles');
 await platform.workforce.saveEmployee(specialist.id,{...specialist,enabled:false});
 await platform.pump();
 const row=platform.runs().find(r=>r.goalId===goal.id&&r.flowNodeId===title.id);
 const run=platform.run(row.id);
 assert.equal(run.input.assignment.employeeId,null);
 assert.equal(run.input.assignment.executor,'skill');
 assert.equal(current().tasks.find(n=>n.id===title.id).owner,run.agentName);
});

test('a specific business request displaces incidental writing and generic comparisons',()=>{
 const requests=requestedSkills('比较促销折扣并审核活动文案');
 assert.deepEqual(requests.map(r=>r.capability),['campaign.discount','content.review']);
 assert.ok(requests[0].supersedes.includes('product.compare'));
 assert.ok(requests[1].supersedes.includes('copy.selling_points'));
 const [review]=requestedSkills('制作商品标题并审核文案');
 assert.ok(review.after.includes('copy.titles'));
 assert.ok(!review.supersedes.includes('copy.titles'));
 assert.deepEqual(requestedSkills('给老客稳定补货，推荐一款猫粮'),[]);
 assert.equal(requestedSkills('仅需要主图设计简报')[0].capability,'copy.image_brief');
});

test('inventory goal computes coverage and shortage risk from actual inputs without a model',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'flow-coverage-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const platform=await createPlatform(dir);
 const goal=await platform.create({executionMode:'flow',text:'用库存、日销和交期算还有几天会断货',requestId:randomUUID()});
 const current=()=>platform.goals().find(g=>g.id===goal.id);
 await platform.action(goal.id,{kind:'inputs',expectedVersion:goal.version,data:{inventory:{stock:60,dailySales:12,leadDays:5,safetyDays:2,source:'期末库存表'}}});
 for(let i=0;i<4;i++)await platform.pump();
 const result=current();
 assert.equal(result.stage,'review');
 assert.deepEqual(result.flow.nodes.map(n=>n.capability),['evidence.collect','inventory.coverage','result.compile']);
 const coverage=result.flow.nodes.find(n=>n.capability==='inventory.coverage');
 assert.equal(coverage.assignment.employeeId,'employee-supply');
 const report=result.artifacts.find(a=>coverage.artifactIds.includes(a.id));
 assert.match(report.body,/库存覆盖：5天/);
 assert.match(report.body,/存在缺货风险/);
 assert.match(report.evidence,/期末库存表/);
});

test('reviewing existing copy waits for the text and resumes without commissioning new copy',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'flow-review-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const platform=await createPlatform(dir);
 const goal=await platform.create({executionMode:'flow',text:'审核已有文案，不要写卖点',requestId:randomUUID()});
 const current=()=>platform.goals().find(g=>g.id===goal.id);
 for(let i=0;i<3;i++)await platform.pump();
 const review=current().flow.nodes.find(n=>n.capability==='content.review');
 assert.equal(review.status,'needs_input');
 assert.ok(!current().flow.nodes.some(n=>n.capability.startsWith('copy.')));
 const evidence=current().flow.nodes.find(n=>n.capability==='evidence.collect').artifactIds;
 await platform.action(goal.id,{kind:'inputs',expectedVersion:current().version,data:{reviewText:'永久不漏，百分百可靠。'}});
 for(let i=0;i<3;i++)await platform.pump();
 const result=current();
 assert.equal(result.stage,'review');
 assert.deepEqual(result.flow.nodes.find(n=>n.capability==='evidence.collect').artifactIds,evidence);
 const report=result.artifacts.find(a=>a.title==='宣传声明初筛');
 assert.match(report.body,/永久不漏/);
 assert.match(report.body,/百分百/);
});
