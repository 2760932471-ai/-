import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {createPlatform} from '../src/platform.js';
import {randomUUID} from 'node:crypto';

const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/S1sAAAAASUVORK5CYII=';
const offers=['101','202'].map((id,i)=>({title:'露营灯 '+id,price:10+i,url:'https://detail.1688.com/offer/'+id+'.html',terms:'元/件'}));
const create=(p,text)=>p.create({requestId:randomUUID(),executionMode:'flow',text});
const state=(p,g)=>p.goals().find(row=>row.id===g.id);
const step=(goal,capability)=>goal.flow.nodes.find(n=>n.capability===capability);
async function drive(p,g){
 for(let i=0;i<15&&state(p,g).stage!=='review';i++){await p.pump();await p.images.pump();}
 const current=state(p,g);
 assert.equal(current.stage,'review',JSON.stringify(current.flow.nodes.map(n=>[n.capability,n.error])));
 return current;
}
async function setup(t){
 const dir=await mkdtemp('/tmp/flow-checkpoint-');
 t.after(()=>rm(dir,{recursive:true,force:true}));
 let searches=0;const imageRequests=[];
 const options={offerSearch:async()=>{searches++;return offers;},offerDetail:async sku=>({sku,photo:'https://cbu01.alicdn.com/img/ibank/'+sku+'.jpg',facts:['颜色：白色']}),
  photoDownload:async()=>png,imageReady:()=>true,imageCall:async(_,request)=>{imageRequests.push(request);return {base64:png,width:1,height:1};}};
 const p=await createPlatform(dir,options);
 await p.images.save({revision:0,enabled:true,provider:'codex_local'});
 return {dir,p,options,imageRequests,searches:()=>searches};
}

test('changing SKU economics preserves evidence, only replaces product assets when the winner changes',async t=>{
 const {p,imageRequests,searches}=await setup(t);
 const g=await create(p,'在1688找露营灯，比较单件利润，其他成本2元，做淘宝主图和卖点');
 const initial=await drive(p,g);
 assert.equal(step(initial,'sourcing.1688').selection.sku,'101');
 const evidence=step(initial,'evidence.collect').runId;
 const firstImage=step(initial,'image.main').imageJobId;
 async function update(saleA,saleB){
  await p.action(g.id,{kind:'inputs',expectedVersion:1,data:{commerce:{source:'店铺订单导出',period:'11 月',csv:'sku,netSales,units\n101,'+saleA+',1\n202,'+saleB+',1'}}});
  return drive(p,g);
 }
 const same=await update(30,30);
 assert.equal(step(same,'image.main').imageJobId,firstImage);
 const changed=await update(30,60);
 assert.equal(step(changed,'sourcing.profit').selection.margin,47);
 assert.equal(step(changed,'sourcing.profit').selection.sku,'202');
 assert.equal(step(changed,'copy.selling_points').preparation.candidate.sku,'202');
 assert.equal(step(changed,'image.main').preparation.candidate.sku,'202');
 assert.equal(step(changed,'evidence.collect').runId,evidence);
 assert(changed.flow.calls>same.flow.calls&&same.flow.calls>initial.flow.calls);
 assert.equal(searches(),1);assert.equal(imageRequests.length,2);
 assert.equal(changed.artifacts.find(a=>a.imageJobId===firstImage).status,'superseded');
 const report=changed.messages.at(-1);assert.match(report.text,/露营灯 202/);
 assert(report.artifactIds.every(id=>changed.artifacts.some(a=>a.id===id&&a.status==='draft')));
});

