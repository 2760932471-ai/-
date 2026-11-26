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
test('a newly connected reasoning model resumes an existing plan and keeps the collected evidence',async t=>{
 const {p}=await make(t,{modelCall:async(model,messages)=>{
  if(messages.length===1)return {message:{content:'连接正常'}};
  const context=JSON.parse(messages[1].content);
  assert.match(JSON.stringify(context.observations),/协议运费每单7元/);
  return {message:{content:JSON.stringify({conclusion:'协议运费每单7元，报价时需计入。'})}};
 }});
 await p.knowledge.saveDocument(null,{baseId:'kb-default',title:'门店运费',source:'运费协议',sku:'',body:'门店协议运费每单7元。',enabled:true,confirmed:true,size:700,overlap:100});
 const goal=await create(p,'分析门店运费的影响');
 await p.pump();await p.pump();
 const initial=get(p,goal),step=initial.flow.nodes.find(n=>n.capability==='analysis.reason');
 const evidence=initial.flow.nodes.find(n=>n.capability==='evidence.collect');
 assert.equal(step.status,'needs_input');
 const model=await connectModel(t,p);
 await act(p,goal,'message',{text:'为什么卡住了？'});
 assert.equal(get(p,goal).flow.nodes.find(n=>n.id===step.id).status,'needs_input');
 await act(p,goal,'message',{text:'继续'});
 for(let i=0;i<4&&get(p,goal).stage!=='review';i++)await p.pump();
 const finished=get(p,goal);
 assert.equal(finished.stage,'review');
 assert.equal(finished.version,initial.version);
 assert.equal(finished.flow.model.id,model.id);
 assert.deepEqual(finished.flow.nodes.find(n=>n.id===evidence.id).artifactIds,evidence.artifactIds);
});
test('flow chat uses the selected workspace model for this turn, preserving recall, routing and the default',async t=>{
 const calls=[];
 let release,started;
 const pendingCall=new Promise(resolve=>{started=resolve;});
 const {p}=await make(t,{modelCall:async(model,messages)=>{
  if(messages.length===1)return {message:{content:'连接正常'}};
  const payload=JSON.parse(messages[1].content);
  calls.push({id:model.id,payload});
  if(payload.message==='等待回复'){
   started();
   await new Promise(resolve=>{release=resolve;});
  }
  if(payload.message==='连接异常')throw new Error('服务暂时不可用');
  const decision=payload.message==='这次想专门评估运费影响'?{intent:'change'}:{intent:'discussion',answer:model.name+'的回答'};
  return {message:{content:'```json\n'+JSON.stringify(decision)+'\n```'}};
 }});
 const primary=await connectModel(t,p);
 const secondary=await p.workforce.saveModel(null,{...primary,name:'讨论模型',model:'discussion'});
 await p.workforce.testModel(secondary.id);await p.pump();
 const goal=await create(p);
 const send=(text,chatModelId)=>act(p,goal,'message',{text,chatModelId});
 await send('进度如何？',secondary.id);
 assert.equal(calls.at(-1).id,secondary.id);
 assert.match(calls.at(-1).payload.recalledAnswer,/已完成/);
 const last=get(p,goal).messages.at(-1);
 assert.equal(last.text,'讨论模型的回答');assert.equal(last.chatModelId,secondary.id);
 assert.equal(last.chatModelRevision,secondary.revision);
 await act(p,goal,'message',{intent:'discuss',text:'解释一下取舍',chatModelId:secondary.id});
 assert.equal(get(p,goal).messages.at(-1).chatModelId,secondary.id);
 await send('需要着重考虑什么？');
 assert.equal(calls.at(-1).id,primary.id);
 assert.equal(get(p,goal).messages.at(-1).text,'总控测试模型的回答');
 assert.equal(p.flows.view().settings.modelId,primary.id);
 await send('这次想专门评估运费影响',secondary.id);
 assert.equal(get(p,goal).version,2);
 const count=get(p,goal).messages.length;
 await assert.rejects(send('连接异常',secondary.id),/服务暂时不可用/);
 await assert.rejects(send('未知模型','absent'));
 const pending=send('等待回复',secondary.id);
 await pendingCall;
 try{await p.workforce.saveModel(secondary.id,{...secondary,name:'新配置'});}finally{release();}
 await assert.rejects(pending);
 await assert.rejects(send('未测试的模型',secondary.id));
 assert.equal(get(p,goal).messages.length,count);
 assert.equal(p.flows.view().settings.modelId,primary.id);
});
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
test('blocked comparison exposes missing inputs and resumes in place with operator quotes',async t=>{
 const {p}=await make(t),g=await create(p,'选品，比较两款水龙头的报价');
 await p.pump();await p.pump();
 const compare=get(p,g).flow.nodes.find(n=>n.capability==='product.compare');
 assert.equal(compare.status,'needs_input');assert.match(compare.missing.join(''),/候选商品/);
 const evidenceRun=get(p,g).flow.nodes[0].runId;
 const data={nodeId:compare.id,candidates:[{sku:'A',price:10,source:'报价单 A'},{sku:'B',price:12,source:'报价单 B'}]};
 await assert.rejects(()=>act(p,g,'supplyOffers',{...data,candidates:[data.candidates[0]]}),/候选商品/);
 await act(p,g,'supplyOffers',data);await assert.rejects(()=>act(p,g,'supplyOffers',data),/已更新/);
 await p.pump();await p.pump();const updated=get(p,g);assert.equal(updated.stage,'review');assert.equal(updated.version,1);
 assert.equal(updated.flow.nodes[0].runId,evidenceRun);assert(updated.artifacts.some(a=>a.body.includes('报价单 B')));
});

