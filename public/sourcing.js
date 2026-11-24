// Shared by goal creation and the task runner so that both search the same category.
export function sourcingIntent(text){
 if(typeof text!=='string'||!/1688|阿里巴巴/.test(text)||!/选品|筛选|找|搜|挑|选购|推荐|比价|挑选|选一|选几/.test(text))return null;
 const money=label=>{const m=text.match(new RegExp('(?:'+label+')\\s*(?:为|约|是|按)?[：:¥￥ ]*([0-9]+(?:\\.[0-9]{1,2})?)'));return m?Number(m[1]):null;};
 const explicit=text.match(/(?:品类|类目|关键词)[：:为是 ]+([^，。；;\n]{1,60})/);
 const parts=(explicit?[explicit[1]]:text.split(/[，,；;。\n]/)).map(part=>part
  .replace(/(?:再|并且|并|然后|之后|后)?(?:直接|自动)?(?:作图|做图|出图|生图|(?:生成|制作|做)(?:商品|淘宝)?(?:主图|详情图)).*$/,'')
  .replace(/(?:预计售价|目标售价|零售价|售价|每件其他成本|单件其他成本|其他成本|预算|进价上限)\s*(?:为|约|是|按|不超过)?[：:¥￥ ]*\d+(?:\.\d+)?\s*元?.*$/,'')
  .replace(/(?:请|帮我|给我|优先|最好|希望|我要|想要|在|去|从|通过|到)?(?:1688|阿里巴巴)(?:平台|网站)?上?/g,'')
  .replace(/请|帮我|给我|帮忙|自动|筛选|挑选|选购|找一下|寻找|搜索|搜寻|找出|搜|选品|推荐|比较|找|挑|选(?=一|几)|一款|几款|选一个|选一|一个|一些|性价比高|利润高|高性价比|高利润|高毛利|低进价|划算|具有|适合|合适|进行|对应|某个|优先|并且|而且|同时|商品|产品|品类|类目/g,'')
  .replace(/^[\s、和且并的在上以]+|[\s、的和且并]+$/g,'').trim())
  .filter(s=>s&&!/^(?:要|高|较高|高的|越高越好)$|(?:作图|做图|出图|生成|制作|上架|售价|成本|毛利|利润|性价比)/.test(s));
 return {query:(parts[0]||'').slice(0,60),retail:money('预计售价|目标售价|零售价|售价'),expenses:money('单件其他成本|每件其他成本|其他成本')};
}
export function sourcingURL(query){
 const url=new URL('https://s.1688.com/selloffer/offer_search.htm');
 url.searchParams.set('keywords',query);url.searchParams.set('charset','utf8');return url.href;
}
export function cleanOffers(rows){
 if(!Array.isArray(rows))return [];
 const seen=new Set(),out=[];
 for(const row of rows.slice(0,100)){
  let url;try{url=new URL(row?.url);}catch{continue;}
  const id=url.pathname.match(/^\/offer\/(\d{1,24})\.html\/?$/)?.[1];
  if(url.origin!=='https://detail.1688.com'||!id||url.username||url.password||seen.has(id)||typeof row.title!=='string'||!row.title.trim()||typeof row.price!=='number'||!(row.price>0&&row.price<=1e8))continue;
  seen.add(id);out.push({sku:id,title:row.title.trim().slice(0,160),price:row.price,url:url.origin+'/offer/'+id+'.html',terms:String(row.terms||'').slice(0,120),repurchase:Number.isFinite(row.repurchase)&&row.repurchase>=0&&row.repurchase<=100?row.repurchase:null});
 }
 return out.slice(0,40);
}

export function rankedOffers(rows,criteria){
 // Among comparable listings a lower price and a higher observed repeat
 // purchase rate are preferable. Unknown rates form a separate price-only list.
 const scored=rows.map(r=>({...r,margin:criteria.retail>0&&criteria.expenses!==null?Math.round((criteria.retail-r.price-criteria.expenses)*100)/100:null}));
 for(const r of scored)r.shortlist=r.repurchase!==null&&!scored.some(o=>o.repurchase!==null&&o.price<=r.price&&o.repurchase>=r.repurchase&&(o.price<r.price||o.repurchase>r.repurchase));
 return scored.sort((a,b)=>Number(b.shortlist)-Number(a.shortlist)||a.price-b.price||(b.repurchase??-1)-(a.repurchase??-1));
}

// Derive the report from this version's saved offers and delivered files.
export function sourcingReport(g){
 const pick=g.flow?.nodes.find(n=>n.capability==='sourcing.1688'&&n.status==='succeeded');
 const criteria=sourcingIntent(g.text);
 if(!pick?.offers?.length||!criteria)return null;
 const rows=rankedOffers(cleanOffers(pick.offers),criteria);
 if(!rows.length)return null;
 const imageSteps=g.flow.nodes.filter(n=>n.capability.startsWith('image.')&&n.status==='succeeded');
 const prep=imageSteps.find(n=>n.preparation?.candidate)?.preparation;
 if(rows[0].margin!==null&&/利润|毛利|收益|盈利/.test(g.text))rows.sort((a,b)=>b.margin-a.margin);
 const selected=prep?rows.find(r=>r.sku===prep.candidate.sku):rows[0];
 if(!selected)return null;
 const pictures=g.artifacts.filter(a=>a.version===g.version&&a.imageJobId&&imageSteps.some(n=>n.imageJobId===a.imageJobId));
 const facts=(prep?.facts||[]).filter(f=>!/^商品品类/.test(f));
 const terms=['增压','防堵','手持','可调节','旋转','可拆洗','折叠','便携','快充','套装'].filter(term=>selected.title.includes(term)).slice(0,3);
 const pitch=facts.length?facts.slice(0,3).join('；'):terms.length?'供应商标题提到'+terms.map(t=>'「'+t+'」').join('、')+'，建议核对实物后用于详情文案。':'当前报价只列出了商品名称；建议先展示外观，性能卖点待核实。';
 const lines=['从 '+rows.length+' 款'+criteria.query+'里，我推荐「'+selected.title+'」。','采购页展示价 ¥'+selected.price+'；'+(selected.repurchase===null?'页面未披露回购率。':'页面回购率 '+selected.repurchase+'%。')+(selected.margin===null?'缺少售价或其他成本，暂时无法判断哪款利润最高。':'按售价 ¥'+criteria.retail+'、其他单件成本 ¥'+criteria.expenses+'，估算单件收益 ¥'+selected.margin.toFixed(2)+'。'),'卖点建议：'+pitch];
 const compositions={'白底商品展示':'白底居中，突出完整商品轮廓','卖点特写主图':'右侧展示商品，左侧呈现特点与局部细节','活动价格主图':'上方展示商品，下方信息带突出已确认的促销文案'};
 if(pictures.length)lines.push('图片交付：'+pictures.map(a=>a.title+(a.layoutName?' · '+(compositions[a.layoutName]||a.layoutName):'')).join('、')+'。'+(pictures.some(a=>a.title.includes('概念'))?'上架前请核对图中外观、颜色与实际发货配件。':'请核对实物与最终版面后上架。'));
 return {text:lines.join('\n\n'),imageIds:pictures.map(a=>a.id),source:selected.url};
}
