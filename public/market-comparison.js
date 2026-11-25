// Keep public listing prices and retail demand separate from the shop's own transactions.
const seasonNames={春:'春季',夏:'夏季',秋:'秋季',冬:'冬季'};

export function demandPeriod(text){
 const found=[...String(text||'').matchAll(/([春夏秋冬])(?:季|天|款|日|装|令)/g)].map(match=>seasonNames[match[1]]);
 const distinct=[...new Set(found)];
 return distinct.length===1?distinct[0]:null;
}

export function observationSeason(observation){
 const stated=demandPeriod(observation.season);
 const period=String(observation.period||'').trim();
 const month=period.match(/^\d{4}[-年/](\d{1,2})月?$/);
 // Sales during one named month belong to that period even when the article
 // also advertises a different season. Multi-month spans need an explicit label.
 const dated=month&&Number(month[1])>=1&&Number(month[1])<=12?
  ['冬季','春季','夏季','秋季'][Math.floor(Number(month[1])%12/3)]:demandPeriod(period);
 if(stated&&dated&&stated!==dated)return null;
 return dated||stated;
}

function sourceLine(observation){
 const label=observation.kind==='ledger'?'店铺账单':observation.kind==='web'?'搜索摘要':'资料原文';
 return [label,...new Set([observation.title,observation.source,observation.period,observation.url].filter(Boolean))].join(' · ');
}

function marketChannel(observation){
 if(observation.kind==='ledger')return '本店';
 const identity=[observation.url,observation.source,observation.title,observation.text].filter(Boolean).join(' ');
 if(/1688\.com|阿里巴巴批发/.test(observation.url||''))return '';
 if(/京东|jd\.com/i.test(identity))return '京东';
 if(/闲鱼|goofish\.com/i.test(identity))return '闲鱼';
 if(/拼多多|pinduoduo\.com|yangkeduo\.com/i.test(identity))return '拼多多';
 if(/淘宝|taobao\.com/i.test(identity))return '淘宝';
 if(/天猫|tmall\.com/i.test(identity))return '天猫';
 // Local evidence can share a named data set. Avoid pooling unrelated domains.
 if(observation.kind==='knowledge')return observation.source||'';
 try{return new URL(observation.url).hostname;}catch{return '';}
}

function windowKey(observation){
 const period=String(observation.period||'').trim();
 const channel=marketChannel(observation);
 if(!channel||!period)return null;
 const unit=observation.unit;
 if(!['件','单','只','个','袋','套','包','瓶','盒','台'].includes(unit))return null;
 // "近30天" on two different dates is not a common measurement window.
 if(!/20\d\d/.test(period))return null;
 const month=period.match(/^(20\d\d)[-年/](\d{1,2})月?$/);
 const window=month?month[1]+'-'+month[2].padStart(2,'0'):period;
 return [channel,window,unit].join('|');
}

export function moneyRange(low,high){
 const amount=n=>'¥'+n.toFixed(2);
 return low===high?amount(low):amount(low)+'–'+amount(high);
}

function attachMarket(row,criteria,observations,expenseAt){
 const market={prices:[],demand:[],comparables:[],margin:null,feeCeiling:null};
 row.market=market;
 const matching=observations.filter(item=>item.sku===row.sku&&['exact','comparable'].includes(item.scope));
 const priced=matching.filter(item=>item.dimension==='retail'&&item.metric==='listingPrice'&&Number.isFinite(item.value)&&item.value>0&&
  ['元','CNY','人民币','元/件','元/只','元/个','元/袋'].includes(item.unit)&&marketChannel(item));
 // Prefer a counterpart identified as this SKU. Comparable models give a sensitivity range only.
 const exact=priced.filter(item=>item.scope==='exact');
 market.prices=exact.length?exact:priced;
 if(market.prices.length){
  const prices=market.prices.map(item=>item.value);
  market.priceRange=[Math.min(...prices),Math.max(...prices)];
 }
 if(row.cost!=null&&!row.assumedSaleUnit&&row.retail==null){
  const fixed=criteria.fees?.shipping??criteria.expenses;
  const retained=criteria.fees?1-(criteria.fees.service+criteria.fees.promotion)/100:1;
  if(Number.isFinite(fixed)&&retained>0)market.breakEvenSale=Math.ceil(((row.cost+fixed)/retained)*100-1e-8)/100;
 }
 if(row.margin!=null&&!row.assumedSaleUnit)market.margin=[row.margin,row.margin];
 if(row.cost!=null&&!row.assumedSaleUnit&&market.priceRange){
  const [low,high]=market.priceRange;
  market.feeCeiling=[low-row.cost,high-row.cost];
  if(!market.margin&&row.retail==null){
   const lowerExpense=expenseAt(criteria,low),upperExpense=expenseAt(criteria,high);
   if(Number.isFinite(lowerExpense)&&Number.isFinite(upperExpense)){
    market.margin=[low-row.cost-lowerExpense,high-row.cost-upperExpense].map(value=>Math.round(value*100)/100);
   }
  }
 }
 const inSeason=item=>!criteria.season||observationSeason(item)===criteria.season;
 const relevant=matching.filter(item=>item.dimension==='demand'&&inSeason(item));
 market.comparables=relevant.filter(item=>item.scope==='comparable'&&item.metric==='unitsSold'&&windowKey(item));
 const demand=relevant.filter(item=>item.scope==='exact'&&item.metric==='unitsSold'&&Number.isSafeInteger(item.value)&&item.value>=0);
 if(row.salesBasis){
  const ledger={sku:row.sku,kind:'ledger',scope:'exact',strength:'document',period:row.salesBasis.period,source:row.salesBasis.source,value:row.salesBasis.units,unit:'件'};
  if(inSeason(ledger))demand.unshift(ledger);
 }
 market.demand=demand.filter(item=>windowKey(item));
}

