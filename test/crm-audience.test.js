import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {basicFlow} from '../src/taskflows/planner.js';
import {createPlatform} from '../src/platform.js';
import {audienceRequest,inspectAudience,normalizeAudienceData} from '../src/taskflows/audience.js';

const goalText='最近上新了冬衣，帮我从公司自由的CRM里找到年轻女性白领这些人，营销他们';
const seedData={source:'11 月 CRM 标签导出',records:[
 {id:'C01',tags:['年轻','女性','白领'],contactable:true},
 {id:'C02',tags:['年轻女性白领'],contactable:false},
 {id:'C03',tags:['年轻','女性','白领']},
 {id:'C04',tags:['女性','白领'],contactable:true}
]};
const step=(goal,cap)=>goal.flow.nodes.find(node=>node.capability===cap);
async function workspace(t){
 const dir=await mkdtemp(join(tmpdir(),'mas-crm-'));
 t.after(()=>rm(dir,{force:true,recursive:true}));
 return dir;
}
async function advance(platform,id){
 for(let i=0;i<12;i++)await platform.pump();
 return platform.goals().find(goal=>goal.id===id);
}
test('a CRM goal delivers a draft before asking for an export, then resumes only the customer filter',async t=>{
 const p=await createPlatform(await workspace(t));
 const {id}=await p.create({executionMode:'flow',requestId:randomUUID(),text:goalText});
 let g=await advance(p,id);
 assert.equal(g.flow.plan.contract.decision.sources,'workspace');
 assert.equal(step(g,'analysis.reason'),undefined);
 assert.equal(step(g,'audience.prepare').status,'succeeded');
 const draft=g.artifacts.find(f=>f.taskId===step(g,'audience.prepare').id);
 assert.match(draft.body,/年轻女性白领/);
 assert.match(draft.body,/新上了冬衣/);
 assert.match(step(g,'audience.select').error,/报表/);
 await p.action(id,{kind:'inputs',expectedVersion:g.version,data:{crmAudience:seedData}});
 g=await advance(p,id);
 const selected=g.artifacts.find(f=>f.taskId===step(g,'audience.select').id);
 assert.match(selected.body,/匹配 3 人/);
 assert.match(selected.body,/允许触达 1 人/);
 assert.match(selected.body,/C01/);
 assert.doesNotMatch(selected.body,/C02|C03|C04/);
 assert.equal(g.flow.status,'blocked');
 assert.match(step(g,'audience.contact').error,/尚未发送/);
 assert.equal(g.artifacts.find(f=>f.id===draft.id).status,'draft');
 assert.equal(step(g,'audience.prepare').attempts,1);
});

test('a blocked v2 generic CRM analysis resumes into local preparation without a model',async t=>{
 const dir=await workspace(t),p=await createPlatform(dir);
 const {id}=await p.create({executionMode:'flow',requestId:randomUUID(),text:'帮我分析冬衣采购风险'});
 let previous=await advance(p,id);
 assert.equal(step(previous,'analysis.reason').status,'needs_input');
 const file=join(dir,'platform.json'),stored=JSON.parse(await readFile(file));
 const old=stored.goals.find(g=>g.id===id);
 old.text=goalText;
 old.messages[0].text=goalText;
 old.flow.plan.contract.version=2;
 await writeFile(file,JSON.stringify(stored));
 const reloaded=await createPlatform(dir);
 const g=await advance(reloaded,id);
 assert.equal(step(g,'analysis.reason'),undefined);
 assert.equal(step(g,'audience.prepare').status,'succeeded');
 assert.equal(step(g,'audience.select').status,'needs_input');
 assert.ok(g.flow.plan.checks.some(check=>check.capability==='audience.prepare'));
});

test('age or occupation is never guessed, and confirmed compound tags are required for additional constraints',()=>{
 const data=normalizeAudienceData(seedData);
 const req=audienceRequest('从CRM里找到年轻女性白领，地区限于上海，营销他们');
 assert.equal(inspectAudience(req,data).question.includes('标签'),true);
 assert.ok(inspectAudience(req,data,'随便选').missing);
 assert.equal(inspectAudience(req,data,'年轻女性白领').matched,1);
 assert.throws(()=>normalizeAudienceData({source:'报表',records:[...seedData.records,seedData.records[0]]}),/重复/);
});

