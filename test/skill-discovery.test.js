import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPlatform} from '../src/platform.js';
import {skillDefinitions,skillSample} from '../src/workforce/skills.js';
import {buildGoalContract} from '../src/taskflows/contract.js';
import {flowCapabilities} from '../src/taskflows/catalog.js';
import {resolveCatalogSkillRequests,webSkillInput} from '../public/goal-language.js';

const ids=task=>task.requirements.map(r=>r.capability);
async function platform(t,options={}){
 const dir=await mkdtemp(join(tmpdir(),'catalog-run-'));t.after(()=>rm(dir,{recursive:true,force:true}));return createPlatform(dir,options);
}
async function advance(p,id){for(let i=0;i<7;i++)await p.pump();return p.goals().find(g=>g.id===id);}

test('every registered built-in can be selected by its name and ID, including a newly registered skill',()=>{
 for(const def of skillDefinitions){
  const cap=flowCapabilities.find(c=>c.id===def.id);
  assert.deepEqual(cap.inputs,def.inputs);assert.deepEqual(cap.outputs,def.outputs);assert.equal(cap.sideEffect,def.sideEffect);
  for(const word of [def.name,def.id]){
   assert.ok(ids(buildGoalContract({text:'使用 '+word})).includes(def.id),word);
  }
 }
 const synthetic={id:'ops.proof',name:'批次凭证核对',aliases:['核对批次凭证'],type:'code',description:'列出已核对的凭证'};
 assert.deepEqual(resolveCatalogSkillRequests('核对批次凭证',[synthetic]).map(r=>r.capability),['ops.proof']);
 assert.deepEqual(resolveCatalogSkillRequests('批次凭证核对',[{...synthetic,type:'external'}]),[]);
});

test('five commonly used skills and an additional registered skill produce real artifacts through the default task flow',async t=>{
 const p=await platform(t);
 const cases=[
  ['表格体检','table.profile','table'],['文档摘要','document.outline','document'],['客服分诊','service.triage','serviceQuestion'],
  ['单件保本价','price.break_even','unitCosts'],['库存覆盖天数','inventory.coverage','inventory'],
  ['流量漏斗','traffic.funnel','traffic']
 ];
 for(const [label,cap,key] of cases){
  const {id,version}=await p.create({text:'使用'+label,executionMode:'flow',requestId:randomUUID()});
  await p.action(id,{kind:'inputs',expectedVersion:version,data:{[key]:skillSample(cap)[key]}});
  const g=await advance(p,id),n=g.flow.nodes.find(step=>step.capability===cap);
  assert.equal(n?.status,'succeeded',label);
  assert.ok(n.artifactIds.length,label);assert.ok(g.artifacts.some(a=>a.taskId===n.id&&a.body),label);
 }
});

test('natural requests and combined named skills use real web inputs and keep workspace-only tasks offline',async t=>{
 const topic='夏季露营杯',url='https://goods.example.org/cups?spec=1';
 const calls=[];
 const p=await platform(t,{flowSkillCall:async(id,input)=>{
  assert.ok(['web.search','web.read'].includes(id));calls.push({id,query:input.query,url:input.url});
  return {status:'succeeded',summary:id,missing:[],artifacts:[{title:id,body:topic,evidence:url}],metrics:{sources:[{url,title:topic}]}};
 }});
 const g=await p.create({executionMode:'flow',text:'上网查夏季露营杯的公开资料，然后阅读第一条网页',requestId:randomUUID()});
 const done=await advance(p,g.id);
 assert.equal(done.stage,'review');
 assert.deepEqual(calls.map(c=>c.id),['web.search','web.read']);assert.equal(calls[0].query,topic);assert.equal(calls[1].url,url);
 assert.equal(webSkillInput('web.read','打开链接 '+url).url,url);
 const offline=buildGoalContract({text:'只从我们自己的知识库查，帮我运行 web.search 夏季露营杯'});
 assert.equal(offline.decision.sources,'workspace');assert.ok(!ids(offline).includes('web.search'));
 assert.ok(offline.excludedCapabilities.includes('web.read'));
 for(const scope of ['只能使用本公司知识库','仅依据我上传的附件','不得访问互联网','不要访问外部网站']){
  const task=buildGoalContract({text:scope+'，搜索夏季露营杯的公开资料'});
  assert.ok(!ids(task).includes('web.search'),scope);
 }
 assert.deepEqual(resolveCatalogSkillRequests('可以告诉我网页搜索怎么用吗',flowCapabilities),[]);
});

test('public search from everyday Chinese requests reaches the search engine with the topic only',async t=>{
 const sent=[];
 const p=await platform(t,{webPageRead:async url=>{
  sent.push(new URL(url).searchParams.get('q'));
  return {url,type:'text/xml',text:'<rss><item><title>公开材料</title><link>https://public.example.org/report</link></item></rss>'};
 }});
 const examples=[
  ['帮我搜一下最近公开发布的折叠屏手机，列出来源','最近公开发布的折叠屏手机'],
  ['帮我查一下最近的 GitHub Pages 官方资料','最近的 GitHub Pages 官方资料'],
  ['帮我找一下网上关于保温杯的最新信息','保温杯的最新信息'],
  ['搜一下agent browser的官网','agent browser的官网']
 ];
 for(const [text,query] of examples){
  const first=await p.create({text,executionMode:'flow',requestId:randomUUID()});
  const result=await advance(p,first.id);
  assert.equal(result.stage,'review',text);
  assert.equal(result.flow.nodes.find(n=>n.capability==='web.search')?.status,'succeeded',text);
  assert.equal(sent.at(-1),query,text);
 }
 assert.equal(sent.length,examples.length);
 for(const text of ['帮我查一下附件里的官方资料','请查一下CRM中的客户名单及最新信息','搜一下我司订单明细的公开资料','上网搜一下密码：private-value','不要联网，查一下 GitHub 官方文档']){
  const contract=buildGoalContract({text});
  assert.ok(!ids(contract).includes('web.search'),text);assert.equal(contract.decision.sources,'workspace',text);
  assert.equal(webSkillInput('web.search',text).query,'',text);
 }
 const shop=buildGoalContract({text:'帮我找1688卖得好的保温杯，附上官方来源'});
 assert.ok(ids(shop).includes('sourcing.1688'));assert.ok(!ids(shop).includes('web.search'));
});
