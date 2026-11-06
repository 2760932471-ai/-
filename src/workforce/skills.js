import {commerceDefinitions,commerceSample,executeCommerce} from './commerce.js';
import {productAgent,insightAgent} from '../agents/builtins.js';
export const skillDefinitions=[
 ...commerceDefinitions,
 {id:'product.validate',name:'商品资料校验',description:'校验已确认商品字段、成本、库存和售价；不判断真实安装兼容性。',roleIds:['merchandise','selection','risk'],requires:['scope.sku','facts','proposal'],version:1},
 {id:'product.draft',name:'商品草案编排',description:'以确认事实生成商品文字草案；不发布商品。',roleIds:['merchandise','creative'],requires:['scope.sku','facts','proposal'],version:1},
 {id:'finance.calculate',name:'贡献利润核算',description:'计算录入账单的贡献利润；上新时仅计算采购价差并注明限制。',roleIds:['profit','analysis','selection'],requires:['financials 或商品成本/售价'],version:1},
 {id:'content.outline',name:'详情页结构草拟',description:'基于核验参数生成图文模块大纲；不生成图片或视频。',roleIds:['creative','merchandise'],requires:['facts','scope','proposal'],version:1},
 {id:'content.review',name:'宣传声明初筛',description:'检查有限的绝对化宣传词并列出人工核验项；不保证平台合规。',roleIds:['creative','risk'],requires:['proposal 或 observations'],version:1},
 {id:'task.brief',name:'任务与交付整理',description:'整理用户目标、范围、前序成果和待确认项。',roleIds:['coordination','analysis'],requires:['goal'],version:1},
 {id:'selection.score',name:'候选商品评分',description:'按已提供的需求、竞争优势、利润、供货和可控风险评分加权。',roleIds:['selection','research'],requires:['candidates'],version:1},
 {id:'product.compare',name:'商品参数比较',description:'逐项比较用户提供的候选参数和价格，保留来源。',roleIds:['selection','research','merchandise'],requires:['candidates'],version:1},
 {id:'price.break_even',name:'单件保本价测算',description:'按采购、履约、广告、售后、其他成本及平台费率测算保本价。',roleIds:['profit','selection'],requires:['unitCosts'],version:1},
 {id:'inventory.coverage',name:'库存覆盖测算',description:'按可售库存、日销量、供货周期和安全天数计算覆盖与缺货风险。',roleIds:['supply','merchandise'],requires:['inventory'],version:1}
].map(s=>({...s,type:'code',sideEffect:'none',inputPolicy:'只读取已保存业务资料，模型不能覆盖输入事实',outputSchema:'{status,summary,missing,artifacts,metrics}'}));
const missing=fields=>({status:'needs_input',summary:'需要补充业务输入才能继续。',missing:fields,artifacts:[],metrics:{}});
const result=(title,body,evidence,metrics={})=>({status:'succeeded',summary:title,missing:[],artifacts:[{title,body,evidence}],metrics});
const finite=v=>v!==''&&v!==null&&v!==undefined&&typeof v!=='boolean'&&Number.isFinite(Number(v))&&Number(v)>=0&&Number(v)<=1e12;
const citations=input=>(input.references||[]).map(r=>`- ${r.title}（${r.sourceName}，v${r.revision}，SKU ${r.sku||'通用知识'}）\n  ${r.type==='image'?'授权参考图：'+r.imageUrl:r.body}\n  来源：${r.url||'内部登记'}；使用范围：${r.rightsNote||'仅供参考'}`).join('\n')||'尚未选用参考资料';
const knowledgeCitations=input=>input.knowledgeRecall?(input.knowledgeRecall.hits.map(r=>`[${r.title} v${r.revision} · 切片 ${r.ordinal}] ${r.text}\n来源：${r.source}`).join('\n\n')||'未召回相关知识，不能据此补全未知事实'):'未启用知识库检索';
const money=n=>Math.round((n+Number.EPSILON)*100)/100;
export function skillSample(id){
 if(commerceDefinitions.some(s=>s.id===id))return commerceSample(id);
 const common={goal:'为角阀准备上新资料和经营测算',kind:'listing',scope:{store:'演示店',sku:'DEMO-001',product:'角阀'},facts:{confirmed:true,material:'黄铜（演示）',connector:'G1/2（演示）',cost:12,stock:200,source:'虚构测试资料'},proposal:{title:'黄铜角阀 G1/2',price:29.9}};
 if(id==='finance.calculate')return {...common,kind:'analysis',financials:{netSales:4000,goods:1200,fees:150,fulfillment:300,ads:600,returns:150,other:0,source:'虚构账单',window:'示例一周'}};
 if(id==='price.break_even')return {...common,unitCosts:{goods:12,fulfillment:3,ads:2,returns:1,other:0,feeRate:5,source:'虚构单件费用假设'}};
 if(id==='inventory.coverage')return {...common,inventory:{stock:200,dailySales:20,leadDays:8,safetyDays:3,source:'虚构库存与销量'}};
 if(['selection.score','product.compare'].includes(id))return {...common,candidates:[{sku:'DEMO-A',material:'黄铜',connector:'G1/2',price:29.9,source:'虚构候选资料 A',scores:{demand:80,competition:60,profit:70,supply:90,risk:80}},{sku:'DEMO-B',material:'不锈钢',connector:'G3/4',price:39.9,source:'虚构候选资料 B',scores:{demand:70,competition:80,profit:85,supply:60,risk:70}}]};
 return common;
}
export async function executeSkill(id,input){
 if(commerceDefinitions.some(s=>s.id===id))return executeCommerce(id,input);
 if(!skillDefinitions.some(s=>s.id===id))throw new Error('Skill尚未实现或不存在');
 if(['product.validate','product.draft'].includes(id)){const checked=productAgent(input);if(id==='product.validate'&&checked.status==='succeeded')checked.artifacts=[{title:'商品资料核验记录',body:checked.summary+'\n已检查：资料人工确认、来源、材质/接口字段、SKU、成本、售价与库存。\n只验证输入完整性和基础约束，不证明材质真实或安装兼容。',evidence:input.facts.source}];return checked;}
 if(id==='finance.calculate')return insightAgent(input);
 if(id==='content.outline'){
  const checked=productAgent(input);if(checked.status!=='succeeded')return checked;
  return result('商品详情页文字大纲（规则草拟）',`商品：${input.scope.product}\n1. 首屏：${input.proposal.title}\n2. 已确认参数：材质 ${input.facts.material}；接口 ${input.facts.connector}\n3. 商品信息：SKU ${input.scope.sku}；售价 ${input.proposal.price}\n4. 待补证明：商品实拍、尺寸图、供应商检测/材质凭证\n5. 待核验安装说明：适用环境、安装条件与不兼容情形\n6. 售后说明：以店铺确认的政策为准\n\n已选参考资料（按原文列出，不自动验证或覆盖商品事实）：\n${citations(input)}\n\n知识库召回：\n${knowledgeCitations(input)}\n\n这是规则模板生成的结构，不含生成图片，不证明安装兼容性，发布前须核验。`,input.facts.source);
 }
 if(id==='content.review'){
  const text=[input.proposal?.title,...(input.observations||[]).map(a=>a.body)].filter(Boolean).join('\n');if(!text)return missing(['待检查内容']);
  const hits=['全网最低','永久不漏','百分百','100%','零风险','国家级','顶级'].filter(w=>text.includes(w));
  return result('宣传声明初筛',`发现的待核验表述：${hits.join('、')||'未命中当前有限词表'}。\n检查范围：标题与本轮已有文字成果。\n还需人工核验参数依据、图片真实性、安装兼容性、知识产权及各平台规则。未命中词表不等于合规通过。`,'本轮输入与成果；有限声明词规则 v1',{flags:hits,approved:false});
 }
 if(id==='task.brief')return input.goal?result('任务交付摘要',`目标：${input.goal}\n范围：${input.scope?.store||'未填写'} / ${input.scope?.sku||'未填写'}\n已接收成果：\n${(input.observations||[]).map(a=>'- '+a.title).join('\n')||'暂无前序成果'}\n\n已选参考资料：\n${citations(input)}\n\n知识库召回：\n${knowledgeCitations(input)}\n\n交付后由负责人核对来源、缺项与执行边界。本次任务不执行真实发布、调价或投放。`,'用户目标与当前任务成果'):missing(['经营目标']);
 if(id==='selection.score'||id==='product.compare'){
  const rows=input.candidates;if(!Array.isArray(rows)||rows.length<2||rows.length>50)return missing(['2–50 个有来源的候选商品']);
  if(rows.some(r=>!r.sku||!r.source))return missing(['每个候选商品的 SKU 和来源']);
  if(id==='product.compare')return result('候选商品参数比较',rows.map(r=>`${r.sku}：材质 ${r.material||'未知'}，接口 ${r.connector||'未知'}，售价 ${finite(r.price)?r.price:'未知'}；来源 ${r.source}`).join('\n')+'\n未知字段不能视为相同或兼容；此比较不自动推荐商品。',rows.map(r=>r.source).join('；'));
  const keys=['demand','competition','profit','supply','risk'],weights=[.25,.15,.25,.2,.15];
  if(rows.some(r=>keys.some(k=>!finite(r.scores?.[k])||r.scores[k]>100)))return missing(['各候选的 demand/competition/profit/supply/risk 评分（0–100，均为越高越好）']);
  const ranked=rows.map(r=>({sku:r.sku,score:money(keys.reduce((sum,k,i)=>sum+Number(r.scores[k])*weights[i],0))})).sort((a,b)=>b.score-a.score);
  return result('候选商品加权评分',ranked.map(r=>`${r.sku}：${r.score}`).join('\n')+'\n权重：需求25%、竞争优势15%、利润25%、供货20%、风险可控性15%。全部评分由用户输入，不是模型验证的市场事实。',rows.map(r=>r.source).join('；'),{ranked});
 }
 if(id==='price.break_even'){
  const c=input.unitCosts,keys=['goods','fulfillment','ads','returns','other','feeRate'];if(!c||keys.some(k=>!finite(c[k]))||!c.source)return missing(['unitCosts：单件五项成本、feeRate 百分比和 source']);
  if(Number(c.feeRate)>=100)return missing(['平台费率必须小于100%']);
  const cost=keys.slice(0,5).reduce((s,k)=>s+Number(c[k]),0),price=Math.ceil(cost/(1-Number(c.feeRate)/100)*100)/100;
  return result('单件保本价测算',`按提供的单件费用，保本价至少 ${price.toFixed(2)} 元（向上取分）。\n公式：五项单件成本之和 ÷（1 − 平台费率）。\n未包含未提供的固定费用与税费；实际售价变更须另行授权。`,c.source,{breakEven:price});
 }
 if(id==='inventory.coverage'){
  const c=input.inventory,keys=['stock','dailySales','leadDays','safetyDays'];if(!c||keys.some(k=>!finite(c[k]))||!c.source)return missing(['inventory：stock、dailySales、leadDays、safetyDays 和 source']);
  const days=Number(c.dailySales)>0?money(Number(c.stock)/Number(c.dailySales)):null,threshold=Number(c.leadDays)+Number(c.safetyDays),shortage=days===null?null:days<threshold;
  return result('库存覆盖测算',`库存覆盖：${days===null?'日销量为0，无法外推耗尽时间':days+'天'}；供货加安全天数：${threshold}天。\n判断：${shortage===null?'无法判断':shortage?'存在缺货风险，需核对补货条件':'按当前输入暂未低于阈值'}。\n这不是销量预测，未自动采购或查询实时库存。`,c.source,{days,shortage});
 }
}
