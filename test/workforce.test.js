import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createPlatform} from '../src/platform.js';
import {roles,capabilities} from '../src/workforce/catalog.js';
import {skillDefinitions,skillSample,executeSkill} from '../src/workforce/skills.js';
import {defaultEmployees,employeeReadiness} from '../src/workforce/employees.js';
import {runEmployee} from '../src/workforce/runtime.js';
import {callModel} from '../src/workforce/model.js';
const make=async options=>createPlatform(await mkdtemp(path.join(os.tmpdir(),'workforce-')),options);
const startInput={requestId:'workforce-test-001',text:'为角阀准备资料、内容与经营测算',kind:'listing',permission:'draft',employeeIds:defaultEmployees().map(e=>e.id)};
const tool=(name,args='{}')=>({message:{role:'assistant',content:null,tool_calls:[{id:'call-1',type:'function',function:{name,arguments:args}}]}});
const answer={message:{role:'assistant',content:'根据实际校验结果形成草案，尚未发布。'}};
test('V2.4 catalog separates 12 roles, 134 planned entries and 10 executable skills',()=>{
 assert.equal(roles.length,12);assert.equal(capabilities.length,134);assert.equal(new Set(capabilities.map(c=>c.id)).size,134);assert.equal(skillDefinitions.length,10);
 assert.equal(capabilities.filter(c=>c.state==='implemented').length,1);assert(capabilities.filter(c=>c.state==='planned').length>100);
 for(const c of capabilities)for(const id of c.skillIds)assert(skillDefinitions.some(s=>s.id===id));
});
test('all code skills compute sample inputs and refuse missing facts; formulas handle boundaries',async()=>{
 for(const s of skillDefinitions){const result=await executeSkill(s.id,skillSample(s.id));assert.equal(result.status,'succeeded',s.id);assert(result.artifacts.length);assert.equal((await executeSkill(s.id,{})).status,'needs_input',s.id);}
 assert.equal((await executeSkill('finance.calculate',skillSample('finance.calculate'))).metrics.profit,1600);
 assert.equal((await executeSkill('price.break_even',skillSample('price.break_even'))).metrics.breakEven,18.95);
 const zero=skillSample('inventory.coverage');zero.inventory.dailySales=0;assert.equal((await executeSkill('inventory.coverage',zero)).metrics.days,null);
 await assert.rejects(()=>executeSkill('商品自动上架Agent',{}),/未实现/);
});
test('employee creation and model readiness are distinct; config persists and stale revisions reject',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'workforce-config-'));const p=await createPlatform(dir);const old=p.workforce.view().employees[0];
 const created=await p.workforce.saveEmployee(null,{...old,name:'新商品员工',mode:'model',modelId:null});assert.equal(p.workforce.view().employees.find(e=>e.id===created.id).readiness.ready,false);
 await assert.rejects(()=>p.create({...startInput,employeeIds:[created.id]}),/模型/);
 await p.workforce.saveEmployee(created.id,{...created,mode:'skills'});await assert.rejects(()=>p.workforce.saveEmployee(created.id,{...created,mode:'skills'}),/已更新/);
 const again=await createPlatform(dir);assert.equal(again.workforce.view().employees.length,5);assert.equal(again.workforce.view().employees.find(e=>e.id===created.id).mode,'skills');
 const noSkills={...old,skillIds:[]};assert.equal(employeeReadiness(noSkills,[]).ready,false);
});
test('four employees hand off real artifacts, recover missing facts and persist chat and traces',async()=>{
 const p=await make();let g=await p.create(startInput);await p.action(g.id,{kind:'plan',expectedVersion:g.version});await p.pump();assert.equal(p.goals()[0].runtime.status,'needs_input');
 g=await p.action(g.id,{kind:'facts',facts:skillSample('product.validate').facts,confirmed:true,expectedVersion:g.version});await p.action(g.id,{kind:'plan',expectedVersion:g.version});
 for(let i=0;i<4;i++)await p.pump();g=p.goals()[0];assert.equal(g.stage,'review');assert.equal(g.runtime.completed.length,4);assert(g.artifacts.length>=5);assert(g.artifacts.at(-1).body.includes('商品详情页文字大纲'));assert.equal(g.permission,'draft');
 const r=p.run(g.artifacts[0].runId);assert(r.trace.some(s=>s.phase==='verify'));assert.equal(r.result.executionType,'rules');assert.equal(r.config,undefined);
 await p.action(g.id,{kind:'message',text:'@价格与利润数字员工 核对价差',target:'employee-profit'});await p.pump();assert(p.goals()[0].messages.some(m=>m.role==='agent'&&m.replyTo));
 await assert.rejects(()=>p.action(g.id,{kind:'approve',expectedVersion:g.version}),/不支持/);
 await p.action(g.id,{kind:'complete',expectedVersion:g.version});assert.equal(p.goals()[0].stage,'completed');
});
test('model loop passes user question, exposes only assigned skills and verifies actual calls before completion',async()=>{
 const employee={...defaultEmployees()[0],mode:'model',skillIds:['product.validate'],maxSteps:3};let turn=0;
 const result=await runEmployee(employee,{model:'test'}, {...skillSample('product.validate'),question:'检查我提供的角阀资料'}, {modelCall:async(model,messages,tools)=>{assert.equal(tools.length,1);assert(messages[1].content.includes('检查我提供的角阀资料'));return turn++===0?tool('product_validate'):answer;}});
 assert.equal(result.executionType,'model');assert(result.artifacts.length>=2);assert.equal(turn,2);assert(result.trace.some(t=>t.phase==='verify'));
});
test('model loop rejects unauthorized tools, fabricated arguments, duplicate calls and empty completion',async()=>{
 const employee={...defaultEmployees()[0],mode:'model',skillIds:['product.validate'],maxSteps:3},input=skillSample('product.validate');let calls=0;
 await assert.rejects(()=>runEmployee(employee,{},input,{modelCall:async()=>tool('publish_product'),skillCall:async()=>{calls++;}}),/未授权/);assert.equal(calls,0);
 await assert.rejects(()=>runEmployee(employee,{},input,{modelCall:async()=>tool('product_validate','{"cost":0}')}),/覆盖业务输入/);
 await assert.rejects(()=>runEmployee(employee,{},input,{modelCall:async()=>answer}),/未调用任何/);
 await assert.rejects(()=>runEmployee(employee,{},input,{modelCall:async()=>tool('product_validate')}),/重复调用/);
 await assert.rejects(()=>runEmployee({...employee,maxSteps:1},{},input,{modelCall:async()=>tool('product_validate')}),/上限/);
});
test('missing input and pause stop the model loop without invented successful artifacts',async()=>{
 const employee={...defaultEmployees()[0],mode:'model',skillIds:['product.validate']};let calls=0;
 const result=await runEmployee(employee,{}, {},{modelCall:async()=>{calls++;return tool('product_validate');}});assert.equal(result.status,'needs_input');assert.equal(calls,1);assert.equal(result.artifacts.length,0);
 await assert.rejects(()=>runEmployee(employee,{},skillSample('product.validate'),{shouldContinue:()=>false,modelCall:async()=>{calls++;return answer;}}),/暂停/);assert.equal(calls,1);
});
test('model HTTP adapter validates host, passes bounded request and rejects secret echoes',async()=>{
 const oldKey=process.env.MODEL_SECRET_TEST,oldHosts=process.env.AGENT_ALLOWED_HOSTS;process.env.MODEL_SECRET_TEST='test-only-secret';process.env.AGENT_ALLOWED_HOSTS='model.example.com';
 try{
  const model={endpoint:'https://model.example.com/v1/chat/completions',secretEnv:'MODEL_SECRET_TEST',model:'test',timeoutMs:1000};
  const resolve=async()=>[{address:'93.184.216.34'}];
  const output=await callModel(model,[{role:'user',content:'测试'}],[],{resolve,fetch:async(url,options)=>{assert.equal(options.redirect,'error');assert.equal(JSON.parse(options.body).max_tokens,1600);return new Response(JSON.stringify({choices:[{message:{content:'收到'}}]}));}});assert.equal(output.message.content,'收到');
  await assert.rejects(()=>callModel(model,[],[],{resolve,fetch:async()=>new Response(JSON.stringify({choices:[{message:{content:'test-only-secret'}}]}))}),/密钥/);
  await assert.rejects(()=>callModel(model,[],[],{resolve:async()=>[{address:'127.0.0.1'}]}),/内网/);
 }finally{if(oldKey===undefined)delete process.env.MODEL_SECRET_TEST;else process.env.MODEL_SECRET_TEST=oldKey;if(oldHosts===undefined)delete process.env.AGENT_ALLOWED_HOSTS;else process.env.AGENT_ALLOWED_HOSTS=oldHosts;}
});
test('model test and revision gate employee execution; model-backed result runs through persisted queue',async()=>{
 const old=process.env.MODEL_SECRET_TEAM;process.env.MODEL_SECRET_TEAM='test-only-team';
 try{
  const p=await make({modelCall:async(model,messages,tools)=>!tools.length?answer:messages.some(m=>m.role==='tool')?answer:tool(tools[0].function.name)});
  const model=await p.workforce.saveModel(null,{name:'测试模型',model:'test',endpoint:'https://example.com/v1/chat/completions',secretEnv:'MODEL_SECRET_TEAM',timeoutMs:1000});
  const employee=p.workforce.view().employees[0];const updated=await p.workforce.saveEmployee(employee.id,{...employee,mode:'model',modelId:model.id});
  assert.equal(p.workforce.view().employees[0].readiness.ready,false);await p.workforce.testModel(model.id);await p.pump();assert.equal(p.workforce.view().employees[0].readiness.ready,true);
  const run=await p.workforce.testEmployee(employee.id);await p.pump();assert.equal(p.run(run.id).result.executionType,'model');assert.equal(p.run(run.id).status,'succeeded');
  let g=await p.create({...startInput,requestId:'model-chat-check',employeeIds:[employee.id]});g=await p.action(g.id,{kind:'facts',expectedVersion:g.version,confirmed:true,facts:skillSample('product.validate').facts});
  await p.action(g.id,{kind:'message',target:employee.id,text:'请根据资料回答我'});await p.pump();assert(p.goals()[0].messages.at(-1).text.includes(answer.message.content));
  await p.workforce.saveModel(model.id,{...model,name:'修改后模型'});assert.equal(p.workforce.view().employees[0].readiness.ready,false);await assert.rejects(()=>p.workforce.testEmployee(employee.id),/测试/);
 }finally{if(old===undefined)delete process.env.MODEL_SECRET_TEAM;else process.env.MODEL_SECRET_TEAM=old;}
});
test('additional business data can unblock selection and inventory goals without changing protected facts',async()=>{
 const p=await make();const seed=p.workforce.view().employees[0];const e=await p.workforce.saveEmployee(null,{...seed,name:'库存员工',roleId:'supply',skillIds:['inventory.coverage']});
 let g=await p.create({...startInput,requestId:'inventory-test-001',kind:'analysis',employeeIds:[e.id]});await p.action(g.id,{kind:'plan',expectedVersion:g.version});await p.pump();assert.equal(p.goals()[0].runtime.status,'needs_input');
 await assert.rejects(()=>p.action(g.id,{kind:'inputs',expectedVersion:g.version,data:{facts:{confirmed:true,cost:0}}}),/只接受/);
 g=await p.action(g.id,{kind:'inputs',expectedVersion:g.version,data:{inventory:skillSample('inventory.coverage').inventory}});await p.action(g.id,{kind:'plan',expectedVersion:g.version});await p.pump();g=p.goals()[0];assert.equal(g.stage,'review');assert.match(g.artifacts[0].body,/存在缺货风险/);
});
test('pre-workforce storage migrates without losing goals or employee defaults',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'workforce-migrate-'));const p=await createPlatform(dir);const g=await p.create(startInput);const stored=JSON.parse(await readFile(path.join(dir,'platform.json'),'utf8'));delete stored.employees;delete stored.models;await writeFile(path.join(dir,'platform.json'),JSON.stringify(stored));
 const migrated=await createPlatform(dir);assert.equal(migrated.goals()[0].id,g.id);assert.equal(migrated.workforce.view().employees.length,4);
});
test('personal Codex bridge is opt-in, uses SDK ChatGPT auth and returns decisions without exposing app secrets',async()=>{
 const {callLocalCodex}=await import('../src/workforce/codex-local.js');const vars=['ENABLE_CODEX_LOCAL','PLATFORM_TOKEN','MODEL_SECRET_PRIVATE'];const saved=Object.fromEntries(vars.map(k=>[k,process.env[k]]));
 try{
  delete process.env.ENABLE_CODEX_LOCAL;await assert.rejects(()=>callLocalCodex({timeoutMs:1000},[],[]),/未启用/);
  process.env.ENABLE_CODEX_LOCAL='1';delete process.env.PLATFORM_TOKEN;await assert.rejects(()=>callLocalCodex({timeoutMs:1000},[],[]),/PLATFORM_TOKEN/);
  process.env.PLATFORM_TOKEN='private-test-token';process.env.MODEL_SECRET_PRIVATE='private-test-secret';let captured;
  class FakeCodex {constructor(options){captured=options;}startThread(options){assert.equal(options.sandboxMode,'read-only');assert.equal(options.webSearchMode,'disabled');assert.equal(options.approvalPolicy,'never');return {run:async(prompt,options)=>{assert(prompt.includes('product_validate'));assert(options.signal);assert.deepEqual(options.outputSchema.properties.skill.enum,['','product_validate']);return {finalResponse:JSON.stringify({action:'skill',skill:'product_validate',answer:''}),usage:{input_tokens:100,output_tokens:20}};}};}}
  const result=await callLocalCodex({timeoutMs:1000},[{role:'user',content:'核验商品'}],[{function:{name:'product_validate',description:'核验'}}],{CodexClass:FakeCodex});
  assert.equal(result.message.tool_calls[0].function.name,'product_validate');assert.equal(captured.config.forced_login_method,'chatgpt');assert.equal(captured.config.features.shell_tool,false);assert.equal(captured.env.PLATFORM_TOKEN,undefined);assert.equal(captured.env.MODEL_SECRET_PRIVATE,undefined);assert.deepEqual(captured.configOverrides,['mcp_servers={}']);
 }finally{for(const k of vars)if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}
});
