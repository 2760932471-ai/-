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
 for(let i=0;i<6&&goal().stage!=='review';i++)await p.pump();
 assert.equal(goal().stage,'review');assert.match(goal().artifacts.at(-1).body,/估算单件收益 ¥42.00/);
});

const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/S1sAAAAASUVORK5CYII=';
for(const legacy of [false,true])test('selected 1688 product reaches the image provider '+(legacy?'after restoring the blocked goal':'after browser collection'),async t=>{
 const dir=await mkdtemp('/tmp/pick-image-');t.after(()=>rm(dir,{recursive:true,force:true}));
 let searches=0;const calls=[];
 const options={offerDetail:async()=>null,offerSearch:async()=>{searches++;return [];},photoDownload:async()=>png,imageReady:()=>true,imageCall:async(config,input)=>{calls.push(input);return {base64:png,width:1,height:1};}};
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
 for(let i=0;i<4&&current().flow.nodes.some(n=>n.capability.startsWith('image.')&&n.status==='pending');i++)await p.pump();
 const nodes=current().flow.nodes.filter(n=>n.capability.startsWith('image.'));
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
 const options={offerDetail:async sku=>({sku,facts:['颜色：白色'],photo:'https://cbu01.alicdn.com/img/ibank/lamp.jpg'}),offerSearch:async()=>{searches++;return rows;},photoDownload:async()=>png,imageReady:()=>true,imageCall:async()=>{
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
 let calls=0;const p=await createPlatform(dir,{offerDetail:async()=>null,offerSearch:async()=>{calls++;return rows;}});
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

test('selected 1688 eyewear details feed both the listing image and selling copy',async t=>{
 const dir=await mkdtemp('/tmp/eyewear-');t.after(()=>rm(dir,{recursive:true,force:true}));
 const photo='https://cbu01.alicdn.com/img/ibank/glasses.jpg',requests=[],details=[];
 const offers=rows.map((r,i)=>({...r,title:'飞行员太阳镜'+String(i).repeat(85)}));
 const p=await createPlatform(dir,{offerSearch:async()=>offers,offerDetail:async sku=>{
  details.push(sku);return {sku,photo,facts:['镜架颜色：黑色','镜框形状：飞行员框','赠送：免费退']};
 },photoDownload:async()=>png,imageReady:()=>true,imageCall:async(config,input)=>{requests.push(input);return {base64:png,width:1,height:1};}});
 await p.images.save({revision:0,enabled:true,provider:'codex_local'});
 const g=await p.create({executionMode:'flow',requestId:randomUUID(),text:'在1688选品太阳镜，选一款做上架淘宝的主图，给我卖点文案'});
 for(let i=0;i<6;i++){await p.pump();await p.images.pump();}
 const goal=p.goals().find(x=>x.id===g.id);
 assert.deepEqual(details,['123']);assert.equal(goal.stage,'review');
 assert.equal(requests.length,1);assert.equal(requests[0].referenceUrl,photo);
 assert.match(requests[0].prompt,/基于所附白底图/);assert.match(requests[0].prompt,/黑色/);
 const copy=goal.artifacts.find(a=>a.taskId==='selling');assert.match(copy.body,/黑色镜架/);assert.match(copy.body,/offer\/123.html/);assert.doesNotMatch(copy.body,/免费退/);
 assert.match(goal.artifacts.find(a=>a.imageJobId).evidence,/1688 商品原图/);
 assert.match(goal.messages.at(-1).text,/黑色/);
});

test('missing listing photo never submits a concept; a later detail read resumes without reselection',async t=>{
 const dir=await mkdtemp('/tmp/eyewear-resume-');t.after(()=>rm(dir,{recursive:true,force:true}));
 let calls=0;const p=await createPlatform(dir,{offerSearch:async()=>rows,offerDetail:async()=>null,photoDownload:async()=>png,imageReady:()=>true,imageCall:async()=>{calls++;return {base64:png,width:1,height:1};}});
 await p.images.save({provider:'codex_local',enabled:true,revision:0});
 const g=await p.create({executionMode:'flow',requestId:randomUUID(),text:'在1688找露营灯，做淘宝主图和卖点文案'});
 for(let i=0;i<5;i++){await p.pump();await p.images.pump();}
 const goal=()=>p.goals().find(x=>x.id===g.id);
 assert.equal(calls,0);const pick=goal().flow.nodes.find(n=>n.id==='pick1688').runId;
 await assert.rejects(()=>p.action(g.id,{kind:'offerDetail',expectedVersion:1,detail:{sku:'456',photo:'https://cbu01.alicdn.com/img/ibank/wrong.jpg'}}));
 await p.action(g.id,{kind:'offerDetail',expectedVersion:1,detail:{sku:'123',facts:['颜色：白色'],photo:'https://cbu01.alicdn.com/img/ibank/123.jpg'}});
 for(let i=0;i<5;i++){await p.pump();await p.images.pump();}
 assert.equal(goal().stage,'review');assert.equal(calls,1);assert.equal(goal().flow.nodes.find(n=>n.id==='pick1688').runId,pick);
});

test('old selling-point blocker repairs itself without resubmitting a delivered main image',async t=>{
 const dir=await mkdtemp('/tmp/offer-copy-restore-');t.after(()=>rm(dir,{recursive:true,force:true}));
 let imageCount=0;const options={offerSearch:async()=>rows,offerDetail:async sku=>({sku,photo:'https://cbu01.alicdn.com/img/ibank/item.jpg',facts:['颜色：白色']}),photoDownload:async()=>png,imageReady:()=>true,imageCall:async()=>{imageCount++;return {base64:png,width:1,height:1};}};
 let p=await createPlatform(dir,options);await p.images.save({enabled:true,provider:'codex_local',revision:0});
 const g=await p.create({requestId:randomUUID(),executionMode:'flow',text:'在1688找露营灯，做淘宝主图，给我卖点'});
 for(let i=0;i<6;i++){await p.pump();await p.images.pump();}
 const data=JSON.parse(await readFile(dir+'/platform.json','utf8')),goal=data.goals.find(v=>v.id===g.id);
 const node=goal.flow.nodes.find(n=>n.id==='selling'),summary=goal.flow.nodes.at(-1);
 goal.flow.status='blocked';goal.stage='draft';
 Object.assign(node,{status:'needs_input',error:'内容草稿尚未生成。',missing:['商品名称必填，最多 80 字'],artifactIds:[]});delete node.preparation;
 Object.assign(summary,{status:'pending',artifactIds:[]});
 const pick=goal.flow.nodes.find(n=>n.id==='pick1688');delete pick.detailChecked;for(const o of pick.offers){delete o.facts;delete o.photo;}
 goal.artifacts=goal.artifacts.filter(a=>a.taskId!=='selling'&&a.taskId!==summary.id);goal.messages=goal.messages.filter(m=>!m.reportVersion);
 await writeFile(dir+'/platform.json',JSON.stringify(data));p=await createPlatform(dir,options);
 for(let i=0;i<4;i++){await p.pump();await p.images.pump();}
 const restored=p.goals().find(v=>v.id===g.id);
 assert.equal(restored.stage,'review');assert.equal(restored.version,1);assert.equal(imageCount,1);
 assert.match(restored.artifacts.find(a=>a.taskId==='selling').body,/白色/);assert.equal(restored.flow.nodes.find(n=>n.id==='pick1688').runId,pick.runId);
});

test('replace a delivered concept with a reference main image in the same plan',async t=>{
 const dir=await mkdtemp('/tmp/replace-concept-');t.after(()=>rm(dir,{recursive:true,force:true}));
 let searches=0;const images=[];
 const p=await createPlatform(dir,{offerSearch:async()=>{searches++;return rows;},offerDetail:async()=>null,photoDownload:async()=>png,imageReady:()=>true,imageCall:async(c,i)=>{images.push(i);return {base64:png,width:1,height:1};}});
 await p.images.save({provider:'codex_local',enabled:true,revision:0});
 const g=await p.create({executionMode:'flow',requestId:randomUUID(),text:'在1688找露营灯，做一张主图'});
 const goal=()=>p.goals().find(x=>x.id===g.id);
 async function pump(){for(let i=0;i<5;i++){await p.pump();await p.images.pump();}}
 await pump();
 const first=goal().flow.nodes.find(n=>n.id==='main').imageJobId;
 await p.action(g.id,{kind:'remakeMain',previousImageJob:first,expectedVersion:1});
 await pump();assert.equal(images.length,1);assert.equal(goal().flow.nodes.find(n=>n.id==='main').status,'needs_input');
 await p.action(g.id,{kind:'offerDetail',expectedVersion:1,detail:{sku:'123',photo:'https://cbu01.alicdn.com/img/ibank/light.jpg',facts:['颜色：白色']}});
 await pump();assert.equal(images.length,2);assert.equal(searches,1);assert.equal(goal().stage,'review');
 assert.equal(goal().artifacts.find(a=>a.imageJobId===first).status,'superseded');assert.equal(images[1].referenceUrl,'https://cbu01.alicdn.com/img/ibank/light.jpg');
 assert.deepEqual(goal().messages.at(-1).artifactIds,goal().flow.nodes.find(n=>n.id==='main').artifactIds);
});

test('a restored missing-photo step downloads an alternate image and supplies its saved bytes after restart',async t=>{
 const dir=await mkdtemp('/tmp/saved-supplier-photo-');t.after(()=>rm(dir,{recursive:true,force:true}));
 const bad='https://cbu01.alicdn.com/img/ibank/unavailable.jpg',good='https://img.alicdn.com/imgextra/i3/123/real.png';
 let available=false,searches=0;const downloads=[],calls=[];
 const options={offerSearch:async()=>{searches++;return rows;},offerDetail:async sku=>available?{sku,photo:bad,photos:[good]}:null,
  photoDownload:async url=>{downloads.push(url);if(url===good)return png;throw Error('unavailable');},
  imageReady:()=>true,imageCall:async(c,i)=>{calls.push(i);return {base64:png,width:1,height:1};}};
 let p=await createPlatform(dir,options);
 await p.images.save({provider:'codex_local',enabled:true,revision:0});
 const g=await p.create({requestId:randomUUID(),executionMode:'flow',text:'在1688找露营灯，做淘宝主图'});
 for(let i=0;i<4;i++)await p.pump();
 // Shape saved by 0.24.0, after the detail lookup returned no photograph.
 const data=JSON.parse(await readFile(dir+'/platform.json','utf8')),goal=data.goals.find(x=>x.id===g.id);
 const node=goal.flow.nodes.find(n=>n.id==='main');assert.equal(node.status,'needs_input');
 delete node.photoAttempts;delete node.nextPhotoTry;
 await writeFile(dir+'/platform.json',JSON.stringify(data));available=true;
 p=await createPlatform(dir,options);await p.pump();
 assert.deepEqual(downloads,[bad,good]);assert.equal(calls.length,0);
 p=await createPlatform(dir,options);for(let i=0;i<4;i++){await p.images.pump();await p.pump();}
 assert.equal(calls.length,1);assert.equal(calls[0].upload.buffer.toString('base64'),png);assert.equal(calls[0].referenceUrl,good);assert.equal(searches,1);
 assert.equal(p.goals().find(x=>x.id===g.id).stage,'review');
});

test('a browser download resumes a blocked goal even when the server cannot reach the CDN',async t=>{
 const dir=await mkdtemp('/tmp/browser-supplier-photo-');t.after(()=>rm(dir,{recursive:true,force:true}));
 let calls=0;const photo='https://cbu01.alicdn.com/img/ibank/glasses.png';
 const p=await createPlatform(dir,{offerSearch:async()=>rows,offerDetail:async()=>null,photoDownload:async()=>{throw Error('CDN unavailable');},imageReady:()=>true,imageCall:async(c,i)=>{assert.equal(i.upload.buffer.toString('base64'),png);calls++;return {base64:png,width:1,height:1};}});
 await p.images.save({provider:'codex_local',enabled:true,revision:0});
 const g=await p.create({requestId:randomUUID(),executionMode:'flow',text:'在1688找露营灯，做淘宝主图'});
 for(let i=0;i<4;i++)await p.pump();
 const action={kind:'offerDetail',expectedVersion:1,detail:{sku:'123',photo,base64:png}};
 await assert.rejects(p.action(g.id,{...action,detail:{...action.detail,sku:'456'}}));
 await p.action(g.id,action);
 await assert.rejects(p.action(g.id,action));
 for(let i=0;i<4;i++){await p.pump();await p.images.pump();}
 assert.equal(calls,1);assert.equal(p.goals().find(x=>x.id===g.id).stage,'review');
 assert(!JSON.stringify(p.goals()).includes(png));
});

test('detail hydration recognizes the selected offer white background before gallery images',async()=>{
 const {publicOfferDetail}=await import('../src/taskflows/offer-search.js');
 const hero='https://gw.alicdn.com/bao/uploaded/i3/123/white.jpg',gallery='https://cbu01.alicdn.com/img/ibank/other.webp';
 const data={offer:{offerId:123,imageList:[{originalImageURI:'img/ibank/other.webp'}],whiteBgImageUrl:hero},recommendations:[{offerId:456,mainImage:'https://cbu01.alicdn.com/img/ibank/wrong.jpg'}]};
 const detail=publicOfferDetail('<script>window.__DATA__ = '+JSON.stringify(data)+';</script>','123');
 assert.deepEqual(detail.photos,[hero,gallery]);
});

test('chat image revisions reuse the selected product and recover the previous misrouted analysis',async t=>{
 const dir=await mkdtemp('/tmp/flow-image-edit-');t.after(()=>rm(dir,{recursive:true,force:true}));
 const edit='图有点丑，再改一下呗，底下也别写什么重量：50g了，那根本不重要，可以换成：双十二优惠 买一赠一';
 const requests=[];let searches=0;
 const options={offerSearch:async()=>{searches++;return rows;},offerDetail:async sku=>({sku,photo:'https://cbu01.alicdn.com/img/ibank/cat.png',facts:['重量：50g']}),
  photoDownload:async()=>png,imageReady:()=>true,imageCall:async(_,input)=>{requests.push(input);return {base64:png,width:1,height:1};}};
 let p=await createPlatform(dir,options);
 await p.images.save({revision:0,enabled:true,provider:'codex_local'});
 const g=await p.create({executionMode:'flow',requestId:randomUUID(),text:'在1688选品猫粮，给我淘宝主图和卖点'});
 const finish=async()=>{for(let i=0;i<12;i++){await p.pump();await p.images.pump();}};
 await finish();assert.equal(requests.length,1);
 const before=p.goals()[0],pick=before.flow.nodes.find(n=>n.capability==='sourcing.1688');
 await p.action(g.id,{kind:'message',text:'为什么要改图？'});await finish();assert.equal(requests.length,1);
 await p.action(g.id,{kind:'message',text:edit});await finish();
 assert.equal(requests.length,2);assert.match(requests[1].prompt,/活动名称「双十二优惠 买一赠一」/);
 assert(!requests[1].prompt.includes('商品特点「重量'));assert.deepEqual(requests[1].upload,requests[0].upload);
 assert.deepEqual(p.goals()[0].flow.nodes.find(n=>n.id===pick.id).runId,pick.runId);
 assert.equal(p.goals()[0].stage,'review');assert.equal(searches,1);
 const file=dir+'/platform.json',data=JSON.parse(await readFile(file)),old=data.goals[0];
 old.text=edit;old.messages.push({role:'human',intent:'change',text:edit});old.version++;
 old.flow={...old.flow,version:old.version,status:'blocked',history:[{version:before.version,nodes:before.flow.nodes,plan:before.flow.plan}],nodes:[{id:'analysis',capability:'analysis.reason',status:'needs_input'}]};
 await writeFile(file,JSON.stringify(data));p=await createPlatform(dir,options);await finish();
 assert.equal(requests.length,3);assert.equal(searches,1);assert.equal(p.goals()[0].text,g.text);assert.equal(p.goals()[0].stage,'review');
});
