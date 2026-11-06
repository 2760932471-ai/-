import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createPlatform} from '../src/platform.js';
import {pullSource} from '../src/sources-transport.js';
import {validateMaterial,validateSource,sourceURL} from '../src/sources.js';
const make=async options=>{const dir=await mkdtemp(path.join(os.tmpdir(),'sources-'));return {dir,p:await createPlatform(dir,options)};};
const doc={sourceId:'source-knowledge',title:'品牌文案规范',sku:'',type:'document',body:'商品材质以核验报告为准，不能宣称永久不漏。',url:'',rights:'reference',rightsNote:'内部审核规范',expiresAt:''};
const supplier={sourceId:'source-supplier',title:'角阀商品图',sku:'SKU-A',type:'image',body:'侧面实拍',url:'https://detail.1688.com/offer/123.html',imageUrl:'https://images.example.com/a.jpg',rights:'authorized',rightsNote:'供应商授权书 A，仅限本店',expiresAt:''};
const create=p=>p.create({requestId:'sources-goal-001',text:'准备角阀品牌文案和商品素材交付',kind:'listing',employeeIds:['employee-coordination'],scope:{store:'测试店',sku:'SKU-A',product:'角阀'}});
const approve=(p,m)=>p.sources.review(m.id,{revision:m.revision,status:'approved',confirmed:true,note:'已核对商品型号与使用依据'});
const attach=(p,g,items)=>p.action(g.id,{kind:'references',expectedVersion:g.version,confirmed:true,references:items.map(m=>({id:m.id,revision:m.revision}))});

