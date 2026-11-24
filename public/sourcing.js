// Shared by goal creation and the task runner so that both search the same category.
export function sourcingIntent(text){
 if(typeof text!=='string'||!/1688|阿里巴巴/.test(text)||!/选品|筛选|找|搜|挑|选购|推荐|比价|挑选|选一|选几/.test(text))return null;
 const money=label=>{const m=text.match(new RegExp('(?:'+label+')\\s*(?:为|约|是|按)?[：:¥￥ ]*([0-9]+(?:\\.[0-9]{1,2})?)'));return m?Number(m[1]):null;};
 const explicit=text.match(/(?:品类|类目|关键词)[：:为是 ]+([^，。；;\n]{1,60})/);
 const parts=(explicit?[explicit[1]]:text.split(/[，,；;。\n]/)).map(part=>part
  .replace(/(?:预计售价|目标售价|零售价|售价|每件其他成本|单件其他成本|其他成本|预算|进价上限)\s*(?:为|约|是|按|不超过)?[：:¥￥ ]*\d+(?:\.\d+)?\s*元?.*$/,'')
  .replace(/(?:请|帮我|给我|优先|最好|希望|我要|想要|在|去|从|通过|到)?(?:1688|阿里巴巴)(?:平台|网站)?上?/g,'')
  .replace(/请|帮我|给我|帮忙|自动|筛选|挑选|选购|找一下|寻找|搜索|搜寻|找出|搜|选品|推荐|比较|找|挑|选(?=一|几)|一款|几款|选一个|选一|一个|一些|性价比高|利润高|高性价比|高利润|高毛利|低进价|划算|具有|适合|合适|进行|对应|某个|优先|并且|而且|同时|商品|产品|品类|类目/g,'')
  .replace(/^[\s、和且并的在上以]+|[\s、的和且并]+$/g,'').trim())
  .filter(s=>s&&!/^(?:要|高|较高|高的|越高越好)$|(?:生成|制作|上架|售价|成本|毛利|利润|性价比)/.test(s));
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