test('a chained task, final report and later discussion can recall evidence from an indirect predecessor',async t=>{
 const raw=basicFlow({text:'制作标题和卖点'});
 const title=raw.nodes.find(n=>n.capability==='copy.titles');
 const copy=raw.nodes.find(n=>n.capability==='copy.selling_points');
 copy.dependsOn=[title.id];raw.nodes.at(-1).dependsOn=[copy.id];
 const {p}=await make(t,{
  modelCall:async(model,messages)=>{
   if(messages.length===1)return {message:{content:'连接正常'}};
   const input=JSON.parse(messages[1].content);
   if(input.message){
    assert(input.memory.steps.some(s=>s.files.some(f=>f.excerpt?.includes('样品包装为纸袋'))));
    return {message:{content:JSON.stringify({intent:'discussion',answer:'这次依据的是样品纸袋包装记录。'})}};
   }
   return {message:{content:JSON.stringify(raw)}};
  },
  flowSkillCall:async(id,input)=>{
   if(id==='copy.selling_points'){
    assert(input.taskMemory.steps.some(s=>s.capability==='evidence.collect'));
    assert(input.observations.some(a=>a.body.includes('样品包装为纸袋')));
   }
   const out=result(id);out.artifacts[0].body=id==='copy.titles'?'样品包装为纸袋':'包装卖点';return out;
  }
 });
 await connectModel(t,p);
 const g=await create(p,'为猫粮制作标题和卖点');
 for(let i=0;i<4;i++)await p.pump();
 assert.equal(get(p,g).stage,'review');
 assert.match(get(p,g).artifacts.at(-1).body,/样品包装为纸袋/);
 const response=await act(p,g,'message',{text:'包装判断依据是什么？'});
 assert.match(response.messages.at(-1).text,/纸袋包装记录/);
 assert.equal(response.version,1);
});

test('analysis can choose a missing fact, persist the investigation across restart and ground a final decision',async t=>{
 const raw=basicFlow({text:'分析活动'});
 const options={modelCall:async(model,messages)=>{
  if(messages.length===1)return {message:{content:'连接正常'}};
  const payload=JSON.parse(messages[1].content);
  if(payload.templates)return {message:{content:JSON.stringify(raw)}};
  if(!payload.followUp)return {message:{content:JSON.stringify({conclusion:'活动收益需要核对运费',query:'活动运费协议',why:'运费影响保本价'})}};
  assert(payload.followUp.documents.some(d=>d.text.includes('每单7元')));
  return {message:{content:JSON.stringify({conclusion:'根据运费协议，每单按7元运费重算。'})}};
 }};
 let {p,dir}=await make(t,options);
 await connectModel(t,p);
 await p.knowledge.saveDocument(null,{baseId:'kb-default',title:'活动运费协议',source:'运费表',sku:'',body:'活动运费协议规定运费每单7元。',enabled:true,confirmed:true,size:700,overlap:100});
 const g=await create(p,'分析促销活动收益');
 for(let i=0;i<3;i++)await p.pump();
 assert.equal(get(p,g).flow.nodes.find(n=>n.capability==='analysis.reason').investigation.phase,'assess');
 p=await createPlatform(dir,options);
 for(let i=0;i<2;i++)await p.pump();
 const finished=get(p,g);assert.equal(finished.stage,'review');
 assert.match(finished.artifacts.at(-1).body,/每单按7元/);assert.match(finished.artifacts.at(-1).body,/补查问题：活动运费协议/);
});

