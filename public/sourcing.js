import {offerPhoto as normalizeOfferPhoto,offerPhotos} from './offer-photos.js';
import {demandPeriod,describeComparison,marketComparisons} from './market-comparison.js';
import {requestParts,asksForMethod} from './goal-language.js';

const sourcePlatform = /1688|阿里巴巴/;
const selectGoods = /选品|筛选|找|搜|挑|选购|推荐|比价|(?:对比|比较).{1,25}(?:报价|进价|价格)|选货|选款|选(?!择)|寻(?:找|源)/;
const purchaseOnly = /(?:只|仅)(?:要|需要|做|改|制作|生成|重新制作).{0,6}(?:主图|详情图|文案|海报)|已有(?:商品|货源|商品链接)|选完了|(?:已经|已)选(?:好|定)/;
const decisionFactors=[
 ['minimumOrder','(?:低)?(?:起订量?|起批量?)'],
 ['repeat','(?:复购|回购)(?:率)?'],
 ['supply','(?:供货稳定性|供货稳定|稳定供货|稳定补货|供货)'],
 ['periodMargin','(?:期间|月度?|当月|总)(?:利润|收益|毛利|贡献)'],
 ['unitMargin','(?:单件|每件|单品)(?:净利润|利润|收益|毛利)']
];
function decisionPriority(text){
 // An explicit business priority overrides a general preference such as a trial order.
 for(const [key,factor] of decisionFactors){
  const first=new RegExp(factor+'(?:为|是|放在)?(?:第一|首要|首位)|(?:第一优先|首要(?:考虑|看)|优先考虑)[：:是为 ]*'+factor);
  if(first.test(text))return key;
 }
 const best=decisionFactors.slice(-2).find(([,factor])=>new RegExp(factor+'(?:最高|最大|最多)|(?:最大化|提高)'+factor).test(text));
 return best?.[0];
}

export function businessBrief(goal){
 let text=goal.text;
 const {requested,excluded}=requestParts(text);
 // Delegating a bare product name can imply sourcing. Explicit channels,
 // analyses and edits already specify the work and keep their own inputs.
 const namedSource=/美团联盟|(?:在|从|去)(?:美团|闲鱼|咸鱼|淘宝|京东|拼多多)|(?:美团|闲鱼|咸鱼)(?:上)?(?:搜|找|选|筛)|1688|阿里巴巴/.test(requested);
 const otherAction=/保本|账单|库存|核算|审核|审查|现有|已有|主图|详情图|文案|海报/.test(requested);
 if(goal.assignedEmployeeId==='flow-sourcing'&&!namedSource&&(!otherAction||selectGoods.test(requested))&&!purchaseOnly.test(requested)&&!selectGoods.test(excluded))text='在1688找'+text;
 if(goal.assignedEmployeeId==='flow-visual'&&!/主图|海报|配图|详情(?:页)?图|生图|作图|做图|出图|(?:不要|无需|不用|不做).*图|只.*文案|只.*文字|简报|提示词/.test(text))text+='；制作商品主图';
 const criteria=sourcingIntent(text);
 if(criteria&&!criteria.query){
  const reply=goal.scenario?.question?.includes('品类或搜索关键词')&&goal.scenario.answer?.split(/[，,。；;\n]/)[0]?.trim();
  const category=goal.scope?.product||reply;
  if(category&&category.length<=60&&!/不知道|不确定|默认|直接判断|随便/.test(category))text+='；品类：'+category;
 }
 return goal.scenario?.answer ? text+'；使用场景：'+goal.scenario.answer : text;
}

