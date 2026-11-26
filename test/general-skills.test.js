import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createPlatform} from '../src/platform.js';
import {executeSkill} from '../src/workforce/skills.js';
import {proposeFlow} from '../src/taskflows/planner.js';
import {flowDefaults} from '../src/taskflows/catalog.js';

test('table profile accounts for empty rows and mixed columns, keeps identifiers opaque and validates CSV',async()=>{
 const csv='门店,订单号,金额,备注\r\n"城东,一店",001,-1.5,"含\n换行"\r\n城南,010,0,\r\n,,,\r\n城西,015,6,0';
 const r=await executeSkill('table.profile',{table:{csv,source:'三店账单'}});
 assert.equal(r.status,'succeeded');assert.equal(r.artifacts[0].evidence,'三店账单');
 assert.equal(r.artifacts[0].skillId,'table.profile');
 assert.deepEqual(r.artifacts[0].tableMetrics,r.metrics);
 assert.doesNotMatch(JSON.stringify(r.artifacts[0]),/城南|城西|城东/);
 assert.equal(r.metrics.rowCount,4);
 assert.deepEqual(r.metrics.columns[2],{name:'金额',present:3,missing:1,min:-1.5,max:6,mean:1.5});
 assert.equal(r.metrics.columns[1].mean,undefined);
 assert.equal(r.metrics.columns[3].mean,undefined);
 assert.match((await executeSkill('table.profile',{table:{csv:'金额,数量\n9,4,5'}})).summary,/列数/);
 assert.match((await executeSkill('table.profile',{})).question,/CSV/);
});

test('document outline preserves source line numbers and only quotes actual text outside code fences',async()=>{
 const text='# 交付说明\r\n\r\n试用范围为两家门店。资料随后更新。\r\n```js\r\n隐藏示例代码\r\n```\r\n\r\n## 决定\r\n- 先核实运费再报价。';
 const r=await executeSkill('document.outline',{document:{text}});
 assert.equal(r.status,'succeeded');assert.deepEqual(r.metrics.lines,[3,9]);
 assert.equal(r.artifacts[0].skillId,'document.outline');
 assert.equal(r.artifacts[0].tableMetrics,undefined);
 assert.match(r.artifacts[0].body,/第 9 行 · 决定\n先核实运费再报价。/);
 assert.doesNotMatch(r.artifacts[0].body,/隐藏示例代码/);
 assert.equal((await executeSkill('document.outline',{document:{text:'# 仅有标题'}})).status,'needs_input');
 assert.equal((await executeSkill('document.outline',{document:{text:'多'.repeat(60001)}})).status,'needs_input');
});

test('a normal task uses the local skill, treats pasted text as data and resumes after the user supplies material',async t=>{
 const dir=await mkdtemp('/tmp/general-task-');t.after(()=>rm(dir,{recursive:true,force:true}));
 const p=await createPlatform(dir),current=id=>p.goals().find(g=>g.id===id);
 const open=text=>p.create({executionMode:'flow',text,requestId:randomUUID()});
 async function run(){for(let i=0;i<5;i++)await p.pump();}
 const inline=await open('请总结下面的文档：\n# 会议记录\n决定：不要忘记制作主图。\n- 先整理供应商报价。');
 await run();let g=current(inline.id);
 assert.equal(g.stage,'review');
 assert.deepEqual(g.flow.nodes.map(n=>n.capability),['document.outline','result.compile']);
 assert.match(g.artifacts.find(a=>a.title==='文档提要').body,/第 2 行 · 会议记录/);
 const task=await open('分析我的 CSV 表格');
 await run();g=current(task.id);
 assert.equal(g.flow.status,'blocked');assert.match(g.flow.nodes[0].question,/粘贴/);
 await p.action(task.id,{kind:'message',expectedVersion:g.version,text:'门店,售价\n东店,40\n西店,60'});
 await run();g=current(task.id);
 assert.equal(g.version,1);assert.equal(g.stage,'review');
 assert.match(g.artifacts.find(a=>a.title==='表格概览').body,/平均 50/);
 const plan=await proposeFlow({text:'整理会议纪要',scope:{},messages:[]},flowDefaults(),{id:'model'},()=>assert.fail('does not need planner model'));
 assert.deepEqual(plan.nodes.map(n=>n.capability),['document.outline','result.compile']);
 const restored=await createPlatform(dir);
 const sheet=restored.goals().find(goal=>goal.id===task.id).artifacts.find(a=>a.skillId==='table.profile');
 assert.deepEqual(sheet.tableMetrics.columns[1],{name:'售价',present:2,missing:0,min:40,max:60,mean:50});
 assert.doesNotMatch(JSON.stringify(sheet),/东店|西店/);
 assert.ok(restored.goals().find(goal=>goal.id===inline.id).artifacts.some(a=>a.skillId==='document.outline'));
});
