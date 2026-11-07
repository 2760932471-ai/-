import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createPlatform} from '../src/platform.js';
import {commerceSample,executeCommerce,parseBusinessCsv} from '../src/workforce/commerce.js';
import {validateExternal,publicExternal,externalBlockers} from '../src/workforce/external.js';
import {invokeExternal} from '../src/workforce/external-transport.js';
import {runEmployee} from '../src/workforce/runtime.js';
const make=async options=>createPlatform(await mkdtemp(path.join(os.tmpdir(),'business-')),options);
const external={name:'内容只读 Agent',description:'根据确认商品事实输出内容草案',provider:'dify',endpoint:'https://dify.example.com/v1/workflows/run',secretEnv:'EXTERNAL_SECRET_TEST',timeoutMs:1000,inputFields:['goal','facts'],outputKey:'result',readOnly:true,enabled:true};
const output={status:'succeeded',summary:'已生成待审核草案',missing:[],artifacts:[{title:'外部草案',body:'仅依据已确认事实准备，尚未发布。',evidence:'测试适配服务'}],metrics:{}};
test('CSV parsing handles quoted delimiters, BOM and duplicate headers without silent coercion',()=>{
 assert.deepEqual(parseBusinessCsv('\uFEFFsku,value\r\n"A,B",10\r\n"A""B",20',['sku','value']).map(r=>r.sku),['A,B','A"B']);
 assert.throws(()=>parseBusinessCsv('sku,sku\nA,B',['sku']),/重复/);assert.throws(()=>parseBusinessCsv('sku,value\n"A,10',['sku']),/未闭合/);assert.throws(()=>parseBusinessCsv('sku,value\nA,10,3',['sku']),/列数/);
});
test('SKU diagnosis calculates actual profit and flags missing fields instead of substituting zero',async()=>{
 const input=commerceSample('commerce.sku_profit'),r=await executeCommerce('commerce.sku_profit',input);
 assert.equal(r.metrics.totalContribution,1300);assert.equal(r.metrics.lossSkuCount,1);assert.equal(r.metrics.skuProfit[0].sku,'DEMO-B');assert.equal(r.metrics.skuProfit[0].profit,-600);assert.match(r.artifacts[0].body,/广告前盈利/);
 const duplicate=structuredClone(input);duplicate.commerce.csv+='\nDEMO-B,3000,1600,150,400,1200,200,50';assert.equal((await executeCommerce('commerce.sku_profit',duplicate)).metrics.skuProfit[0].profit,-1200);
 const refund=structuredClone(input);refund.commerce.csv=refund.commerce.csv.replace('10000','-100');const refunded=await executeCommerce('commerce.sku_profit',refund);assert.equal(refunded.metrics.skuProfit.find(r=>r.sku==='DEMO-A').margin,null);
 input.commerce.csv=input.commerce.csv.replace('1200','');const bad=await executeCommerce('commerce.sku_profit',input);assert.equal(bad.status,'needs_input');assert.match(bad.missing.join(' '),/ads/);
});
test('discount scenarios use stated volume, costs and fixed budget; zero contribution never divides by zero',async()=>{
 const input=commerceSample('campaign.discount'),r=await executeCommerce('campaign.discount',input);assert.equal(r.metrics.scenarios[0].totalContribution,3000);assert.equal(r.metrics.scenarios[2].unitContribution,16);assert.equal(r.metrics.scenarios[2].breakEvenVolume,32);assert.equal(r.metrics.breakEvenPrice,68.43);
 input.campaign.goods=100;const loss=await executeCommerce('campaign.discount',input);assert.equal(loss.metrics.scenarios[0].breakEvenVolume,null);assert.match(loss.artifacts[0].body,/原价也不足以保本/);
 const zero=commerceSample('campaign.discount');Object.assign(zero.campaign,{price:60,feeRate:0,fixedBudget:0,discountRates:[0]});assert.equal((await executeCommerce('campaign.discount',zero)).metrics.scenarios[0].breakEvenVolume,0);
 input.campaign.feeRate=100;assert.equal((await executeCommerce('campaign.discount',input)).status,'needs_input');
});
test('batch replenishment respects MOQ, carton size, inbound and zero-sales boundaries',async()=>{
 const input=commerceSample('inventory.replenish'),r=await executeCommerce('inventory.replenish',input);assert.equal(r.metrics.replenishment[0].order,60);assert.equal(r.metrics.replenishment[0].target,85);assert.equal(r.metrics.replenishment[0].risk,true);assert.equal(r.metrics.replenishment[1].order,0);assert.equal(r.metrics.replenishment[1].coverageDays,null);
 input.replenishment.csv+='\nDEMO-A,20,10,5,7,3,7,20,12';assert.equal((await executeCommerce('inventory.replenish',input)).status,'needs_input');
});
test('service evidence preserves policy citations and stops on missing or irrelevant evidence',async()=>{
 const input=commerceSample('service.evidence'),r=await executeCommerce('service.evidence',input);assert.equal(r.status,'succeeded');assert.match(r.artifacts[0].body,/虚构售后政策 v1/);assert.equal(r.metrics.requiresHumanReview,true);
 input.knowledgeRecall.hits=[];assert.equal((await executeCommerce('service.evidence',input)).status,'needs_input');input.knowledgeRecall.hits=[{text:'品牌主色为蓝色'}];assert.equal((await executeCommerce('service.evidence',input)).status,'needs_input');
});
test('business recipe installation is idempotent and actual goal execution delivers loss analysis',async()=>{
 const p=await make();const e=await p.workforce.install('sku-profit');assert.equal((await p.workforce.install('sku-profit')).id,e.id);assert.equal(p.workforce.view().employees.length,13);assert.deepEqual(p.workforce.recommend('查清本月哪些商品亏损').employeeIds,[e.id]);
 const g=await p.create({requestId:'business-goal-001',text:'查清本月哪些商品亏损',kind:'analysis',employeeIds:[e.id]});const saved=await p.action(g.id,{kind:'inputs',expectedVersion:g.version,data:commerceSample('commerce.sku_profit')});await p.action(g.id,{kind:'plan',expectedVersion:saved.version});await p.pump();assert.equal(p.goals()[0].stage,'review');assert.match(p.goals()[0].artifacts[0].body,/DEMO-B/);
 await p.action(g.id,{kind:'message',text:'这些商品亏损主要在哪里？',target:'coordinator',intent:'discuss'});await p.pump();assert.equal(p.runs()[0].agentId,e.id);assert.equal(p.runs()[0].purpose,'chat');
});
test('external configs require readonly declaration, field permissions and versioned successful tests',()=>{
 assert.throws(()=>validateExternal({...external,readOnly:false}),/只读/);assert.throws(()=>validateExternal({...external,inputFields:['password']}),/字段/);assert.throws(()=>validateExternal({...external,secretEnv:'real-key'}),/变量名/);assert.throws(()=>validateExternal({...external,endpoint:'https://dify.example.com'}),/workflows/);
 const config=validateExternal(external);assert.equal(config.lastTest,null);assert(externalBlockers(publicExternal(config)).length>=1);assert.throws(()=>validateExternal({...external,revision:0},{...config,revision:2}),/已更新/);
});
test('Dify adapter obeys field allowlist and parses workflow result; generic HTTP shares the contract',async()=>{
 const old=process.env.AGENT_ALLOWED_HOSTS;process.env.AGENT_ALLOWED_HOSTS='dify.example.com';process.env.EXTERNAL_SECRET_TEST='fixture-external-secret';const config={...validateExternal(external),id:'external_test'};const resolve=async()=>[{address:'8.8.8.8',family:4}];
 try{
  const r=await invokeExternal(config,{goal:'准备商品文案',facts:{confirmed:true},financials:{private:true},knowledgeRecall:{private:true}},{resolve,fetch:async(url,opt)=>{const b=JSON.parse(opt.body);assert.equal(b.response_mode,'blocking');assert.equal(b.user,'ai-workbench');assert.deepEqual(Object.keys(JSON.parse(b.inputs.context)),['goal','facts']);assert.equal(opt.redirect,'error');assert.equal(opt.headers.Authorization,'Bearer fixture-external-secret');return new Response(JSON.stringify({workflow_run_id:'wf-1',data:{status:'succeeded',outputs:{result:JSON.stringify(output)}}}));}});assert.equal(r.remote.workflowRunId,'wf-1');assert.equal(r.artifacts[0].title,'外部草案');
  const generic=await invokeExternal({...config,provider:'http'},{goal:'测试'},{resolve,fetch:async(url,opt)=>{assert.equal(JSON.parse(opt.body).schemaVersion,1);return new Response(JSON.stringify(output));}});assert.equal(generic.status,'succeeded');
  for(const data of [{data:{status:'failed',outputs:{result:output}}},{data:{status:'succeeded',outputs:{result:'invalid'}}},{...output,summary:'fixture-external-secret'}])await assert.rejects(()=>invokeExternal(config,{goal:'测试'},{resolve,fetch:async()=>new Response(JSON.stringify(data))}),/调用失败/);
 }finally{if(old===undefined)delete process.env.AGENT_ALLOWED_HOSTS;else process.env.AGENT_ALLOWED_HOSTS=old;delete process.env.EXTERNAL_SECRET_TEST;}
});
test('external skill testing gates mounting/execution, snapshots configuration and resets after edits',async()=>{
 process.env.EXTERNAL_SECRET_TEST='fixture-external-secret';const calls=[];try{
  const p=await make({externalCall:async(c,input)=>{calls.push({c,input});return output;}}),s=await p.workforce.saveExternal(null,external);
  const employee=await p.workforce.saveEmployee(null,{name:'外部内容员工',roleId:'creative',mode:'skills',modelId:null,skillIds:[s.id],enabled:true,maxSteps:5,instructions:'只读草案'});
  assert.equal(p.workforce.view().employees.find(e=>e.id===employee.id).readiness.ready,false);
  await p.workforce.testExternal(s.id,{goal:'验证输出'});await p.pump();assert.equal(p.workforce.view().employees.find(e=>e.id===employee.id).readiness.ready,true);
  const g=await p.create({requestId:'external-goal-001',text:'准备商品内容草案',kind:'analysis',employeeIds:[employee.id]});await p.action(g.id,{kind:'plan',expectedVersion:g.version});await p.pump();assert.equal(p.goals()[0].stage,'review');assert.equal(calls.length,2);assert.equal(calls[1].c.revision,1);assert.match(p.runs()[0].agentName,/外部内容/);
  await p.workforce.saveExternal(s.id,{...external,revision:s.revision,description:'新职责'});assert.equal(p.workforce.view().employees.find(e=>e.id===employee.id).readiness.ready,false);
 }finally{delete process.env.EXTERNAL_SECRET_TEST;}
});
test('model loop can select configured external skills while rejecting unmounted calls',async()=>{
 const id='external_test',e={name:'测试员工',mode:'model',maxSteps:3,skillIds:[id],instructions:'只读'};let turn=0;
 const r=await runEmployee(e,{}, {goal:'任务'},{definitions:[{id,description:'已配置外部能力'}],skillCall:async selected=>{assert.equal(selected,id);return output;},modelCall:async()=>({message:turn++?{role:'assistant',content:'根据外部结果准备草案'}:{role:'assistant',content:null,tool_calls:[{id:'call-1',function:{name:id,arguments:'{}'}}]}})});
 assert.equal(r.executionType,'model');assert.equal(r.artifacts.length,2);assert(r.trace.some(x=>x.skillId===id));
});
