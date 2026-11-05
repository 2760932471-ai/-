import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoal, goalAction, tickGoal } from '../src/goals.js';
const make=(extra={})=>createGoal({text:'为角阀准备上新并观察经营表现',kind:'listing',members:['product','content'],permission:'approval',...extra});
const move=(g,kind,extra={})=>goalAction(g,{kind,...extra});
const prepare=g=>{move(g,'facts');move(g,'plan');move(g,'draft');};
const approve=g=>move(g,'approve',{version:g.version,approvalId:g.approval.id});
test('goal creates one linked task space; required facts and stage order cannot be bypassed',()=>{
 const g=make();assert.equal(g.stage,'facts');assert.equal(g.tasks.length,6);assert.ok(g.tasks.every(t=>t.goalId===g.id));assert.throws(()=>move(g,'draft'));assert.throws(()=>move(g,'execute'));assert.throws(()=>make({members:[]}));assert.throws(()=>make({text:' '}));
});
test('approval binds version, exact payload and identity; revision preserves superseded artifacts',()=>{
 const g=make();prepare(g);const old={version:g.version,approvalId:g.approval.id};approve(g);move(g,'revise',{title:'新版角阀草案',price:32});assert.equal(g.stage,'plan');assert.equal(g.approval.status,'invalidated');assert.equal(g.artifacts[0].status,'superseded');assert.throws(()=>move(g,'execute'));move(g,'plan');move(g,'draft');assert.throws(()=>move(g,'approve',old));approve(g);g.proposal.price=31;assert.throws(()=>move(g,'execute'),/有效审批/);
});
test('published is distinct from verified and reviewed; replay and readback retry do not duplicate execution',()=>{
 const g=make();prepare(g);approve(g);move(g,'execute');const id=g.execution.id;move(g,'execute');assert.equal(g.execution.id,id);assert.equal(g.stage,'submitted');assert.throws(()=>move(g,'complete'));move(g,'verify',{mismatch:true});assert.equal(g.stage,'submitted');assert.equal(g.execution.status,'mismatch');move(g,'verify');assert.equal(g.execution.id,id);assert.equal(g.stage,'observing');assert.equal(g.review,null);move(g,'observe');assert.equal(g.review.profit,g.review.netSales-g.review.goods-g.review.fees-g.review.fulfillment-g.review.ads-g.review.returns-g.review.other);assert.equal(g.review.baseline,null);assert.equal(g.stage,'review');move(g,'complete');assert.ok(g.tasks.every(t=>t.status==='completed'));assert.equal(g.artifacts[0].status,'verified');
});
test('draft-only listing and general analysis never claim publishing completion',()=>{
 for(const kind of ['listing','analysis']){const g=make({kind,permission:'draft'});if(kind==='listing')move(g,'facts');move(g,'plan');move(g,'draft');assert.equal(g.stage,'review');assert.equal(g.approval,null);assert.equal(g.execution,null);assert.ok(g.tasks.every(t=>!t.title.includes('发布')));assert.throws(()=>move(g,'execute'));move(g,'complete');assert.equal(g.artifacts[0].status,'accepted');assert.ok(g.tasks.every(t=>t.status==='completed'));}
});
test('goal pause and reply pause are independent; message intent never mutates business facts',()=>{
 const g=make();move(g,'pause');assert.throws(()=>move(g,'facts'),/恢复/);move(g,'message',{text:'改为不锈钢',intent:'context'});assert.equal(g.queue.length,1);assert.equal(tickGoal(g),true);assert.equal(g.facts.material,'待确认');assert.equal(g.artifacts.length,0);move(g,'pauseReplies');move(g,'message',{text:'@内容营销 优化标题'});assert.equal(g.queue[0].target,'content');assert.equal(tickGoal(g),false);move(g,'pause');move(g,'facts');assert.equal(g.stage,'plan');move(g,'pauseReplies');assert.equal(tickGoal(g),true);assert.equal(g.artifacts.length,0);assert.throws(()=>move(g,'message',{text:'hi',target:'service'}));
});
test('rejection requires a reason; old draft is retained, replaced and requires new approval',()=>{
 const g=make();prepare(g);assert.throws(()=>move(g,'reject',{reason:' '}));move(g,'reject',{reason:'规格仍需校验'});assert.equal(g.version,2);assert.equal(g.stage,'plan');assert.equal(g.approval.status,'rejected');assert.equal(g.artifacts[0].status,'superseded');move(g,'plan');move(g,'draft');assert.equal(g.approval.version,2);assert.equal(g.approval.status,'pending');
});
test('queue bound rejects before saving a human message',()=>{const g=make();for(let i=0;i<24;i++)move(g,'message',{text:'消息'+i});const count=g.messages.length;assert.throws(()=>move(g,'message',{text:'溢出'}));assert.equal(g.messages.length,count);});
test('human plan confirmation and final acceptance remain explicit actionable tasks',()=>{const g=make({kind:'analysis'});assert.equal(g.tasks[0].status,'confirmation');move(g,'plan');move(g,'draft');assert.equal(g.tasks[2].status,'acceptance');move(g,'pause');assert.equal(g.tasks[2].status,'paused');move(g,'pause');assert.equal(g.tasks[2].status,'acceptance');});
