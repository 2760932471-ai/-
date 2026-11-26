import {businessBrief,sourcingIntent} from '../../public/sourcing.js';
import {requestParts,requestedImages,requestedSkills,asksForMethod} from '../../public/goal-language.js';
import {decisionBrief} from './brief.js';
import {audienceRequest} from './audience.js';

export const goalContractVersion=3;

// Each requested output maps to an executable capability and an observable acceptance condition.
const outputs = [
 {id:'title', capability:'copy.titles', matches:/标题/, title:'制作商品标题', acceptance:'交付可直接检查的标题，商品与规格须有来源。'},
 {id:'selling', capability:'copy.selling_points', matches:/卖点|(?<!详情页)文案/, title:'提炼商品卖点', acceptance:'交付所选商品的卖点文案，区分供应商陈述和已核实的特点。'},
 {id:'detail-copy', capability:'copy.detail', matches:/详情页文案/, title:'制作详情页文案', acceptance:'交付详情页各部分的文字，并引用对应商品事实。'},
 {id:'script', capability:'copy.video', matches:/视频脚本|短视频文案|视频台词|分镜脚本|(?:写|制作|出)(?:一个|一份)?脚本/, title:'制作短视频脚本', acceptance:'交付脚本正文，内容和分镜对应当前商品。'},
 {id:'main', capability:'image.main', imageKind:'main', title:'生成商品主图', acceptance:'交付可预览的主图文件，选品任务的主图须对应所选 SKU。'},
 {id:'detail', capability:'image.detail', imageKind:'detail', title:'生成详情图片模块', acceptance:'交付可预览的详情图片模块，注明使用的商品及参考素材。'}
];
const crossPlatform = /跨平台.*(?:选品|铺货)|(?:选品|找货|联盟|1688).*(?:铺货|(?:到|去|在|发往|转卖至)闲鱼)|(?:美团联盟|1688).*闲鱼.*(?:卖|销售|发布|上架)/;
const comparison = /比价|选品|找货|(?:美团|闲鱼).*(?:找|搜|挑|筛)|(?:比较|对比|寻找).{0,20}(?:商品|货源|同款|供应商|报价|采购价|价格|参数|[两三几多\d]款)/;
const profit = /利润|收益|毛利|盈利|赚钱/;
const profitComparison = /(?:比较|对比|计算|测算|核算|估算|按|分析|优先|看).{0,8}(?:利润|收益|毛利|盈利)|(?:利润|收益|毛利|盈利)(?:测算|比较|排序|最高|最大|最多|优先|(?:较|更)?高)|最(?:有利润|赚钱|挣钱)|高(?:利润|收益|毛利)/;
const financialCalculation=/(?:核算|计算|测算|算一下|算算|算出).{0,10}(?:利润|成本|收益|毛利)|(?:利润|成本|收益|毛利)(?:核算|测算|计算)/;
const comparisonGoal=/比较|对比|权衡|取舍|二选一|选型|哪个更|哪种更|哪家更|如何选|怎么选|值不值得|是否值得|要不要|适不适合|可行性|(?:选出|挑选|推荐).{0,8}(?:最合适|最优|方案|服务商|系统|工具)/;
const nonProduct=/方案|系统|软件|选址|路线|方法|策略|供应链模式|服务商|平台选型/;
const publicUse=/淘宝|天猫|京东|闲鱼|拼多多|上架|商品详情页|对外|投放|广告|发布|促销|推广|招商|展会|官宣/;

// Concrete work already attached to this task can resolve references such as
// “这个”. Default workspace names and superseded files cannot.
export function hasTaskMaterial(goal){
 return Boolean(goal.scope?.product||goal.references?.length||goal.proposal?.title||
  Object.values(goal.skillData||{}).some(value=>value!=null&&typeof value==='object'&&Object.keys(value).length)||
  goal.artifacts?.some(file=>file.status!=='superseded'&&file.version===goal.version));
}

function clarification(goal,criteria,request){
 if(criteria&&!criteria.query)return '这次要在 1688 筛选什么商品？请告诉我品类或搜索关键词。';
 const subject=request.replace(/(?:一份|一个|份|个)?(?:具体|简单|详细|完整)?(?:方案|计划|建议)(?:出来)?$/,'').replace(/你来定|你决定|按默认|你看着办|随便|都行|想办法|能不能|可以|麻烦|帮我|帮忙|给我|先|再|你|来|把|做|看看|看|搞|处理|跟进|弄|安排|改善|调整|改进|分析|研究|优化|比较|推进|提升|一下|这个|那个|这件事|这块|那块|的事|它|下|吧|吗|呢|了|请|[\s，]/gu,'');
 if(!subject&&!hasTaskMaterial(goal))
  return '你希望我处理什么对象？给我一个名称、一句话描述或一份资料即可。';
 return null;
}