function comparableWindows(rows){
 const windows=new Map();
 for(const row of rows){
  for(const observation of row.market.demand){
   // Rounded ranks or open-ended counters ("10万+") cannot support multiplication.
   if(/[\d万千][+＋]|(?:累计|历年)销量|销量超过|销量约/.test(observation.text||''))continue;
   const key=windowKey(observation);
   if(!windows.has(key))windows.set(key,new Map());
   const samples=windows.get(key);
   const old=samples.get(row.sku);
   samples.set(row.sku,old===undefined||old?.value===observation.value?observation:null);
  }
 }
 // Use one reporting basis for the whole comparison. Prefer coverage, then
 // the shop's records and the latest period; never choose the best-looking month.
 return [...windows.entries()].map(([key,values])=>({key,values,coverage:[...values.values()].filter(Boolean).length}))
  .filter(entry=>entry.coverage>=2)
  .sort((a,b)=>b.coverage-a.coverage||Number(b.key.startsWith('本店|'))-Number(a.key.startsWith('本店|'))||
   b.key.split('|')[1].localeCompare(a.key.split('|')[1])||a.key.localeCompare(b.key))[0];
}

export function marketComparisons(eligible,criteria,investigation,expenseAt,priority){
 const observations=Array.isArray(investigation?.observations)?investigation.observations:[];
 for(const row of eligible)attachMarket(row,criteria,observations,expenseAt);
 const context=observations.find(item=>item.scope==='category'&&item.dimension==='demand'&&(!criteria.season||observationSeason(item)===criteria.season));
 if(context)for(const row of eligible)row.market.context=context;
 const window=comparableWindows(eligible);
 if(window)for(const row of eligible){
  const sample=window.values.get(row.sku);
  if(!sample)continue;
  row.market.sample=sample;
  const margins=row.market.margin;
  if(margins&&sample.unit!=='单')row.market.contribution=margins.map(value=>Math.round(sample.value*value*100)/100);
 }
 const quality=market=>market.sample?3:market.demand.length?2:market.comparables.length?1:0;
 // Avoid pairwise switches between incompatible metrics (a non-transitive comparator).
 // Only compare contributions when available for every measured candidate.
 const sampled=eligible.filter(row=>row.market.sample);
 const useContribution=criteria.compareProfit&&sampled.length>1&&sampled.every(row=>row.market.contribution);
 eligible.sort((a,b)=>{
  const ma=a.market,mb=b.market;
  if(priority!=='marketDemand'){
   const comparable=ma.margin&&mb.margin;
   if(comparable)return mb.margin[0]-ma.margin[0];
   if(ma.margin||mb.margin)return Number(!!mb.margin)-Number(!!ma.margin);
   if(ma.feeCeiling&&mb.feeCeiling)return mb.feeCeiling[0]-ma.feeCeiling[0];
   return Number(!!mb.feeCeiling)-Number(!!ma.feeCeiling);
  }
  const byEvidence=quality(mb)-quality(ma);
  if(byEvidence)return byEvidence;
  if(ma.sample&&mb.sample){
   if(useContribution)return mb.contribution[0]-ma.contribution[0]||mb.sample.value-ma.sample.value;
   return mb.sample.value-ma.sample.value;
  }
  return (mb.margin?.[0]??-Infinity)-(ma.margin?.[0]??-Infinity)||0;
 });
 return eligible;
}

