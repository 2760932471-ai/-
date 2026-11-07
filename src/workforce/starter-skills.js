export const starterDefinitions=[
 {id:'traffic.funnel',name:'推广漏斗核算',description:'根据曝光、点击、订单和广告费用计算 CTR、转化率、CPC、CPA 与 ROAS，列出可核查的断点。',roleIds:['growth','analysis'],requires:['traffic'],version:1},
 {id:'service.triage',name:'售后问题分诊',description:'识别客户问题中的物流、安装、漏水和退换关键词，生成收集凭证清单与接待话术；不认定售后资格。',roleIds:['service'],requires:['question 或 serviceQuestion'],version:1}
];
export function starterSample(id){return id==='traffic.funnel'?{traffic:{impressions:10000,clicks:500,orders:20,revenue:2000,spend:600,source:'虚构推广数据',period:'演示一周'}}:{serviceQuestion:'收到的角阀安装后漏水，需要退货吗？'};}
export function executeStarter(id,input){
 const missing=items=>({status:'needs_input',summary:'请补齐本次业务资料',missing:items,artifacts:[],metrics:{}});
 if(id==='service.triage'){
  const q=input.question||input.serviceQuestion;if(typeof q!=='string'||!q.trim())return missing(['客户原始问题']);
  const currentId=input.contextSelection?.selected?.find(m=>m.reason==='本次提问')?.id;
  const previous=(input.conversation||[]).filter(m=>m.role==='human'&&m.id!==currentId).at(-1);
  const previousText=previous?.text?.replace(/(?:^|\s)@[^\s]+/g,'').trim();
  const followup=/^(那|这个|刚才|继续|再|为什么|怎么)|上一条/.test(q)&&!(/快递|物流|破损|发货|漏水|安装|接口|尺寸|退款|退货|换货|售后/.test(q));
  const basis=followup&&previousText?previousText:q;
  const groups=[['物流','快递|物流|未收到|破损|发货',['订单编号','物流单号和轨迹','包裹及商品照片']],['安装与漏水','漏水|安装|接口|尺寸',['订单与 SKU','接口尺寸和安装环境','问题照片或视频']],['退换与退款','退款|退货|换货|售后',['订单编号和收货时间','问题描述与凭证','适用的店铺售后政策']]].filter(x=>new RegExp(x[1]).test(basis));
  const checklist=[...new Set(groups.length?groups.flatMap(g=>g[2]):['商品或订单信息','具体问题和期望处理方式'])];
  return {status:'succeeded',summary:'客户问题分诊与接待草案',missing:[],artifacts:[{title:'售后分诊单',body:`客户问题：${q}${basis!==q?'\n参考上一轮客户问题：'+basis:''}\n识别类别：${groups.map(g=>g[0]).join('、')||'一般咨询，需进一步确认'}\n建议收集：\n${checklist.map(s=>'- '+s).join('\n')}\n\n接待草案：您好，已收到您的问题。请提供${checklist.join('、')}，我们核对商品情况和适用政策后再确认处理方案。\n\n关键词分诊，不构成故障判定；未承诺退款、换货资格或金额，未向客户发送消息。`,evidence:'用户提供的客户原话；本地分诊规则'}],metrics:{categories:groups.map(g=>g[0]),checklist,requiresHumanReview:true}};
 }
 const d=input.traffic,keys=['impressions','clicks','orders','revenue','spend'];
 if(!d||keys.some(k=>d[k]===''||d[k]==null||typeof d[k]==='boolean'||!Number.isFinite(Number(d[k]))||Number(d[k])<0||Number(d[k])>1e12)||!d.source?.trim()||!d.period?.trim())return missing(['曝光、点击、订单、归因成交额、广告费用、来源与期间']);
 const n=Object.fromEntries(keys.map(k=>[k,Number(d[k])]));
 if(['impressions','clicks','orders'].some(k=>!Number.isInteger(n[k]))||n.clicks>n.impressions||n.orders>n.clicks)return missing(['曝光、点击、订单需为非负整数，且订单 ≤ 点击 ≤ 曝光；请统一去重与归因口径']);
 const divide=(a,b,scale=1)=>b?Math.round(a/b*scale*100)/100:null;
 const metrics={ctr:divide(n.clicks,n.impressions,100),cvr:divide(n.orders,n.clicks,100),cpc:divide(n.spend,n.clicks),cpa:divide(n.spend,n.orders),roas:divide(n.revenue,n.spend)};
 const value=(k,unit)=>metrics[k]===null?'分母为 0，无法计算':metrics[k]+unit;
 const notes=n.impressions===0?'没有曝光，先检查数据范围与广告是否实际投放。':n.clicks===0?'已有曝光但无点击，优先检查展示与素材匹配；不能据此断定素材问题。':n.orders===0?'已有点击但无订单，核对落地页、价格、库存及转化追踪。':'漏斗各环节已有数据，建议与同口径历史和实验组比较；当前没有行业阈值依据。';
 return {status:'succeeded',summary:'推广漏斗指标报告',missing:[],artifacts:[{title:'推广漏斗核算',body:`期间：${d.period}\n点击率 CTR：${value('ctr','%')}\n点击到订单转化率：${value('cvr','%')}\n点击成本 CPC：${value('cpc',' 元')}\n订单成本 CPA：${value('cpa',' 元')}\n广告投入产出 ROAS：${value('roas','')}\n\n排查建议：${notes}\nROAS 不是利润，未扣商品、履约与售后成本。依赖提供的归因口径，未连接广告账户或自动调整预算。`,evidence:d.source}],metrics};
}
