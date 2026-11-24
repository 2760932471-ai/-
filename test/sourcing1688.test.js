import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {sourcingIntent,rankedOffers,cleanOffers} from '../public/sourcing.js';
import {publicProducts} from '../src/taskflows/offer-search.js';
import {createPlatform} from '../src/platform.js';
const text='在1688上筛选高性价比、高利润的露营灯，预计售价 89 元，单件其他成本 12 元';
const rows=[{title:'露营灯 A',url:'https://detail.1688.com/offer/123.html',price:35,repurchase:40},{title:'露营灯 B',url:'https://detail.1688.com/offer/456.html',price:42,repurchase:30}];
test('category and sourced offer ranking handle missing economic inputs',()=>{
 assert.deepEqual(sourcingIntent(text),{query:'露营灯',retail:89,expenses:12});
 assert.equal(sourcingIntent('在1688找花洒并直接作图').query,'花洒');
 assert.equal(sourcingIntent('在1688上选品').query,'');assert.equal(sourcingIntent('为水龙头做主图'),null);
 const candidates=cleanOffers([...rows,rows[0],{...rows[1],url:'https://other.example/offer/123.html'}]);assert.equal(candidates.length,2);
 const ranked=rankedOffers(candidates,sourcingIntent(text));assert.equal(ranked[0].margin,42);assert.equal(ranked[1].shortlist,false);
 assert.equal(rankedOffers(candidates,sourcingIntent('在1688找露营灯'))[0].margin,null);
 const json={'@type':'Product',name:'露营灯 A',url:rows[0].url,offers:{priceCurrency:'CNY',price:'35'}};
 assert.equal(publicProducts('<script type="application/ld+json">'+JSON.stringify(json)+'</script>')[0].price,35);
 assert.deepEqual(publicProducts('<h1>请登录</h1>'),[]);
});
for(const source of ['server','browser'])test('1688 goal to deliverable using '+source+' evidence',async t=>{
 const dir=await mkdtemp('/tmp/pick-goal-');t.after(()=>rm(dir,{recursive:true,force:true}));
 const p=await createPlatform(dir,{offerSearch:async query=>{assert.equal(query,'露营灯');return source==='server'?rows:[];}});
 const g=await p.create({executionMode:'flow',requestId:randomUUID(),text});await p.pump();await p.pump();
 const goal=()=>p.goals().find(x=>x.id===g.id);
 if(source==='browser'){
  assert.equal(goal().flow.nodes[1].status,'needs_input');
  const action={kind:'browserOffers',expectedVersion:1,query:'露营灯',rows};
  await assert.rejects(()=>p.action(g.id,{...action,query:'其他'}));await assert.rejects(()=>p.action(g.id,{...action,rows:[]}));
  const first={...action,rows:rows.slice(0,1)};
  await p.action(g.id,first);await p.action(g.id,first);assert.equal(goal().flow.nodes[1].offers.length,1);assert.match(goal().flow.nodes[1].error,/还需 1 件/);
  await p.action(g.id,{...action,rows:rows.slice(1)});await assert.rejects(()=>p.action(g.id,action));await p.pump();
 }
 await p.pump();assert.equal(goal().stage,'review');assert.match(goal().artifacts.at(-1).body,/估算单件收益 ¥42.00/);
});

