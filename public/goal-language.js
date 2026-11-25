// Keep examples, rejected actions and scenario descriptions out of executable requests.
export function requestParts(text) {
 const input = String(text || '')
  .replace(/(?:(?:资料|附件|旧版|文档|记录|邮件|案例)(?:里|中|上|的)?(?:写着|写道|提到|原文|记载|注明|要求|建议)(?:是|为)?|引用(?:原文|资料)?)[：:\s]*[“「『"][^”」』"]*[”」』"]/gu, '')
  .replace(/(?:举例|例如|比如|示例)[：:\s]*[“「『][^”」』]*[”」』]/g, '')
  .replace(/(?:不用|不必|无需|不要)(?:再)?(?:询问|问我|追问|提问|问)/g, '')
  .replace(/(?=但是|而是|改为|改成|仅(?:需|做|要)|只(?:需|做|要|生成|制作)|(?:同时|并且)?(?:不要|不需要|暂不|无需|不用|先不|不做|不生成|不(?=发送|发通知|发邮件|发布|外发|导出|上架|下单|联网|上网)|别再|别(?:做|出|生成|选|找|搜|发|导出|上架|下单|联网)))/g, '；');
 const positive = [], negative = [];
 for (const clause of input.split(/[，,；;。！？!?\n]+/).map(value => value.trim()).filter(Boolean)) {
  if (/^(?:举例|例如|比如|示例|举个例子)/.test(clause)) continue;
  const refusal = clause.match(/^(?:同时|并且)?(?:不要|不需要|暂不|无需|不用|先不|不(?=做|生成|发送|发通知|发邮件|发布|外发|导出|上架|下单|联网|上网)|别再|别(?=做|出|生成|选|找|搜|发|导出|上架|下单|联网))/);
  if (refusal) negative.push(clause.slice(refusal[0].length));
  else positive.push(clause);
 }
 return {requested: positive.join('，'), excluded: negative.join('，')};
}

export function asksForMethod(text){
 return /^(?:请|帮我)?(?:解释|介绍|讲讲|说明|分析|评估)?(?:一下)?(?:如何|怎么|为什么)|^(?:请)?(?:解释|介绍|讲讲|说明|分析|评估).*(?:如何|怎么|为什么|选品方法|选品流程|选品策略|选品案例|选品逻辑)/.test(text);
}

export function requestedImages(text) {
 const {requested} = requestParts(text);
 const clauses = requested.split('，').filter(value => !asksForMethod(value)&&
  !/(?:图片?|主图|详情图|海报)(?:的|设计)?(?:简报|提示词|拍摄方案|构图建议|文案)|(?:简报|提示词).*(?:图片?|海报)|(?:仅|只)(?:需(?:要)?|做|提供|要|输出)?(?:文案|文字)/.test(value));
 const kinds = new Set();
 for (const clause of clauses) {
  if (/主图|海报|配图/.test(clause)) kinds.add('main');
  if (/详情(?:页)?(?:图|图片)/.test(clause)) kinds.add('detail');
  else if (/生图|作图|做图|出图|(?:生成|制作|做).{0,15}图片/.test(clause)) kinds.add('main');
 }
 return ['main', 'detail'].filter(kind => kinds.has(kind));
}

// These requests correspond to business tools with concrete input schemas, not open-ended analysis.
export const skillRequestPatterns = [
 {id:'coverage',capability:'inventory.coverage',title:'核算库存覆盖天数',
  matches:/库存覆盖|库存.{0,12}(?:卖|销|撑|维持|支持).{0,4}(?:几|多少)天|(?:几天|多少天|多久).{0,5}(?:断货|缺货|售罄)|(?:预测|计算|测算|评估).{0,6}(?:断货时间|缺货风险)/,
  acceptance:'列明可售库存、日销量、交期与安全天数，给出覆盖天数、风险及数据来源。'},
 {id:'replenish',capability:'inventory.replenish',title:'编制补货清单',
  matches:/补货(?:清单|建议|数量|计划)|(?:应该?|需要)补(?:多少|几)(?:件|箱|个|包|袋)|(?:批量|逐款|按库存)补货/,
  acceptance:'逐款列明建议补货量、供货和整箱条件、采用的销量及数据来源。'},
 {id:'break-even',capability:'price.break_even',title:'测算单件保本价',
  matches:/保本(?:售?价|定价)|盈亏平衡(?:售?价|定价)|(?:卖|定价).{0,6}多少.{0,5}(?:才)?(?:能)?保本/,
  replaces:['finance.calculate'],acceptance:'按单件费用和平台费率列出保本价、计算依据与数据来源。'},
 {id:'discount',capability:'campaign.discount',title:'比较促销折扣方案',
  matches:/折扣(?:方案|测算|核算|测评|力度)|(?:比较|对比|测算|计算|核算|算|估算|评估|设计).{0,10}(?:促销折扣|打几折|折扣)|打几折.{0,7}(?:保本|盈利|赚钱)/,
  replaces:['product.compare','finance.calculate'],acceptance:'按给定折扣、费用和销量假设，列出各方案的单件贡献、活动贡献与保本条件。'},
 {id:'sku-profit',capability:'commerce.sku_profit',title:'核算各 SKU 的经营盈亏',
  matches:/(?:逐|每|各|按)\s*(?:个|款)?\s*SKU.{0,12}(?:盈亏|利润|亏损)|SKU\s*(?:盈亏诊断|亏损排行)|(?:哪些|哪几)(?:个|款)?(?:商品|SKU).{0,3}(?:在|有)?亏损/i,
  replaces:['finance.calculate','product.compare'],acceptance:'逐 SKU 核对同一期间的收入和费用，给出贡献利润、亏损排序及账单来源。'},
 {id:'review-copy',capability:'content.review',title:'检查文案宣传声明',
  matches:/(?:审核|审查|核查|检查|校审|审校|过审).{0,12}(?:文案|标题|宣传|广告词|卖点)|(?:文案|宣传|广告词).{0,10}(?:审核|合规|违规词|违禁词)|检查.{0,5}(?:违禁词|绝对化用语)/,
  replaces:['copy.selling_points','copy.titles','copy.detail','copy.video'],acceptance:'列出被审文本中命中规则的宣传用语及需人工核实的表述。'},
 {id:'image-brief',capability:'copy.image_brief',title:'编写主图设计简报',
  matches:/(?:主图|海报|图片)(?:的|设计|制作)?(?:设计)?(?:简报|构图建议|拍摄方案|提示词)/,
  replaces:['image.main'],acceptance:'交付商品主图的构图、画面文字和素材清单，按文字简报验收。'},
 {id:'funnel',capability:'traffic.funnel',title:'分析推广转化漏斗',
  matches:/(?:推广|广告|投放|流量|转化)漏斗|(?:广告|推广)的?(?:CTR|ROAS|转化率).{0,4}(?:核算|测算)/i,
  acceptance:'按录入的曝光、点击、订单和费用给出转化指标及需核对的环节。'},
 {id:'service-answer',capability:'service.evidence',title:'根据售后政策起草答复',
  matches:/(?:售后|退换货|退款|退货|质保)(?:政策|知识库).{0,15}(?:答复|回答|回复|话术)|(?:答复|回复).{0,12}(?:售后|退换货|退款|质保)(?:政策|问题)/,
  acceptance:'答复引用本轮召回的政策原文，列明缺失的依据。'}
];

const generalRequests = {
 'finance.calculate':/利润|毛利|成本|盈亏|盈利|收益/,
 'product.compare':/(?:比较|对比|比较一下|对比一下|比价|选品|挑选).{0,12}(?:商品|产品|候选|型号|货源|参数|报价)|(?:商品|产品|候选).{0,6}(?:比较|对比|比价)/,
 'copy.selling_points':/卖点|文案/,'copy.titles':/标题/,'copy.detail':/详情(?:页)?文案/,'copy.video':/脚本|分镜/,'image.main':/主图|海报|配图|生图|出图/
};

export function requestedSkills(requested){
 const clauses=String(requested||'').split(/，|[；;。]|并(?:且)?(?=审|核|生|制|写|输|给|算|计|测|做|比)|同时|然后|再(?=审|生|写|做|给)/).map(text=>text.trim()).filter(Boolean);
 return skillRequestPatterns.flatMap(rule=>{
  const matched=clauses.filter(text=>rule.matches.test(text));
  if(!matched.length)return [];
  // A qualified request like “审查标题” consumes its own clause. A separately requested title still runs.
  const remaining=clauses.filter(text=>!matched.includes(text)).join('，');
  const supersedes=(rule.replaces||[]).filter(capability=>!generalRequests[capability].test(remaining));
  const after=rule.capability==='content.review'&&matched.some(text=>!/(?:已有|既有|现有|原有|已写|上次|刚才)/.test(text))
   ? ['copy.titles','copy.selling_points','copy.detail','copy.video'].filter(capability=>generalRequests[capability].test(remaining)) : [];
  return [{id:rule.id,capability:rule.capability,title:rule.title,objective:rule.title,acceptance:rule.acceptance,supersedes,after}];
 });
}
