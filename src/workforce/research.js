import {bm25} from '../knowledge-retrieval.js';
import {materialProblem} from '../sources.js';
import {parseBusinessCsv} from './commerce.js';

export const isResearchGoal=g=>g.intent==='selection'||/选品|性价比|候选商品|商品对比/.test(g.text);
export const researchQuestion=text=>/为什么.{0,12}(资料|补|提供)|为啥.{0,12}(资料|补|提供)|自己.{0,8}(找|搜|查)|自动.{0,8}(找|搜|查)|你.{0,8}(找|搜|查)|不应该.{0,12}(找|搜|查)|怎么.{0,8}(补|资料)|^\s*[?？]+\s*$/.test(text);
const aliases={sku:['sku','商品编号','型号','货号'],name:['name','商品','商品名称','产品','产品名称','品名'],price:['price','售价','单价','报价','价格','供货价'],material:['material','材质'],connector:['connector','接口','规格','接口规格']};
const key=k=>String(k).toLowerCase().replace(/[\s/（(].*$/,'').replace(/[*`]/g,'');
function candidateRows(body){
 try{const value=JSON.parse(body);if(Array.isArray(value))return value;if(Array.isArray(value.candidates))return value.candidates;}catch{}
 const lines=body.split('\n');let out=[];
 for(let i=0;i<lines.length;i++){
  if(lines[i].includes('|')&&/^\s*\|?\s*:?-{3}/.test(lines[i+1]||'')){
   const cells=line=>line.trim().replace(/^\||\|$/g,'').split('|').map(s=>s.trim());const headers=cells(lines[i]);i+=2;
   while(i<lines.length&&lines[i].includes('|')){const row=cells(lines[i]);if(row.length===headers.length)out.push(Object.fromEntries(headers.map((h,j)=>[h,row[j]])));i++;}
  }
 }
 if(out.length)return out;
 try{out=parseBusinessCsv(body,[]);if(out.some(r=>Object.keys(r).some(k=>aliases.price.includes(key(k)))))return out;}catch{}
 const pairs=lines.map(l=>l.match(/^\s*(?:[-*]\s*)?([^:：\n]{1,20})[:：]\s*(.{1,300})$/)).filter(Boolean);return pairs.length?[Object.fromEntries(pairs.map(m=>[m[1],m[2]]))]:[];
}
function extract(body,origin){
 return candidateRows(body).slice(0,50).flatMap(row=>{
  if(!row||typeof row!=='object')return [];
  const normalized=Object.fromEntries(Object.entries(row).map(([k,v])=>[key(k),v]));
  const get=k=>aliases[k].map(a=>normalized[a]).find(x=>x!==undefined);
  const sku=String(get('sku')||origin.sku||'').trim(),raw=String(get('price')??'').replace(/^[¥￥]\s*|\s*元$/g,'').trim(),price=Number(raw);
  if(!sku||sku.length>120||!/^\d+(?:\.\d{1,2})?$/.test(raw)||!Number.isFinite(price)||price<=0||price>1e9)return [];
  return [{sku,name:String(get('name')||'').slice(0,160),price,material:String(get('material')||'未知').slice(0,300),connector:String(get('connector')||'未知').slice(0,300),source:origin.source,provenance:origin.provenance}];
 });
}
function searchQuery(g,question){
 const generic=/^(自动)?选品$|^候选商品$|^经营分析$|^待比较候选$/;
 let text=g.text;
 if(g.scope?.product&&!generic.test(g.scope.product))text+=' '+g.scope.product;
 const last=g.messages.filter(m=>m.role==='human'&&!researchQuestion(m.text)&&!/你是谁|你能|介绍|进度/.test(m.text)).slice(-3).map(m=>m.text).join(' ');
 text+=' '+last+' '+(!researchQuestion(question||'')?question||'':'');
 const active=text.split(/改为|改找|换成|只找/).at(-1);
 const topics=[['淋浴头','花洒'],['角阀'],['水龙头','龙头'],['浴巾'],['马桶'],['地漏']].find(words=>words.some(w=>active.includes(w)));
 const stripped=text.replace(/自动|选品|寻找|市面上|性价比|比较|候选|商品|产品|帮我|找一下|找找|推荐|高的|低价|搜索|供应商|请|给我|\s|[，。？！?！]/g,'').trim();
 const budget=[...text.matchAll(/预算(?:不超过|最多|在)?\s*(\d+(?:\.\d+)?)/g)].at(-1);
 return {query:topics?topics.join(' '):stripped||'商品 报价',topics,specific:!!topics||stripped.length>=2,maxPrice:budget?Number(budget[1]):null};
}
export function collectResearch(d,g,question=''){
 const q=searchQuery(g,question),baseIds=g.knowledge?.baseIds||[],docs=d.knowledge.documents.filter(doc=>doc.enabled&&baseIds.includes(doc.baseId)&&d.knowledge.bases.some(b=>b.id===doc.baseId&&b.enabled));
 const materials=d.materials.filter(m=>m.type==='document'&&!materialProblem(m,d.sources.find(s=>s.id===m.sourceId)));
 const rows=[...docs.map(doc=>({id:doc.id,title:doc.title,text:doc.body,source:doc.source,sku:doc.sku,provenance:{kind:'knowledge',id:doc.id,revision:doc.revision,baseId:doc.baseId}})),...materials.map(m=>({id:m.id,title:m.title,text:m.body,source:(d.sources.find(s=>s.id===m.sourceId)?.name||'来源')+' · '+m.title+' · '+(m.url||'内部登记'),sku:m.sku,provenance:{kind:'material',id:m.id,revision:m.revision,sourceId:m.sourceId}}))];
 const hits=bm25(q.query,rows).slice(0,12),candidates=[],seen=new Set();
 for(const hit of hits){
  if(q.topics&&!q.topics.some(t=>(hit.title+' '+hit.text).includes(t)))continue;
  for(const c of extract(hit.text,hit)){
   if(q.topics&&c.name&&!q.topics.some(t=>c.name.includes(t)))continue;if(q.maxPrice!==null&&c.price>q.maxPrice)continue;
   const id=c.sku+'|'+c.price+'|'+c.source;if(seen.has(id))continue;seen.add(id);candidates.push(c);if(candidates.length>=20)break;
  }
  if(candidates.length>=20)break;
 }
 const pending=d.materials.filter(m=>m.status==='pending'&&d.sources.some(s=>s.id===m.sourceId&&s.enabled)).length;
 const supplierSources=d.sources.filter(s=>s.enabled&&s.kind==='supplier');
 return {status:!q.specific?'needs_scope':candidates.length>=2?'found':candidates.length?'partial':'empty',query:q.query,maxPrice:q.maxPrice,specific:q.specific,candidates,checked:{knowledgeDocuments:docs.length,materials:materials.length,supplierSources:supplierSources.length,httpSources:d.sources.filter(s=>s.enabled&&s.mode==='http').length,pending},hits:hits.map(h=>({id:h.id,title:h.title,source:h.source,kind:h.provenance.kind})),at:new Date().toISOString()};
}
export function researchSummary(r){
 const lines=[`已检索本目标范围内的 ${r.checked.knowledgeDocuments} 份知识文档、${r.checked.materials} 项可用来源资料。`];
 if(r.maxPrice!==null)lines.push('按你最近给出的预算筛选：报价不超过 '+r.maxPrice+' 元，未计运费等未提供费用。');
 if(r.candidates.length)lines.push(`识别到 ${r.candidates.length} 条带来源与报价的商品记录：`+r.candidates.slice(0,5).map(c=>`${c.name||c.sku}（${c.sku}，${c.price} 元；来源：${c.source}）`).join('；')+'。');
 else lines.push(r.hits.length?'检索命中了相关文档，但没有识别到可比较的商品报价记录。方案或说明文字不能替代真实商品数据。':'没有检索到可用的商品报价记录。');
 if(!r.specific)lines.push('需要你明确要找的品类，预算也可以一并说明；候选资料由系统继续从已接入来源查找。');
 if(r.checked.pending)lines.push(`另有 ${r.checked.pending} 项来源资料待核验，尚未用于比较，无需重新录入。`);
 if(!r.checked.httpSources)lines.push(r.webSearchReady?'当前已启用网络搜索；网页线索与可核验报价分开展示。':'尚未连接可用的网络搜索或供应商接口。可在 AI基础能力配置启用网络搜索 / 1688 站点搜索，或接入授权供应商资料。');
 if(r.status==='found')lines.push('这些记录可以用于参数与报价初筛；未获取销量、质量或风险依据时，不会编造综合性价比分数。');
 return lines.join('\n');
}
export function researchInputs(d,g){
 if(!isResearchGoal(g)||Array.isArray(g.skillData?.candidates))return {};
 const r=g.researchExecution?.version===g.version?g.researchExecution.discovery:collectResearch(d,g);return r.status==='found'?{candidates:r.candidates,candidateDiscovery:r}:{};
}
export function assertResearch(d,r){
 if(!r)return;
 for(const c of r.candidates){const p=c.provenance;if(p.kind==='knowledge'){const doc=d.knowledge.documents.find(x=>x.id===p.id);if(!doc?.enabled||doc.revision!==p.revision||!d.knowledge.bases.some(b=>b.id===p.baseId&&b.enabled))throw new Error('检索到的商品资料已更新或停用，请重新检索');}
  else{const m=d.materials.find(x=>x.id===p.id);if(!m||m.revision!==p.revision||materialProblem(m,d.sources.find(s=>s.id===p.sourceId)))throw new Error('检索到的来源资料已更新或不可用，请重新检索');}}
}
export function createResearchManager({getData,transaction,sources,event,integrations}){
 async function run(id){
  const snapshot=getData().goals.find(g=>g.id===id),request=snapshot?.researchRequest;if(!request)return;
  const diagnostics=[];let webResult=null;
  const local=collectResearch(getData(),snapshot,request.question);
  if(integrations?.view().search.ready&&local.specific&&(local.status!=='found'||/全网|1688|网上|网络/.test(request.question))){try{webResult=await integrations.query({query:local.query+(local.maxPrice!==null?' 预算'+local.maxPrice+'元':''),site:/1688/.test(snapshot.text+request.question)?'1688.com':''});}catch{diagnostics.push('网络搜索暂未完成，请在 AI基础能力配置检查搜索连接');}}
  for(const s of getData().sources.filter(s=>s.enabled&&s.mode==='http').slice(0,3)){
   if(!request.forceSync&&s.lastSync?.revision===s.revision&&Date.now()-Date.parse(s.lastSync.at)<300000){if(s.lastSync.status!=='succeeded')diagnostics.push(s.name+'：最近同步未成功，本轮未重复请求；可在协作详情中主动重试');continue;}
   try{const result=await sources.sync(s.id);diagnostics.push(s.name+'：已同步 '+result.received+' 项，新增或变更内容需核验后使用');}catch(error){diagnostics.push(s.name+(String(error.message).startsWith('静态预览')?'：免安装预览不能调用外部来源，请运行完整后端':'：同步未完成，请检查接口配置与授权'));}
  }
  await transaction(d=>{
   const g=d.goals.find(g=>g.id===id);if(!g||g.researchRequest?.id!==request.id)return;if(g.repliesPaused&&request.source)return;delete g.researchRequest;
   if(g.version!==request.version||(request.contextRevision&&g.chatContext?.revision&&g.chatContext.revision!==request.contextRevision)){event(g,'查找期间目标或话题已变更，此次结果未用于新目标。');return;}
   g.research={...collectResearch(d,g,request.question),diagnostics,webSearchReady:!!integrations?.view().search.ready};
   if(g.researchExecution?.version===g.version)diagnostics.push('本轮执行继续使用开始时的候选快照；新的筛选条件用于查找，变更执行范围需重新确认计划');
   if(webResult){g.webResearch={...webResult,goalVersion:g.version};event(g,webResult.results.length?'已搜索到 '+webResult.results.length+' 条网页线索。以下是搜索服务返回的摘要，尚未核验报价、库存或供应商资质；不会直接用于上架或认定性价比。':'本次网络搜索未返回匹配网页，请调整品类或关键词。');g.messages.at(-1).links=webResult.results;g.messages.at(-1).workflow='research';}
   const prefix=request.source?'你不需要重复提供已有资料。我已先检查当前可用来源。\n':'';
   event(g,prefix+researchSummary(g.research)+(diagnostics.length?'\n来源同步：\n'+diagnostics.join('\n'):''));const msg=g.messages.at(-1);msg.replyTo=request.source||null;msg.workflow='research';msg.goalVersion=g.version;
   if(g.research.status==='found'&&!Array.isArray(g.skillData?.candidates)&&g.stage==='draft'&&g.runtime?.status==='needs_input'){g.runtime={status:'idle',completed:g.runtime.completed||[]};event(g,'已找到可用候选，将继续已确认的执行计划。');}
  });
 }
 return {run};
}
