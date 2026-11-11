import {bm25} from '../knowledge-retrieval.js';
import {materialProblem} from '../sources.js';
export const contentChannels=['全渠道','淘宝 / 天猫','抖音','小红书','京东','拼多多','1688','自有商城'];
export const normalizeChannel=value=>!value||['商品详情页','详情页','主图','详情图'].includes(value)?'全渠道':value;
export const placeholderFact=value=>/^(嗯+|哦+|好[的吧]?|暂无|无|不知道|待补[充齐]?|测试|test|n\/a|\.+|…+|待确认)$/i.test(String(value||'').trim());
export function imageOutputs(text){
 const t=String(text||'').replace(/(?:不要|无需|不做|不用)[^，。；\n]*/g,'');
 if(/简报|提示词|仅.*文案|只.*文字/.test(t))return [];
 const out=[];if(/主图|海报|配图/.test(t))out.push('main');if(/详情(?:页)?(?:图|图片)/.test(t))out.push('detail');
 if(!out.length&&/(生图|生成.{0,15}图片|制作.{0,15}图片|做.{0,15}图片)/.test(t))out.push('main');return out;
}
export function channelFromGoal(g){
 const existing=g.skillData?.copyBrief?.channel;if(existing&&!['商品详情页','详情页','主图','详情图'].includes(existing))return normalizeChannel(existing);
 if(/全渠道/.test(g.text))return '全渠道';
 const matches=[['淘宝|天猫','淘宝 / 天猫'],['抖音|抖店','抖音'],['小红书','小红书'],['京东','京东'],['拼多多','拼多多']].filter(([r])=>new RegExp(r).test(g.text)).map(([,v])=>v);
 return matches.length?matches.join('、'):'全渠道';
}
export function prepareContent(d,g){
 const manual=g.skillData?.copyBrief;
 const topic=['水龙头','花洒','淋浴头','角阀','地漏','浴巾','马桶'].find(t=>g.text.includes(t));
 const generic=/^(全店汇总|经营分析|待比较候选|候选商品|内容制作|测试商品|角阀 · 样例商品)$/;
 const candidates=(g.skillData?.candidates||g.research?.candidates||[]).filter(c=>!/(?:在|从|去)?1688/.test(g.text)||/1688/.test(c.source||''));
 const explicitSku=g.scope?.sku&&!/DEMO|汇总|候选|内容制作/.test(g.scope.sku)?g.scope.sku:null;
 const candidate=(explicitSku?candidates.filter(c=>c.sku===explicitSku):candidates).slice().sort((a,b)=>a.price-b.price)[0];
 let productName=candidate?.name||manual?.productName||topic||(!generic.test(g.scope?.product||'')?g.scope?.product:'')||'';
 if(!productName||/^(经营分析|候选商品|商品)$/.test(productName))productName='';
 const sku=candidate?.sku||explicitSku||'',baseIds=g.knowledge?.baseIds||d.knowledge.bases.filter(b=>b.enabled).map(b=>b.id);
 const docs=d.knowledge.documents.filter(x=>x.enabled&&baseIds.includes(x.baseId)&&d.knowledge.bases.some(b=>b.id===x.baseId&&b.enabled)&&(!sku||!x.sku||x.sku===sku));
 const materials=d.materials.filter(m=>m.type==='document'&&!materialProblem(m,d.sources.find(s=>s.id===m.sourceId))&&(!sku||!m.sku||m.sku===sku));
 const records=[...docs.map(x=>({id:x.id,title:x.title,text:x.body,source:x.source,sku:x.sku,kind:'knowledge',revision:x.revision})),...materials.map(x=>({id:x.id,title:x.title,text:x.body,source:x.url||x.title,sku:x.sku,kind:'material',revision:x.revision}))];
 let hits=bm25(productName||g.text,records).slice(0,5);
 // Do not mix facts from multiple unrelated SKUs into one product image.
 const selectedSku=sku||hits.find(h=>h.sku)?.sku||'';hits=hits.filter(h=>!h.sku||h.sku===selectedSku);
 const evidence=[],facts=[];const add=(text,source,origin)=>{text=String(text).trim().slice(0,120);if(!text||placeholderFact(text)||facts.includes(text)||facts.length>=8)return;facts.push(text);evidence.push({text,source,...origin});};
 if(manual?.confirmed&&manual.source&&!placeholderFact(manual.source)){for(const f of manual.facts||[])if(!placeholderFact(f))add(f,manual.source,{kind:'manual'});}
 if(candidate){for(const [k,label]of [['material','材质'],['connector','接口 / 规格']])if(candidate[k]&&!/^(未知|待确认)$/.test(candidate[k]))add(label+'：'+candidate[k],candidate.source,candidate.provenance);}
 for(const h of hits){for(const line of h.text.split('\n')){
  if(/示例|虚构|待补|待确认|未知|通用知识|例如|不得|不能|未提供|不代表|尚未/.test(line))continue;
  const match=line.match(/^\s*(?:[-*#]+\s*)?((?:材质|接口|规格|尺寸|颜色|包装|数量|工艺|适用范围|安装方式|产品特点|商品特点|卖点)\s*[:：].{1,105})$/);
  if(match)add(match[1],h.title+' · '+h.source,{kind:h.kind,id:h.id,revision:h.revision});
 }}
 const audience=manual?.audience&&!placeholderFact(manual.audience)?manual.audience:/水龙头|花洒|淋浴头|角阀|地漏/.test(productName)?'家庭装修与旧件换新用户（系统建议，可调整）':productName?'正在了解和选购'+productName+'的用户（系统建议，可调整）':'待明确商品后自动建议';
 if(!facts.length&&productName)add('商品品类：'+productName,'用户目标 / 商品名称（仅明确品类，未确认规格）',{kind:'goal'});
 const source=[...new Set(evidence.map(e=>e.source))].join('；').slice(0,500)||'尚未找到具体商品资料';
 const images=d.materials.filter(m=>m.type==='image'&&!materialProblem(m,d.sources.find(s=>s.id===m.sourceId))&&selectedSku&&m.sku===selectedSku);
 return {productName,channel:channelFromGoal(g),audience,facts,source,evidence,selectedSku,selectionReason:candidate?'按已有报价从低到高初筛；未核实质量、库存和运费，不代表综合最优。':'',candidate: candidate?{name:candidate.name,sku:candidate.sku,source:candidate.source,price:candidate.price}:null,referenceId:images[0]?.id||null,checked:{knowledge:docs.length,materials:materials.length},suggested:true,method:'自动检索与规则提取',duration:manual?.duration||30,confirmed:false,missing:productName?[]:['尚未识别具体商品，请说明品类或商品名称'],boundary:facts.every(f=>f.startsWith('商品品类：'))?'仅明确商品品类，画面按概念示意制作，不添加材质、性能、认证和售后承诺。':'特点来自所列资料；目标人群为建议，图片发布前仍需核对实物。'};
}
export function assertContentEvidence(d,p){for(const e of p?.evidence||[]){if(e.kind==='knowledge'){const doc=d.knowledge.documents.find(x=>x.id===e.id);if(!doc?.enabled||doc.revision!==e.revision||!d.knowledge.bases.some(b=>b.id===doc.baseId&&b.enabled))throw new Error('内容来源已变更，请重新整理资料');}if(e.kind==='material'){const m=d.materials.find(x=>x.id===e.id);if(!m||m.revision!==e.revision||materialProblem(m,d.sources.find(s=>s.id===m.sourceId)))throw new Error('内容素材已变更，请重新整理资料');}}}
