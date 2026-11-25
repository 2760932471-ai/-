import {offerPhoto as normalizeOfferPhoto,offerPhotos} from './offer-photos.js';
export function businessBrief(goal){
 return goal.scenario?.answer ? goal.text+'；使用场景：'+goal.scenario.answer : goal.text;
}
// Shared by goal creation and the task runner so that both search the same category.
export function sourcingIntent(text){
 if(typeof text!=='string'||!/1688|阿里巴巴/.test(text)||!/选品|筛选|找|搜|挑|选购|推荐|比价|挑选|选一|选几/.test(text))return null;
 const money=label=>{const m=text.match(new RegExp('(?:'+label+')\\s*(?:为|约|是|按)?[：:¥￥ ]*([0-9]+(?:\\.[0-9]{1,2})?)'));return m?Number(m[1]):null;};
 const explicit=text.match(/(?:品类|类目|关键词)[：:为是 ]+([^，。；;\n]{1,60})/);
 const parts=(explicit?[explicit[1]]:text.split(/[，,；;。\n]/)).map(part=>part
  .replace(/(?:再|并且|并|然后|之后|后)?(?:直接|自动)?(?:作图|做图|出图|生图|(?:生成|制作|做)(?:商品|淘宝)?(?:主图|详情图)).*$/,'')
  .replace(/(?:预计售价|目标售价|零售价|售价|每件其他成本|单件其他成本|其他成本|预算|进价上限)\s*(?:为|约|是|按|不超过)?[：:¥￥ ]*\d+(?:\.\d+)?\s*元?.*$/,'')
  .replace(/(?:请|帮我|给我|优先|最好|希望|我要|想要|在|去|从|通过|到)?(?:1688|阿里巴巴)(?:平台|网站)?上?/g,'')
  .replace(/请|帮我|给我|帮忙|自动|卖得(?:比较)?好(?:的)?|热销的?|畅销的?|筛选|挑选|选购|找一下|寻找|搜索|搜寻|找出|搜|选品|推荐|比较|找|挑|选(?=一|几)|一款|几款|选一个|选一|一个|一些|性价比高|利润高|高性价比|高利润|高毛利|低进价|划算|具有|适合|合适|进行|对应|某个|优先|并且|而且|同时|商品|产品|品类|类目/g,'')
  .replace(/^[\s、和且并的在上以]+|[\s、的和且并]+$/g,'').trim())
  .filter(s=>s&&!/^(?:要|高|较高|高的|越高越好)$|(?:作图|做图|出图|生成|制作|上架|售价|成本|毛利|利润|性价比)/.test(s));
 const retail=money('预计售价|目标售价|零售价|售价');
 const expenses=money('单件其他成本|每件其他成本|其他成本');
 const basis={query:(parts[0]||'').slice(0,60),retail,expenses};
 if(/(?:优先(?:考虑|看|比较)?|侧重|看重)(?:复购|回购)|(?:回购|复购)(?:率)?(?:优先|为主)/.test(text))basis.repeatFirst=true;
 if(/小批量测款|小批量试卖|低起订(?:量)?优先|优先(?:低起订|小批量)/.test(text))basis.smallTrial=true;
 if(/月利润|月度收益|总利润|总收益|总贡献|一个月.*赚/.test(text))basis.periodGoal=true;
 const pack=text.match(/(?:每(?:单|袋|包)|折算(?:为|成)?|统一按)\s*(\d+(?:\.\d+)?)\s*(公斤|千克|kg|斤|克|g)/i);
 if(pack&&Number(pack[1])>0)basis.grams=weightInGrams(pack[1],pack[2]);
 if(expenses!==null)return basis;
 const rate=label=>{
  const match=text.match(new RegExp('(?:'+label+')\\s*(?:按售价|按|为)?[：: ]*([0-9]+(?:\\.[0-9]+)?)\\s*[%％]'));
  return match?Number(match[1]):null;
 };
 const shipping=money('单件运费|快递费?|运费'),service=rate('服务费|平台费'),promotion=rate('推广费?|投放费');
 if(shipping!==null&&service!==null&&promotion!==null&&service+promotion<=100){
  basis.fees={shipping,service,promotion};
  basis.expenses=scenarioExpenses(basis,retail);
 }
 return basis;
}
function weightInGrams(amount,unit){
 const scale={公斤:1000,千克:1000,kg:1000,斤:500,克:1,g:1};
 return Number(amount||1)*scale[unit.toLowerCase()];
}
function quoteUnit(terms){
 const match=terms?.match(/(?:每|[/／])\s*(\d+(?:\.\d+)?)?\s*(公斤|千克|kg|斤|克|g|件|袋|包)/i);
 if(!match)return null;
 const grams=weightInGrams(match[1],match[2]);
 return Number.isFinite(grams)&&grams>0 ? grams : match[0].replace(/^(?:每|[/／])\s*/,'');
}
export function scenarioExpenses(basis,retail){
 if(!basis.fees)return basis.expenses;
 if(!(retail>0))return null;
 const {shipping,service,promotion}=basis.fees;
 return Math.round((shipping+retail*(service+promotion)/100)*100)/100;
}
export function expenseDescription(basis){
 if(!basis.fees)return '其他单件成本 ¥'+basis.expenses;
 const {shipping,service,promotion}=basis.fees;
 return '快递 ¥'+shipping+'、服务费 '+service+'%、推广费 '+promotion+'%（费率按售价计算）';
}
export function sourcingURL(query){
 const url=new URL('https://s.1688.com/selloffer/offer_search.htm');
 url.searchParams.set('keywords',query);url.searchParams.set('charset','utf8');return url.href;
}
// 1688 offer photography is served from the ibank directories on these CDNs.
export function offerPhoto(value){return normalizeOfferPhoto(value);}
export function offerFacts(values){
 const field=/^(?:镜框材质|镜架材质|镜片材质|镜架颜色|镜片颜色|镜框形状|镜框款式|镜架款式|镜片款式|镜框颜色|框架材质|眼镜结构|镜架结构|材质|颜色|款式|型号|规格|尺寸|风格|镜宽|镜腿长度|镜框宽度|重量|包装|表面工艺|适用人群|形状|光源类型|供电方式|接口|安装方式)[：:]\s*[^<>\n：:]{1,48}$/;
 return [...new Set((Array.isArray(values)?values:[]).filter(v=>typeof v==='string').map(v=>v.trim()).filter(v=>field.test(v)&&!/(?:待确认|未知|全网最低|100%|顶级|国家级)/.test(v)))].slice(0,8);
}
export function selectedOffer(rows,criteria,text){
 return decisionOrder(cleanOffers(rows),criteria,text)[0];
}
export function decisionOrder(rows,criteria,text){
 const ranked=rankedOffers(rows,criteria);
 const period=criteria.periodGoal&&ranked.length&&ranked.every(r=>r.periodMargin!==null);
 if(criteria.repeatFirst&&ranked.some(r=>r.repurchase!==null))
  return ranked.sort((a,b)=>(b.repurchase??-1)-(a.repurchase??-1));
 if(criteria.smallTrial&&trialComparable(ranked))return ranked.sort((a,b)=>a.minimumOrder.count-b.minimumOrder.count);
 if(period)return ranked.sort((a,b)=>b.periodMargin-a.periodMargin);
 if(/利润|毛利|收益|盈利|赚/.test(text)&&ranked.some(r=>r.margin!==null))ranked.sort((a,b)=>(b.margin??-Infinity)-(a.margin??-Infinity));
 return ranked;
}
export function cleanOffers(rows){
 if(!Array.isArray(rows))return [];
 const seen=new Map(),out=[];
 for(const row of rows.slice(0,100)){
  let url;try{url=new URL(row?.url);}catch{continue;}
  const id=url.pathname.match(/^\/offer\/(\d{1,24})\.html\/?$/)?.[1];
  if(url.origin!=='https://detail.1688.com'||!id||url.username||url.password||typeof row.title!=='string'||!row.title.trim()||typeof row.price!=='number'||!(row.price>0&&row.price<=1e8))continue;
  const photos=offerPhotos(row.photo,row.photos);
  const terms=String(row.terms||'').slice(0,120);
  const record=seen.get(id);
  const notes=(Array.isArray(row.quoteNotes)?row.quoteNotes:[]).filter(t=>typeof t==='string'&&t.length<=150);
  if(record){
   const firstUnit=quoteUnit(record.terms),nextUnit=quoteUnit(terms);
   if(record.price!==row.price||firstUnit&&nextUnit&&firstUnit!==nextUnit){
    notes.push('¥'+record.price+' '+record.terms,'¥'+row.price+' '+terms);
   }
   if(record.price===row.price&&!firstUnit&&nextUnit)record.terms=terms;
   if(notes.length)record.quoteNotes=[...new Set([...(record.quoteNotes||[]),...notes])].slice(0,6);
   continue;
  }
  const sale=row.salesBasis;
  const salesBasis=sale&&Number.isFinite(sale.price)&&sale.price>0&&Number.isInteger(sale.units)&&sale.units>0&&typeof sale.source==='string'&&typeof sale.period==='string'?
   {price:sale.price,units:sale.units,source:sale.source.slice(0,200),period:sale.period.slice(0,100)}:null;
  const item={...(salesBasis?{salesBasis}:{}),...(photos.length?{photo:photos[0],photos}:{}),...(offerFacts(row.facts).length?{facts:offerFacts(row.facts)}:{}),sku:id,title:row.title.trim().slice(0,160),price:row.price,url:url.origin+'/offer/'+id+'.html',terms,...(notes.length?{quoteNotes:notes.slice(0,6)}:{}),repurchase:Number.isFinite(row.repurchase)&&row.repurchase>=0&&row.repurchase<=100?row.repurchase:null};
  seen.set(id,item);out.push(item);
 }
 return out.slice(0,40);
}