test('source schema distinguishes registration, HTTP credentials, image rights and safe links',()=>{
 assert.throws(()=>sourceURL('javascript:alert(1)'),/HTTPS/);
 assert.throws(()=>sourceURL('https://user:pass@example.com'),/凭证/);
 assert.throws(()=>validateSource({name:'CMS',kind:'knowledge',mode:'http',enabled:true,endpoint:'https://api.example.com/read?token=x'}),/查询/);
 assert.throws(()=>validateSource({name:'CMS',kind:'knowledge',mode:'http',enabled:true,endpoint:'https://api.example.com/read',secretEnv:'sk-secret'}),/不要填写密钥/);
 assert.throws(()=>validateMaterial({...supplier,sku:''},{kind:'supplier'}),/SKU/);
 assert.throws(()=>validateMaterial({...supplier,rightsNote:''},{kind:'supplier'}),/依据/);
 assert.throws(()=>validateMaterial({...doc,body:''},{kind:'knowledge'}),/正文/);
});
test('review gates selection; persistent references feed actual employee input and delivery',async()=>{
 const {p,dir}=await make();const g=await create(p);const draft=await p.sources.saveMaterial(null,doc);
 await assert.rejects(()=>attach(p,g,[draft]),/尚未通过审核/);
 const m=await approve(p,draft),image=await approve(p,await p.sources.saveMaterial(null,supplier));
 const selected=await attach(p,g,[m,image]);assert.equal(selected.references.length,2);assert.equal(selected.version,g.version+1);
 await assert.rejects(()=>attach(p,g,[m]),/版本已改变/);
 await p.action(g.id,{kind:'plan',expectedVersion:selected.version});await p.pump();
 const run=p.run(p.runs().find(r=>r.goalId===g.id).id);assert.equal(run.status,'succeeded');assert.equal(run.input.references[0].body,doc.body);
 assert(run.result.artifacts[0].body.includes('供应商授权书 A'));assert(run.result.artifacts[0].body.includes(doc.title));
 const restarted=await createPlatform(dir);assert.equal(restarted.sources.view().materials.length,2);assert.equal(restarted.goals()[0].references.length,2);
});
test('unknown permissions, mismatched SKU, expiration and missing confirmation reject references',async()=>{
 const {p}=await make();const g=await create(p);
 const unknown=await p.sources.saveMaterial(null,{...supplier,rights:'unknown'});await assert.rejects(()=>approve(p,unknown),/使用范围/);
 const refOnly=await p.sources.saveMaterial(null,{...supplier,rights:'reference'});await assert.rejects(()=>approve(p,refOnly),/图片需要使用授权/);
 const expired=await p.sources.saveMaterial(null,{...doc,expiresAt:'2020-01-01'});await assert.rejects(()=>approve(p,expired),/过期/);
 const offSku=await approve(p,await p.sources.saveMaterial(null,{...supplier,sku:'SKU-B'}));await assert.rejects(()=>attach(p,g,[offSku]),/SKU 不匹配/);
 const m=await approve(p,await p.sources.saveMaterial(null,doc));await assert.rejects(()=>p.action(g.id,{kind:'references',expectedVersion:g.version,references:[m]}),/核对/);
 await assert.rejects(()=>attach(p,g,[m,m]),/不同资料/);
});
test('edited or revoked sources stop queued execution; references can be removed and plan reconfirmed',async()=>{
 const {p}=await make();const g=await create(p);const m=await approve(p,await p.sources.saveMaterial(null,doc));const attached=await attach(p,g,[m]);
 await p.action(g.id,{kind:'plan',expectedVersion:attached.version});
 await p.sources.review(m.id,{revision:m.revision,status:'rejected',note:'规范内容有冲突，撤回'});await p.pump();
 assert.equal(p.runs()[0].status,'failed');assert.equal(p.goals()[0].stage,'draft');assert.match(p.runs()[0].error,/版本已改变/);
 const cleared=await attach(p,p.goals()[0],[]);await p.action(g.id,{kind:'plan',expectedVersion:cleared.version});await p.pump();assert.equal(p.goals()[0].stage,'review');
});
test('source sync is atomic, deduplicates external IDs and resets changed material to pending',async()=>{
 let items=[{...doc,externalId:'document-1'}];const {p}=await make({sourceTransport:async()=>({schemaVersion:1,items})});
 const s=await p.sources.saveSource(null,{name:'客户 CMS',kind:'knowledge',mode:'http',enabled:true,endpoint:'https://api.example.com/materials',secretEnv:''});
 assert.equal((await p.sources.sync(s.id)).added,1);let m=await approve(p,p.sources.view().materials[0]);
 assert.equal((await p.sources.sync(s.id)).updated,0);assert.equal(p.sources.view().materials[0].status,'approved');
 items=[{...items[0],body:'新规范'}];assert.equal((await p.sources.sync(s.id)).updated,1);m=p.sources.view().materials[0];assert.equal(m.status,'pending');
 items=[{...items[0],body:'不能部分写入'},{...doc,externalId:'broken',body:''}];await assert.rejects(()=>p.sources.sync(s.id),/正文/);assert.equal(p.sources.view().materials[0].body,'新规范');
 assert.equal(p.sources.view().sources.find(x=>x.id===s.id).lastSync.status,'failed');
 items=[];assert.equal((await p.sources.sync(s.id)).received,0);assert.equal(p.sources.view().materials.length,1);
 await assert.rejects(()=>p.sources.saveMaterial(m.id,{...m,title:'不能覆盖外部资料'}),/原系统/);
});
test('sync prevents concurrent calls/config edits and sanitizes transport failures',async()=>{
 let release;const {p}=await make({sourceTransport:()=>new Promise((_,reject)=>{release=reject;})});
 const s=await p.sources.saveSource(null,{name:'供应商授权接口',kind:'supplier',mode:'http',enabled:true,endpoint:'https://api.example.com/materials',secretEnv:''});
 const run=p.sources.sync(s.id);while(!release)await new Promise(r=>setTimeout(r,1));
 await assert.rejects(()=>p.sources.sync(s.id),/正在同步/);await assert.rejects(()=>p.sources.saveSource(s.id,{...s,enabled:false}),/正在同步/);
 release(new Error('private credential must never persist'));await assert.rejects(()=>run,/同步失败/);assert(!JSON.stringify(p.sources.view()).includes('private credential'));
});
test('HTTP source adapter uses auth, bounded responses, host validation and rejects leaked secrets',async()=>{
 const previous=process.env.AGENT_ALLOWED_HOSTS;process.env.AGENT_ALLOWED_HOSTS='source.example.com';process.env.SOURCE_SECRET_TEST='test-private-value';
 const source={endpoint:'https://source.example.com/materials',kind:'knowledge',secretEnv:'SOURCE_SECRET_TEST'};const resolve=async()=>[{address:'8.8.8.8',family:4}];
 try{
  const result=await pullSource(source,{resolve,fetch:async(url,options)=>{assert.equal(options.headers.Authorization,'Bearer test-private-value');assert.equal(options.redirect,'error');assert.equal(JSON.parse(options.body).operation,'list_materials');return new Response(JSON.stringify({schemaVersion:1,items:[]}));}});assert.deepEqual(result.items,[]);
  await assert.rejects(()=>pullSource(source,{resolve,fetch:async()=>new Response('test-private-value')}),/敏感凭证/);
  await assert.rejects(()=>pullSource(source,{resolve,fetch:async()=>new Response('x'.repeat(256001))}),/256KB/);
  await assert.rejects(()=>pullSource(source,{resolve:async()=>[{address:'127.0.0.1',family:4}]}),/公网/);
 }finally{if(previous===undefined)delete process.env.AGENT_ALLOWED_HOSTS;else process.env.AGENT_ALLOWED_HOSTS=previous;delete process.env.SOURCE_SECRET_TEST;}
});
