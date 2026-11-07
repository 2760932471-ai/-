import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createPlatform} from '../src/platform.js';
import {defaultEmployees} from '../src/workforce/employees.js';
import {skillSample,executeSkill} from '../src/workforce/skills.js';
import {contextSettings,selectConversation,updateContext,mentionedEmployees} from '../src/workforce/conversation.js';
const make=async options=>{const dir=await mkdtemp(path.join(os.tmpdir(),'discussion-'));return {p:await createPlatform(dir,options),dir};};
const goal=p=>p.create({requestId:randomUUID(),text:'讨论角阀经营与客户问题',kind:'analysis',employeeIds:['employee-coordination'],permission:'draft'});
const latest=(p,g)=>p.goals().find(x=>x.id===g.id);
const send=(p,g,more={})=>p.action(g.id,{kind:'message',text:'客户说安装后漏水怎么办',target:'employee-service',intent:'discuss',...more});
const invite=(p,g,id)=>p.action(g.id,{kind:'inviteDiscussion',employeeId:id});
test('12 basic roles are ready and each can run its declared sample without a model',async()=>{
 const {p,dir}=await make();assert.equal(p.workforce.view().employees.length,12);assert(p.workforce.view().employees.every(e=>e.readiness.ready));
 for(const e of defaultEmployees()){const run=await p.workforce.testEmployee(e.id);await p.pump();assert.equal(p.run(run.id).status,'succeeded',e.name);}
 const old=JSON.parse(await readFile(path.join(dir,'platform.json'),'utf8'));old.employees=old.employees.slice(0,4);old.employees[0].enabled=false;old.employees[0].name='保留用户配置';await writeFile(path.join(dir,'platform.json'),JSON.stringify(old));
 const migrated=await createPlatform(dir);assert.equal(migrated.workforce.view().employees.length,12);assert.equal(migrated.workforce.view().employees[0].name,'保留用户配置');assert.equal(migrated.workforce.view().employees[0].enabled,false);
});
test('traffic metrics compute actual inputs and handle zero denominators and inconsistent counts',async()=>{
 const input=skillSample('traffic.funnel'),r=await executeSkill('traffic.funnel',input);assert.deepEqual(r.metrics,{ctr:5,cvr:4,cpc:1.2,cpa:30,roas:3.33});input.traffic.clicks=0;input.traffic.orders=0;const zero=await executeSkill('traffic.funnel',input);assert.equal(zero.metrics.cpa,null);input.traffic.orders=3;assert.equal((await executeSkill('traffic.funnel',input)).status,'needs_input');
 const triage=await executeSkill('service.triage',{question:'快递破损了可以退款吗'});assert(triage.metrics.categories.includes('物流'));assert(triage.metrics.categories.includes('退换与退款'));assert.match(triage.artifacts[0].body,/未承诺退款/);
 const followup=await executeSkill('service.triage',{question:'那应该怎么办？',conversation:[{id:'old',role:'human',text:'@客服售后数字员工 快递破损了'},{id:'now',role:'human',text:'那应该怎么办？'}],contextSelection:{selected:[{id:'now',reason:'本次提问'}]}});assert.deepEqual(followup.metrics.categories,['物流']);assert.match(followup.artifacts[0].body,/参考上一轮客户问题/);
});
test('mentions support multiple people, duplicate names and boundaries; unknown names fail explicitly',()=>{
 const people=[{id:'a',name:'小李'},{id:'b',name:'小李助理'},{id:'c',name:'客服'}];assert.deepEqual(mentionedEmployees('@小李助理 @客服 请介绍一下自己',people),['b','c']);
 assert.deepEqual(mentionedEmployees('发给 a@example.com',people),[]);assert.throws(()=>mentionedEmployees('@陌生人 你好',people),/先邀请/);
 const duplicates=[{id:'a',name:'同名'},{id:'b',name:'同名'}];assert.throws(()=>mentionedEmployees('@同名 你好',duplicates),/同名/);assert.deepEqual(mentionedEmployees('@同名 你好',duplicates,['b']),['b']);
});
test('invite only adds discussion participants; multi-mention dispatches two linked replies and persists',async()=>{
 const {p,dir}=await make();let g=await goal(p),version=g.version;g=await invite(p,g,'employee-service');g=await invite(p,g,'employee-growth');assert.deepEqual(g.members,['employee-coordination']);assert.equal(g.version,version);
 await send(p,g,{text:'@客服售后数字员工 @流量推广数字员工 你能做什么？',target:'coordinator',mentionIds:['employee-service','employee-growth']});await p.pump();await p.pump();g=latest(p,g);const replies=g.messages.filter(m=>m.role==='agent');assert.equal(replies.length,2);assert.equal(replies[0].replyTo,replies[1].replyTo);assert.equal(p.runs().length,0);
 const again=await createPlatform(dir);assert.deepEqual(again.goals()[0].messages,JSON.parse(JSON.stringify(g.messages)));assert(again.goals()[0].participants.includes('employee-service'));
});
test('context selection enforces source cutoff, budgets, pinned evidence and excludes reply descendants',()=>{
 const messages=Array.from({length:30},(_,i)=>({id:'m'+i,role:'human',author:'你',text:i===0?'固定预算依据':('第'+i+'轮普通讨论').repeat(400)}));messages.splice(5,0,{id:'excluded-answer',role:'agent',author:'员工',text:'不能外传的已排除内容',replyTo:'m4',goalVersion:2,status:'succeeded'});messages.push({id:'stale',role:'agent',author:'旧回复',text:'旧版本',goalVersion:1,status:'succeeded'});const source={id:'question',role:'human',author:'你',text:'那预算怎么处理',replyTo:'m0'};messages.push(source,{id:'future',role:'human',author:'你',text:'未来消息'});
 const g={version:2,text:'经营',messages,chatContext:{revision:1,pinnedIds:['m0'],excludedIds:['m4'],maxMessages:6,maxChars:4000}};const r=selectConversation(g,source);assert(r.conversation.some(m=>m.id==='m0'));assert(r.conversation.some(m=>m.id==='question'));assert(!r.conversation.some(m=>['m4','excluded-answer','future','stale'].includes(m.id)));assert(r.conversation.length<=6);assert(r.contextSelection.characters<=4000);assert(r.contextSelection.selected.some(m=>m.truncated));
});
test('reply follow-ups route to the same employee and the saved runtime includes selected history',async()=>{
 const {p}=await make();let g=await goal(p);g=await invite(p,g,'employee-service');await send(p,g);await p.pump();g=latest(p,g);const answer=g.messages.at(-1);assert.equal(answer.employeeId,'employee-service');
 await send(p,g,{text:'那退货需要什么凭证？',target:'coordinator',replyTo:answer.id});await p.pump();g=latest(p,g);const run=p.run(g.messages.at(-1).runId);assert.equal(run.agentId,'employee-service');assert(run.input.conversation.some(m=>m.id===answer.id));assert(run.input.contextSelection.selected.some(m=>m.reason==='引用链'));
 const rows=run.input.conversation;assert.equal(rows.at(-1).text,'那退货需要什么凭证？');
});
test('context settings persist without editing facts; reset retains transcript and blocks old context',async()=>{
 const {p,dir}=await make();let g=await goal(p);g=await invite(p,g,'employee-service');await send(p,g);await p.pump();g=latest(p,g);const facts=structuredClone(g.facts),before=g.messages.length;
 g=await p.action(g.id,{kind:'chatContext',revision:1,note:'客户需先核对规格',maxMessages:6,maxChars:4000,pinnedIds:[g.messages.at(-1).id]});assert.deepEqual(g.facts,facts);
 const again=await createPlatform(dir);assert.equal(contextSettings(again.goals()[0]).note,'客户需先核对规格');
 g=await p.action(g.id,{kind:'chatContext',revision:2,reset:true});assert(g.messages.length>before);assert.equal(p.workforce.context(g.id).conversation.length,0);assert.equal(contextSettings(g).note,'');
 await assert.rejects(send(p,g,{replyTo:g.messages[0].id}),/旧话题/);await assert.rejects(p.action(g.id,{kind:'chatContext',revision:1,note:'旧设置'}),/变化/);
 await send(p,g,{text:'现在客户咨询物流'});await p.pump();g=latest(p,g);assert.equal(p.run(g.messages.at(-1).runId).input.conversation.length,1);
});
test('in-flight model reply is discarded if context is reset; model sees selected history and note',async()=>{
 const old=[process.env.ENABLE_CODEX_LOCAL,process.env.PLATFORM_TOKEN];process.env.ENABLE_CODEX_LOCAL='1';process.env.PLATFORM_TOKEN='test';
 try{
  let finish,entered,seen;const started=new Promise(r=>entered=r);const {p}=await make({modelCall:async(m,msg)=>{if(msg.length===1)return {message:{role:'assistant',content:'ok'}};seen=JSON.parse(msg[1].content);entered();return new Promise(r=>finish=r);}});
  const m=await p.workforce.saveModel(null,{provider:'codex-local',name:'受控模型',model:'',timeoutMs:1000});await p.workforce.testModel(m.id);await p.pump();const e=p.workforce.view().employees.find(e=>e.id==='employee-service');await p.workforce.saveEmployee(e.id,{...e,mode:'model',modelId:m.id});let g=await goal(p);g=await invite(p,g,e.id);g=await p.action(g.id,{kind:'chatContext',revision:1,note:'先核对订单'});await send(p,g);const pump=p.pump();await started;assert.equal(seen.conversationContext.note,'先核对订单');assert(seen.conversation.some(m=>m.text.includes('漏水')));
  g=latest(p,g);await p.action(g.id,{kind:'chatContext',revision:2,reset:true});finish({message:{role:'assistant',tool_calls:[{id:'call-1',type:'function',function:{name:'service_triage',arguments:'{}'}}]}});await pump;g=latest(p,g);assert.equal(g.messages.at(-1).status,'discarded');assert.equal(p.run(g.messages.at(-1).runId).result,null);
 }finally{for(const [i,k]of ['ENABLE_CODEX_LOCAL','PLATFORM_TOKEN'].entries())if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];}
});