function trialComparable(rows){
 return rows.length>0&&rows.every(row=>row.minimumOrder&&row.minimumOrder.unit===rows[0].minimumOrder.unit);
}
export function rankedOffers(rows,criteria){
 // Among comparable listings a lower price and a higher observed repeat
 // purchase rate are preferable. Unknown rates form a separate price-only list.
 const scored=rows.map(r=>{
  const unit=quoteUnit(r.terms);
  let cost=r.price;
  if(criteria.grams)cost=typeof unit==='number'?Math.round(r.price*criteria.grams/unit*100)/100:null;
  else if(typeof unit==='number')cost=null;
  if(r.quoteNotes?.length)cost=null;
  const retail=criteria.retail??r.salesBasis?.price??null;
  const expenses=scenarioExpenses(criteria,retail);
  const margin=cost!==null&&retail>0&&expenses!=null?Math.round((retail-cost-expenses)*100)/100:null;
  const periodMargin=margin!==null&&r.salesBasis?Math.round(margin*r.salesBasis.units*100)/100:null;
  const terms=String(r.terms||'');
  const lot=terms.match(/(?:起订量|起批量)\s*[:：]?\s*(\d+)\s*(件|个|套|箱|只|袋|包)/)||terms.match(/(\d+)\s*(件|个|套|箱|只|袋|包)\s*起(?:订|批)/);
  const minimumOrder=lot&&Number.isSafeInteger(Number(lot[1]))&&Number(lot[1])>0?{count:Number(lot[1]),unit:lot[2]}:null;
  return {...r,cost,retail,expenses,margin,periodMargin,minimumOrder};
 });
 for(const r of scored)r.shortlist=r.cost!==null&&r.repurchase!==null&&!scored.some(o=>o.cost!==null&&o.repurchase!==null&&o.cost<=r.cost&&o.repurchase>=r.repurchase&&(o.cost<r.cost||o.repurchase>r.repurchase));
 return scored.sort((a,b)=>Number(a.cost===null)-Number(b.cost===null)||Number(b.shortlist)-Number(a.shortlist)||(a.cost??a.price)-(b.cost??b.price)||(b.repurchase??-1)-(a.repurchase??-1));
}