test('unfinished legacy plan recovers the missing profit deliverable without buying its matching image twice',async t=>{
 const {dir,p,options,imageRequests,searches}=await setup(t);
 const g=await create(p,'在1688找露营灯，比较单件利润，预计售价 50 元，其他成本 3 元，做淘宝主图');
 const v=await drive(p,g),oldImage=step(v,'image.main').imageJobId;
 const path=dir+'/platform.json',d=JSON.parse(await readFile(path,'utf8')),saved=d.goals.find(row=>row.id===g.id);
 const profit=step(saved,'sourcing.profit'),pick=step(saved,'sourcing.1688');
 delete saved.flow.plan.contract;delete pick.selection;
 for(const nodes of [saved.flow.nodes,saved.flow.plan.nodes]){
  nodes.splice(nodes.findIndex(n=>n.id===profit.id),1);
  for(const node of nodes)node.dependsOn=node.dependsOn.map(id=>id===profit.id?pick.id:id);
 }
 saved.artifacts=saved.artifacts.filter(a=>!profit.artifactIds.includes(a.id));
 await writeFile(path,JSON.stringify(d));const restored=await createPlatform(dir,options);
 await assert.rejects(restored.action(g.id,{kind:'complete',expectedVersion:1}),/缺少/);
 await restored.pump();const current=await drive(restored,g);
 assert.equal(step(current,'sourcing.profit').selection.margin,37);
 assert.equal(step(current,'image.main').imageJobId,oldImage);
 assert.equal(searches(),1);assert.equal(imageRequests.length,1);
 await restored.action(g.id,{kind:'complete',expectedVersion:1});
});

test('purchase constraints recheck supplier details and resume on a richer quote at the same price',async t=>{
 const dir=await mkdtemp('/tmp/flow-moq-');t.after(()=>rm(dir,{recursive:true,force:true}));
 const checks=[];
 const p=await createPlatform(dir,{offerSearch:async()=>offers,offerDetail:async sku=>{checks.push(sku);return null;}});
 const g=await create(p,'在1688找露营灯，起订量最多 10 件');
 for(let i=0;i<4;i++)await p.pump();
 assert.deepEqual([...new Set(checks)].sort(),['101','202']);
 const pick=step(state(p,g),'sourcing.1688');assert.equal(pick.status,'needs_input');
 await p.action(g.id,{kind:'browserOffers',expectedVersion:1,query:'露营灯',rows:[{...offers[1],terms:'元/件，3件起订'}]});
 const finished=await drive(p,g);assert.equal(step(finished,'sourcing.1688').selection.sku,'202');
});

test('acceptance detects an image from another SKU and reruns only that branch after restart',async t=>{
 const {dir,p,options,imageRequests,searches}=await setup(t);
 const goal=await create(p,'在1688找露营灯，比较单件利润，预计售价 50 元，其他成本 3 元，做淘宝主图和卖点');
 const ready=await drive(p,goal),main=step(ready,'image.main'),copy=step(ready,'copy.selling_points');
 const path=dir+'/platform.json',data=JSON.parse(await readFile(path,'utf8'));
 const job=data.imageJobs.find(row=>row.id===main.imageJobId);
 job.contentEvidence.candidate.sku='202';
 await writeFile(path,JSON.stringify(data));
 const restored=await createPlatform(dir,options);
 await assert.rejects(restored.action(goal.id,{kind:'complete',expectedVersion:1}),/图片对应/);
 await restored.pump();
 const healed=await drive(restored,goal);
 assert.notEqual(step(healed,'image.main').imageJobId,main.imageJobId);
 assert.equal(step(healed,'copy.selling_points').runId,copy.runId);
 assert.equal(searches(),1);assert.equal(imageRequests.length,2);
 await restored.action(goal.id,{kind:'complete',expectedVersion:1});
});

