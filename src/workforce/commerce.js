const missing=fields=>({status:'needs_input',summary:'业务数据尚不完整，请补齐后重试。',missing:fields,artifacts:[],metrics:{}});
const round=n=>Math.round((n+Number.EPSILON)*100)/100;
const signedAmount=v=>v!==''&&v!=null&&typeof v!=='boolean'&&Number.isFinite(Number(v))&&Math.abs(Number(v))<=1e9;
const validNumber=v=>v!==''&&v!=null&&typeof v!=='boolean'&&Number.isFinite(Number(v))&&Number(v)>=0&&Number(v)<=1e9;
const report=(title,body,source,metrics)=>({status:'succeeded',summary:title,missing:[],artifacts:[{title,body,evidence:source}],metrics});
export const commerceDefinitions=[
 {id:'commerce.sku_profit',name:'SKU 盈亏诊断',description:'导入逐 SKU 收入费用 CSV，计算贡献利润、亏损排序、广告前利润和费用结构，输出排查建议。',roleIds:['profit','analysis'],requires:['commerce.csv','commerce.source','commerce.period'],version:1},
 {id:'campaign.discount',name:'促销折扣测算',description:'比较多个折扣方案的单件贡献、活动总贡献、保本销量和最高保本折扣；不假设折扣会提升销量。',roleIds:['campaign','profit'],requires:['campaign'],version:1},
 {id:'inventory.replenish',name:'批量补货建议',description:'按库存、在途、日销、交期、安全天数、复核周期、MOQ 和整箱量生成补货数量与风险清单。',roleIds:['supply','merchandise'],requires:['replenishment.csv','replenishment.source'],version:1},
 {id:'service.evidence',name:'售后证据答复',description:'从本轮知识召回中选择有词项匹配的政策片段，形成带出处的答复草案；缺依据转人工，不承诺退款或换货。',roleIds:['service','risk'],requires:['serviceQuestion 或 question','knowledgeRecall.hits'],version:1}
];
export const recipes=[
 {id:'sku-profit',name:'查清哪些商品在亏钱',employeeName:'SKU 盈亏分析员',roleId:'profit',skillIds:['commerce.sku_profit'],kind:'analysis',goal:'分析本月各 SKU 盈亏，列出亏损商品、主要费用和优先排查事项',input:'逐 SKU 收入费用 CSV、账单来源与期间',output:'逐 SKU 利润表、亏损优先级、费用核对清单',keywords:'亏损|盈亏|SKU利润|商品利润|哪些商品|经营诊断'},
 {id:'discount',name:'活动折扣还能不能赚钱',employeeName:'活动利润测算员',roleId:'campaign',skillIds:['campaign.discount'],kind:'analysis',goal:'比较不同促销折扣的利润和保本销量，给出可复核的活动方案',input:'售价、单位成本、费率、预计销量、固定预算、折扣列表',output:'折扣情景对比、保本销量与预算风险',keywords:'折扣|促销|活动预算|保本销量'},
 {id:'replenish',name:'生成商品补货清单',employeeName:'库存补货分析员',roleId:'supply',skillIds:['inventory.replenish'],kind:'analysis',goal:'核对库存、销量和供货周期，整理优先补货商品与建议采购数量',input:'逐 SKU 库存与补货参数 CSV',output:'补货数量、断货风险和到货假设',keywords:'补货|断货|采购数量|库存风险'},
 {id:'service',name:'根据政策准备售后答复',employeeName:'售后知识答复员',roleId:'service',skillIds:['service.evidence'],kind:'analysis',goal:'根据知识库政策，回答客户的售后问题并注明依据，缺少资料交人工确认',input:'客户问题、已启用的政策知识库',output:'证据片段、答复草案与人工确认项',keywords:'售后|客服|客户.*问题|退换货|退款政策'}
];
export function matchingRecipes(text){return recipes.filter(r=>new RegExp(r.keywords,'i').test(text));}
export function parseBusinessCsv(raw,required){
 if(typeof raw!=='string'||!raw.trim()||raw.length>80000)throw new Error('请提供不超过 80000 字符的 CSV');
 const rows=[];let row=[],cell='',quoted=false,closed=false;const s=raw.replace(/^\uFEFF/,'');
 for(let i=0;i<s.length;i++){const c=s[i];if(quoted){if(c==='"'){if(s[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}
  if(c==='"'){if(cell||closed)throw new Error('CSV 引号格式错误');quoted=true;continue;}
  if(c===','||c==='\n'||c==='\r'){row.push(cell.trim());cell='';closed=false;if(c!==','){if(row.some(Boolean))rows.push(row);row=[];if(c==='\r'&&s[i+1]==='\n')i++;}continue;}
  if(closed&&c.trim())throw new Error('CSV 闭合引号后只能是分隔符');cell+=c;
 }
 if(quoted)throw new Error('CSV 引号未闭合');row.push(cell.trim());if(row.some(Boolean))rows.push(row);
 if(rows.length<2||rows.length>201)throw new Error('CSV 需要表头和 1–200 条数据');
 const header=rows.shift();if(new Set(header).size!==header.length||header.length>30)throw new Error('CSV 表头重复或过多');
 const absent=required.filter(k=>!header.includes(k));if(absent.length)throw new Error('CSV 缺少列：'+absent.join('、'));
 return rows.map((r,i)=>{if(r.length!==header.length)throw new Error(`第 ${i+2} 行列数与表头不同`);return Object.fromEntries(header.map((k,j)=>[k,r[j]]));});
}
export function commerceSample(id){
 if(id==='commerce.sku_profit')return {commerce:{csv:'sku,netSales,goods,fees,fulfillment,ads,returns,other\nDEMO-A,10000,4000,500,800,2500,200,100\nDEMO-B,3000,1600,150,400,1200,200,50',source:'虚构演示账单',period:'演示月份'}};
 if(id==='campaign.discount')return {campaign:{price:100,goods:40,fulfillment:5,adsPerOrder:10,returnCost:3,other:2,feeRate:5,volume:100,fixedBudget:500,discountRates:[0,10,20,30],source:'虚构活动测算假设'}};
 if(id==='inventory.replenish')return {replenishment:{csv:'sku,stock,inbound,dailySales,leadDays,safetyDays,reviewDays,moq,packSize\nDEMO-A,20,10,5,7,3,7,20,12\nDEMO-B,100,0,0,7,3,7,10,5',source:'虚构库存和销量',period:'演示近 7 天日销'}};
 return {serviceQuestion:'漏水售后需要哪些凭证？',knowledgeRecall:{hits:[{id:'fixture',title:'虚构售后政策',revision:1,ordinal:1,text:'漏水售后需提供订单编号、安装环境说明与视频，处理方案由客服核验后确认。',source:'仅供演示的政策'}]}};
}
export async function executeCommerce(id,input){
 if(id==='commerce.sku_profit'){
  const d=input.commerce;if(!d?.source?.trim()||!d.period?.trim())return missing(['逐 SKU 账单 CSV、来源与统计期间']);
  const fields=['netSales','goods','fees','fulfillment','ads','returns','other'];let rows;try{rows=parseBusinessCsv(d.csv,['sku',...fields]);}catch(e){return missing([e.message]);}
  const errors=rows.flatMap((r,i)=>[...(!r.sku||r.sku.length>60?[`第 ${i+2} 行 SKU 缺失或过长`]:[]),...fields.filter(k=>k==='netSales'?!signedAmount(r[k]):!validNumber(r[k])).map(k=>`第 ${i+2} 行 ${k} 金额无效（费用需非负）；未知请补齐，不能默认为 0`)]);if(errors.length)return missing(errors.slice(0,20));
  const grouped=new Map();for(const r of rows){const t=grouped.get(r.sku)||{sku:r.sku,...Object.fromEntries(fields.map(k=>[k,0]))};for(const k of fields)t[k]+=Math.round(Number(r[k])*100);grouped.set(r.sku,t);}
  const result=[...grouped.values()].map(t=>{const v=Object.fromEntries(fields.map(k=>[k,t[k]/100])),profit=(t.netSales-fields.slice(1).reduce((n,k)=>n+t[k],0))/100;return {sku:t.sku,...v,profit,margin:v.netSales>0?round(profit/v.netSales*100):null,beforeAds:round(profit+v.ads)};}).sort((a,b)=>a.profit-b.profit);
  const total=result.reduce((a,r)=>a+r.profit,0),losses=result.filter(r=>r.profit<0);
  const table=['SKU | 净销售额 | 贡献利润 | 利润率 | 广告前贡献',...result.map(r=>`${r.sku} | ${r.netSales.toFixed(2)} | ${r.profit.toFixed(2)} | ${r.margin===null?'无法计算':r.margin+'%'} | ${r.beforeAds.toFixed(2)}`)].join('\n');
  const actions=losses.map(r=>`${r.sku}：${r.beforeAds<=0?'广告前已不盈利，优先核对采购/履约/售后与售价，不应只归因广告。':'广告前盈利、计广告后亏损，先核对广告归因窗口与费用，再评估预算。'}`);
  return report('SKU 盈亏诊断报告',`期间：${d.period}\n${rows.length} 条明细合并为 ${result.length} 个 SKU；总贡献利润 ${round(total)} 元，亏损 SKU ${losses.length} 个。\n\n${table}\n\n优先核查：\n${actions.join('\n')||'当前输入没有亏损 SKU，仍需核对费用是否完整。'}\n\n口径：净销售额已扣退款本金，可为负；净销售额非正时不计算利润率。金额逐行按分四舍五入；returns 只填额外售后损失。同 SKU 行累加，必须避免重复导出。结果不含固定费用与未录入税费，不证明净利润；未自动调整广告。`,d.source,{skuProfit:result,totalContribution:round(total),lossSkuCount:losses.length});
 }
 if(id==='campaign.discount'){
  const c=input.campaign,fields=['price','goods','fulfillment','adsPerOrder','returnCost','other','feeRate','volume','fixedBudget'];if(!c||fields.some(k=>!validNumber(c[k]))||!c.source?.trim())return missing(['完整活动成本、售价、费率、销量、固定预算与来源']);
  if(Number(c.price)<=0||Number(c.volume)<=0||!Number.isInteger(Number(c.volume))||Number(c.feeRate)>=100||Number(c.volume)>1000000||Number(c.price)>10000000||!Array.isArray(c.discountRates)||!c.discountRates.length||c.discountRates.length>12||c.discountRates.some(x=>!validNumber(x)||Number(x)>90))return missing(['售价为 0–1000 万元（不含 0），销量为 1–100 万整数，费率小于 100%，1–12 个 0–90% 的折扣率']);
  const variable=['goods','fulfillment','adsPerOrder','returnCost','other'].reduce((n,k)=>n+Number(c[k]),0),factor=1-Number(c.feeRate)/100;
  const scenarios=[...new Set(c.discountRates.map(Number))].map(discount=>{const price=round(Number(c.price)*(1-discount/100)),unit=round(price*factor-variable),total=round(unit*Number(c.volume)-Number(c.fixedBudget));return {discount,price,unitContribution:unit,totalContribution:total,breakEvenVolume:unit>0?Math.ceil(Number(c.fixedBudget)/unit):unit===0&&Number(c.fixedBudget)===0?0:null};});
  const breakEvenPrice=Math.ceil((variable+Number(c.fixedBudget)/Number(c.volume))/factor*100)/100;
  const maxDiscount=Math.max(0,Math.floor((1-breakEvenPrice/Number(c.price))*10000)/100);
  return report('促销折扣与保本测算',`所有情景统一假设销量 ${c.volume} 件，不假定降价能带来增量。\n折扣率 | 实付价 | 单件贡献 | 扣活动固定预算后贡献 | 保本销量\n${scenarios.map(r=>`${r.discount}% | ${r.price} | ${r.unitContribution} | ${r.totalContribution} | ${r.breakEvenVolume??'无法靠增加销量保本'}`).join('\n')}\n\n按该销量分摊预算，单件保本价至少 ${breakEvenPrice} 元；${breakEvenPrice>Number(c.price)?'原价也不足以保本，需调整成本、预算或销量假设。':'最高理论保本折扣约 '+maxDiscount+'%（需按实付价再次核验）。'}\n折扣率 20% 表示八折。实付价、单件贡献按分四舍五入后计算；费用按输入假设，不含未提供税费；结果需人工审批，未修改售价或创建活动。`,c.source,{scenarios,breakEvenPrice,maxDiscount});
 }
 if(id==='inventory.replenish'){
  const d=input.replenishment;if(!d?.source?.trim()||!d.period?.trim())return missing(['库存 CSV、来源和日销统计期间']);const fields=['stock','inbound','dailySales','leadDays','safetyDays','reviewDays','moq','packSize'];let rows;try{rows=parseBusinessCsv(d.csv,['sku',...fields]);}catch(e){return missing([e.message]);}
  if(new Set(rows.map(r=>r.sku)).size!==rows.length)return missing(['库存表每个 SKU 只能一行，避免重复采购建议']);
  const errors=rows.flatMap((r,i)=>[...(!r.sku||r.sku.length>60?[`第 ${i+2} 行 SKU 无效`]:[]),...fields.filter(k=>!validNumber(r[k])||(['stock','inbound','moq','packSize'].includes(k)&&!Number.isInteger(Number(r[k])))||k==='packSize'&&Number(r[k])<=0).map(k=>`第 ${i+2} 行 ${k} 无效`)]);if(errors.length)return missing(errors.slice(0,20));
  const suggestions=rows.map(r=>{const n=Object.fromEntries(fields.map(k=>[k,Number(r[k])])),target=Math.ceil(n.dailySales*(n.leadDays+n.safetyDays+n.reviewDays)),gap=Math.max(0,target-n.stock-n.inbound),order=gap?Math.ceil(Math.max(gap,n.moq)/n.packSize)*n.packSize:0;return {sku:r.sku,target,order,coverageDays:n.dailySales?round(n.stock/n.dailySales):null,risk:n.dailySales>0&&n.stock<n.dailySales*n.leadDays};}).sort((a,b)=>Number(b.risk)-Number(a.risk)||b.order-a.order);
  return report('补货建议与断货风险清单',`日销期间：${d.period}\nSKU | 库存覆盖天数 | 目标库存 | 建议补货 | 交期内风险\n${suggestions.map(r=>`${r.sku} | ${r.coverageDays??'零日销，无法外推'} | ${r.target} | ${r.order} | ${r.risk?'现货可能不足':'按当前假设未触发'}`).join('\n')}\n\n目标库存 = 日销 ×（交期 + 安全天数 + 复核周期）；扣现货和在途后，按 MOQ 与整箱量向上取整。假定在途可在目标周期内到货，需核对 ETA；未预测销量变化、未判断真实供应商交期、未创建采购单。零日销不自动补货。`,d.source,{replenishment:suggestions});
 }
 if(id==='service.evidence'){
  const question=input.question||input.serviceQuestion||'',hits=input.knowledgeRecall?.hits||[];if(!question.trim())return missing(['客户具体问题']);if(!hits.length)return missing(['未召回政策依据，请补充或启用知识库；转人工确认']);
  const terms=[...question.matchAll(/[a-z0-9]+|[\p{Script=Han}]{2}/giu)].map(m=>m[0].toLowerCase());
  const useful=hits.filter(h=>terms.some(t=>(h.text||'').toLowerCase().includes(t))).slice(0,3);if(!useful.length)return missing(['召回片段与客户问题无词项匹配，请调整问题或转人工']);
  return report('售后答复草案（政策证据摘录）',`客户问题：${question}\n\n可供客服核对的原文：\n${useful.map(h=>`[${h.title} v${h.revision} / 切片 ${h.ordinal}]\n${h.text}\n来源：${h.source}`).join('\n\n')}\n\n建议答复：您好，已找到与您问题相关的处理说明，以上政策需要结合您的订单与实际情况核对。请补充订单编号及问题凭证，我们确认适用条件后再说明处理方案。\n\n这是证据摘录与确认话术，未自动判断退款/换货资格、未承诺时效或金额、未向客户发送消息。存在政策冲突时必须交人工核对。`,useful.map(h=>`${h.title} v${h.revision} #${h.ordinal}`).join('；'),{citationIds:useful.map(h=>h.id),requiresHumanReview:true});
 }
 throw new Error('业务 Skill 不存在');
}
