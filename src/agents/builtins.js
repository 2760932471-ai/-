// Pure code agents: inputs and calculations are real; no LLM or store API is implied.
export const seeds = [
 {id:'product',name:'商品运营 Agent',initials:'商',role:'检查规格、成本、库存与售价，生成有来源的商品草案。',adapter:'builtin',enabled:true,timeoutMs:15000,revision:1,endpoint:'',secretEnv:'',instructions:'只引用已确认事实，不生成未经证实的规格。',settings:{minGrossMargin:0},capabilities:['product.validate','product.draft']},
 {id:'insight',name:'经营分析 Agent',initials:'析',role:'根据录入账单计算贡献利润；区分缺数据、零销售与亏损。',adapter:'builtin',enabled:true,timeoutMs:15000,revision:1,endpoint:'',secretEnv:'',instructions:'逐项列出收入费用，无基线不宣称增长。',settings:{targetProfitRate:15},capabilities:['finance.calculate','finance.review']}
];
export const financeFields=['netSales','goods','fees','fulfillment','ads','returns','other'];
export const financeLabels={netSales:'净销售额',goods:'商品成本',fees:'平台及支付费用',fulfillment:'履约费用',ads:'归因广告费用',returns:'售后额外损失',other:'其他可变成本'};
const missingValue=v=>v===undefined||v===null||v===''||typeof v==='boolean';
const amount=v=>!missingValue(v)&&Number.isFinite(Number(v))&&Number(v)>=0&&Number(v)<=1e12;
const round=v=>Math.round((v+Number.EPSILON)*100)/100;
const yuan=v=>'¥'+Number(v).toFixed(2);
export function productAgent(input,config=seeds[0]) {
 const f=input.facts||{},p=input.proposal||{},scope=input.scope||{};
 const missing=[];
 for(const [key,label] of [['material','材质'],['connector','接口 / 适用规格'],['source','资料来源']])if(typeof f[key]!=='string'||!f[key].trim()||f[key].includes('待确认'))missing.push(label);
 if(!f.confirmed)missing.push('资料人工确认');
 if(!amount(f.cost))missing.push('有效采购成本');
 if(!Number.isInteger(Number(f.stock))||missingValue(f.stock)||Number(f.stock)<=0)missing.push('大于0的可售库存');
 if(!amount(p.price)||Number(p.price)<=0)missing.push('有效售价');
 if(!scope.sku?.trim())missing.push('SKU');
 if(missing.length)return {status:'needs_input',summary:'商品资料尚不能用于生成发布草案。',missing,artifacts:[],metrics:{}};
 const spread=round(Number(p.price)-Number(f.cost)),rate=round(spread/Number(p.price)*100);
 if(rate<config.settings.minGrossMargin)return {status:'needs_input',summary:`价差率 ${rate}% 低于配置下限 ${config.settings.minGrossMargin}%，请调整价格或核实成本。`,missing:['售价 / 成本不符合配置约束'],artifacts:[],metrics:{spread,rate}};
 const title=p.title?.trim()||`${scope.product||'商品'}｜${f.material}｜${f.connector}`;
 return {status:'succeeded',summary:`${scope.sku} 必需资料校验通过。售价 ${yuan(p.price)}，采购成本 ${yuan(f.cost)}，可售 ${f.stock} 件。`,missing:[],metrics:{spread,procurementMarginRate:rate},artifacts:[{title:'商品资料校验与上新草案',body:`目标：${input.goal||'商品资料检查'}\n店铺：${scope.store||'未提供'}\nSKU：${scope.sku}\n发布标题：${title}\n材质：${f.material}\n接口 / 适用规格：${f.connector}\n售价：${yuan(p.price)}\n采购成本：${yuan(f.cost)}\n可售库存：${f.stock} 件\n\n规格与商品名称来自用户确认的数据。该草案未执行发布；安装兼容性、图片和宣传声明仍需业务确认。\n售价与采购成本价差：${yuan(spread)}（${rate}%）。未扣平台、履约、广告和售后费用，不等于贡献利润。`,evidence:f.source}]};
}
export function insightAgent(input,config=seeds[1]) {
 const data=input.financials;
 if(!data&&input.kind==='listing'){
  const f=input.facts||{},p=input.proposal||{};
  if(!amount(f.cost)||!amount(p.price)||Number(p.price)<=0)return {status:'needs_input',summary:'无法计算单件价差。',missing:['采购成本','售价'],artifacts:[],metrics:{}};
  const spread=round(Number(p.price)-Number(f.cost)),rate=round(spread/Number(p.price)*100);
  return {status:'succeeded',summary:`单件采购价差 ${yuan(spread)}，价差率 ${rate}%；经营费用未提供，贡献利润待观察。`,missing:[],metrics:{spread,procurementMarginRate:rate,profit:null},artifacts:[{title:'上新经营测算与观察清单',body:`售价 ${yuan(p.price)} − 采购成本 ${yuan(f.cost)} = 单件采购价差 ${yuan(spread)}。\n\n这不是贡献利润。发布后需收集：净销售额、实际售出商品成本、平台及支付费用、履约费用、归因广告费用、售后额外损失与其他可变成本。\n配置的贡献利润率观察阈值：${config.settings.targetProfitRate}%。暂无完整账单，当前是否达标：无法判断。`,evidence:f.source||'用户录入资料'}]};
 }
 const missing=financeFields.filter(k=>!amount(data?.[k])).map(k=>financeLabels[k]);
 if(typeof data?.source!=='string'||!data.source.trim())missing.push('账单来源');if(typeof data?.window!=='string'||!data.window.trim())missing.push('统计期间');
 if(missing.length)return {status:'needs_input',summary:'账单不完整，未将缺失费用按0处理。',missing,artifacts:[],metrics:{profit:null,rate:null}};
 const values=Object.fromEntries(financeFields.map(k=>[k,round(Number(data[k]))]));
 const profit=round(values.netSales-financeFields.slice(1).reduce((sum,k)=>sum+values[k],0));
 const rate=values.netSales>0?round(profit/values.netSales*100):null,target=config.settings.targetProfitRate;
 const outcome=rate===null?'无法判断':rate>=target?'达标':'未达标';
 const metrics={...values,profit,rate,target,outcome,baseline:null,window:data.window,source:data.source,result:`${outcome}；无对照基线，不能归因于AI或宣称提升。`};
 return {status:'succeeded',summary:`贡献利润 ${yuan(profit)}，利润率 ${rate===null?'—（净销售额为0）':rate+'%'}；${outcome}。`,missing:[],metrics,artifacts:[{title:'SKU贡献利润分析',body:`目标：${input.goal||'经营分析'}\n统计期间：${data.window}\n\n${financeFields.map(k=>`${financeLabels[k]}：${yuan(values[k])}`).join('\n')}\n\n贡献利润：${yuan(profit)}\n贡献利润率：${rate===null?'—（净销售额为0）':rate+'%'}\n阈值：${target}%\n判断：${outcome}\n\n净销售额应已扣退款本金；售后项只填额外损失，避免重复扣减。数值来自录入账单，未自动核对平台。无对照基线，不宣称AI带来增量收益。${profit<0?'\n建议：核查广告与履约费用、采购成本和退款损耗；任何改价或投放动作需另行授权。':''}`,evidence:data.source}]};
}
export const builtins={product:productAgent,insight:insightAgent};
export function testSample(id){return id==='product'?{goal:'检查这款商品的上新资料',kind:'listing',scope:{store:'演示店',sku:'DEMO-JF-001',product:'角阀'},facts:{material:'黄铜（演示）',connector:'G1/2（演示）',cost:12,stock:200,source:'内置测试样例',confirmed:true},proposal:{price:29.9,title:'黄铜角阀（测试草案）'}}:{goal:'分析样例账单',kind:'analysis',financials:{netSales:3000,goods:1200,fees:150,fulfillment:300,ads:600,returns:150,other:0,window:'示例第1–7天',source:'内置测试样例'}};}
export const isSelectionGoal=text=>/选品|性价比|候选商品|商品对比|产品对比|寻找.{0,20}(商品|产品|淋浴|花洒)|对比.{0,15}(商品|产品|供应商)/.test(String(text||''))&&!/(上新|上架|发布)/.test(String(text||''));
export function previewGoal(text){
 if(typeof text!=='string'||!text.trim()||text.length>2000)throw new Error('请输入1–2000字的目标');
 if(isSelectionGoal(text))return {kind:'analysis',intent:'selection',product:'候选商品',sku:'待比较候选',members:['insight'],method:'rules',reason:'比较已有候选的参数、价格和有依据的评分；需要商品来源，未执行全网检索。'};
 const listing=/(上新|上架|发布|商品.{0,6}草案)/.test(text);
 return {kind:listing?'listing':'analysis',members:listing?['product','insight']:['insight'],method:'rules',reason:listing?'识别到商品准备或发布意图，推荐上新流程；执行边界仍由你确认。':'推荐经营分析流程；需要补充账单才能计算结果。',limitations:'规则识别，不是大模型语义规划；可以手动更改类型。'};
}
