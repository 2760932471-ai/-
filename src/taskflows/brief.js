// Use the goal's own constraints for investigation. Unknown costs or preferences
// remain assumptions until evidence or a user correction resolves them.
const dimensions=[
 ['迁移成本',/迁移成本/],['实施风险',/实施风险/],['权限',/权限/],['交期',/交期|交货期/],
 ['起订条件',/起订|试单|测款/],['投入成本',/预算|费用|(?<!迁移)成本|价格/],
 ['回购',/复购|回购/],['时间',/耗时|工期|周期|上线时间/],['安全性',/安全性|安全风险/]
];
const seasons=[['冬季',/冬季|冬天|冬款/],['夏季',/夏季|夏天|夏款/],['秋季',/秋季|秋天|秋款/],['春季',/春季|春天|春款/]];
const retailChannels=/淘宝|天猫|闲鱼|京东|拼多多|直播间|线下门店/;

export function decisionBrief(request,criteria,{compare=false,profit=false,excluded='',modelQuestions=[]}={}){
 const season=criteria?.season||seasons.find(([,match])=>match.test(request))?.[0]||null;
 const demand=!!criteria&&(criteria.demandGoal||criteria.periodGoal||/动销|热销|卖得好|销量|能卖出/.test(request));
 const channel=request.match(retailChannels)?.[0]||null;
 const clauses=request.split(/[，；。]/).filter(Boolean);
 const topic=clauses.find(clause=>/对比|比较|选型|取舍|适不适合|要不要|可行性/.test(clause))||clauses[0]||'';
 const subject=criteria?.query||topic.replace(/^(?:请|帮我|给我|我们需要|我想)*(?:比较|对比|调研|分析|评估)?(?:一下)?/,'').trim().slice(0,100);
 const explicit=request.match(/(?:重点关注|重点看|关注|看重|侧重|优先考虑)\s*([^，。；]{1,80})/)?.[1]?.split(/、|和|与|及/).map(s=>s.trim()).filter(s=>s&&s.length<22)||[];
 const measures=[...(profit?['单件贡献利润']:[]),...(demand||criteria&&season?[(season||'目标期间')+'零售动销']:[]),...explicit,...dimensions.filter(([,match])=>match.test(request)).map(([label])=>label)];
 const questions=[],assumptions=[];
 const add=(kind,query)=>{
  if(typeof query!=='string'||!query.trim()||query.length>180||questions.some(row=>row.query===query.trim()))return;
  questions.push({kind,query:query.trim()});
 };
 if(criteria?.query){
  if(profit&&criteria.retail==null)add('retail',[channel,subject,'同规格 零售价 到手价'].filter(Boolean).join(' '));
  if(demand||season)add('demand',[channel,subject,season,'零售销量 统计期间'].filter(Boolean).join(' '));
  if(questions.length===1&&questions[0].kind==='retail'&&criteria.expenses==null)add('criterion',subject+' 同规格 履约费用 运费 平台费率');
  if(questions.length===1&&questions[0].kind==='demand')add('alternatives',subject+' 同品类 备选 规格 差异');
  if((profit||demand||season)&&!channel)assumptions.push('销售渠道尚未指定，各渠道的价格和销量分别比较。');
  if(profit&&criteria.expenses==null)assumptions.push('履约、推广等费用待核，测算须注明成本口径。');
 }
 if(Array.isArray(modelQuestions))for(const row of modelQuestions.slice(0,3)){
  if(!row||typeof row.query!=='string'||row.query.trim().length<3||row.query.length>100)continue;
  if(/https?:\/\/|[\w.+-]+@[\w.-]+\.\w+|\b1[3-9]\d{9}\b|(?:密码|密钥|口令|api[_ -]?key|token)\s*[:=：]/i.test(row.query))continue;
  add(['retail','demand','alternatives','criterion'].includes(row.kind)?row.kind:'criterion',row.query);
 }
 if(!criteria&&compare&&subject){
  add('alternatives',subject+' 备选方案 适用条件');
  add('criterion',[subject,...measures.slice(0,3),'真实案例 实施限制'].join(' '));
 }
 const workspaceOnly=/(?:联网|上网|外部搜|网络搜|公开搜|公网上搜)/.test(excluded)||/(?:仅|只)(?:使用|用|查|根据|参考|依据|按|分析)(?:我们(?:的)?|我(?:的)?|你(?:的)?)?(?:本地|现有|已有|内部|附件|知识库|提供的)/.test(request);
 return {kind:criteria?'sourcing':compare||questions.length?'comparison':'task',subject,channel,season,
  criteria:[...new Set(measures)],questions:questions.slice(0,3),sources:workspaceOnly?'workspace':'available',assumptions,deliverables:[]};
}
