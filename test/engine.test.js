import test from 'node:test';
import assert from 'node:assert/strict';
import { agents, createTask, tick, decide, planGoal } from '../src/engine.js';

test('single orchestrator executes selected agents, retains observations, and requires approval', async () => {
  const task = createTask('优化电商经营', agents.map(a=>a.id));
  for (let i=0; i<agents.length; i++) await tick(task);
  assert.equal(task.status, 'running');
  assert.equal(task.artifacts.length, 4);
  await tick(task);
  assert.equal(task.status, 'awaiting_approval');
  const iterations = task.iterations;
  await tick(task);
  assert.equal(task.iterations, iterations);
  decide(task, 'approve');
  assert.equal(task.status, 'completed');
  assert.throws(()=>decide(task,'approve'));
});
test('only selected adapters run and receive prior observations', async () => {
  const task=createTask('分析商品',['insight','product','product']);
  let received;
  await tick(task,{insight:async()=>({artifact:'分析',summary:'完成',evidence:'演示'})});
  await tick(task,{product:async input=>{received=input;return {artifact:'商品方案',summary:'完成',evidence:'演示'};}});
  assert.equal(task.artifacts.length,2);
  assert.equal(received.observations[0].body,'分析');
  await tick(task);decide(task,'reject');assert.equal(task.status,'rejected');
});
test('invalid goals, empty team and unknown adapters are rejected',()=>{
  for(const goal of ['',null,' '.repeat(5),'x'.repeat(2001)]) assert.throws(()=>createTask(goal));
  assert.throws(()=>createTask('测试',[]));
  assert.throws(()=>createTask('测试',['unknown']));
});
test('adapter failures stop the loop with a visible error',async()=>{
  const task=createTask('测试',['service']);
  await tick(task,{service:async()=>{throw new Error('upstream unavailable');}});
  assert.equal(task.status,'failed');assert.match(task.events.at(-1).detail,/upstream/);
  await tick(task);assert.equal(task.iterations,1);
});
test('malformed output and exhausted iteration budget fail explicitly',async()=>{
  const task=createTask('测试',['service']);await tick(task,{service:async()=>({})});assert.equal(task.status,'failed');
  const other=createTask('测试');other.maxIterations=0;await tick(other);assert.equal(other.status,'failed');
});
test('cancelled task never executes another adapter',async()=>{
 const task=createTask('测试');task.status='cancelled';await tick(task,{});assert.equal(task.iterations,0);
});

 test('natural language recommends the relevant specialists',()=>{
 assert.deepEqual(planGoal('准备客服售后话术').selected,['service']);
 assert.deepEqual(planGoal('新品商品卖点与推广文案').selected,['product','content']);
 assert.deepEqual(planGoal('帮帮我').selected,['insight']);
 assert.throws(()=>planGoal(''));
 assert.deepEqual(createTask('优化客服话术').selected,['service']);
 });