// Derive the report from this version's saved offers and delivered files.
export function sourcingReport(g){
 const pick=g.flow?.nodes.find(n=>n.capability==='sourcing.1688'&&n.status==='succeeded');
 const brief=businessBrief(g),criteria=sourcingIntent(brief);
 if(!pick?.offers?.length||!criteria)return null;
 const rows=decisionOrder(cleanOffers(pick.offers),criteria,brief);
 if(!rows.length)return null;
 const imageSteps=g.flow.nodes.filter(n=>n.capability.startsWith('image.')&&n.status==='succeeded');
 const prep=imageSteps.find(n=>n.preparation?.candidate)?.preparation;
 const selected=prep?rows.find(r=>r.sku===prep.candidate.sku):rows[0];
 if(!selected)return null;
 const pictures=g.artifacts.filter(a=>a.version===g.version&&a.imageJobId&&imageSteps.some(n=>n.imageJobId===a.imageJobId));
 const copy=g.flow.nodes.find(n=>n.capability==='copy.selling_points'&&n.preparation?.candidate?.sku===selected.sku)?.preparation;
 const facts=(copy?.facts||prep?.facts||selected.facts||[]).filter(f=>!/^商品品类/.test(f));
 const terms=['增压','防堵','手持','可调节','旋转','可拆洗','折叠','便携','快充','套装'].filter(term=>selected.title.includes(term)).slice(0,3);
 const copyStep=g.flow.nodes.find(n=>n.capability==='copy.selling_points'&&n.status==='succeeded');
 const draft=copyStep&&g.artifacts.find(a=>a.version===g.version&&copyStep.artifactIds?.includes(a.id));
 const tagline=draft?.body.match(/^推荐文案：(.+)$/m)?.[1];
 const pitch=tagline|| (facts.length?facts.slice(0,3).join('；'):terms.length?'供应商标题提到'+terms.map(t=>'「'+t+'」').join('、')+'，建议核对实物后用于详情文案。':'当前报价只列出了商品名称；建议先展示外观，性能卖点待核实。');
 const profitGoal=/利润|毛利|收益|盈利|赚/.test(brief);
 const comparable=rows.every(r=>(criteria.periodGoal?r.periodMargin:r.margin)!==null);
 const provisional=criteria.repeatFirst?rows.some(r=>r.repurchase===null):criteria.smallTrial?!trialComparable(rows):profitGoal&&!comparable;
 const verdict=provisional?'初筛候选，优先核实':'推荐商品';
 const lines=['从 '+rows.length+' 款'+criteria.query+'里，'+(provisional?'建议优先核实':'我推荐')+'「'+selected.title+'」。','采购页展示价 ¥'+selected.price+'；'+(selected.repurchase===null?'页面未披露回购率。':'页面回购率 '+selected.repurchase+'%。')+(selected.margin===null?'销售规格、售价或成本尚未齐全，利润待核算。':(criteria.grams?'按每单 '+criteria.grams+' 克折算采购成本 ¥'+selected.cost+'，':'')+'按售价 ¥'+selected.retail+'、'+expenseDescription({...criteria,expenses:selected.expenses})+'，估算单件收益 ¥'+selected.margin.toFixed(2)+'。'),'卖点建议：'+pitch];
 if(g.scenario?.answer)lines.push('本次使用场景：'+g.scenario.answer+'。');
 if(selected.salesBasis)lines.push('店铺口径：'+selected.salesBasis.period+'，实际销售 '+selected.salesBasis.units+' 件，成交均价 ¥'+selected.salesBasis.price+'。来源：'+selected.salesBasis.source+'。');
 const runner=rows.find(r=>r.sku!==selected.sku&&r.margin!==null);
 const unitGoal=!criteria.periodGoal&&profitGoal;
 if(criteria.repeatFirst){
  lines.push(selected.repurchase===null?'本次优先考虑复购，但供应商页面未提供可比较的回购率，建议先做小样测试。':'按你优先考虑复购的要求，先比较可见的供应商回购率。该指标反映 1688 采购方行为，店铺消费者的复购仍需用实际订单验证。');
 }else if(criteria.smallTrial){
  lines.push(trialComparable(rows)?'这次先小批量测款；同单位报价里，所选款起订量最低，为 '+selected.minimumOrder.count+' '+selected.minimumOrder.unit+'。下单前应核对首批采购额和运费。':'小批量测款需要可比较的起订量。现有报价缺少数量或单位不一致，建议先向供应商询最小试单量及样品运费。');
 }else if(criteria.periodGoal){
  if(rows.every(r=>r.periodMargin!==null))lines.push('按同期间历史销量试算，首选款贡献 ¥'+selected.periodMargin.toFixed(2)+'。销量变化会影响排序。');
  else lines.push('期间总收益仍待核算：需要各款同期间销量与单件收益。目前只能给出初筛候选。');
 }else if(unitGoal&&runner&&selected.margin!==null){
  const share=criteria.fees?1-(criteria.fees.service+criteria.fees.promotion)/100:1;
  const gap=selected.margin-runner.margin;
  if(gap===0)lines.push('「'+runner.title+'」的预计单件收益相同。可优先核实两款起订量和实际成交价。');
  if(gap>0&&share>0&&selected.retail-gap/share>0)lines.push('对比备选「'+runner.title+'」，首选每件多 ¥'+gap.toFixed(2)+'。仅首选售价变动、其余条件相同时，首选降到约 ¥'+(selected.retail-gap/share).toFixed(2)+'，两款收益持平。');
 }
 if(pick.decisionCheck)lines.push(pick.decisionCheck);
 const compositions={'白底商品展示':'白底居中，突出完整商品轮廓','卖点特写主图':'右侧展示商品，左侧呈现特点与局部细节','淘宝商品封面':'大幅商品实拍搭配短标题与底部信息栏','活动价格主图':'上方展示商品，下方信息带突出已确认的促销文案'};
 const conflicts=rows.filter(r=>r.quoteNotes?.length);
 if(conflicts.length)lines.push('询价后再决策：'+conflicts.map(r=>'「'+r.title+'」记录到不同报价或单位（'+r.quoteNotes.join(' / ')+'），收益待核算。').join(' '));
 if(pictures.length)lines.push('图片交付：'+pictures.map(a=>a.title+(a.layoutName?' · '+(compositions[a.layoutName]||a.layoutName):'')).join('、')+'。'+(pictures.some(a=>a.title.includes('概念'))?'上架前请核对图中外观、颜色与实际发货配件。':'请核对实物与最终版面后上架。'));
 return {text:lines.join('\n\n'),paragraphs:lines,selection:selected,verdict,periodGoal:!!criteria.periodGoal,candidateCount:rows.length,imageIds:pictures.map(a=>a.id),source:selected.url};
}
