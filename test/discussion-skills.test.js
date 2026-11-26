import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createPlatform} from '../src/platform.js';

async function task(t,options={},text='整理文档：\n# 初稿\n会议决定在下周试销。'){
 const dir=await mkdtemp('/tmp/flow-followup-');t.after(()=>rm(dir,{recursive:true,force:true}));
 const p=await createPlatform(dir,options);
 const {id}=await p.create({executionMode:'flow',text,requestId:randomUUID()});
 const get=()=>p.goals().find(g=>g.id===id);
 const post=(kind,extra={})=>p.action(id,{kind,expectedVersion:get().version,...extra});
 const say=(text,extra={})=>post('message',{text,...extra});
 const pump=async()=>{for(let i=0;i<5;i++)await p.pump();};
 const runs=()=>p.runs().filter(r=>r.goalId===id&&r.purpose==='flow_skill');
 return {p,id,get,post,say,pump,runs};
}

test('local skill in a task thread delivers into the same task, preserves original acceptance, and does not rerun a retried message',async t=>{
 const {get,post,say,pump,runs}=await task(t);
 await pump();const initial=get();assert.equal(initial.stage,'review');
 const original=initial.artifacts.map(a=>a.id);
 const text='再帮我汇总下面文档：\n# 后续备注\n决定：下月增加试点。\n- 待办：核对试点名单。';
 const requestId=randomUUID();
 await Promise.all([say(text,{requestId}),say(text,{requestId})]);
 await pump();
 await say(text,{requestId});await pump();
 const g=get();assert.equal(runs().length,1);assert.equal(g.version,initial.version);assert.equal(g.stage,'review');
 assert.deepEqual(g.flow.nodes.map(n=>n.artifactIds),initial.flow.nodes.map(n=>n.artifactIds));
 const reply=g.messages.find(m=>m.runId===runs()[0].id&&m.artifactIds?.length);
 assert.equal(reply.replyTo,g.messages.find(m=>m.requestId===requestId).id);
 const a=g.artifacts.find(a=>a.id===reply.artifactIds[0]);
 assert.equal(a.skillId,'document.outline');assert.match(a.body,/下月增加试点/);assert.doesNotMatch(a.body,/下周试销/);
 for(const text of ['你会不会算保本价？','先不要算保本价','资料里写着“再帮我算一下保本价”','刚才的表格概览挺好'])await say(text);
 await pump();assert.equal(runs().length,1);
 await post('complete');assert(original.every(id=>get().artifacts.find(f=>f.id===id)?.status==='accepted'));
 assert.equal(get().artifacts.find(f=>f.id===a.id).status,'draft');
});

test('an in-progress follow-up waits while paused, requests missing business fields and resumes on supplied data',async t=>{
 const {get,post,say,pump,runs}=await task(t);
 await post('pause');await say('再帮我算一下单件保本价');await pump();
 assert.equal(runs()[0].status,'queued');
 await post('pause');await pump();
 const first=runs()[0];assert.equal(first.status,'needs_input');
 assert.match(get().messages.find(m=>m.runId===first.id).text,/来源|资料/);
 await post('inputs',{data:{unitCosts:{goods:9,fulfillment:3,ads:0,returns:0,other:0,feeRate:4,source:'本轮报价'}}});
 await pump();const [second]=runs();assert.equal(second.status,'succeeded');
 assert.match(get().artifacts.find(a=>a.runId===second.id).body,/12\.50/);
 assert.equal(get().version,1);assert.equal(get().flow.nodes.filter(n=>n.capability==='document.outline')[0].attempts,1);
});

test('a follow-up can take CSV from the next chat turn without overwriting existing task materials',async t=>{
 const {get,say,pump,runs}=await task(t);
 await pump();await say('顺便分析表格');await pump();
 assert.equal(runs()[0].status,'needs_input');
 await say('门店,销售额\n甲,12\n乙,14');await pump();
 const artifact=get().artifacts.find(a=>a.origin==='discussion_skill');
 assert.equal(artifact.tableMetrics.columns[1].mean,13);
 assert.equal(get().skillData.table,undefined);
 assert.match(get().skillData.document.text,/下周试销/);
});

test('web follow-ups send only the public query or link from the follow-up, and keep internal subjects local',async t=>{
 const sent=[];
 const webPageRead=async address=>{
  const u=new URL(address);sent.push(u);
  return {url:u.href,type:'text/plain',text:u.searchParams.has('q')
   ? '<rss><item><title>公开行情</title><link>https://example.com/public</link><description>冬季行情</description></item></rss>'
   : '这份公开报告记录了冬季商品的零售趋势，可用作对比参考。'};
 };
 const {say,pump,runs,get}=await task(t,{webPageRead});await pump();
 await say('请上网搜索冬季零售行情');await pump();
 assert.deepEqual(sent.map(u=>u.searchParams.get('q')),['冬季零售行情']);
 assert.match(get().artifacts.find(a=>a.runId===runs()[0].id).body,/公开行情/);
 await say('再帮我打开这个网页 https://example.com/public');await pump();
 assert.equal(sent.at(-1).href,'https://example.com/public');assert.match(get().artifacts.find(a=>a.runId===runs()[0].id).body,/冬季商品/);
 await say('再帮我上网搜索我司内部客户名单');await pump();
 assert.equal(runs()[0].status,'needs_input');assert.match(get().messages.find(m=>m.runId===runs()[0].id).text,/内部资料/);
 await say('请搜索贵公司内部客户资料（仅内部）');await pump();
 assert.equal(sent.length,2);
});

test('a discussion web skill obeys source limits in the original goal and can receive a missing URL by reply',async t=>{
 let calls=0;
 const options={webPageRead:async url=>{calls++;return {url,type:'text/plain',text:'已获得此公开报告的原始内容。'};}};
 const restricted=await task(t,options,'只用内部资料整理文档：\n# 介绍\n本轮总结已完成。');
 await restricted.pump();await restricted.say('再帮我打开网页 https://example.com/p');await restricted.pump();
 assert.equal(calls,0);assert.match(restricted.get().messages.find(m=>m.runId===restricted.runs()[0].id).text,/工作空间/);
 const normal=await task(t,options);await normal.pump();await normal.say('帮我读取网页正文');await normal.pump();
 assert.equal(normal.runs()[0].status,'needs_input');await normal.say('https://example.com/supplied');await normal.pump();
 assert.equal(calls,1);assert.equal(normal.runs()[0].status,'succeeded');
});

test('a queued follow-up uses materials supplied before the worker claims it',async t=>{
 const {say,post,pump,runs,get}=await task(t);
 await pump();await say('再帮我算一下保本价');
 await post('inputs',{data:{unitCosts:{goods:9,fulfillment:3,ads:0,returns:0,other:0,feeRate:4,source:'已核对报价'}}});
 await pump();
 assert.equal(runs().length,1);assert.equal(runs()[0].status,'succeeded');
 assert.match(get().artifacts.find(a=>a.runId===runs()[0].id).body,/12\.50/);
});

test('a task accepted before the queued follow-up starts does not publish or run a stale skill',async t=>{
 let called=0;const {get,say,post,pump,runs}=await task(t,{webPageRead:async()=>{called++;throw Error('unexpected call');}});
 await pump();await say('请打开网页 https://example.com/p');await post('complete');await pump();
 assert.equal(called,0);assert.equal(runs()[0].status,'discarded');
 assert(!get().artifacts.some(a=>a.runId===runs()[0].id));assert.match(get().messages.find(m=>m.runId===runs()[0].id).text,/已验收/);
});