const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/S1sAAAAASUVORK5CYII=';
for(const legacy of [false,true])test('selected 1688 product reaches the image provider '+(legacy?'after restoring the blocked goal':'after browser collection'),async t=>{
 const dir=await mkdtemp('/tmp/pick-image-');t.after(()=>rm(dir,{recursive:true,force:true}));
 let searches=0;const calls=[];
 const options={offerSearch:async()=>{searches++;return [];},imageReady:()=>true,imageCall:async(config,input)=>{calls.push(input);return {base64:png,width:1,height:1};}};
 let p=await createPlatform(dir,options);
 const offers=[{...rows[0],repurchase:null},{...rows[1],repurchase:30}];
 const goalText=legacy?'在1688选品露营灯，选完直接作图':text+'，选一个预计利润最高的产品做淘宝主图和详情图';
 const g=await p.create({executionMode:'flow',requestId:randomUUID(),text:goalText});
 await p.pump();await p.pump();
 await p.action(g.id,{kind:'browserOffers',expectedVersion:1,query:'露营灯',rows:offers});await p.pump();
 const current=()=>p.goals().find(x=>x.id===g.id);
 const pickRun=current().flow.nodes.find(n=>n.capability==='sourcing.1688').runId;
 if(!legacy){
  const m=await p.sources.saveMaterial(null,{sourceId:'source-knowledge',title:'候选 A 已授权实拍',sku:'123',type:'image',url:rows[0].url,imageUrl:'https://assets.example.com/123.png',body:'露营灯实拍',rights:'authorized',rightsNote:'已授权制作商品图',expiresAt:''});
  await p.sources.review(m.id,{revision:m.revision,status:'approved',note:'已核验',confirmed:true});
 }
 if(legacy){
  const data=JSON.parse(await readFile(dir+'/platform.json','utf8')),saved=data.goals.find(x=>x.id===g.id);
  saved.flow.status='blocked';const node=saved.flow.nodes.find(n=>n.capability==='image.main');
  node.status='needs_input';node.error='尚未找到有来源的候选商品记录，不能虚构在售商品图片。';node.missing=[node.error];
  await writeFile(dir+'/platform.json',JSON.stringify(data));p=await createPlatform(dir,options);
  await p.pump();
  assert.match(current().flow.nodes.find(n=>n.capability==='image.main').error,/图片服务未就绪/);
 }
 await p.images.save({revision:0,enabled:true,provider:'gemini',endpoint:'https://generativelanguage.googleapis.com/v1beta',model:'gemini-test',secretEnv:'IMAGE_SECRET_TEST'});
 if(legacy)await p.action(g.id,{kind:'retry',nodeId:'main',expectedVersion:1});
 await p.pump();const nodes=current().flow.nodes.filter(n=>n.capability.startsWith('image.'));
 const selected=legacy?offers[1]:offers[0];
 assert.equal(nodes.length,legacy?1:2);
 for(const n of nodes){assert.equal(n.status,'waiting_external');assert.equal(n.preparation.candidate.source,selected.url);}
 for(let i=0;i<5;i++){await p.images.pump();await p.pump();}
 assert.equal(current().stage,'review');assert.equal(searches,1);assert.equal(current().flow.nodes.find(n=>n.capability==='sourcing.1688').runId,pickRun);
 assert.equal(calls.length,nodes.length);
 for(const call of calls){assert.equal(call.referenceUrl,legacy?null:'https://assets.example.com/123.png');assert(call.prompt.includes(selected.title));assert(call.prompt.includes(selected.url));}
 const artifacts=current().artifacts.filter(a=>a.imageJobId);assert.equal(artifacts.length,nodes.length);
 for(const a of artifacts)assert.equal((await p.images.image(a.imageJobId)).base64,png);
});

test('restart after a failed image resumes the same plan and reports the delivered image',async t=>{
 const dir=await mkdtemp('/tmp/pick-resume-');t.after(()=>rm(dir,{recursive:true,force:true}));
 let searches=0,images=0;
 const options={offerSearch:async()=>{searches++;return rows;},imageReady:()=>true,imageCall:async()=>{
  if(++images===1)throw new Error('provider failed');
  return {base64:png,width:1,height:1};
 }};
 let p=await createPlatform(dir,options);
 await p.images.save({revision:0,enabled:true,provider:'gemini',endpoint:'https://generativelanguage.googleapis.com/v1beta',model:'gemini-test',secretEnv:'IMAGE_SECRET_TEST'});
 const goal=await p.create({executionMode:'flow',requestId:randomUUID(),text:text+'，做淘宝主图，活动名称：双十一，活动价：89元'});
 const current=()=>p.goals().find(g=>g.id===goal.id);
 const step=cap=>current().flow.nodes.find(n=>n.capability===cap);
 for(let i=0;i<6;i++){await p.pump();await p.images.pump();}
 const pickId=step('sourcing.1688').runId,previousImageJob=step('image.main').imageJobId;
 assert.equal(step('image.main').status,'failed');
 p=await createPlatform(dir,options);
 const action={kind:'retry',expectedVersion:1,nodeId:step('image.main').id,previousImageJob};
 await p.action(goal.id,action);await p.action(goal.id,action);
 for(let i=0;i<5;i++){await p.pump();await p.images.pump();}
 assert.equal(current().stage,'review');assert.equal(images,2);assert.equal(searches,1);
 assert.equal(step('sourcing.1688').runId,pickId);assert.notEqual(step('image.main').imageJobId,previousImageJob);
 const reports=current().messages.filter(m=>m.reportVersion===1);
 assert.equal(reports.length,1);assert.match(reports[0].text,/露营灯 A/);assert.match(reports[0].text,/卖点建议/);assert.match(reports[0].text,/信息带/);
 assert.equal(reports[0].links[0].url,rows[0].url);
 const image=current().artifacts.find(a=>a.id===reports[0].artifactIds[0]);
 assert.equal(image.layoutName,'活动价格主图');assert.equal((await p.images.image(image.imageJobId)).base64,png);
});

