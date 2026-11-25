import test from 'node:test';
import assert from 'node:assert/strict';
import {attachAcceptanceChecks,evaluatePlanChecks} from '../src/taskflows/acceptance.js';
import {analyzeDecision} from '../src/taskflows/decision.js';

test('only current outputs of the assigned task satisfy an artifact check',()=>{
 const node={id:'main',capability:'image.main',title:'主图',dependsOn:[],artifactIds:['asset'],imageJobId:'img'};
 const plan=attachAcceptanceChecks({nodes:[node]},null,{requirements:[node]});
 const artifact={id:'asset',version:2,status:'draft',imageJobId:'img'};
 const result=patch=>evaluatePlanChecks({version:2,artifacts:[{...artifact,...patch}]},plan,[node]);
 for(const patch of [{version:1},{status:'superseded'},{imageJobId:'other'},{imageJobId:null,taskId:'main'}]){
  assert.equal(result(patch).failures.length,1);
 }
 assert.deepEqual(result({}).failures,[]);
});

test('planner checks use only the actual dependency branch and keep human review explicit',()=>{
 const read={id:'read',capability:'research.compare',dependsOn:[],investigation:{observations:[
  {url:'https://example.com/a'},{url:'https://example.com/a'}
 ]}};
 const other={id:'other',capability:'evidence.collect',dependsOn:[],web:{results:[{url:'https://example.com/b'}]}};
 const decide={id:'decide',capability:'analysis.reason',dependsOn:['read']};
 const nodes=[read,other,decide];
 const checks=['sources','human_review','execute-tool'].map(kind=>({kind,capability:'analysis.reason',minimum:2,label:'核对独立来源'}));
 const plan=attachAcceptanceChecks({nodes},{checks},{requirements:[]});
 assert.equal(plan.checks.length,2);
 const result=evaluatePlanChecks({artifacts:[]},plan,nodes);
 assert.match(result.notes.join('\n'),/1 个来源/);
 assert.match(result.notes.join('\n'),/人工核对/);
 read.investigation.observations.push({url:'https://example.com/new'});
 assert.equal(evaluatePlanChecks({artifacts:[]},plan,nodes).notes.length,1);
});

test('a comparison preserves sourced material after an unavailable model or an unknown citation',async()=>{
 const row={id:'known',kind:'knowledge',text:'A 方案支持字段权限。',source:'甲方案手册'};
 const goal={text:'比较甲乙的权限',flow:{model:{id:'configured'},plan:{contract:{decision:{criteria:['权限']}}}}};
 const run=(observations,modelCall)=>analyzeDecision({goal,node:{title:'比较'},input:{research:{observations,gaps:['乙方案的权限说明']}},modelCall});
 for(const call of [async()=>{throw Error('服务不可用');},async()=>({message:{content:'{"conclusion":"全选乙","citations":["nonexistent"]}'}})]){
  const result=await run([row],call);
  assert.equal(result.status,'succeeded');
  assert.match(result.artifacts[0].body,/甲方案手册/);
  assert.doesNotMatch(result.artifacts[0].body,/全选乙/);
 }
 assert.equal((await run([],null)).status,'needs_input');
});

test('repeated retrieval of one document and category-only matches cannot meet comparison requirements',()=>{
 const document={documentId:'one',source:'月度汇总'};
 const study={id:'study',capability:'research.compare',dependsOn:[],
  recall:{hits:[document]},investigation:{observations:['A','B'].map(candidateSku=>({...document,scope:'category',candidateSku}))}};
 const checks=['sources','comparison'].map(kind=>({kind,capability:study.capability,minimum:2,label:'比较独立依据'}));
 const plan=attachAcceptanceChecks({nodes:[study]},{checks},{requirements:[]});
 const {notes}=evaluatePlanChecks({artifacts:[]},plan,[study]);
 assert.match(notes.join('\n'),/1 个来源/);
 assert.match(notes.join('\n'),/尚缺两个/);
});