test('a missing category can be clarified after restart together with optional business preferences',async t=>{
 const offers=['101','102'].map((sku,i)=>({sku,title:'猫粮'+sku,price:i?18:10,repurchase:i?70:20,url:'https://detail.1688.com/offer/'+sku+'.html'}));
 const options={offerSearch:async()=>offers,offerDetail:async()=>null};
 let {p,dir}=await make(t,options);
 const g=await create(p,'在1688选品，推荐最有利润的品');
 await p.pump();assert.equal(get(p,g).flow.status,'awaiting_context');
 await p.pump();assert.equal(get(p,g).messages.filter(m=>m.text.includes('品类或搜索关键词')).length,1);
 p=await createPlatform(dir,options);
 await act(p,g,'message',{text:'继续'});
 await p.pump();
 assert.equal(get(p,g).flow.status,'awaiting_context');
 assert.equal(get(p,g).flow.questionKind,'category');
 assert.equal(get(p,g).scenario?.answer,undefined);
 await act(p,g,'message',{text:'猫粮，给老客补货，优先考虑复购，售价30元，其他成本2元'});
 for(let i=0;i<4;i++)await p.pump();
 const goal=get(p,g),report=goal.artifacts.find(a=>a.title==='选品交付报告');
 assert.equal(goal.stage,'review');assert.match(report.body,/我推荐「猫粮102」/);assert.match(report.body,/单件收益 ¥10.00/);assert.match(report.body,/采购方行为/);
 assert.equal(goal.version,1);
});

test('a model preference question does not block initial work and supplied preferences inform the plan',async()=>{
 const goal={text:'评估是否开分店',messages:[],scope:{}},settings=flowDefaults();
 const question=await proposeFlow(goal,settings,{id:'m'},async()=>({message:{content:JSON.stringify({question:'这次开分店优先验证客群还是回收投资？'})}}));
 assert.equal(question.question,undefined);assert.ok(question.nodes.some(n=>n.capability==='evidence.collect'));
 const decided=await proposeFlow({...goal,scenario:{answer:'优先回收投资'}},settings,{id:'m'},async(m,chat)=>{
  assert.match(JSON.parse(chat[1].content).goal,/优先回收投资/);return {message:{content:JSON.stringify(basicFlow(goal))}};
 });
 assert(decided.nodes.length>0);
});

test('discussion links unblock sourcing without an extension and only matching quotes count',async t=>{
 const ids=[];
 const {p}=await make(t,{offerSearch:async()=>[],offerDetail:async sku=>{
  ids.push(sku);return {sku,quote:{title:sku==='333'?'门把手':'猫粮'+sku,price:12,url:'https://detail.1688.com/offer/'+sku+'.html'}};
 }});
 const g=await create(p,'在1688找猫粮');await p.pump();await p.pump();
 assert.equal(get(p,g).flow.status,'blocked');
 await act(p,g,'message',{text:['111','222','333'].map(i=>'https://detail.1688.com/offer/'+i+'.html').join('\n')});
 for(let i=0;i<3;i++)await p.pump();
 const pick=get(p,g).flow.nodes.find(n=>n.capability==='sourcing.1688');
 assert.equal(pick.status,'succeeded');assert.deepEqual(pick.offers.map(o=>o.sku),['111','222']);assert.match(pick.offerSource,/讨论中提供/);assert(ids.includes('333'));
});

test('trial orders compare confirmed minimum quantities only in the same unit',async()=>{
 const {sourcingIntent,decisionOrder}=await import('../public/sourcing.js');
 const text='在1688找猫粮，新店小批量测款',criteria=sourcingIntent(text);
 const rows=[{sku:'A',price:10,terms:'20袋起订',repurchase:20},{sku:'B',price:15,terms:'起订量：2袋',repurchase:20}];
 assert.equal(decisionOrder(rows,criteria,text)[0].sku,'B');
 assert.equal(decisionOrder([rows[0],{...rows[1],terms:'2箱起订'}],criteria,text)[0].sku,'A');
});

