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

export function privateWebSubject(text){
 return /(?:我[们司]|贵公司|本公司|公司|内部|CRM|工作空间).{0,12}(?:客户资料|客户名单|客户数据|联系人|客户档案|客户信息|订单明细)|手机号[码]?|身份证号|个人邮箱|客户名单|(?:^|[^0-9])1[3-9][0-9]{9}(?![0-9])|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:密钥|口令|密码|订单号|客户编号|api[_ -]?key|password|secret|token)\s*[:=：]/i.test(text);
}

function usesWorkspaceSource(clause){
 return /(?:查|找|搜|检索|核对|读取|从|根据|依据|在).{0,12}(?:附件|工作空间|公司(?:的)?(?:知识库|内部资料|CRM)|(?:CRM|知识库|本地文件|内部资料)(?:中|里|内|的))|(?:在|从)(?:我(?:们)?(?:的)?|公司(?:的)?|本工作空间的)?(?:附件|知识库|CRM|内部资料)(?:里|内|中)/i.test(clause);
}

export function workspaceSourcesOnly(request,excluded=''){
 const web=/联网|上网|外网|互联网|公网|外部(?:搜|网站|资料|网页|信息)|网络搜|公开搜|搜网页|浏览网页|访问网页|打开网页|web\.(?:read|search)/i;
 return privateWebSubject(request)||web.test(excluded)||request.split('，').some(clause=>usesWorkspaceSource(clause)||/(?:禁止|不准|不能|不可|不得|切勿|避免)/.test(clause)&&web.test(clause))||
  /(?:仅|只)(?:限于?|允许|能)?(?:使用|用|查|从|根据|参考|依据|按|分析|检索)?(?:我们(?:自己)?(?:的)?|我(?:的)?|你(?:的)?|本公司(?:的)?|公司(?:的)?|企业(?:的)?|项目(?:的)?|当前|本次)?(?:上传的|提供的|本地|现有|已有|内部|附件|知识库|工作空间)/.test(request);
}