test('main image templates use only confirmed promotional copy',async()=>{
 const {mainImageLayout}=await import('../src/workforce/main-image-layout.js');
 assert.equal(mainImageLayout('采购价12元，预计售价29元').name,'白底商品展示');
 assert.equal(mainImageLayout('做主图',['接口：G1/2']).name,'卖点特写主图');
 const promotion=mainImageLayout('做主图，活动：周末特惠，活动价：29.90元，采购价：10元');
 assert.equal(promotion.name,'活动价格主图');assert.match(promotion.prompt,/¥29.90/);assert.doesNotMatch(promotion.prompt,/10元/);
});

test('replanning an unchanged blocked goal reuses saved sourcing evidence',async t=>{
 const dir=await mkdtemp('/tmp/pick-checkpoint-');t.after(()=>rm(dir,{recursive:true,force:true}));
 let calls=0;const p=await createPlatform(dir,{offerSearch:async()=>{calls++;return rows;}});
 const goal=await p.create({executionMode:'flow',requestId:randomUUID(),text:text+'，做主图'});
 for(let i=0;i<5;i++)await p.pump();
 await p.action(goal.id,{kind:'replan',expectedVersion:1});
 for(let i=0;i<5;i++)await p.pump();
 const current=p.goals().find(g=>g.id===goal.id);
 assert.equal(current.version,2);assert.equal(calls,1);assert.equal(current.flow.nodes.find(n=>n.capability==='sourcing.1688').offers.length,2);
 assert.equal(current.flow.nodes.find(n=>n.capability==='image.main').preparation.candidate.source,rows[0].url);
});

test('a restored visible 1688 goal opens its search and receives offers without a click',async t=>{
 const {createPickBrowser}=await import('../public/pick-browser.js');
 const values=new Map(),commands=[],writes=[];let check;
 const original=new Map();
 function substitute(name,value){
  original.set(name,Object.getOwnPropertyDescriptor(globalThis,name));
  Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});
 }
 t.after(()=>{for(const [name,descriptor] of original){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}});
 substitute('sessionStorage',{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)});
 substitute('document',{hidden:false,addEventListener(){}});
 substitute('window',{addEventListener(){}});
 substitute('setInterval',fn=>{check=fn;});
 substitute('chrome',{runtime:{sendMessage:(id,cmd,reply)=>{commands.push(cmd);reply(cmd.op==='pick1688'?{rows,phase:'complete'}:{value:true});}}});
 const goal={id:'restored-goal',version:3,text,mode:'flow',flow:{nodes:[{capability:'sourcing.1688',status:'needs_input'}]}};
 createPickBrowser({state:{goal:goal.id,goals:[goal]},act:async(...args)=>writes.push(args),esc:String,render(){}});
 check();check();await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(commands.map(cmd=>cmd.action||cmd.op),['openSearch','pick1688']);
 assert.equal(commands[0].key,commands[1].key);assert.equal(commands[0].query,'露营灯');
 assert.deepEqual(writes,[['browserOffers',{expectedVersion:3,query:'露营灯',rows},goal.id]]);
});