// Goal creation, browser discovery and execution need the same category and price basis.
export function sourcingIntent(text){
 if(typeof text!=='string')return null;
 const [action,scenario='']=text.split('；使用场景：');
 const {requested,excluded}=requestParts(action);
 if(!sourcePlatform.test(requested)||!selectGoods.test(requested))return null;
 if(purchaseOnly.test(requested)&&!/(?:在|从|去)?(?:1688|阿里巴巴)(?:平台|上)?(?:找|搜|选|挑|比价)/.test(requested))return null;
 if(selectGoods.test(excluded)&&!/(?:1688|阿里巴巴)(?:平台|上)?(?:找|搜|选|挑|比价)/.test(requested))return null;
 const clauses=requested.split(/[，、]/);
 const selection=clauses.findIndex(c=>selectGoods.test(c)&&!asksForMethod(c)&&!/选完品|选好的|所选|已选|入选|首选|(?:之前|上次|先前|已经).*(?:选|找|搜)|(?:选|找|搜)(?:到|好)的|选择(?:模型|图片|颜色|模板)/.test(c));
 if(selection<0)return null;
 const explicit=[requested,scenario].join('，').match(/(?:品类|类目|关键词)(?:[：:为是 ]+)([^，,、。；;\n]{1,60})/);
 const cleanCategory=value=>value
  .replace(/(?:适合|面向)?(?:新店|老店)?小批量(?:试卖|测款|试单)的?|最(?:赚钱|有利润)的?|性价比最高的?/g,'')
  .replace(/(?:再|并且|并|然后|之后|后|同时)?(?:直接|自动)?(?:作图|做图|出图|生图|(?:生成|制作|做)(?:商品|淘宝)?(?:主图|详情图)|(?:比较|计算|测算)(?:各款|单件|每件)?(?:利润|收益)|(?:给我|给出)(?:选品)?清单).*$/,'')
  .replace(/(?:预计售价|目标售价|零售价|售价|每件其他成本|单件其他成本|其他成本|预算|进价上限|起订量|采购单价)\s*(?:为|约|是|按|不超过)?[：:¥￥ ]*\d+.*$/,'')
  .replace(/想?(?:在|去|从|通过|到)?(?:1688|阿里巴巴)(?:平台|网站)?上?/g,'').replace(/对比|(?:的)?(?:报价|进价|价格)$/g,'')
  .replace(/请|帮我|给我|帮忙|自动|卖得(?:比较)?好(?:的)?|热销的?|畅销的?|筛选|挑选|选购|找一下|寻找|搜索|搜寻|找出|搜|选品|选货|选款|推荐|比较|比价|找|挑|选|(?:[一二两三四五六七八九十几多]|\d+)款|一个|一些|性价比高|(?:利润|收益|毛利)(?:较|更)?高|高性价比|高利润|高收益|高毛利|低进价|划算|低起订量?|具有|适合|合适|进行|对应|某个|优先|并且|而且|同时|商品|产品|品类|类目/g,'')
  .replace(/^[\s、和且并的在上以]+|[\s、的和且并]+$/g,'').trim();
 const category=(explicit?[explicit[1]]:clauses.slice(selection)).map(cleanCategory)
  .find(s=>s&&!/^(?:要|高|较高|高的|越高越好|品|货|款|东西|最佳|热卖|好卖|销量最高)$|作图|做图|出图|生成|制作|上架|售价|成本|毛利|利润|性价比|测款|起订|预算|补货|运费|判断|卖点|清单/.test(s));
 // A scenario can supply a missing category, but its examples never request new work.
 text=[requested,requestParts(scenario).requested].join('，');
 const money=label=>{
  const amount=text.match(new RegExp('(?:'+label+')\\s*(?:为|约|是|按)?[：:¥￥ ]*([0-9]+(?:\\.[0-9]+)?)\\s*(美元|美金|港元|港币|欧元|日元|USD|HKD|EUR|JPY|[%％])?','i'));
  return amount&&!amount[2]&&Number.isFinite(Number(amount[1]))?Number(amount[1]):null;
 };
 const retail=money('预计售价|目标售价|零售价|售价');
 const expenses=money('单件其他成本|每件其他成本|其他成本');
 const basis={query:(category||'').slice(0,60),retail,expenses};
 const season=demandPeriod(text);
 const demandRequest=/畅销|热销|卖得(?:比较)?好|卖得出去|卖出去|销量|动销|需求旺|好卖|卖得动|适销/.test(text);
 if(season)basis.season=season;
 if(demandRequest||season)basis.demandGoal=true;
 if(basis.demandGoal&&/利润|盈利|毛利|收益|赚钱/.test(text))basis.compareProfit=true;
 if(/(?:优先(?:考虑|看|比较)?|侧重|看重)(?:复购|回购)|(?:回购|复购)(?:率)?(?:优先|为主)/.test(text))basis.repeatFirst=true;
 if(/小批量(?:测款|试卖|试单)|低起订|优先小批量/.test(text))basis.smallTrial=true;
 if(/稳定(?:补货|供货|货源)|长期(?:补货|供货|供应)/.test(text))basis.stableSupply=true;
 if(/月利润|月度收益|总利润|总收益|总贡献|一个月.*赚/.test(text))basis.periodGoal=true;
 const priority=decisionPriority(text);
 if(priority)basis.decisionPriority=priority;
 const maxLot=text.match(/(?:起订|起批)(?:量)?\s*(?:上限|最多|不超过|不高于|至多|≤|<=)\s*[：:]?\s*(\d+)\s*(件|个|套|箱|只|袋|包)/)
  ||text.match(/(?:最多|至多)\s*(?:进货|采购|订购|进|订)\s*(\d+)\s*(件|个|套|箱|只|袋|包)/);
 if(maxLot&&Number.isSafeInteger(Number(maxLot[1]))&&Number(maxLot[1])>0)basis.maxMinimumOrder={count:Number(maxLot[1]),unit:maxLot[2]};
 const upperPrice=money('(?:进价|采购单价|单件进货价)(?:上限|最多|不超过|不高于|至多|≤|<=)');
 if(upperPrice!==null)basis.maxUnitPrice=upperPrice;
 const unitMargin=money('(?:单件|每件)(?:预计|预估)?(?:净利润|利润|收益|毛利)(?:至少|不低于|不少于|最低|≥|>=)');
 if(unitMargin!==null)basis.minUnitMargin=unitMargin;
 const marginRate=text.match(/(?:利润率|毛利率|净利率)(?:至少|不低于|不少于|最低|≥|>=)\s*(\d+(?:\.\d+)?)\s*[%％]/);
 if(marginRate)basis.minMarginRate=Number(marginRate[1]);
 const budget=text.match(/(?:首批|首单|试单|采购)(?:采购|进货)?(?:预算|金额|货款)\s*(?:[（(]含运费[）)])?\s*(?:上限|最多|不超过|不高于|至多|≤|<=|为|约)?[：:¥￥ ]*(\d+(?:\.\d{1,2})?)/);
 if(budget){
  basis.maxBatchCost=Number(budget[1]);
  if(/(?:预算|金额|货款).{0,15}(?:含运费|含邮费)|(?:含运费|含邮费).{0,8}(?:预算|金额)/.test(text)&&!/不含运费|不含邮费/.test(text))basis.batchBudgetIncludesFreight=true;
 }
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
 const match=terms?.match(/(?:每|[/／])\s*(\d+(?:\.\d+)?)?\s*(公斤|千克|kg|斤|克|g|件|个|套|箱|只|袋|包)/i);
 if(!match)return null;
 const grams=weightInGrams(match[1],match[2]);
 if(Number.isFinite(grams))return grams>0?grams:null;
 const count=Number(match[1]||1);
 return count>0?(count===1?'':String(count))+match[2]:null;
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
 const field=/^(?:镜框材质|镜架材质|镜片材质|镜架颜色|镜片颜色|镜框形状|镜框款式|镜架款式|镜片款式|镜框颜色|框架材质|眼镜结构|镜架结构|材质|容量|净含量|额定容量|材质等级|内胆材质|执行标准|保温时长|保温时间|颜色|款式|型号|规格|尺寸|风格|镜宽|镜腿长度|镜框宽度|重量|包装|表面工艺|适用人群|形状|光源类型|供电方式|接口|安装方式)[：:]\s*[^<>\n：:]{1,48}$/;
 return [...new Set((Array.isArray(values)?values:[]).filter(v=>typeof v==='string').map(v=>v.trim()).filter(v=>field.test(v)&&!/(?:待确认|未知|全网最低|100%|顶级|国家级)/.test(v)))].slice(0,8);
}
export function selectedOffer(rows,criteria,text,investigation){
 return decisionOrder(cleanOffers(rows),criteria,text,investigation).find(row=>row.eligibility==='eligible');
}
export function sourcingPriority(criteria,text){
 if(['unitMargin','periodMargin','minimumOrder','repeat','supply'].includes(criteria?.decisionPriority))return criteria.decisionPriority;
 if(criteria?.repeatFirst)return 'repeat';
 if(criteria?.stableSupply)return 'supply';
 if(criteria?.smallTrial)return 'minimumOrder';
 if(criteria?.periodGoal&&!criteria.season)return 'periodMargin';
 if(criteria?.demandGoal)return 'marketDemand';
 return /利润|毛利|收益|盈利|赚/.test(text)?'unitMargin':'quote';
}
export function decisionOrder(rows,criteria,text,investigation){
 const ranked=rankedOffers(rows,criteria);
 const priority=sourcingPriority(criteria,text);
 // A quote which fails a purchase condition can never become the fallback winner.
 const feasible=ranked.filter(r=>r.eligibility==='eligible');
 const rest=ranked.filter(r=>r.eligibility!=='eligible');
 if(priority==='repeat'&&feasible.some(r=>r.repurchase!=null)){
  feasible.sort((a,b)=>(b.repurchase??-1)-(a.repurchase??-1));
 }else if(priority==='supply'){
  const metrics=new Set(feasible.filter(r=>r.fulfillment).map(r=>r.fulfillment.label));
  feasible.sort((a,b)=>{
   const byRecord=metrics.size===1?(b.fulfillment?.rate??-1)-(a.fulfillment?.rate??-1):0;
   return byRecord||(a.dispatchHours??Infinity)-(b.dispatchHours??Infinity);
  });
 }else if(priority==='minimumOrder'&&trialComparable(feasible)){
  feasible.sort((a,b)=>a.minimumOrder.count-b.minimumOrder.count);
 }else if(priority==='periodMargin'&&comparablePeriods(feasible)){
  feasible.sort((a,b)=>b.periodMargin-a.periodMargin);
 }else if(priority==='unitMargin'||priority==='marketDemand'&&criteria.compareProfit){
  feasible.sort((a,b)=>(b.margin??-Infinity)-(a.margin??-Infinity));
 }
 if(investigation&&['marketDemand','unitMargin','quote'].includes(priority))marketComparisons(feasible,criteria,investigation,scenarioExpenses,priority);
 return feasible.concat(rest);
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
   const firstLot=orderMinimum(record.terms),nextLot=orderMinimum(terms);
   const lotConflict=firstLot&&nextLot&&(firstLot.unit!==nextLot.unit||firstLot.count!==nextLot.count);
   if(record.price!==row.price||firstUnit&&nextUnit&&firstUnit!==nextUnit||lotConflict){
    notes.push('¥'+record.price+' '+record.terms,'¥'+row.price+' '+terms);
   }
   if(record.price===row.price&&terms!==record.terms){
    const priorEvidence=!!firstUnit||!!firstLot||dispatchHours(record.terms)!=null||!!fulfillmentRecord(record.terms);
    const addsEvidence=!!nextUnit&&!firstUnit||!!nextLot&&!firstLot||dispatchHours(terms)!=null&&dispatchHours(record.terms)==null||
     fulfillmentRecord(terms)&&!fulfillmentRecord(record.terms)||terms.includes('首批运费')&&!record.terms.includes('首批运费');
    if(addsEvidence)record.terms=priorEvidence?[...new Set((terms+'；'+record.terms).split(/[；;]/))].join('；').slice(0,120):terms;
   }
   if(row.facts?.length)record.facts=offerFacts([...(record.facts||[]),...row.facts]);
   if(photos.length){record.photos=offerPhotos(record.photo,record.photos,photos);record.photo=record.photos[0];}
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
function comparablePeriods(rows){
 return rows.length>0&&rows.every(r=>r.periodMargin!=null&&r.salesBasis.period===rows[0].salesBasis.period);
}
function orderMinimum(terms){
 const lot=terms.match(/(?:起订量|起批量)\s*[:：]?\s*(\d+)\s*(件|个|套|箱|只|袋|包)/)||terms.match(/(\d+)\s*(件|个|套|箱|只|袋|包)\s*起(?:订|批)/);
 const count=Number(lot?.[1]);
 return Number.isSafeInteger(count)&&count>0?{count,unit:lot[2]}:null;
}
function dispatchHours(terms){
 const time=terms.match(/(\d+(?:\.\d+)?)\s*(小时|天)\s*(?:内)?发货(?!率)/);
 return time?Number(time[1])*(time[2]==='天'?24:1):null;
}
function fulfillmentRecord(terms){
 const match=terms.match(/((?:近\s*\d+\s*天\s*)?(?:准时发货率|按时发货率|\d+\s*小时(?:内)?发货率))\s*[:：]?\s*(\d+(?:\.\d+)?)\s*[%％]/);
 if(!match||Number(match[2])>100)return null;
 return {label:match[1].replace(/\s/g,''),rate:Number(match[2])};
}
function assessPurchase(r,criteria,unit,minimumOrder,cost,retail,margin){
 const missing=[],excluded=[];
 const lotLimit=criteria.maxMinimumOrder;
 if(lotLimit){
  if(r.quoteNotes?.length||!minimumOrder||minimumOrder.unit!==lotLimit.unit)missing.push('需确认以'+lotLimit.unit+'计的起订量（上限 '+lotLimit.count+' '+lotLimit.unit+'）');
  else if(minimumOrder.count>lotLimit.count)excluded.push('起订 '+minimumOrder.count+' '+minimumOrder.unit+'，超过上限 '+lotLimit.count+' '+lotLimit.unit);
 }
 if(criteria.maxUnitPrice!=null){
  if(cost===null||!unit)missing.push('需核对计价单位及对应单价（上限 ¥'+criteria.maxUnitPrice+'）');
  else if(cost>criteria.maxUnitPrice)excluded.push('折算单价 ¥'+cost+'，超过上限 ¥'+criteria.maxUnitPrice);
 }
 const profitLimit=criteria.minUnitMargin!=null||criteria.minMarginRate!=null;
 if(profitLimit&&(!unit||margin==null)){
  const required=[!unit?'计价单位':'',cost==null?'适用采购成本':'',retail==null?'售价':'',scenarioExpenses(criteria,retail)==null?'单件费用':''].filter(Boolean);
  missing.push('需核实'+required.join('、')+'后验证最低收益要求');
 }else if(profitLimit){
  if(criteria.minUnitMargin!=null&&margin<criteria.minUnitMargin)excluded.push('估算单件收益 ¥'+margin.toFixed(2)+'，低于最低 ¥'+criteria.minUnitMargin);
  if(criteria.minMarginRate!=null&&Math.round(margin*100)*100<criteria.minMarginRate*Math.round(retail*100))excluded.push('估算收益率 '+(margin/retail*100).toFixed(2)+'%，低于最低 '+criteria.minMarginRate+'%');
 }
 // Use the supplier's purchase unit for cash required at MOQ. Retail fees and
 // per-order customer shipping cannot stand in for inbound freight on this lot.
 const pack=typeof unit==='string'&&unit.match(/^(\d+(?:\.\d+)?)?(件|个|套|箱|只|袋|包)$/);
 const packCount=pack?Number(pack[1]||1):null;
 const firstBatchCost=!r.quoteNotes?.length&&minimumOrder&&packCount>0&&pack[2]===minimumOrder.unit?
  Math.round(r.price*Math.ceil(minimumOrder.count/packCount)*100)/100:null;
 if(criteria.maxBatchCost!=null){
  const limit=criteria.maxBatchCost;
  if(firstBatchCost===null)missing.push('需确认首批起订数量及对应报价单位（预算 ¥'+limit+'）');
  else if(firstBatchCost>limit)excluded.push('首批货款 ¥'+firstBatchCost+'，超过预算 ¥'+limit);
  else if(criteria.batchBudgetIncludesFreight){
   const freight=String(r.terms||'').match(/首批运费\s*[:：]?\s*[¥￥]?\s*(\d+(?:\.\d{1,2})?)\s*元/);
   if(!freight)missing.push('首批货款 ¥'+firstBatchCost+'，需确认首批运费后核对含运预算 ¥'+limit);
   else if(Math.round((firstBatchCost+Number(freight[1]))*100)>Math.round(limit*100))excluded.push('首批货款和运费合计 ¥'+(firstBatchCost+Number(freight[1])).toFixed(2)+'，超过预算 ¥'+limit);
  }
 }
 return {firstBatchCost,eligibility:excluded.length?'excluded':missing.length?'unverified':'eligible',eligibilityReasons:[...excluded,...missing]};
}
export function rankedOffers(rows,criteria){
 // Among comparable listings a lower price and a higher observed repeat
 // purchase rate are preferable. Unknown rates form a separate price-only list.
 const scored=rows.map(r=>{
  const unit=quoteUnit(r.terms);
  let cost=r.price;
  if(criteria.grams)cost=typeof unit==='number'?Math.round(r.price*criteria.grams/unit*100)/100:null;
  else if(typeof unit==='number')cost=null;
  else if(typeof unit==='string'&&/^\d/.test(unit))cost=Math.round(r.price/parseFloat(unit)*100)/100;
  if(r.quoteNotes?.length)cost=null;
  const retail=criteria.retail??r.salesBasis?.price??null;
  const expenses=scenarioExpenses(criteria,retail);
  const margin=cost!==null&&retail>0&&expenses!=null?Math.round((retail-cost-expenses)*100)/100:null;
  const periodMargin=margin!==null&&r.salesBasis?Math.round(margin*r.salesBasis.units*100)/100:null;
  const terms=String(r.terms||'');
  const minimumOrder=orderMinimum(terms);
  return {...r,cost,retail,expenses,margin,periodMargin,assumedSaleUnit:unit===null&&cost!==null,minimumOrder,dispatchHours:dispatchHours(terms),fulfillment:fulfillmentRecord(terms),
   ...assessPurchase(r,criteria,unit,minimumOrder,cost,retail,margin)};
 });
 for(const r of scored)r.shortlist=r.eligibility==='eligible'&&r.cost!==null&&r.repurchase!=null&&!scored.some(o=>o.eligibility==='eligible'&&o.cost!==null&&o.repurchase!=null&&o.cost<=r.cost&&o.repurchase>=r.repurchase&&(o.cost<r.cost||o.repurchase>r.repurchase));
 const priority={eligible:0,unverified:1,excluded:2};
 return scored.sort((a,b)=>priority[a.eligibility]-priority[b.eligibility]||Number(a.cost===null)-Number(b.cost===null)||Number(b.shortlist)-Number(a.shortlist)||(a.cost??a.price)-(b.cost??b.price)||(b.repurchase??-1)-(a.repurchase??-1));
}

export function comparisonSummary(rows,winner,criteria){
 return describeComparison(rows,winner,criteria);
}

export function goalSelection(goal,nodes=goal.flow?.nodes||[]){
 const brief=businessBrief(goal),criteria=sourcingIntent(brief);
 const pick=nodes.find(node=>node.capability==='sourcing.1688'&&node.status==='succeeded');
 const research=nodes.find(node=>node.capability==='research.compare'&&node.status==='succeeded');
 const rows=pick&&criteria?decisionOrder(cleanOffers(pick.offers),criteria,brief,research?.investigation):[];
 const lockedSku=research?.selection?.sku||pick?.selection?.sku||nodes.find(node=>node.capability.startsWith('image.')&&node.status==='succeeded'&&node.preparation?.candidate)?.preparation.candidate.sku;
 const winner=rows.find(row=>row.eligibility==='eligible'&&(!lockedSku||row.sku===lockedSku));
 return {pick,research,criteria,rows,winner};
}

// Derive the report from this version's saved offers and delivered files.
export function sourcingReport(g){
 const {pick,research,criteria,rows,winner:selected}=goalSelection(g);
 if(!selected)return null;
 const brief=businessBrief(g);
 const eligible=rows.filter(row=>row.eligibility==='eligible');
 const completedImages=g.flow.nodes.filter(n=>n.capability.startsWith('image.')&&n.status==='succeeded');
 const imageSteps=completedImages.filter(n=>n.preparation?.candidate?.sku===selected.sku);
 const prep=imageSteps[0]?.preparation;
 const current=(g.artifacts||[]).filter(a=>a.version===g.version&&a.status!=='superseded');
 const pictures=current.filter(a=>a.imageJobId&&imageSteps.some(n=>n.imageJobId===a.imageJobId));
 const copyStep=g.flow.nodes.find(n=>n.capability==='copy.selling_points'&&n.status==='succeeded'&&n.preparation?.candidate?.sku===selected.sku);
 const facts=(copyStep?.preparation.facts||prep?.facts||selected.facts||[]).filter(f=>!/^商品品类/.test(f));
 const terms=['增压','防堵','手持','可调节','旋转','可拆洗','折叠','便携','快充','套装'].filter(term=>selected.title.includes(term)).slice(0,3);
 const draft=copyStep&&current.find(a=>copyStep.artifactIds?.includes(a.id));
 const tagline=draft?.body.match(/^推荐文案：(.+)$/m)?.[1];
 const pitch=tagline|| (facts.length?facts.slice(0,3).join('；'):terms.length?'供应商标题提到'+terms.map(t=>'「'+t+'」').join('、')+'，建议核对实物后用于详情文案。':'当前报价只列出了商品名称；建议先展示外观，性能卖点待核实。');
 const priority=sourcingPriority(criteria,brief);
 const unverified=rows.filter(r=>r.eligibility==='unverified');
 const needsEvidence={
  marketDemand:()=>eligible.length<2||eligible.some(r=>!r.market?.sample||r.market.sample.strength==='lead'||
   criteria.compareProfit&&(!r.market.contribution||r.margin==null)),
  repeat:()=>eligible.some(r=>r.repurchase==null),
  supply:()=>true,
  minimumOrder:()=>!trialComparable(eligible),
  periodMargin:()=>!comparablePeriods(eligible)||eligible.some(r=>r.assumedSaleUnit),
  unitMargin:()=>eligible.some(r=>r.margin==null||r.assumedSaleUnit),
  quote:()=>false
 };
 const provisional=unverified.length>0||needsEvidence[priority]();
 const verdict=provisional?'初筛候选，优先核实':'推荐商品';
 const lines=['从 '+rows.length+' 款'+criteria.query+'里，'+(provisional?'建议优先核实':'我推荐')+'「'+selected.title+'」。','采购页展示价 ¥'+selected.price+'；'+(selected.repurchase===null?'页面未披露回购率。':'页面回购率 '+selected.repurchase+'%。')+(selected.margin===null?(selected.market?.margin?'已按零售展示价另作情景估算，实际单件收益待确认。':'销售规格、售价或成本尚未齐全，利润待核算。'):(criteria.grams?'按每单 '+criteria.grams+' 克折算采购成本 ¥'+selected.cost+'，':'')+'按售价 ¥'+selected.retail+'、'+expenseDescription({...criteria,expenses:selected.expenses})+'，估算单件收益 ¥'+selected.margin.toFixed(2)+'。'),'卖点建议：'+pitch];
 if(selected.margin!=null&&quoteUnit(selected.terms)==null)lines.push('这项试算暂按一份展示报价对应一件销售商品。页面尚未注明报价单位，需核实实际包装及适用阶梯价。');
 if(g.scenario?.answer)lines.push('本次使用场景：'+g.scenario.answer+'。');
 if(selected.salesBasis)lines.push('店铺口径：'+selected.salesBasis.period+'，实际销售 '+selected.salesBasis.units+' 件，成交均价 ¥'+selected.salesBasis.price+'。来源：'+selected.salesBasis.source+'。');
 const runner=eligible.find(r=>r.sku!==selected.sku);
 const excluded=rows.filter(r=>r.eligibility==='excluded');
 if(criteria.minUnitMargin!=null)lines.push('按本次报价和费用假设，所选款单件收益 ¥'+selected.margin.toFixed(2)+'，达到最低 ¥'+criteria.minUnitMargin+'。');
 if(criteria.minMarginRate!=null)lines.push('按同一售价和费用假设，所选款收益率 '+(selected.margin/selected.retail*100).toFixed(2)+'%，达到最低 '+criteria.minMarginRate+'%。');
 if(criteria.maxMinimumOrder&&selected.minimumOrder)lines.push('首选起订 '+selected.minimumOrder.count+' '+selected.minimumOrder.unit+'，本次上限 '+criteria.maxMinimumOrder.count+' '+criteria.maxMinimumOrder.unit+'。');
 if(criteria.maxUnitPrice!=null)lines.push('按本次采购规格折算单价 ¥'+selected.cost+'，上限 ¥'+criteria.maxUnitPrice+'。');
 if(criteria.maxBatchCost!=null)lines.push('按起订量试算首批货款 ¥'+selected.firstBatchCost+'，'+(criteria.batchBudgetIncludesFreight?'报价注明'+(selected.terms.match(/首批运费[^；，,。]*/)?.[0]||'运费待确认')+'，含运':'货款')+'预算 ¥'+criteria.maxBatchCost+'。');
 for(const [label,group] of [['超出采购条件',excluded],['仍需核实',unverified]]){
  if(group.length)lines.push(label+' '+group.length+' 款。'+group.slice(0,2).map(r=>'「'+r.title+'」'+r.eligibilityReasons.join('；')+'。').join(''));
 }
 if(priority==='repeat'){
  lines.push(selected.repurchase===null?'本次优先考虑复购，但供应商页面未提供可比较的回购率，建议先做小样测试。':'按你优先考虑复购的要求，先比较可见的供应商回购率。该指标反映 1688 采购方行为，店铺消费者的复购仍需用实际订单验证。');
 }else if(priority==='supply'){
  const supplyNotes=row=>[row.fulfillment?row.fulfillment.label+' '+row.fulfillment.rate+'%':'',row.dispatchHours!=null?row.dispatchHours+' 小时内发货':''].filter(Boolean).join('，');
  lines.push('长期补货优先比较同口径的履约记录，再参考发货时效。'+
   (supplyNotes(selected)?'首选页面注明'+supplyNotes(selected)+'。':'首选页面尚未披露可对比的履约率或交期。')+
   (runner?'备选「'+runner.title+'」'+(supplyNotes(runner)?'注明'+supplyNotes(runner)+'。':'尚无相应数据。'):'')+'持续补货仍需核实滚动库存和实际准时交付记录。');
 }else if(priority==='minimumOrder'){
  lines.push(trialComparable(eligible)?'这次先小批量测款；同单位报价里，所选款起订量最低，为 '+selected.minimumOrder.count+' '+selected.minimumOrder.unit+'。下单前应核对首批采购额和运费。':'小批量测款需要可比较的起订量。现有报价缺少数量或单位不一致，建议先向供应商询最小试单量及样品运费。');
 }else if(priority==='periodMargin'){
  if(comparablePeriods(eligible))lines.push('按同期间历史销量试算，首选款贡献 ¥'+selected.periodMargin.toFixed(2)+'。销量变化会影响排序。');
  else lines.push('期间总收益仍待核算：需要各款同期间销量与单件收益。目前只能给出初筛候选。');
 }else if(priority==='unitMargin'&&runner?.margin!=null&&selected.margin!==null){
  const share=criteria.fees?1-(criteria.fees.service+criteria.fees.promotion)/100:1;
  const gap=selected.margin-runner.margin;
  if(gap===0)lines.push('「'+runner.title+'」的预计单件收益相同。可优先核实两款起订量和实际成交价。');
  if(gap>0&&share>0&&selected.retail-gap/share>0)lines.push('对比备选「'+runner.title+'」，首选每件多 ¥'+gap.toFixed(2)+'。仅首选售价变动、其余条件相同时，首选降到约 ¥'+(selected.retail-gap/share).toFixed(2)+'，两款收益持平。');
 }
 const comparison=comparisonSummary(rows,selected,criteria);
 if(comparison)lines.push(comparison);
 else if(priority==='marketDemand')lines.push('本次还缺少同款'+(criteria.season||'同期间')+'的零售动销记录，1688 采购端的数据只用于初筛。');
 if(pick.decisionCheck&&(!research?.selection||research.selection.sku===pick.selection?.sku))lines.push(pick.decisionCheck);
 const compositions={'白底商品展示':'白底居中，突出完整商品轮廓','卖点特写主图':'右侧展示商品，左侧呈现特点与局部细节','淘宝商品封面':'大幅商品实拍搭配短标题与底部信息栏','活动价格主图':'上方展示商品，下方信息带突出已确认的促销文案'};
 const conflicts=rows.filter(r=>r.quoteNotes?.length);
 if(conflicts.length)lines.push('询价后再决策：'+conflicts.map(r=>'「'+r.title+'」记录到不同报价或单位（'+r.quoteNotes.join(' / ')+'），收益待核算。').join(' '));
 if(pictures.length)lines.push('图片交付：'+pictures.map(a=>a.title+(a.layoutName?' · '+(compositions[a.layoutName]||a.layoutName):'')).join('、')+'。'+(pictures.some(a=>a.title.includes('概念'))?'上架前请核对图中外观、颜色与实际发货配件。':'请核对实物与最终版面后上架。'));
 return {text:lines.join('\n\n'),paragraphs:lines,selection:selected,verdict,periodGoal:priority==='periodMargin',candidateCount:rows.length,imageIds:pictures.map(a=>a.id),source:selected.url};
}