export function describeComparison(rows,selected,criteria){
 if(!selected?.market)return '';
 const eligible=rows.filter(row=>row.eligibility==='eligible');
 const rival=eligible.find(row=>row.sku!==selected.sku);
 const period=criteria.season||'目标销售期';
 const market=selected.market;
 const lines=[];
 if(!criteria.demandGoal){
  if(market.margin&&rival?.market?.margin)lines.push('按两款各自的售价和费用口径，首选估算单件收益 '+moneyRange(...market.margin)+'，备选「'+rival.title+'」为 '+moneyRange(...rival.market.margin)+'。');
 }else if(market.sample){
  const sample=market.sample;
  lines.push(period+'动销比较采用 '+sample.period+' 的记录。首选「'+selected.title+'」记录 '+sample.value+' '+sample.unit+'（'+sourceLine(sample)+'）。');
  if(rival?.market?.sample)lines.push('备选「'+rival.title+'」在同一口径下记录 '+rival.market.sample.value+' '+rival.market.sample.unit+'（'+sourceLine(rival.market.sample)+'）。');
  if(criteria.compareProfit&&market.contribution&&rival?.market?.contribution){
   lines.push('将观察期件数与估算单件收益相乘，首选贡献 '+moneyRange(...market.contribution)+'，备选 '+moneyRange(...rival.market.contribution)+'。这是按该期数据试算，店铺未来销量仍待验证。');
  }else if(criteria.compareProfit)lines.push('先按同期间的零售动销初筛；确认两款各自的成交价和完整费用后才能判定同期贡献。');
 }else if(market.demand.length){
  const sample=market.demand[0];
  lines.push(period+'的同款动销资料见 '+sourceLine(sample)+'；各款缺少共同统计窗口，只能暂列首选。');
 }else if(market.comparables.length){
  lines.push('「'+selected.title+'」有'+period+'的相近款需求线索（'+sourceLine(market.comparables[0])+'）。先核实该款的实际销量和成交价。');
 }else{
  lines.push('尚无可归属到候选款的'+period+'零售动销依据。暂列的「'+selected.title+'」可优先询价或小批量测试，销量优势仍待核实。');
 }
 if(market.prices.length){
  lines.push((market.prices[0].scope==='exact'?'同款':'相近规格')+'零售展示价 '+moneyRange(...market.priceRange)+'（'+sourceLine(market.prices[0])+'）。实际成交价需核对。');
 }
 if(market.breakEvenSale!=null)lines.push('按本次给定费用估算，单件成交价约需达到 '+moneyRange(market.breakEvenSale,market.breakEvenSale)+' 才能保本。');
 if(market.context&&!market.sample)lines.push('另有品类需求线索（'+sourceLine(market.context)+'），其销量不能归给本款。');
 if(market.margin&&selected.margin==null)lines.push('沿用上述展示价和给定费用，估算单件收益 '+moneyRange(...market.margin)+'。');
 if(market.contribution&&rival?.market?.contribution&&market.contribution[0]<=rival.market.contribution[1]&&market.contribution[1]>=rival.market.contribution[0]&&
  (market.contribution[1]>market.contribution[0]||rival.market.contribution[1]>rival.market.contribution[0]))lines.push('两款期间贡献区间有重叠，按区间下限暂排，实际成交价可能改变顺序。');
 if(market.feeCeiling&&selected.expenses==null&&!criteria.fees)lines.push('按该展示价试算，每单可用于履约、平台、推广、退货等费用的空间为 '+moneyRange(...market.feeCeiling)+'。费用达到相应上限时贡献为零。');
 const own=market.margin,other=rival?.market?.margin;
 if(criteria.compareProfit&&own&&other&&own[0]>0&&other[0]>0&&own[0]===own[1]&&other[0]===other[1]&&own[0]!==other[0]){
  lines.push('两款比较同期间贡献时，首选的销量需达到备选约 '+(other[0]/own[0]).toFixed(2)+' 倍才能持平（'+moneyRange(other[0],other[0])+' ÷ '+moneyRange(own[0],own[0])+'）。');
 }
 return lines.join('\n');
}
