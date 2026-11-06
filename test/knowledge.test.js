import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createPlatform} from '../src/platform.js';
import {chunkText,bm25,cosine,validateVectors} from '../src/knowledge-retrieval.js';
import {embedTexts} from '../src/knowledge-embedding.js';
const make=async options=>{const dir=await mkdtemp(path.join(os.tmpdir(),'knowledge-'));return {p:await createPlatform(dir,options),dir};};
const doc={baseId:'kb-default',title:'角阀售后政策',source:'测试售后部门政策 v1',body:'角阀漏水售后：请提供订单编号、安装环境说明和漏水视频。确认质量问题后换货。',sku:'',size:300,overlap:40,enabled:true,confirmed:true};
const fixtureConfig=()=>({configured:true,model:'fixture-vector',signature:'fixture|v1'});
const fixtureEmbed=async texts=>texts.map(t=>t.includes('漏水')?[1,0]:[0,1]);
const goalInput={requestId:'knowledge-goal-001',text:'整理角阀漏水售后所需凭证',kind:'listing',employeeIds:['employee-coordination']};

test('chunking preserves coverage, offsets, overlap, paragraph boundaries and validates bounds',()=>{
 const text=('第一段商品说明。'.repeat(32)+'\n\n第二段售后规范。'.repeat(20)+'🙂').repeat(2);
 const split=chunkText(text,{size:300,overlap:50});assert(split.chunks.length>3);assert.equal(split.chunks[0].start,0);assert.equal(split.chunks.at(-1).end,text.length);
 split.chunks.forEach((c,i)=>{assert.equal(c.text,text.slice(c.start,c.end));assert(c.text.length<=300);if(i){assert(c.start>split.chunks[i-1].start);assert(c.start<=split.chunks[i-1].end);}assert(!/^[\uDC00-\uDFFF]/.test(c.text));});
 assert.throws(()=>chunkText(''),/正文/);assert.throws(()=>chunkText('正文',{size:100,overlap:0}),/切片长度/);assert.throws(()=>chunkText('正文',{size:300,overlap:160}),/重叠/);
 assert.throws(()=>chunkText('二进制\0'),/二进制/);
});
test('BM25 ranks relevant Chinese and SKU chunks, and returns no fabricated zero-score matches',()=>{
 const rows=[{id:'a',title:'售后',text:'角阀漏水需要订单编号和视频 JF-001'},{id:'b',title:'品牌',text:'品牌主色为蓝色，图片使用白色背景'},{id:'c',title:'库存',text:'角阀库存统计'}];
 assert.equal(bm25('漏水需要什么',rows)[0].id,'a');assert.equal(bm25('JF-001',rows)[0].id,'a');assert.deepEqual(bm25('unrelated-jargon',rows),[]);
 assert.equal(cosine([1,0],[1,0]),1);assert.equal(cosine([1,0],[0,1]),0);assert.throws(()=>validateVectors([[0,0]],1),/零向量/);
});
test('documents persist as real slices; scope, SKU, disabled content and stale revisions are enforced',async()=>{
 const {p,dir}=await make();const saved=await p.knowledge.saveDocument(null,doc);const detail=p.knowledge.document(saved.id);assert.equal(detail.chunks[0].text,doc.body);
 const other=await p.knowledge.saveBase(null,{name:'另一知识库',description:'',enabled:true});await p.knowledge.saveDocument(null,{...doc,baseId:other.id,title:'隔离内容'});await p.knowledge.saveDocument(null,{...doc,sku:'OTHER',title:'其他型号'});
 const hits=await p.knowledge.search({baseIds:['kb-default'],query:'漏水售后',sku:'JF-001',topK:5});assert.equal(hits.hits.length,1);assert.equal(hits.hits[0].documentId,saved.id);
 const changed=await p.knowledge.saveDocument(saved.id,{...detail,body:'新版售后政策，漏水需提供订单和照片',confirmed:true});assert.equal(changed.revision,2);assert.throws(()=>p.knowledge.assertRecall(hits),/已更新/);
 await assert.rejects(()=>p.knowledge.saveDocument(saved.id,{...detail,confirmed:true}),/版本/);
 const reloaded=await createPlatform(dir);assert.equal(reloaded.knowledge.document(saved.id).revision,2);await reloaded.knowledge.toggle(saved.id,{revision:2,enabled:false});
 assert.equal((await reloaded.knowledge.search({baseIds:['kb-default'],query:'漏水',sku:'JF-001'})).hits.length,0);
});
test('vector and hybrid retrieval use persisted embeddings; unindexed docs and changed models fail explicitly',async()=>{
 let signature='fixture|v1';const {p}=await make({embed:fixtureEmbed,embeddingConfig:()=>({...fixtureConfig(),signature})});
 const a=await p.knowledge.saveDocument(null,doc),b=await p.knowledge.saveDocument(null,{...doc,title:'品牌',body:'品牌规范使用白底蓝色'});
 const input={baseIds:['kb-default'],query:'漏水',mode:'vector',topK:2};await assert.rejects(()=>p.knowledge.search(input),/未完成/);
 await p.knowledge.index(a.id,{revision:1});await p.knowledge.index(b.id,{revision:1});
 const r=await p.knowledge.search(input);assert.equal(r.hits.length,1);assert.equal(r.hits[0].documentId,a.id);assert.equal(r.hits[0].score,1);assert(!JSON.stringify(r).includes('"vector"'+':'+ '['));
 const hybrid=await p.knowledge.search({...input,mode:'hybrid'});assert.equal(hybrid.hits[0].documentId,a.id);assert.match(hybrid.algorithm,/RRF/);
 signature='fixture|v2';await assert.rejects(()=>p.knowledge.search(input),/模型已变更/);
});
test('no embedding config does not masquerade as semantic recall and lexical retrieval remains usable',async()=>{
 const {p}=await make({embeddingConfig:()=>({configured:false})});const d=await p.knowledge.saveDocument(null,doc);
 await assert.rejects(()=>p.knowledge.index(d.id,{revision:1}),/尚未配置/);await assert.rejects(()=>p.knowledge.search({baseIds:['kb-default'],query:'漏水',mode:'vector'}),/尚未配置/);
 assert.equal((await p.knowledge.search({baseIds:['kb-default'],query:'漏水'})).hits.length,1);
});
test('document edits during indexing discard old vectors, and failures leave BM25 available',async()=>{
 let release;const {p}=await make({embed:()=>new Promise(r=>release=r),embeddingConfig:fixtureConfig});const d=await p.knowledge.saveDocument(null,doc);
 const running=p.knowledge.index(d.id,{revision:1});while(!release)await new Promise(r=>setTimeout(r,1));await assert.rejects(()=>p.knowledge.index(d.id,{revision:1}),/正在索引/);
 await p.knowledge.saveDocument(d.id,{...doc,revision:1,body:'新版漏水政策，请核对照片'});release([[1,0]]);await assert.rejects(()=>running,/未完成/);assert.equal(p.knowledge.document(d.id).index.status,'not_indexed');assert(!p.knowledge.document(d.id).chunks[0].vector);
 assert.equal((await p.knowledge.search({baseIds:['kb-default'],query:'漏水'})).hits.length,1);
});
test('employee execution retrieves by goal and by chat question, persists citations and refuses stale citations',async()=>{
 const {p}=await make();const d=await p.knowledge.saveDocument(null,doc);const g=await p.create(goalInput);await p.action(g.id,{kind:'plan',expectedVersion:g.version});await p.pump();
 const run=p.run(p.runs()[0].id);assert.equal(run.input.knowledgeRecall.hits.length,1);assert(run.trace.some(t=>t.phase==='retrieval'));assert(run.result.artifacts[0].body.includes('切片 1'));assert(run.result.artifacts[0].body.includes('订单编号'));
 await p.action(g.id,{kind:'message',text:'漏水售后需要什么凭证？',target:'employee-coordination',intent:'discuss'});await p.pump();const chat=p.run(p.runs()[0].id);assert.equal(chat.input.knowledgeRecall.query,'漏水售后需要什么凭证？');
 await p.knowledge.toggle(d.id,{revision:d.revision,enabled:false});assert.throws(()=>p.knowledge.assertRecall(run.input.knowledgeRecall),/已更新或停用/);
 await assert.rejects(()=>p.action(g.id,{kind:'complete',expectedVersion:p.goals()[0].version}),/已更新或停用/);
});
test('embedding transport validates response indexes, dimensions, authorization and secret echoes',async()=>{
 const keys=['KB_EMBEDDING_ENDPOINT','KB_EMBEDDING_MODEL','KB_EMBEDDING_KEY','AGENT_ALLOWED_HOSTS'],old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));Object.assign(process.env,{KB_EMBEDDING_ENDPOINT:'https://embed.example.com/v1/embeddings',KB_EMBEDDING_MODEL:'test-model',KB_EMBEDDING_KEY:'fixture-secret-private',AGENT_ALLOWED_HOSTS:'embed.example.com'});
 const resolve=async()=>[{address:'8.8.8.8',family:4}];try{
  assert.deepEqual(await embedTexts(['a','b'],{resolve,fetch:async(url,opt)=>{assert.equal(opt.redirect,'error');assert.equal(opt.headers.Authorization,'Bearer fixture-secret-private');return new Response(JSON.stringify({data:[{index:1,embedding:[0,1]},{index:0,embedding:[1,0]}]}));}}),[[1,0],[0,1]]);
  await assert.rejects(()=>embedTexts(['a'],{resolve,fetch:async()=>new Response('fixture-secret-private')}),/请求失败/);
  await assert.rejects(()=>embedTexts(['a','b'],{resolve,fetch:async()=>new Response(JSON.stringify({data:[{index:0,embedding:[1]},{index:0,embedding:[1]}]}))}),/请求失败/);
 }finally{for(const k of keys)if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}
});