test('a missing external job leaves the image at an explicit checkpoint until the original request and costs are confirmed',async t=>{
 const {dir,p,options,imageRequests}=await setup(t);
 const goal=await create(p,'在1688找露营灯，做淘宝主图');
 for(let i=0;i<6&&step(state(p,goal),'image.main')?.status!=='waiting_external';i++)await p.pump();
 const waiting=step(state(p,goal),'image.main');assert.equal(waiting.status,'waiting_external');
 const path=dir+'/platform.json',data=JSON.parse(await readFile(path,'utf8'));
 data.imageJobs=data.imageJobs.filter(job=>job.id!==waiting.imageJobId);await writeFile(path,JSON.stringify(data));
 const restored=await createPlatform(dir,options);await restored.pump();await restored.pump();
 const blocked=step(state(restored,goal),'image.main');
 assert.equal(blocked.status,'failed');assert.match(blocked.error,/任务记录缺失/);
 const retry={kind:'retry',expectedVersion:1,nodeId:blocked.id,previousImageJob:waiting.imageJobId};
 await assert.rejects(restored.action(goal.id,retry),/费用/);
 await assert.rejects(restored.action(goal.id,{...retry,previousImageJob:'different',confirmUnknown:true}),/当前图片断点/);
 assert.equal(imageRequests.length,0);
 await restored.action(goal.id,{...retry,confirmUnknown:true});await drive(restored,goal);
 assert.equal(imageRequests.length,1);
});

test('a research-backed comparison resumes from the evidence gap after a document is added, without a chat model',async t=>{
 const {p}=await setup(t);
 const goal=await create(p,'只使用知识库比较自建和托管 CRM 方案，关注迁移成本。');
 for(let i=0;i<6;i++)await p.pump();
 const blocked=state(p,goal),analysis=step(blocked,'analysis.reason');
 assert.equal(analysis.status,'needs_input');
 assert.match(analysis.error,/依据|来源/);
 const firstRun=step(blocked,'evidence.collect').runId;
 const document=await p.knowledge.saveDocument(null,{baseId:'kb-default',title:'CRM 迁移成本实测',source:'CRM 迁移实施记录',sku:'',
  body:'自建 CRM 需要单独迁移历史附件；托管 CRM 方案已包含导入服务。试点时配置迁移范围。',enabled:true,confirmed:true,size:700,overlap:100});
 await p.action(goal.id,{kind:'retry',expectedVersion:1,nodeId:analysis.id});
 const done=await drive(p,goal);
 const research=step(done,'research.compare');
 assert(research.recall.hits.some(hit=>hit.documentId===document.id));
 assert(done.messages.at(-1).text.includes('CRM'));
 assert.equal(step(done,'evidence.collect').runId,firstRun);
 await p.knowledge.deleteDocument(document.id,{revision:document.revision,confirmed:true});
 await assert.rejects(p.action(goal.id,{kind:'complete',expectedVersion:1}),/不存在|更新|停用/);
});

test('a v1 profit and photo plan adds comparison research before acceptance and reuses a matching paid image',async t=>{
 const {dir,p,options,imageRequests}=await setup(t);
 const goal=await create(p,'在1688找露营灯，比较单件利润，单件其他成本 2 元，交付淘宝主图。');
 const ready=await drive(p,goal),research=step(ready,'research.compare'),image=step(ready,'image.main');
 const path=dir+'/platform.json',data=JSON.parse(await readFile(path,'utf8')),saved=data.goals.find(row=>row.id===goal.id);
 const pick=step(saved,'sourcing.1688');
 for(const nodes of [saved.flow.nodes,saved.flow.plan.nodes]){
  nodes.splice(nodes.findIndex(n=>n.id===research.id),1);
  for(const n of nodes)n.dependsOn=n.dependsOn.map(id=>id===research.id?pick.id:id);
 }
 saved.flow.plan.contract.version=1;
 saved.flow.plan.contract.requirements=saved.flow.plan.contract.requirements.filter(r=>r.capability!=='research.compare');
 saved.artifacts=saved.artifacts.filter(file=>!research.artifactIds.includes(file.id));
 await writeFile(path,JSON.stringify(data));
 const restored=await createPlatform(dir,options);
 await assert.rejects(restored.action(goal.id,{kind:'complete',expectedVersion:1}),/缺少/);
 await restored.pump();
 const current=await drive(restored,goal);
 assert.equal(step(current,'research.compare').selection.sku,pick.selection.sku);
 assert.equal(step(current,'image.main').imageJobId,image.imageJobId);
 assert.equal(imageRequests.length,1);
 await restored.action(goal.id,{kind:'complete',expectedVersion:1});
});
