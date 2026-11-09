import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {createPlatform} from '../src/platform.js';
import {selectConversation} from '../src/workforce/conversation.js';
const text='寻找性价比高的淋浴头';
const input={requestId:'research-goal-001',text,kind:'analysis',permission:'draft',teamSelection:'auto',scope:{store:'测试店',sku:'待比较候选',product:'候选商品'}};
const quotes='| SKU | 商品名称 | 报价（元） | 材质 | 接口 |\n|---|---|---|---|---|\n| A | 淋浴头 A | 39.90 | ABS | G1/2 |\n| B | 淋浴头 B | 49 | 不锈钢 | G1/2 |\n| C | 淋浴头 C | 80 | 黄铜 | G1/2 |';
async function make(t,options){const dir=await mkdtemp('/tmp/research-');t.after(()=>rm(dir,{recursive:true,force:true}));return createPlatform(dir,options);}
const docInput=body=>({baseId:'kb-default',title:'淋浴头报价表',source:'测试供应商报价表，仅用于测试',sku:'',body,size:700,overlap:100,confirmed:true,enabled:true});
test('selection retrieves real quoted candidates from knowledge and completes without manual scores',async t=>{
 const p=await make(t);await p.knowledge.saveDocument(null,docInput(quotes));let g=await p.create(input);assert.equal(g.research.status,'found');assert.equal(g.research.candidates.length,3);assert(!g.skillData?.candidates);assert(g.collaboration.checks.every(c=>c.status==='ready'));
 await p.action(g.id,{kind:'plan',expectedVersion:g.version});for(let i=0;i<5;i++)await p.pump();g=p.goals()[0];assert.equal(g.stage,'review');const screening=g.artifacts.find(a=>a.title==='候选商品报价初筛');assert(screening.body.includes('39.9 元'));assert(screening.body.includes('不代表综合性价比'));assert(screening.evidence.includes('测试供应商'));assert(g.artifacts.some(a=>a.title==='任务交付摘要'&&a.body.includes(screening.body)));
});
test('why and question-mark replies explain the gap instead of executing task.brief or dumping proposal prose',async t=>{
 const p=await make(t);await p.knowledge.saveDocument(null,docInput('# 自动选品方案\n总控应该寻找淋浴头并分析供应商。\n这是一份方案，不含商品报价。'));let g=await p.create({...input,text:'自动选品'});assert.equal(g.research.candidates.length,0);const runs=p.runs().length;
 for(const text of ['为什么要补齐资料啊','？']){await p.action(g.id,{kind:'message',text,target:'coordinator'});await p.pump();g=p.goals()[0];const human=g.messages.findLast(m=>m.role==='human'),reply=g.messages.findLast(m=>m.replyTo===human.id);assert(reply);assert(reply.text.includes('你不需要重复提供已有资料'));assert(reply.text.includes('品类'));assert(reply.text.length<1000);assert(!reply.text.includes('任务交付摘要'));}
 assert.equal(p.runs().length,runs);
});
test('supplier material must be approved and current; revocation invalidates queued evidence',async t=>{
 const p=await make(t);const material=await p.sources.saveMaterial(null,{sourceId:'source-supplier',type:'document',title:'淋浴头报价',sku:'',body:quotes,url:'https://supplier.example.com/shower',rights:'reference',rightsNote:'供选品研究',expiresAt:''});let g=await p.create(input);assert.equal(g.research.candidates.length,0);assert.equal(g.research.checked.pending,1);
 await p.sources.review(material.id,{revision:material.revision,status:'approved',note:'测试已核对',confirmed:true});g=await p.action(g.id,{kind:'research',expectedVersion:g.version});await p.pump();g=p.goals()[0];assert.equal(g.research.status,'found');await p.action(g.id,{kind:'plan',expectedVersion:g.version});const s=p.sources.view().sources.find(s=>s.id==='source-supplier');await p.sources.saveSource(s.id,{...s,enabled:false});await p.pump();g=p.goals()[0];assert.equal(g.runtime.status,'failed');assert.equal(g.artifacts.length,0);
});
test('automatic source lookup invokes configured readonly transport, preserves review gates and caches recent sync',async t=>{
 let calls=0;const p=await make(t,{sourceTransport:async()=>{calls++;return {schemaVersion:1,items:[{externalId:'quotation',title:'淋浴头报价',sku:'',type:'document',body:quotes,url:'https://supplier.example.com/shower',rights:'reference',rightsNote:'接口测试'}]};}});
 await p.sources.saveSource(null,{name:'授权测试接口',kind:'supplier',mode:'http',enabled:true,endpoint:'https://supplier.example.com/catalog',secretEnv:''});let g=await p.create(input);assert(g.researchRequest);await p.pump();g=p.goals()[0];assert.equal(calls,1);assert(!g.researchRequest);assert.equal(g.research.candidates.length,0);assert(g.research.diagnostics.some(s=>s.includes('已同步 1 项')));assert.equal(g.research.checked.pending,1);
 await p.action(g.id,{kind:'message',text:'你自己去找啊'});await p.pump();assert.equal(calls,1);
});
test('recent category and budget context guides discovery; superseded documents cannot be accepted',async t=>{
 const p=await make(t);const doc=await p.knowledge.saveDocument(null,docInput(quotes));let g=await p.create({...input,text:'自动选品'});await p.action(g.id,{kind:'message',text:'找淋浴头，预算50元以内'});await p.pump();g=p.goals()[0];assert.equal(g.research.candidates.length,2);assert.equal(g.research.maxPrice,50);
 await p.action(g.id,{kind:'plan',expectedVersion:g.version});for(let i=0;i<4;i++)await p.pump();g=p.goals()[0];assert.equal(g.stage,'review');await p.knowledge.toggle(doc.id,{revision:doc.revision,enabled:false});await assert.rejects(()=>p.action(g.id,{kind:'complete',expectedVersion:g.version}),/已更新或停用/);
});
test('context automatically retains human constraints, reply chains and blockers while omitting repetitive workflow receipts',()=>{
 const g={text:'选花洒',version:2,stage:'draft',runtime:{status:'needs_input',missing:['授权来源']},messages:[{id:'h1',role:'human',text:'预算50元以内'},{id:'receipt',role:'agent',author:'员工',goalVersion:2,workflow:'check',text:'缺资料'},{id:'c1',role:'coordinator',text:'尚未接入供应商来源'},{id:'h2',role:'human',text:'为什么',replyTo:'c1'}]};
 const ctx=selectConversation(g,g.messages.at(-1));assert(ctx.conversation.some(m=>m.id==='h1'));assert(ctx.conversation.some(m=>m.id==='c1'));assert(!ctx.conversation.some(m=>m.id==='receipt'));assert.equal(ctx.conversationContext.automatic,true);assert.deepEqual(ctx.conversationContext.blockers,['授权来源']);
});
test('pausing replies during lookup retains the pending response until resume',async t=>{
 let release,started;const gate=new Promise(r=>release=r),begun=new Promise(r=>started=r);const p=await make(t,{sourceTransport:async()=>{started();await gate;return {schemaVersion:1,items:[]};}});const g=await p.create(input);await p.sources.saveSource(null,{name:'延迟测试来源',kind:'supplier',mode:'http',enabled:true,endpoint:'https://supplier.example.com/catalog',secretEnv:''});await p.action(g.id,{kind:'message',text:'为什么要补齐资料'});const pumping=p.pump();await begun;await p.action(g.id,{kind:'pauseReplies'});release();await pumping;assert(p.goals()[0].researchRequest);assert(!p.goals()[0].messages.some(m=>m.workflow==='research'));await p.action(g.id,{kind:'pauseReplies'});await p.pump();assert(!p.goals()[0].researchRequest);assert(p.goals()[0].messages.some(m=>m.workflow==='research'));
});

test('execution shares one candidate snapshot even when later chat changes the discovery budget',async t=>{
 const p=await make(t);await p.knowledge.saveDocument(null,docInput(quotes));let g=await p.create(input);await p.action(g.id,{kind:'plan',expectedVersion:g.version});await p.pump();await p.action(g.id,{kind:'message',text:'找淋浴头，预算50元以内'});for(let i=0;i<6;i++)await p.pump();g=p.goals()[0];assert.equal(g.research.candidates.length,2);const runs=p.runs().filter(r=>r.goalId===g.id&&r.purpose==='draft');assert(runs.length>=3);assert(runs.every(r=>p.run(r.id).input.candidates.length===3));assert(g.messages.some(m=>m.text.includes('候选快照')));
});
