import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeDecision} from '../src/taskflows/decision.js';
import {flowCapabilities} from '../src/taskflows/catalog.js';
import {executeSkill} from '../src/workforce/skills.js';

function decisionFixture({sources='available',data={},answer,skillCall=executeSkill,maxCalls=12}){
 const node={id:'analysis',title:'经营建议',objective:'用可核对的资料给出建议'};
 const goal={text:'判断这一季需要优先关注什么',flow:{nodes:[node,{id:'summary',status:'pending'}],
  calls:1,policy:{maxCalls},model:{id:'configured'},plan:{contract:{decision:{sources}}}}};
 const rounds=[];
 const run=async()=>{
  const result=await analyzeDecision({goal,node,input:{...data,observations:[]},toolCatalog:flowCapabilities,skillCall,
   modelCall:async (_model,messages)=>{
    const context=JSON.parse(messages[1].content);rounds.push(context);
    return {message:{content:JSON.stringify(answer(context))}};
   }});
  if(result.continueAnalysis)node.investigation=structuredClone(result.investigation);
  goal.flow.calls++;
  return result;
 };
 return {run,rounds,node,goal};
}

test('analysis can pick a registered code skill by its purpose, and base the next decision on its actual workspace result',async()=>{
 const data={table:{source:'季报',csv:'月份,数量\n一月,10\n二月,30'},crmAudience:{records:[{id:'private-row'}]}};
 const executed=[];
 const {run}=decisionFixture({data,answer:ctx=>{
  assert.doesNotMatch(JSON.stringify(ctx),/private-row/);
  if(!ctx.toolResults.length){
   assert.ok(ctx.tools.find(t=>t.id==='table.profile').description.includes('行列数'));
   return {tool:{id:'table.profile'},why:'核对销售台账是否缺列'};
  }
  assert.match(ctx.toolResults[0].observations[0].body,/平均 20/);
  return {conclusion:'季报中数量列两期的平均值为 20。'};
 },skillCall:(id,input)=>{executed.push(id);assert.equal(input.crmAudience,undefined);return executeSkill(id,input);}});
 assert.equal((await run()).investigation.phase,'tool');
 const output=await run();assert.equal(output.trace[0].skillId,'table.profile');
 assert.equal(output.artifacts[0].evidence,'季报');
 const reviewed=await run();
 assert.match(reviewed.artifacts[0].body,/平均值为 20/);
 assert.match(reviewed.artifacts[0].body,/季报/);
 assert.deepEqual(executed,['table.profile']);
});

test('a missing skill input stays visible across reassessment and is never filled from a sample',async()=>{
 const {run}=decisionFixture({answer:ctx=>ctx.toolResults.length?{conclusion:'无法算出该表的规模。'}:{tool:{id:'table.profile'}}});
 await run();
 const checked=await run();assert.deepEqual(checked.artifacts,[]);
 assert.equal(checked.trace[0].status,'needs_input');
 const finished=await run();
 assert.equal(finished.status,'needs_input');assert.match(finished.summary,/CSV/);
});

test('model output cannot supply local facts, add credentials to the search, call external effects or manufacture read targets',async()=>{
 for(const [tool,pattern] of [
  [{id:'table.profile',table:{csv:'型号,售价\nA,999'}},/声明的参数/],
  [{id:'web.search',query:'查 13812345678 的记录'},/敏感信息/],
  [{id:'web.read',url:'https://never-seen.example.com/private'},/实际检索/],
  [{id:'image.main'},/未开放/],
  [{id:'external_secret'},/未开放/]
 ]){
  const {run}=decisionFixture({answer:()=>({tool}),skillCall:()=>assert.fail('invalid selection must not execute')});
  await assert.rejects(run,pattern);
 }
 const local=decisionFixture({sources:'workspace',answer:ctx=>{
  assert.ok(ctx.tools.some(t=>t.id==='table.profile'));
  assert.ok(!ctx.tools.some(t=>t.id.startsWith('web.')));
  return {tool:{id:'web.search',query:'公开运费'}};
 },skillCall:()=>assert.fail()});
 await assert.rejects(local.run,/未开放/);
 const limited=decisionFixture({maxCalls:3,answer:ctx=>{assert.deepEqual(ctx.tools,[]);return {tool:{id:'table.profile'}};}});
 assert.match((await limited.run()).summary,/调用额度/);
});

test('comparison analysis can request a primary source and cite its observed record, even if earlier research was empty',async()=>{
 const url='https://company.example.com/manual';
 const {run,goal}=decisionFixture({data:{research:{observations:[],gaps:['供应商正式规格']}},
  answer:ctx=>ctx.toolResults.length?{conclusion:'该型号具备 2 个接口。',citations:['tool-1-1']}:{tool:{id:'web.read',url}},
  skillCall:async()=>({status:'succeeded',summary:'读取产品手册',artifacts:[{title:'手册',body:'该型号的规格为 2 个接口。',evidence:url}],
   metrics:{sources:[{title:'手册',url}]}})});
 goal.messages=[{role:'human',text:'规格可以看 '+url}];
 await run();await run();
 const final=await run();assert.equal(final.status,'succeeded');
 assert.match(final.artifacts[0].body,/tool-1-1/);
 assert.match(final.artifacts[0].body,/2 个接口/);
});
