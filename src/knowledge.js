import {knowledgeStarters} from './knowledge-starters.js';
import {randomUUID} from 'node:crypto';
import {chunkText,bm25,cosine,validateVectors} from './knowledge-retrieval.js';
import {embedTexts,embeddingConfiguration} from './knowledge-embedding.js';
const now=()=>new Date().toISOString();
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const field=(v,label,max,required=true)=>{if(typeof v!=='string'||v.length>max||(required&&!v.trim()))fail(label+'格式无效');return v.trim();};
function inspectMedia(input){
 const name=field(input?.name,'文件名',240),encoded=input?.base64;
 if(typeof encoded!=='string'||!encoded.length||encoded.length>44739244||encoded.length%4||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))fail('图片或视频文件无效，视频最大 32 MB');
 const header=atob(encoded.slice(0,64)),bytes=encoded.length/4*3-(encoded.endsWith('==')?2:encoded.endsWith('=')?1:0);
 const formats=[
  ['image/jpeg',header.startsWith('\xff\xd8\xff')],['image/png',header.startsWith('\x89PNG\r\n\x1a\n')],
  ['image/webp',header.startsWith('RIFF')&&header.slice(8,12)==='WEBP'],
  ['video/mp4',header.slice(4,8)==='ftyp'&&/^(isom|iso[2-9]|mp4[12]|avc1|M4V |MSNV|dash)/.test(header.slice(8,12))],
  ['video/webm',header.startsWith('\x1a\x45\xdf\xa3')&&header.includes('webm')]
 ];
 const mime=formats.find(([,match])=>match)?.[0];
 if(!mime)fail('支持 JPG、PNG、WebP 图片和 MP4、WebM 视频，请检查原文件格式');
 if(bytes>(mime.startsWith('image')?8:32)*1024*1024)fail('图片最大 8 MB，视频最大 32 MB');
 return {id:randomUUID(),name,mime,bytes};
}
export function initialKnowledge(){return {bases:[{id:'kb-default',name:'企业知识库',description:'商品说明、品牌规范与售后知识',enabled:true,revision:1}],documents:[]};}
export function createKnowledgeManager({getData,transaction,mediaFiles,embed=embedTexts,configuration=embeddingConfiguration}){
 const find=(list,id,label)=>list.find(x=>x.id===id)||fail(label+'不存在',404);
 const safeDoc=({chunks,body,...doc})=>({...doc,index:doc.index.status==='ready'&&doc.index.signature!==configuration().signature?{...doc.index,status:'stale'}:doc.index,characters:body.length,chunkCount:chunks.length});
 const publicConfig=()=>{const c=configuration();return {configured:c.configured,model:c.model};};
 function view(){const k=getData().knowledge;return structuredClone({bases:k.bases,documents:k.documents.map(safeDoc),starters:knowledgeStarters,embedding:publicConfig()});}
 function document(id){const doc=find(getData().knowledge.documents,id,'文档');return structuredClone({...doc,chunks:doc.chunks.map(({vector,...c})=>c)});}
 const saveBase=(id,input)=>transaction(d=>{const k=d.knowledge,old=id?find(k.bases,id,'知识库'):null;if(old&&input.revision!==old.revision)fail('知识库版本已变化',409);if(k.bases.length>=20&&!old)fail('当前最多创建 20 个知识库');const name=field(input.name,'知识库名称',80),description=field(input.description||'','知识库说明',500,false);if(typeof input.enabled!=='boolean')fail('请选择启用状态');const base={id:old?.id||randomUUID(),name,description,enabled:input.enabled,revision:(old?.revision||0)+1};if(old)k.bases[k.bases.indexOf(old)]=base;else k.bases.push(base);return base;});
 async function saveDocument(id,input){
  let previous,created;
  try{
   const saved=await transaction(async d=>{
    const k=d.knowledge,old=id?find(k.documents,id,'文档'):null;if(old&&input.revision!==old.revision)fail('文档版本已变化，请重新打开',409);
    const base=find(k.bases,old?.baseId||input.baseId,'知识库');if(!base.enabled)fail('知识库已停用');
    if(k.documents.length>=100&&!old)fail('当前版本最多保存 100 份文档');
    if(input.confirmed!==true)fail('请确认文档内容及来源可供员工参考');
    const title=field(input.title,'文档标题',160),source=field(input.source,'来源说明',500),sku=field(input.sku||'','SKU',120,false);
    if(typeof input.enabled!=='boolean')fail('请选择文档启用状态');
    const media=input.media?inspectMedia(input.media):input.media===null?null:old?.media;
    const size=Number(input.size),overlap=Number(input.overlap),split=chunkText(media&&!input.body?.trim()?title:input.body,{size,overlap});
    if(k.documents.filter(x=>x.id!==id).reduce((n,x)=>n+x.chunks.length,0)+split.chunks.length>1000)fail('当前版本切片总量上限 1000，请减少文档或增大切片长度');
    const doc={...(media?{media}:{}),id:old?.id||randomUUID(),baseId:base.id,title,source,sku,body:split.text,size,overlap,enabled:input.enabled,revision:(old?.revision||0)+1,updatedAt:now(),index:{status:'not_indexed'},chunks:split.chunks.map(c=>({...c,id:randomUUID()}))};
    if(input.media){created=media.id;await mediaFiles.put(media.id,input.media.base64);}
    if(old?.media&&old.media.id!==media?.id)previous=old.media.id;
    if(old)k.documents[k.documents.indexOf(old)]=doc;else k.documents.unshift(doc);return safeDoc(doc);
   });
  created=null;
  if(previous)await mediaFiles.remove(previous);
  return saved;
  }catch(error){if(created)await mediaFiles.remove(created);throw error;}
 }
 async function media(id){
  const file=find(getData().knowledge.documents,id,'资料').media;
  if(!file)fail('资料没有媒体文件',404);
  return {mime:file.mime,base64:await mediaFiles.get(file.id)};
 }
 const toggle=(id,input)=>transaction(d=>{const doc=find(d.knowledge.documents,id,'文档');if(input.revision!==doc.revision)fail('文档版本已变化',409);if(typeof input.enabled!=='boolean')fail('请选择启用状态');doc.enabled=input.enabled;doc.revision++;doc.updatedAt=now();doc.index={status:'not_indexed'};for(const c of doc.chunks)delete c.vector;return safeDoc(doc);});
 const deleteDocument=async(id,input)=>{let file;const result=await transaction(d=>{const doc=find(d.knowledge.documents,id,'文档');if(input.confirmed!==true)fail('请确认删除文档和全部切片');if(input.revision!==doc.revision)fail('文档版本已变化，请刷新',409);if(doc.index.status==='indexing')fail('文档正在索引，请稍后删除',409);file=doc.media?.id;d.knowledge.documents=d.knowledge.documents.filter(x=>x.id!==id);return {deleted:true,id};});if(file)await mediaFiles.remove(file);return result;};
 const deleteBase=(id,input)=>transaction(d=>{const base=find(d.knowledge.bases,id,'知识库');if(input.confirmed!==true)fail('请确认删除知识库');if(input.revision!==base.revision)fail('知识库版本已变化',409);if(d.knowledge.documents.some(x=>x.baseId===id))fail('请先删除或迁出库内文档，非空知识库不能删除');d.knowledge.bases=d.knowledge.bases.filter(x=>x.id!==id);for(const g of d.goals)if(g.knowledge)g.knowledge.baseIds=g.knowledge.baseIds.filter(x=>x!==id);return {deleted:true,id};});
 function validateScope(input,d=getData()){
  const baseIds=input?.baseIds||[];if(!Array.isArray(baseIds)||baseIds.length>20||new Set(baseIds).size!==baseIds.length)fail('知识库选择无效');
  for(const id of baseIds)if(!find(d.knowledge.bases,id,'知识库').enabled)fail('所选知识库已停用');
  const mode=input?.mode||'bm25',topK=Number(input?.topK??5);if(!['bm25','vector','hybrid'].includes(mode)||!Number.isInteger(topK)||topK<1||topK>8)fail('召回方式无效，Top K 范围为 1–8');
  if(mode!=='bm25'&&!configuration().configured)fail('Embedding 尚未配置，请使用 BM25');
  return {baseIds,mode,topK};
 }
 async function index(id,input){
  const cfg=configuration();if(!cfg.configured)fail('Embedding 尚未配置，BM25 已可使用');
  const snapshot=await transaction(d=>{const doc=find(d.knowledge.documents,id,'文档');if(input.revision!==doc.revision)fail('文档版本已变化',409);if(!doc.enabled||!find(d.knowledge.bases,doc.baseId,'知识库').enabled)fail('请先启用知识库与文档');if(doc.index.status==='indexing')fail('文档正在索引，请稍后',409);doc.index={status:'indexing',completed:0,total:doc.chunks.length,startedAt:now(),job:randomUUID()};return doc;});
  try{
   const vectors=[];for(let i=0;i<snapshot.chunks.length;i+=16){const current=find(getData().knowledge.documents,id,'文档');if(current.revision!==snapshot.revision||configuration().signature!==cfg.signature)fail('文档或模型已改变');const batch=snapshot.chunks.slice(i,i+16);vectors.push(...validateVectors(await embed(batch.map(c=>snapshot.title+'\n'+c.text)),batch.length));await transaction(d=>{const doc=find(d.knowledge.documents,id,'文档');if(doc.revision===snapshot.revision&&doc.index.job===snapshot.index.job)doc.index.completed=vectors.length;});}
   validateVectors(vectors,snapshot.chunks.length);
   return await transaction(d=>{const doc=find(d.knowledge.documents,id,'文档');if(doc.revision!==snapshot.revision||doc.index.job!==snapshot.index.job||configuration().signature!==cfg.signature)fail('索引期间文档或模型已改变，请重新构建',409);doc.chunks.forEach((c,i)=>c.vector=vectors[i]);doc.index={status:'ready',signature:cfg.signature,model:cfg.model,dimension:vectors[0].length,at:now()};return safeDoc(doc);});
  }catch(e){await transaction(d=>{const doc=find(d.knowledge.documents,id,'文档');if(doc.revision===snapshot.revision&&doc.index.job===snapshot.index.job)doc.index={status:'failed',error:'向量索引失败，请检查服务后重试；BM25 仍可使用',at:now()};});throw new Error('向量索引未完成，请检查服务或文档版本后重试；BM25 仍可使用');}
 }
 function assertRecall(recall,d=getData()){
  if(!recall)return;
  for(const hit of recall.hits||[]){const doc=find(d.knowledge.documents,hit.documentId,'引用文档'),base=find(d.knowledge.bases,doc.baseId,'引用知识库');if(!doc.enabled||!base.enabled||doc.revision!==hit.revision||!doc.chunks.some(c=>c.id===hit.id))fail('召回文档已更新或停用，旧引用不能继续交付');}
 }
 async function search(input){
  const scope=validateScope(input),query=field(input.query,'检索问题',2000),sku=field(input.sku||'','SKU',120,false),cfg=configuration();
  const threshold=Number(input.minSimilarity??.3);if(!Number.isFinite(threshold)||threshold<0||threshold>1)fail('向量相似度阈值需为 0–1');
  const snapshot=structuredClone(getData().knowledge),docs=snapshot.documents.filter(doc=>scope.baseIds.includes(doc.baseId)&&doc.enabled&&(!sku||!doc.sku||doc.sku===sku));
  const rows=docs.flatMap(doc=>doc.chunks.map(c=>({...c,documentId:doc.id,revision:doc.revision,title:doc.title,source:doc.source,baseId:doc.baseId,baseName:snapshot.bases.find(b=>b.id===doc.baseId).name,sku:doc.sku})));
  let results=[],lexical=bm25(query,rows);
  if(scope.mode==='bm25')results=lexical;
  else if(rows.length){
   if(docs.some(doc=>doc.index.status!=='ready'||doc.index.signature!==cfg.signature))fail('所选范围存在未完成或模型已变更的向量索引，请先构建全部索引，或改用 BM25');
   const [vector]=validateVectors(await embed([query]),1);
   const semantic=rows.map(r=>({...r,score:cosine(vector,r.vector)})).filter(r=>r.score>=threshold).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
   if(scope.mode==='vector')results=semantic;
   else{const fused=new Map();for(const list of [lexical,semantic])list.forEach((r,i)=>{const hit=fused.get(r.id)||{...r,score:0};hit.score+=1/(60+i+1);fused.set(r.id,hit);});results=[...fused.values()].sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));}
  }
  const hits=results.slice(0,scope.topK).map(({vector,...r})=>({...r,score:Number(r.score.toFixed(6))}));
  const recall={query,...scope,algorithm:{bm25:'BM25（中文双字词 / 英文词）',vector:'Embedding 余弦相似度',hybrid:'BM25 + 向量 · RRF 融合'}[scope.mode],totalChunks:rows.length,hits,at:now()};
  if(scope.mode!=='bm25'&&configuration().signature!==cfg.signature)fail('Embedding 配置已变化，请重新检索');validateScope(scope);assertRecall(recall);return recall;
 }
 return {view,document,media,saveBase,saveDocument,deleteDocument,deleteBase,toggle,index,search,validateScope,assertRecall};
}