// Compare only explicit preferences. A task comparing both channels keeps its
// usual generalist, while two compatible employees can share the same skill.
function requestedEmployeePreferences(text){
 const brief=String(text||'').replace(/(?:客户|买家|顾客)(?:问道?|说|原话|反馈|留言|问题)?[：:\s]*[“「"][^”」"]*[”」"]/gu,'');
 const {requested}=requestParts(brief);
 const taobao=/淘宝|天猫/.test(requested),douyin=/抖音/.test(requested);
 const concise=/简洁|简明|干练|简短|言简意赅|直截了当/.test(requested);
 const empathetic=/共情|安抚|温和|暖心|体贴|关怀|温柔|耐心/.test(requested);
 return {channel:taobao&&douyin?'general':taobao?'taobao':douyin?'douyin':null,
  tone:concise&&empathetic?'standard':concise?'concise':empathetic?'empathetic':null};
}

export function employeeProfileFit(employee, text){
 const profile=employee.profile;
 const {requested}=requestParts(text);
 const {channel,tone}=requestedEmployeePreferences(text);
 const match=(value,preference,generic)=>!value||value===generic?0:value===preference?2:-1;
 const namesPosition=[employee.name,profile?.position].some(value=>value?.length>=2&&requested.includes(value));
 const areas=[profile?.audience,profile?.responsibilities].filter(Boolean).flatMap(value=>value.split(/[、，,；;。\n]/));
 const relevant=areas.some(part=>part.trim().length>=2&&requested.includes(part.trim()));
 return (namesPosition?8:0)+(relevant?1:0)+match(profile?.channel,channel,'general')+match(profile?.tone,tone,'standard');
}

export function employeeProfileForTask(profile,text){
 const {channel,tone}=requestedEmployeePreferences(text);
 if(!profile&&!channel&&!tone)return undefined;
 return {...profile,channel:channel||profile?.channel||'general',tone:tone||profile?.tone||'standard'};
}

export function serviceQuestionFromGoal(text){
 const goal=String(text||'').trim();
 const quote=goal.match(/(?:客户|顾客|买家|用户)(?:原话|问题|留言|咨询|反馈|来信|问道?|说)?\s*[：:「“"]+\s*([^」”"\n]+)/u);
 if(quote)return quote[1].trim();
 return /漏水|破损|未收到|没收到|退款|退货|换货|发货|物流/.test(goal)&&!/(?:客服|分诊|分析|写一|给我|拟一|起草|话术|帮我回复)/.test(goal)?goal:'';
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

// A plain 查/找 may refer to a workspace or a shop. A named public source
// or an explicit request to go online distinguishes a public search.
function webSearchClause(clause){
 const explicit=clause.match(/(?:web\.search|(?:上网|联网|(?:在|去)?网上)(?:搜(?:索|一搜)?|查(?:找|询|证|一查)?|找(?:一找)?)|网页搜索|搜(?:索)?(?:一下)?网页)[：:\s]*(?:一下)?\s*(.*)$/i);
 const ordinary=explicit?null:clause.match(/^(?:请你|请|帮我|给我|替我|麻烦|顺便|再|先|也|去|帮忙|继续|想请你|能否)*(?:搜(?:索|集|一搜)?|查(?:找|询|一查)?|找(?:一找|找)?)(?:一下)?\s*(.+)$/i);
 if(privateWebSubject(clause)||usesWorkspaceSource(clause))return explicit?{query:''}:null;
 let topic=(explicit||ordinary)?.[1]?.trim();
 if(topic===undefined)return null;
 if(ordinary){
  const online=/^(?:在)?(?:网上|线上|互联网上)/.test(topic);
  const publicSource=/官网|官方(?:发布|资料|来源|文档|指南|公告|网站|消息|信息|报道)|公开(?:发布|发售|上市|披露|发表|报道|资料|数据|网页|来源|信息|报告|政策)|最新(?:消息|新闻|报道)|\bnews\b/i.test(topic);
  const commerce=/(?:1688|淘宝|天猫|闲鱼|拼多多|京东).*(?:选品|销量|热销|批发|报价|货源|卖得好|起订)/.test(clause);
  if(!online&&(!publicSource||commerce))return null;
 }
 topic=topic.replace(/^(?:在)?(?:网上|线上|互联网上)(?:的)?\s*/,'').replace(/^关于\s*/,'')
  .replace(/(?:的)?公开(?:的)?(?:资料|网页|来源)\s*$/,'')
  .split(/(?:并(?:且)?|然后|接着)(?:打开|阅读|提取|读取|整理|生成|写|列出|附上)/)[0].trim();
 return {query:topic.slice(0,200)};
}

// These requests correspond to business tools with concrete input schemas, not open-ended analysis.
export const skillRequestPatterns = [
 {id:'web_search',capability:'web.search',title:'搜索公开网页',
  matches:clause=>webSearchClause(clause)!==null,
  acceptance:'返回实际搜到的标题、链接和摘要，注明检索词和来源。'},
 {id:'web_read',capability:'web.read',title:'读取网页正文',
  matches:/(?:打开|浏览|读(?:取)?|阅读|提取|看(?:一)?下).{0,14}(?:链接|网址|网页|网站|https?:\/\/)|^https?:\/\/[^\s]+$/i,
  acceptance:'读取给定网页的实际正文，保留来源；访问受限时明确说明。'},
 {id:'table-profile',capability:'table.profile',title:'分析表格',
  matches:/(?:分析|概览|检查|概括|统计|汇总|查看).{0,16}(?:CSV|表格)|(?:CSV|表格).{0,14}(?:概览|分析|统计|空值|缺失|分布|平均值)/i,
  acceptance:'给出当前表格的行列数、逐列缺失数和可识别数值列的统计。'},
 {id:'document-outline',capability:'document.outline',title:'整理文档提要',
  matches:/(?:整理|总结|汇总|概括|摘要|提炼|梳理|摘取).{0,12}(?:文档|原文|会议纪要|会议记录|文字|材料|段文本)|(?:文档|原文|会议纪要|材料|文本|正文).{0,12}(?:提要|摘要|要点|梳理|总结)/,
  acceptance:'摘取来自所给原文的内容，每条都附有可查回的行号。'},
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
 {id:'triage',capability:'service.triage',title:'分诊客户问题并起草接待回复',
  matches:/(?:客服|售后|客户问题)(?:问题)?分诊|(?:接待|安抚)(?:一[下位])?(?:客户|买家|顾客)|客服(?:接待)?话术|(?:拟|写|起草|草拟).{0,8}客服(?:回复|答复)/,
  acceptance:'根据客户原话给出接待草案和需要核对的凭证。'},
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
  const matched=clauses.filter(text=>typeof rule.matches==='function'?rule.matches(text):rule.matches.test(text));
  if(!matched.length)return [];
  // A qualified request like “审查标题” consumes its own clause. A separately requested title still runs.
  const remaining=clauses.filter(text=>!matched.includes(text)).join('，');
  const supersedes=(rule.replaces||[]).filter(capability=>!generalRequests[capability].test(remaining));
  const after=rule.capability==='content.review'&&matched.some(text=>!/(?:已有|既有|现有|原有|已写|上次|刚才)/.test(text))
   ? ['copy.titles','copy.selling_points','copy.detail','copy.video'].filter(capability=>generalRequests[capability].test(remaining)) : [];
  return [{id:rule.id,capability:rule.capability,title:rule.title,objective:rule.title,acceptance:rule.acceptance,supersedes,after}];
 });
}