test('a concrete user decision pauses only its analysis step and resumes from a chat reply',async t=>{
 const question='这次预算按一家门店还是两家门店计算？';
 const {p}=await make(t,{modelCall:async(model,messages)=>{
  if(messages.length===1)return {message:{content:'正常'}};
  const args=JSON.parse(messages[1].content);
  if(args.templates)return {message:{content:JSON.stringify(basicFlow({text:'分析门店预算'}))}};
  const answer=args.clarification?{conclusion:'按两家门店核算。'}:{conclusion:'门店数量影响本轮预算。',blockingQuestion:question};
  return {message:{content:JSON.stringify(answer)}};
 }});
 await connectModel(t,p);
 const g=await create(p,'分析门店预算');
 for(let i=0;i<4&&get(p,g).flow.status!=='blocked';i++)await p.pump();
 const step=get(p,g).flow.nodes.find(n=>n.capability==='analysis.reason');
 assert.equal(step.question,question);
 const status=await act(p,g,'message',{text:'继续'});
 assert.match(status.messages.at(-1).text,/一家门店还是两家/);
 assert.equal(status.flow.nodes.find(n=>n.id===step.id).status,'needs_input');
 await act(p,g,'message',{text:'按两家门店计算'});
 for(let i=0;i<4&&get(p,g).stage!=='review';i++)await p.pump();
 const done=get(p,g);
 assert.equal(done.stage,'review');
 assert.equal(done.version,1);
 assert.equal(done.flow.nodes.find(n=>n.capability==='evidence.collect').attempts,1);
 assert.match(done.artifacts.at(-1).body,/两家门店/);
});

test('the coordinator discovers tools during analysis, reads a search result after restart and cites the actual page',async t=>{
 const url='https://example.com/rules',executed=[];
 const options={
  webPageRead:async address=>{
   executed.push(address);
   if(address===url)return {url,type:'text/plain',text:'生效规则为首件 7 元。'};
   assert.equal(new URL(address).searchParams.get('q'),'公开运费规则');
   return {url:address,text:'<rss><channel><item><title>运费规则</title><link>'+url+'</link><description>查看阶梯收费</description></item></channel></rss>'};
  },
  modelCall:async (_model,messages)=>{
   if(messages.length===1)return {message:{content:'连接正常'}};
   const payload=JSON.parse(messages[1].content);
   let answer;
   if(payload.templates)answer=basicFlow({text:'评估门店运费'});
   else if(!payload.toolResults.length){
    assert.ok(payload.tools.some(tool=>tool.id==='web.search'));
    answer={tool:{id:'web.search',query:'公开运费规则'},why:'确定费用依据'};
   }else if(payload.toolResults.length===1){
    assert.ok(payload.readTargets.includes(url));
    answer={tool:{id:'web.read',url},why:'核对每件费用'};
   }else{
    assert.match(payload.toolResults[1].observations[0].body,/首件 7 元/);
    answer={conclusion:'按规则条款，每单首件计 7 元。'};
   }
   return {message:{content:JSON.stringify(answer)}};
  }};
 let {p,dir}=await make(t,options);
 await connectModel(t,p);
 const goal=await create(p,'评估门店运费对报价的影响');
 await p.pump();await p.pump();
 const analysis=get(p,goal).flow.nodes.find(n=>n.capability==='analysis.reason');
 assert.equal(analysis.investigation.tool.id,'web.search');
 assert.equal(executed.length,0);
 p=await createPlatform(dir,options);
 for(let i=0;i<8&&get(p,goal).stage!=='review';i++)await p.pump();
 assert.equal(get(p,goal).stage,'review');
 assert.equal(executed.length,2);
 assert.equal(new URL(executed[0]).searchParams.get('q'),'公开运费规则');
 assert.equal(executed[1],url);
 const current=get(p,goal).flow.nodes.find(n=>n.id===analysis.id);
 assert.equal(current.investigation.toolResults.length,2);
 assert.ok(p.runs().some(r=>r.trace?.some(event=>event.skillId==='web.read')));
 assert.match(get(p,goal).artifacts.at(-1).body,/每单首件计 7 元/);
 assert.match(get(p,goal).artifacts.at(-1).body,/https:\/\/example.com\/rules/);
});