test('private CRM rows stay out of chat, compiled summaries and a later generic model task',async t=>{
 const calls=[];
 const p=await createPlatform(await workspace(t),{modelCall:async(model,messages)=>{
  if(messages.length===1)return {message:{content:'连接成功'}};
  const payload=JSON.parse(messages[1].content);
  calls.push(payload);
  const reply=payload.executionPolicy?basicFlow({text:'分析仓储费用'}):payload.message?{intent:'discussion',answer:'已检查筛选条件。'}:{conclusion:'按本月仓储费用测算。'};
  return {message:{content:JSON.stringify(reply)}};
 }});
 const {id}=await p.create({executionMode:'flow',requestId:randomUUID(),text:'从 CRM 找到年轻女性白领，列出名单'});
 let g=await advance(p,id);
 const crmAudience={source:'内部报表',records:[{id:'PRIVATE-CUSTOMER-901',tags:['年轻女性白领','PRIVATE-CRM-TAG'],contactable:true}]};
 await p.action(id,{kind:'inputs',expectedVersion:g.version,data:{crmAudience,estimatedStorageFee:700}});
 g=await advance(p,id);
 assert.equal(g.stage,'review');
 assert.match(g.artifacts.find(a=>a.taskId===step(g,'audience.select').id).body,/PRIVATE-CUSTOMER-901/);
 assert.doesNotMatch(g.artifacts.find(a=>a.taskId===step(g,'result.compile').id).body,/PRIVATE-CUSTOMER-901/);
 const env='MODEL_SECRET_CRM_PRIVACY';
 const previous=process.env[env];process.env[env]='fake-credential';
 t.after(()=>{if(previous==null)delete process.env[env];else process.env[env]=previous;});
 const model=await p.workforce.saveModel(null,{name:'讨论模型',provider:'api',model:'mock',endpoint:'https://api.example.com/chat',secretEnv:env,timeoutMs:1000});
 await p.workforce.testModel(model.id);await p.pump();
 await p.flows.saveSettings({...p.flows.view().settings,modelId:model.id});
 await p.action(id,{kind:'message',intent:'discuss',chatModelId:model.id,text:'帮我解读本次报表'});
 assert.ok(calls.some(call=>call.message==='帮我解读本次报表'));
 await p.action(id,{kind:'message',intent:'change',text:'分析仓储费用'});
 g=await advance(p,id);
 assert.equal(step(g,'analysis.reason').status,'succeeded');
 const analysis=calls.find(call=>call.decisionData);
 assert.equal(analysis.decisionData.estimatedStorageFee,700);
 assert.equal(Object.hasOwn(analysis.decisionData,'crmAudience'),false);
 assert.doesNotMatch(JSON.stringify(calls),/PRIVATE-CUSTOMER-901|PRIVATE-CRM-TAG/);
});

test('a CRM marketing draft can use a named target tag without a requested selection or dispatch',()=>{
 const req=audienceRequest('帮我根据CRM里年轻女性白领的标签设计营销文案','不要发送');
 assert.equal(req.audience,'年轻女性白领');
 assert.equal(req.wantsCopy,true);
 assert.equal(req.wantsSelection,false);
 assert.equal(req.wantsOutreach,false);
});

test('an unmapped CRM cohort pauses selection while an evaluable empty intersection and an empty report return zero',async t=>{
 const p=await createPlatform(await workspace(t));
 const {id}=await p.create({executionMode:'flow',requestId:randomUUID(),text:goalText});
 let g=await advance(p,id);
 const setRows=async records=>{
  await p.action(id,{kind:'inputs',expectedVersion:g.version,data:{crmAudience:{source:'CRM 自建标签',records}}});
  g=await advance(p,id);
 };
 await setRows([{id:'A',tags:['一级会员']},{id:'B',tags:['二级会员']}]);
 assert.equal(step(g,'audience.select').status,'needs_input');
 assert.match(step(g,'audience.select').question,/标签/);
 assert.equal(step(g,'audience.contact').status,'pending');
 await p.action(id,{kind:'message',text:'一级会员'});
 g=await advance(p,id);
 assert.match(g.artifacts.find(a=>a.id===step(g,'audience.select').artifactIds[0]).body,/匹配 1 人/);
 await setRows([{id:'A',tags:['年轻','女性']},{id:'B',tags:['白领']}]);
 assert.equal(step(g,'audience.contact').status,'succeeded');
 assert.match(g.artifacts.find(a=>a.id===step(g,'audience.select').artifactIds[0]).body,/匹配 0 人/);
 await setRows([]);
 assert.match(g.artifacts.find(a=>a.id===step(g,'audience.select').artifactIds[0]).body,/报表包含 0 条客户记录/);
});