// Local planning and follow-up messages resolve against the same callable
// catalog the model sees. A new skill is selectable by its name or ID as soon
// as it is registered. Patterns add natural-language support and dependencies.
export function resolveCatalogSkillRequests(text,definitions,{reportBlockedWeb=false}={}){
 text=String(text||'');
 const attached=attachedSkillText(text);
 const {requested,excluded}=requestParts(attached?.title||text);
 const clauses=requested.split('，').filter(clause=>!asksForMethod(clause)&&!/^输入示例[：:]/.test(clause)&&
  !/(?:是什么|是做什么的|有什么用|怎么用|能做什么|用过(?:了)?吗|执行过(?:了)?吗|执行了吗|为什么失败|有哪些技能)(?:吗|呢|啊)?$/.test(clause));
 const actions=clauses.join('，');
 const rules=requestedSkills(actions);
 const normalized=actions.toLowerCase();
 const result=[];
 for(const skill of definitions){
  if(skill.type!=='code'&&skill.executor!=='skill'&&!skill.discoverable)continue;
  if(skill.id.startsWith('web.')&&!reportBlockedWeb&&workspaceSourcesOnly(requested,excluded))continue;
  const rule=rules.find(entry=>entry.capability===skill.id);
  const idToken=skill.id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const named=new RegExp('(?:^|[^a-z0-9_.])'+idToken+'(?![a-z0-9_.])','i').test(actions)||
   [skill.name,...(skill.aliases||[])].some(word=>word&&normalized.includes(word.toLowerCase()));
  if(!rule&&!named)continue;
  const intent=skillRequestPatterns.find(entry=>entry.capability===skill.id);
  const acceptance=intent?.acceptance||skill.acceptance||skill.description;
  result.push(rule||{id:intent?.id||skill.id.replace(/\./g,'_'),capability:skill.id,title:skill.name,
   objective:skill.name,acceptance,supersedes:[],after:[]});
 }
 return result.filter(entry=>!result.some(other=>other.supersedes.includes(entry.capability)));
}

// Derive only the search terms or explicit address. The transport should
// never receive an entire conversation or the user's other task materials.
export function webSkillInput(id,text,input={}){
 if(id!=='web.read'&&id!=='web.search')return input;
 const raw=String(text||'').trim();
 if(id==='web.read'){
  const url=raw.match(/https?:\/\/[^\s<>"'“”「」《》、，。；（）)]+/i)?.[0].replace(/[.,;!?:]+$/,'');
  return {...input,url:input.url||url||''};
 }
 const {requested,excluded}=requestParts(raw);
 if(workspaceSourcesOnly(requested,excluded)||privateWebSubject(input.query||''))return {...input,query:''};
 const clause=requested.split('，').map(webSearchClause).find(Boolean);
 return {...input,query:input.query||clause?.query||''};
}

// Separate pasted source material from the request before planning. A sentence
// inside a document or a CSV cell is data, even if it mentions another action.
export function attachedSkillText(text){
 const parts=text.trim().match(/^([^\r\n：:]+?)[：:\r\n]+\s*([\s\S]+)$/);
 if(!parts)return null;
 const requested=requestParts(parts[1]).requested;
 if(asksForMethod(requested))return null;
 const matched=requestedSkills(requested).filter(rule=>rule.capability==='table.profile'||rule.capability==='document.outline');
 if(matched.length!==1)return null;
 const raw=parts[2].trim().replace(/^```(?:csv|markdown|md|text)?\s*\n([\s\S]*?)\n```$/i,'$1');
 if(matched[0].capability==='table.profile'&&!/[,\n\r]/.test(raw))return null;
 return {title:parts[1].trim(),capability:matched[0].capability,raw};
}