export function buildGoalContract(goal,{modelQuestions=[],researchRequested=false,reviewRequested=false}={}){
 const brief=businessBrief(goal),criteria=sourcingIntent(brief);
 // Scenario answers constrain an existing decision; they are not additional requested deliverables.
 const {requested,excluded}=requestParts(brief.split('；使用场景：')[0]);
 const positive=requested.replaceAll('咸鱼','闲鱼');
 const actions=positive.split('，').filter(clause=>!asksForMethod(clause)).join('，');
 const audience=audienceRequest(positive,excluded);
 const skills=requestedSkills(actions).filter(skill=>skill.capability!=='commerce.sku_profit'||!criteria||/账单|订单明细/.test(actions));
 const compare=!audience&&!criteria&&(researchRequested||!skills.length&&comparisonGoal.test(actions)&&(!comparison.test(actions)||nonProduct.test(actions)));
 const profitDecision=!!criteria&&(profitComparison.test(positive)||criteria.periodGoal||criteria.minUnitMargin!=null||criteria.minMarginRate!=null);
 const decision=decisionBrief([actions,requestParts(goal.scenario?.answer).requested].filter(Boolean).join('，'),criteria,{compare,profit:profitDecision,excluded,modelQuestions:audience?[]:modelQuestions});
 const requirements=[],pending=[],excludedCapabilities=new Set();
 const replaced=new Set(skills.flatMap(skill=>skill.supersedes));
 function add(id,capability,title,acceptance,dependsOn,extra={}){
  if(replaced.has(capability))return;
  requirements.push({id,capability,title,objective:title,acceptance,dependsOn,...extra});
 }
 add('evidence','evidence.collect','收集相关证据','记录本次查到的资料及其来源，标记缺失或矛盾的信息。',[]);
 const upstream=['evidence.collect'];
 if(audience){
  decision.audience=audience;
  decision.sources='workspace';
  add('audiencePrepare','audience.prepare',audience.wantsCopy?'准备客户筛选条件与营销资料':'准备客户筛选条件','列出可核对的人群条件、所需字段和本次可先交付的资料。',[]);
  if(audience.wantsSelection)add('audienceSelect','audience.select','筛选 CRM 客户','仅从本工作空间可用的客户数据筛选，并注明筛选依据、数量和缺失字段。',['audience.prepare']);
  if(audience.wantsOutreach)add('audienceContact','audience.contact','核实客户触达结果','确认可用渠道、接收范围与真实发送结果。',['audience.select']);
  excludedCapabilities.add('analysis.reason');
 }
 if(criteria){
  add('pick1688','sourcing.1688','筛选 1688 商品报价','比较至少两款有详情链接的同类商品，保留 SKU、报价、规格和起订条件。',upstream);
  if(criteria.maxMinimumOrder||criteria.smallTrial)pending.push('核对各款起订数量、单位与试单条件。');
  if(criteria.maxBatchCost!=null)pending.push('核对起订数量、采购单价及首单总额。');
  if(criteria.stableSupply)pending.push('核对交期和持续供货依据。');
 }
 if(decision.questions.length){
  const acceptance=criteria?'按目标渠道和规格保留候选证据、统计期间及缺失项，区分同款表现与品类线索。':
   '按决策条件比较备选的证据及来源，查证可能改变建议的信息，记录缺口。';
  add('research','research.compare','调查备选与决策依据',acceptance,criteria?['sourcing.1688']:upstream);
 }
 const investigated=decision.questions.length?'research.compare':criteria?'sourcing.1688':'evidence.collect';
 if(profitDecision){
  add('profit','sourcing.profit','比较候选商品收益','列出售价、同规格采购成本和费用的依据，区分单件收益和期间收益；缺少可比数据时给出条件性结论。',[investigated]);
  if(criteria.retail===null)pending.push('核实目标渠道的实际成交价。');
  if(criteria.expenses===null)pending.push('核对履约、平台、推广等单件费用。');
  if(criteria.periodGoal)pending.push('核对各款同一期间的可归属销量。');
 }
 const selected=profitDecision?'sourcing.profit':!criteria&&decision.questions.length?'analysis.reason':investigated;
 if(crossPlatform.test(actions))add('offers','market.offers','检索货源并核对销售条件','列出可追溯的候选，并核对销售渠道与履约条件。',[selected]);
 else if(!criteria&&!compare&&comparison.test(actions))add('compare','product.compare','比较候选参数与报价','逐项列出有来源的报价和参数，写明缺项与比较口径。',upstream);
 if(!criteria&&!compare&&(financialCalculation.test(actions)||/利润|盈利|成本/.test(actions)&&!/比较|对比|分析|评估|调研|为什么/.test(actions)))add('finance','finance.calculate','核算利润与成本','保留成本与售价的来源，说明测算口径与缺失项。',upstream);
 const images=requestedImages(requested),excludedImages=requestedImages(excluded);
 const imagesOnly=/(?:仅|只)(?:需要|需|要|做|改|生成|制作).{0,6}(?:主图|海报|详情图)/.test(requested);
 for(const output of outputs){
  const audienceCopy=audience&&audience.wantsCopy&&output.id==='selling'&&!/卖点|商品文案|产品文案/.test(actions);
  const wanted=output.imageKind?images.includes(output.imageKind):!audienceCopy&&output.matches.test(actions);
  if(wanted)add(output.id,output.capability,output.title,output.acceptance,[selected]);
  else if(audienceCopy||imagesOnly||(output.imageKind?excludedImages.includes(output.imageKind):output.matches.test(excluded)))excludedCapabilities.add(output.capability);
 }
 for(const skill of skills){
  const after=skill.after.filter(cap=>requirements.some(n=>n.capability===cap));
  const consumesSelection=skill.capability==='copy.image_brief'||skill.capability==='price.break_even';
  add(skill.id,skill.capability,skill.title,skill.acceptance,after.length?after:consumesSelection?[selected]:upstream);
 }
 for(const skill of requestedSkills(excluded))if(!skills.some(s=>s.capability===skill.capability))excludedCapabilities.add(skill.capability);
 for(const cap of replaced)excludedCapabilities.add(cap);
 if(!criteria&&(imagesOnly||/(?:选品|选货|重新(?:选|搜)|1688)/.test(excluded)))excludedCapabilities.add('sourcing.1688');
 if(!profit.test(positive)&&profit.test(excluded))excludedCapabilities.add('finance.calculate');
 const unresolvedRequests=actions.split('，').filter(s=>
  (!audience?.wantsOutreach&&/发(?:送)?(?:一封)?邮件/.test(s))||
  /导出.{0,8}(?:PPT|PDF|Excel|幻灯片)|(?:制作|生成|剪辑|输出)(?![^，]*脚本).{0,6}(?:成片|视频)|(?:直接|自动|立即)(?:下单|付款|发布|上架)/.test(s));
 const drafts=requirements.filter(r=>/^(?:copy|image)\./.test(r.capability)&&r.capability!=='copy.image_brief');
 if(drafts.length&&(publicUse.test(actions)||criteria&&drafts.some(r=>r.capability.startsWith('copy.'))||reviewRequested)){
  const reviewed=requirements.filter(r=>r.capability==='content.review').map(r=>r.capability);
  add('review','delivery.review','复核对外发布材料','逐项对照实际交付、商品资料和文案，标出欠缺依据的规格、促销或功效声明，给出发布前需核实的事项。',[...drafts.map(r=>r.capability),...reviewed]);
 }
 if(!criteria&&decision.questions.length){
  add('analysis','analysis.reason','比较备选并给出判断','结合已收集的证据说明推荐、适用条件和最可能改变结论的依据。',['research.compare']);
 }else if(requirements.length===1){
  add('analysis','analysis.reason','分析目标并提出执行方法','列出带依据的判断、假设、反例及会改变结论的信息。',upstream,{fallback:true});
 }
 // The CRM helper works directly on the local report. Searching the web or
 // knowledge base would not resolve missing customer rows or delivery receipts.
 if(audience&&requirements.every(req=>req.capability==='evidence.collect'||req.capability.startsWith('audience.'))){
  requirements.splice(requirements.findIndex(req=>req.capability==='evidence.collect'),1);
  excludedCapabilities.add('evidence.collect');
 }
 const leaves=requirements.filter(n=>!requirements.some(other=>other.dependsOn.includes(n.capability)));
 add('summary','result.compile','核验与汇总','逐项核验请求的交付物，给出建议、依据、限制与仍待确认的事项。',leaves.map(n=>n.capability));
 decision.unknowns=[...pending,...decision.questions.map(question=>question.query)];
 decision.deliverables=requirements.filter(n=>!['evidence.collect','research.compare','delivery.review','result.compile'].includes(n.capability)).map(n=>n.capability);
 return {version:goalContractVersion,brief,requirements,decision,excludedRequests:excluded.split('，').filter(Boolean),excludedCapabilities:[...excludedCapabilities],criteria,pending,unresolvedRequests,question:clarification(goal,criteria,requested)};
}
