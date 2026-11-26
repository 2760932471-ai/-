import {serviceQuestionFromGoal} from '../../public/goal-language.js';
export const starterDefinitions=[
 {id:'traffic.funnel',aliases:['流量漏斗','转化漏斗'],name:'推广漏斗核算',description:'根据曝光、点击、订单和广告费用计算 CTR、转化率、CPC、CPA 与 ROAS，列出可核查的断点。',roleIds:['growth','analysis'],requires:['traffic'],version:1},
 {id:'service.triage',aliases:['售后分诊','客服分诊'],inputs:['question','serviceQuestion'],name:'售后问题分诊',description:'识别客户问题中的物流、安装、漏水和退换关键词，生成收集凭证清单与接待话术；不认定售后资格。',roleIds:['service'],requires:['question 或 serviceQuestion'],version:1}
];
export function starterSample(id){return id==='traffic.funnel'?{traffic:{impressions:10000,clicks:500,orders:20,revenue:2000,spend:600,source:'虚构推广数据',period:'演示一周'}}:{serviceQuestion:'收到的角阀安装后漏水，需要退货吗？'};}
export function executeStarter(id,input){
 const missing=items=>({status:'needs_input',summary:'请补齐本次业务资料',missing:items,artifacts:[],metrics:{}});
 if(id==='service.triage'){
  const q=input.question||input.serviceQuestion||serviceQuestionFromGoal(input.goal);if(typeof q!=='string'||!q.trim())return missing(['客户原始问题']);
  const currentId=input.contextSelection?.selected?.find(m=>m.reason==='本次提问')?.id;
  const previous=(input.conversation||[]).filter(m=>m.role==='human'&&m.id!==currentId).at(-1);
  const previousText=previous?.text?.replace(/(?:^|\s)@[^\s]+/g,'').trim();
  const followup=/^(那|这个|刚才|继续|再|为什么|怎么)|上一条/.test(q)&&!(/快递|物流|破损|发货|漏水|安装|接口|尺寸|退款|退货|换货|售后/.test(q));
  const basis=followup&&previousText?previousText:q;
  const groups=[['物流','快递|物流|未收到|破损|发货',['订单编号','物流单号和轨迹','包裹及商品照片']],['安装与漏水','漏水|安装|接口|尺寸',['订单与 SKU','接口尺寸和安装环境','问题照片或视频']],['退换与退款','退款|退货|换货|售后',['订单编号和收货时间','问题描述与凭证','适用的店铺售后政策']]].filter(x=>new RegExp(x[1]).test(basis));
  const checklist=[...new Set(groups.length?groups.flatMap(g=>g[2]):['商品或订单信息','具体问题和期望处理方式'])];
  let reply='您好，已收到您的问题。请提供'+checklist.join('、')+'，我们核对商品情况和适用政策后再确认处理方案。';
  if(input.employeeProfile?.tone==='concise'){
   reply='请先提供'+checklist[0]+'。还需核对'+checklist.slice(1).join('、')+'，核对后再确认处理方式。';
  }else if(input.employeeProfile?.tone==='empathetic'){
   const acknowledgement=groups.some(([name])=>name==='物流')?'包裹遇到状况，您一定想知道接下来怎么办。':
    groups.some(([name])=>name==='安装与漏水')?'使用时遇到这个问题，确实会让人担心。':'理解您想尽快得到明确答复。';
   reply=acknowledgement+'您可以先把'+checklist[0]+'发给我，我来帮您核对。之后我们再一起确认'+checklist.slice(1).join('、')+'和适用的处理方式。';
  }
  return {status:'succeeded',summary:'客户问题分诊与接待草案',missing:[],artifacts:[{title:'售后分诊单',body:`客户问题：${q}${basis!==q?'\n参考上一轮客户问题：'+basis:''}\n识别类别：${groups.map(g=>g[0]).join('、')||'一般咨询，需进一步确认'}\n建议收集：\n${checklist.map(s=>'- '+s).join('\n')}\n\n接待草案：${reply}\n\n关键词分诊，不构成故障判定；未承诺退款、换货资格或金额，未向客户发送消息。`,evidence:'用户提供的客户原话；本地分诊规则'}],metrics:{categories:groups.map(g=>g[0]),checklist,requiresHumanReview:true}};
 }
 const d=input.traffic,keys=['impressions','clicks','orders','revenue','spend'];
 if(!d||keys.some(k=>d[k]===''||d[k]==null||typeof d[k]==='boolean'||!Number.isFinite(Number(d[k]))||Number(d[k])<0||Number(d[k])>1e12)||!d.source?.trim()||!d.period?.trim())return missing(['曝光、点击、订单、归因成交额、广告费用、来源与期间']);
 const n=Object.fromEntries(keys.map(k=>[k,Number(d[k])]));
 if(['impressions','clicks','orders'].some(k=>!Number.isInteger(n[k]))||n.clicks>n.impressions||n.orders>n.clicks)return missing(['曝光、点击、订单需为非负整数，且订单 ≤ 点击 ≤ 曝光；请统一去重与归因口径']);
 const divide=(a,b,scale=1)=>b?Math.round(a/b*scale*100)/100:null;
 const metrics={ctr:divide(n.clicks,n.impressions,100),cvr:divide(n.orders,n.clicks,100),cpc:divide(n.spend,n.clicks),cpa:divide(n.spend,n.orders),roas:divide(n.revenue,n.spend)};
 const value=(k,unit)=>metrics[k]===null?'分母为 0，无法计算':metrics[k]+unit;
 const notes=n.impressions===0?'没有曝光，先检查数据范围与广告是否实际投放。':n.clicks===0?'已有曝光但无点击，优先检查展示与素材匹配；不能据此断定素材问题。':n.orders===0?'已有点击但无订单，核对落地页、价格、库存及转化追踪。':'漏斗各环节已有数据，建议与同口径历史和实验组比较；当前没有行业阈值依据。';
 const channel=input.employeeProfile?.channel;
 let channelPlan='';
 if(channel==='taobao'){
  const next=n.impressions===0?'先检查商品的搜索收录、类目匹配和推广计划的展现范围。':
   n.clicks===0?'按搜索词拆分展现和点击，对同一个词测试主图与标题是否符合购买意图。':
   n.orders===0?'找到有点击无成交的搜索词，逐一核对对应 SKU 的到手价、库存和详情页承接。':
   '按搜索词与 SKU 拆分点击和成交，先找有成交且贡献利润为正的组合，再测试关键词出价。';
  channelPlan='\n淘宝运营建议：'+next+' 当前汇总表无法验证搜索词表现，需要同期间的搜索词及商品报表。';
 }else if(channel==='douyin'){
  const next=n.impressions===0?'先核实短视频或直播间是否开播、关联商品以及对应的分发记录。':
   n.clicks===0?'分别检查短视频前几秒的留存、直播间商品曝光和商品卡点击，逐个测试开场或商品展示。':
   n.orders===0?'按短视频与直播间拆分商品点击，核对内容中展示的款式、价格与商品落地页是否一致。':
   '按素材和直播场次拆分商品点击与成交，比较同商品的开场展示，复核归因后再决定放大哪组素材。';
  channelPlan='\n抖音运营建议：'+next+' 当前汇总表无法验证内容表现，需要同期间的素材或直播场次明细。';
 }
 return {status:'succeeded',summary:'推广漏斗指标报告',missing:[],artifacts:[{title:'推广漏斗核算',body:`期间：${d.period}\n点击率 CTR：${value('ctr','%')}\n点击到订单转化率：${value('cvr','%')}\n点击成本 CPC：${value('cpc',' 元')}\n订单成本 CPA：${value('cpa',' 元')}\n广告投入产出 ROAS：${value('roas','')}\n\n排查建议：${notes}${channelPlan}\nROAS 不是利润，未扣商品、履约与售后成本。依赖提供的归因口径，未连接广告账户或自动调整预算。`,evidence:d.source}],metrics};
}
