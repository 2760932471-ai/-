import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGoalContract} from '../src/taskflows/contract.js';
import {basicFlow,proposeFlow,reconcileFlow,validateFlow} from '../src/taskflows/planner.js';
import {flowDefaults} from '../src/taskflows/catalog.js';

const model={id:'small-model',revision:1};
const goal=text=>({text,messages:[]});
const step=(id,capability,dependsOn=[])=>({id,capability,dependsOn,title:id,objective:id,acceptance:'提交实际结果并引用来源'});
const proposal=(...nodes)=>({name:'任务',rationale:'按目标交付',nodes});
const offerGoal=goal('在1688为新店找猫粮，比较利润，给推荐款写卖点并制作淘宝主图');

test('repairs a reversed product dependency, inserts profit and copy, preserves independent work and stable IDs',()=>{
 const contract=buildGoalContract(offerGoal);
 const broken=proposal(step('art','image.main'),step('pick','sourcing.1688',['art']),step('study','research.market'),step('out','result.compile',['pick']));
 const repaired=reconcileFlow(contract,broken);
 assert(repaired.corrections.length);
 assert(repaired.nodes.some(n=>n.id==='study'&&n.capabilityProposal?.status==='unverified'));
 const byCap=Object.fromEntries(repaired.nodes.map(node=>[node.capability,node]));
 assert.deepEqual(byCap['sourcing.1688'].dependsOn,[byCap['evidence.collect'].id]);
 assert.deepEqual(byCap['sourcing.profit'].dependsOn,['pick']);
 for(const cap of ['copy.selling_points','image.main'])assert.deepEqual(byCap[cap].dependsOn,[byCap['sourcing.profit'].id]);
 assert.equal(byCap['image.main'].id,'art');
 assert.equal(repaired.nodes.at(-1).id,'out');
 assert.deepEqual(reconcileFlow(contract,repaired).nodes,repaired.nodes);
 assert.deepEqual(broken.nodes[1].dependsOn,['art']);
 validateFlow(repaired);
});

test('a weak planner can fail without losing known deliverables or being called repeatedly',async()=>{
 for(const answer of [null,'{}','not JSON',JSON.stringify(proposal({id:'invalid'}))]){
  let calls=0;
  const planned=await proposeFlow(offerGoal,flowDefaults(),model,async()=>{calls++;return {message:{content:answer}};});
  assert.equal(calls,1);
  assert.equal(planned.planner,'rules');
  assert.deepEqual(planned.nodes,basicFlow(offerGoal).nodes);
  assert(planned.corrections.length);
 }
});

test('an unresolved delivery stays visible as an unverified capability in the fallback',async()=>{
 const requested=goal('制作猫粮标题，发送邮件');
 const planned=await proposeFlow(requested,flowDefaults(),model,async()=>({message:{content:'{}'}}));
 assert(planned.nodes.some(n=>n.capability==='copy.titles'));
 const missing=planned.nodes.find(n=>n.capabilityProposal);
 assert.equal(missing.capabilityProposal.status,'unverified');
 assert.match(missing.objective,/邮件/);
 assert(planned.nodes.at(-1).dependsOn.includes(missing.id));
});

test('retains novel analysis plans while removing explicitly excluded work',async()=>{
 const requested=goal('评估这家店是否适合开分店，不用做主图');
 const raw=proposal(step('walk','footfall.observe'),step('unaskedImage','image.main',['walk']),step('out','result.compile',['unaskedImage']));
 const planned=await proposeFlow(requested,flowDefaults(),model,async()=>({message:{content:'```json\n'+JSON.stringify(raw)+'\n```'}}));
 assert.deepEqual(planned.nodes.map(n=>n.capability),['evidence.collect','footfall.observe','result.compile']);
 assert.equal(planned.nodes[1].capabilityProposal.status,'unverified');
 assert.match(planned.corrections.join(' '),/移除/);
});

test('malformed proposals can fall back to analysis while tool calls, unresolved novel cycles and impossible budgets stay blocked',async()=>{
 await assert.rejects(proposeFlow(offerGoal,flowDefaults(),model,async()=>({message:{tool_calls:[{}]}})),/不能直接执行工具/);
 const fallback=await proposeFlow(goal('评估本地小店的选址'),flowDefaults(),model,async()=>({message:{content:'??'}}));
 assert.equal(fallback.planner,'rules');
 assert.deepEqual(fallback.nodes.map(node=>node.capability),['evidence.collect','analysis.reason','result.compile']);
 await assert.rejects(proposeFlow(offerGoal,{...flowDefaults(),maxNodes:3},null),/上限/);
 const cycle=proposal(step('one','footfall.observe',['two']),step('two','rent.measure',['one']));
 await assert.rejects(proposeFlow(goal('评估本地小店的选址'),flowDefaults(),model,async()=>({message:{content:JSON.stringify(cycle)}})),/循环依赖/);
});

test('minimal model steps inherit delivery standards and keep an explicitly proposed analysis branch',async()=>{
 const requested=goal('为花洒制作标题和卖点');
 const raw={nodes:[{id:'headline',capability:'copy.titles'},step('check','analysis.reason'),step('out','result.compile',['headline'])]};
 const planned=await proposeFlow(requested,flowDefaults(),model,async()=>({message:{content:JSON.stringify(raw)}}));
 const byId=Object.fromEntries(planned.nodes.map(node=>[node.id,node]));
 assert.equal(planned.planner,'model');
 assert.match(byId.headline.acceptance,/规格/);
 assert.deepEqual(byId.check.dependsOn,['evidence']);
 assert(byId.out.dependsOn.includes('check'));
 assert(planned.nodes.some(node=>node.capability==='copy.selling_points'));
});
