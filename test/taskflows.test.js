import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createPlatform} from '../src/platform.js';
import {validateFlow,basicFlow,proposeFlow} from '../src/taskflows/planner.js';
import {flowDefaults} from '../src/taskflows/catalog.js';
const result=name=>({status:'succeeded',summary:name,missing:[],artifacts:[{title:name,body:'实际测试结果',evidence:'测试输入'}]});
async function make(t,options={}){const dir=await mkdtemp('/tmp/flow-test-');t.after(()=>rm(dir,{force:true,recursive:true}));return {dir,p:await createPlatform(dir,options)};}
const create=(p,text='为水龙头制作标题和卖点')=>p.create({executionMode:'flow',text,requestId:randomUUID()});
const get=(p,g)=>p.goals().find(x=>x.id===g.id);
const act=(p,g,kind,extra={})=>p.action(g.id,{kind,expectedVersion:get(p,g).version,...extra});
test('goals execute without employees, independent branches overlap, summary waits for both, and templates persist',async t=>{
 let active=0,peak=0;const {p,dir}=await make(t,{flowSkillCall:async id=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,20));active--;return result(id);}});
 const g=await create(p);assert.deepEqual(g.members,[]);assert.equal(g.mode,'flow');await p.pump();await p.pump();assert.equal(peak,2);assert.equal(get(p,g).flow.nodes.at(-1).status,'pending');await p.pump();assert.equal(get(p,g).stage,'review');await act(p,g,'complete');const template=await p.flows.saveTemplate(g.id,{expectedVersion:1});assert(template.id);assert.equal((await p.flows.saveTemplate(g.id,{expectedVersion:1})).id,template.id);const restored=await createPlatform(dir);assert(restored.flows.view().templates.some(x=>x.id===template.id));assert.equal(get(restored,g).stage,'completed');
});
test('new capabilities are accepted as creative proposals, but cycles and incomplete final verification are rejected',()=>{
 const p=basicFlow({text:'分析市场'});p.nodes[1].capability='novel.market.method';p.nodes[1].capabilityProposal={description:'新方法',implementation:'new algorithm',tests:'交叉验证'};assert.equal(validateFlow(p).nodes[1].capabilityProposal.status,'unverified');
 const cycle=structuredClone(p);cycle.nodes[0].dependsOn=['analysis'];assert.throws(()=>validateFlow(cycle),/循环/);
 const omitted=structuredClone(p);omitted.nodes.at(-1).dependsOn=[];assert.throws(()=>validateFlow(omitted),/遗漏/);
 const duplicate=structuredClone(p);duplicate.nodes[1].id='evidence';assert.throws(()=>validateFlow(duplicate),/重复/);
});
test('model can invent a new flow and capability instead of being restricted to the registered catalog',async()=>{
 const raw=basicFlow({text:'分析竞品'});raw.nodes[1].capability='new.method';raw.nodes[1].capabilityProposal={description:'设计新的分析方法',implementation:'伪代码',tests:'用已知样例验证'};
 const p=await proposeFlow({text:'创新分析方法',scope:{},messages:[]},flowDefaults(),{id:'model',revision:2},async(model,messages,tools)=>{assert.equal(tools.length,0);assert(messages[0].content.includes('不限制构思'));return {message:{content:JSON.stringify(raw)}};});assert.equal(p.source,'generated');assert.equal(p.nodes[1].capability,'new.method');
});
test('missing model is explicit and unfinished tasks cannot pass acceptance',async t=>{const {p}=await make(t);const g=await create(p,'分析水龙头市场');await p.pump();await p.pump();assert.equal(get(p,g).flow.nodes[1].status,'needs_input');assert.match(get(p,g).flow.nodes[1].error,/连接总控模型/);await assert.rejects(()=>act(p,g,'complete'),/未完成/);});
test('new capability proposal is retained, not executed or silently reported successful',async t=>{
 const {p,dir}=await make(t);const g=await create(p,'分析市场');await p.pump();const stored=JSON.parse(await readFile(dir+'/platform.json','utf8'));const n=stored.goals[0].flow.nodes[1];n.capability='new.reader';n.capabilityProposal={description:'新读取能力',implementation:'delete everything',tests:'隔离验证',status:'unverified'};await writeFile(dir+'/platform.json',JSON.stringify(stored));const restored=await createPlatform(dir);await restored.pump();assert.equal(get(restored,g).flow.nodes[1].status,'needs_capability');assert.equal(get(restored,g).flow.nodes.at(-1).status,'pending');assert(get(restored,g).artifacts.some(a=>a.title.includes('新能力设计')));
});
test('pause stops new work and changing goal version discards in-flight results',async t=>{
 let release;const {p}=await make(t,{flowSkillCall:async()=>{await new Promise(r=>release=r);return result('late');}});const g=await create(p,'水龙头标题');await p.pump();await act(p,g,'pause');await p.pump();assert.equal(get(p,g).flow.nodes[1].status,'pending');await act(p,g,'pause');const pending=p.pump();while(!release)await new Promise(r=>setTimeout(r,5));await act(p,g,'message',{intent:'change',text:'改为花洒标题'});release();await pending;assert.equal(get(p,g).version,2);assert(!get(p,g).artifacts.some(a=>a.title==='late'));assert(p.runs().some(r=>r.status==='discarded'));
});
test('restart marks in-flight calls failed instead of repeating potentially billable work',async t=>{const {p,dir}=await make(t);const g=await create(p);await p.pump();const stored=JSON.parse(await readFile(dir+'/platform.json','utf8'));stored.goals[0].flow.nodes[1].status='running';await writeFile(dir+'/platform.json',JSON.stringify(stored));const restored=await createPlatform(dir);assert.equal(get(restored,g).flow.nodes[1].status,'failed');assert.match(get(restored,g).flow.nodes[1].error,/重启/);});
test('invalidated evidence prevents final acceptance',async t=>{const {p}=await make(t,{flowSkillCall:async id=>result(id)});const doc=await p.knowledge.saveDocument(null,{baseId:'kb-default',title:'水龙头说明',source:'企业产品册',sku:'',body:'水龙头为不锈钢材质，接口 G1/2。',enabled:true,confirmed:true,size:700,overlap:100});const g=await create(p);for(let i=0;i<3;i++)await p.pump();assert.equal(get(p,g).stage,'review');await p.knowledge.deleteDocument(doc.id,{revision:doc.revision,confirmed:true});await assert.rejects(()=>act(p,g,'complete'),/不存在|更新|停用/);});
async function connectModel(t,p){const old=process.env.MODEL_SECRET_FLOW_TEST;process.env.MODEL_SECRET_FLOW_TEST='fake-test-only';t.after(()=>old===undefined?delete process.env.MODEL_SECRET_FLOW_TEST:process.env.MODEL_SECRET_FLOW_TEST=old);const m=await p.workforce.saveModel(null,{name:'总控测试模型',provider:'api',model:'mock',endpoint:'https://api.example.com/chat',secretEnv:'MODEL_SECRET_FLOW_TEST',timeoutMs:1000});await p.workforce.testModel(m.id);await p.pump();await p.flows.saveSettings({...p.flows.view().settings,modelId:m.id});return m;}
test('real planning path uses configured model, retains creative proposal and automatically tries an alternative once',async t=>{
 let plans=0;const {p}=await make(t,{modelCall:async(m,messages)=>{
  if(messages.length===1)return {message:{content:'连接正常'}};
  plans++;const flow=basicFlow({text:'制作水龙头标题'});
  if(plans===1){flow.nodes[1].capability='new.research';flow.nodes[1].capabilityProposal={description:'创造新方法',implementation:'草案',tests:'待验证'};}
  else assert(JSON.parse(messages[1].content).previousBlockers.length);
  return {message:{content:JSON.stringify(flow)}};
 },flowSkillCall:async id=>result(id)});await connectModel(t,p);const g=await create(p,'制作水龙头标题');
 for(let i=0;i<7;i++)await p.pump();const done=get(p,g);assert.equal(plans,2);assert.equal(done.version,2);assert.equal(done.stage,'review');assert.equal(done.flow.repairAttempts,1);assert(done.flow.history[0].nodes.some(n=>n.capabilityProposal));assert.equal(done.flow.calls,5);
});
test('image task waits for actual image delivery rather than accepting a brief',async t=>{
 const {p}=await make(t,{imageReady:()=>true,imageCall:async()=>({base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/S1sAAAAASUVORK5CYII=',width:1,height:1})});
 await p.images.save({revision:0,enabled:true,provider:'gemini',endpoint:'https://generativelanguage.googleapis.com/v1beta',model:'gemini-2.5-flash-image',secretEnv:'IMAGE_SECRET_TEST'});
 const g=await create(p,'生成水龙头主图');await p.pump();await p.pump();assert.equal(get(p,g).flow.nodes[1].status,'waiting_external');assert.notEqual(get(p,g).stage,'review');await p.images.pump();await p.pump();assert.equal(get(p,g).stage,'review');assert(get(p,g).artifacts.some(a=>a.imageJobId));
});
test('call budget blocks excess work and settings revisions reject lost updates',async t=>{
 const {p}=await make(t,{flowSkillCall:async id=>result(id)});const cfg=p.flows.view().settings;await p.flows.saveSettings({...cfg,maxCalls:4});await assert.rejects(()=>p.flows.saveSettings(cfg),/已更新/);const g=await create(p,'为水龙头制作标题、卖点和视频脚本');for(let i=0;i<4;i++)await p.pump();assert.equal(get(p,g).flow.calls,4);assert.match(get(p,g).flow.nodes.at(-1).error,/调用上限/);await assert.rejects(()=>act(p,g,'complete'),/未完成/);
});
