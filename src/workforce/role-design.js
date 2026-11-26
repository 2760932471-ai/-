import {requestParts,requestedSkills} from '../../public/goal-language.js';

// The role family supplies a starting point. The confirmed job title and brief are workspace-specific.
const roleTopics={
 research:/市场研究|市场调研|竞品|市场趋势|市场洞察/,
 selection:/选品|货源|供应商比价/,
 merchandise:/商品管理|商品资料|商品主档|上架资料/,
 creative:/内容创意|文案|脚本|分镜|商品标题|卖点/,
 growth:/推广|投流|广告投放|投产|运营漏斗|流量运营/,
 campaign:/促销|平台活动|活动运营/,
 supply:/补货|仓储|仓库|库存|供应链/,
 service:/客服|售后|退换货|客户咨询/,
 profit:/利润|保本|成本核算|价格测算/,
 analysis:/经营分析|经营复盘|经营数据/,
 coordination:/项目协调|运营协同|任务分配|跟进进度/
};
const answerLimits={responsibilities:1600,audience:300,deliverable:600};
const action=/通知|编制|负责|安排|准备|培训|接收|设计|整理|总结|汇总|管理|核对|核查|计算|核算|测算|分析|回复|回答|接待|分诊|梳理|筛选|起草|撰写|编写|写|跟踪|跟进|收集|输出|生成|交付|提交|审核|检查|统计|形成|协调|维护|记录|制作|受理|复核/;
const titleEnd=/(?:助理|顾问|专员|运营|经理|客服|编辑|策划|分析师|设计师|协调员|档案员|管理员|负责人|工程师|研究员|老师|会计|教练|秘书|员工)$/;
const genericName=/^(?:自定义岗位|新员工|助手|助理|数字员工|AI员工|员工|岗位|角色|一个员工|你好|随便|随意|还没想好)$/i;
function trimmed(value,max,label){
 if(typeof value!=='string'||value.trim().length>max)throw Error(label+'最多 '+max+' 字');
 return value.trim();
}
function namedPosition(first){
 let title=first.replace(/^(?:(?:请|我是|我想|想要|希望|帮我|给我|需要|让它|让他|让她|创建|新建|(?:想找|找|设计|招聘)(?=一个|一位|一名|个)|搭建|配置|做|要|担任|一个|一位|一名|个|名)\s*)+/,'')
  .replace(/^(?:岗位(?:名称|定位)?|名称|名字|叫做|叫)\s*[：:]?\s*/,'').replace(/^(?:[“「"])(.+)[”」"]$/,'$1').trim();
 if(action.test(title)&&title.includes('的')){
  const suffix=title.split('的').at(-1).trim();
  if(!titleEnd.test(suffix)&&!/^[A-Z]{2,12}$/.test(suffix))return '';
  title=suffix;
 }
 if(!/^[\p{L}][\p{L}\p{N} &/+.·-]{0,35}$/u.test(title)||genericName.test(title))return '';
 if(/^(?:每[日周月天年季]|定期|今天|明天|本周|这次|按照|根据|给|为|帮我|请|先|只需|能否|希望|面向|负责(?!人$))/u.test(title))return '';
 if(titleEnd.test(title))return title;
 // Short noun phrases can name a job in any language. A verb with an object
 // still describes an assignment (e.g. 核对库存), even after removing “帮我”.
 const verb=title.match(action);
 if(verb&&verb.index+verb[0].length<title.length)return '';
 if(/^(?:找出|列出|比较|提取|查找|导出|阅读|search|review|summarize|create|find|send)\s*./i.test(title))return '';
 return title;
}
function selectRole(roles,chosen,positive,skillMatches){
 if(chosen){const role=roles.find(r=>r.id===chosen);if(!role)throw Error('岗位方向已更新，请重新选择');return role;}
 const scored=roles.filter(r=>r.id!=='custom').map(role=>{
  const label=role.name.replace(/数字员工$/,'');
  const score=(positive.includes(label)?12:0)+(roleTopics[role.id]?.test(positive)?5:0)+
   skillMatches.reduce((n,s)=>n+(s.roleIds?.[0]===role.id?2:0),0);
  return {role,score};
 }).sort((a,b)=>b.score-a.score);
 return scored[0]?.score?scored[0].role:roles.find(r=>r.id==='custom');
}
function inferAudience(text){
 const labeled=text.match(/(?:面向|服务对象(?:是|为|[：:])|服务于|主要服务)\s*([^，。；;、]{1,40})/);
 const addressed=text.match(/(?:为|给|帮|向)\s*([^，。；;、]{1,32}?)(?=(?:每[日周月天]|定期|负责|提供|输出|交付|生成|整理|汇总|做|制作|分析|处理|审核|起草|编写|撰写|写|核算|核对|跟进|筛选|识别))/);
 return (labeled?.[1]||addressed?.[1]||'').replace(/(?:的(?:数字员工|助理))$/,'').trim();
}
function inferDeliverable(text){
 const explicit=text.match(/(?:交付(?:物(?:是|为|[：:])?)?|产出|输出|生成|提交|形成|整理成|给出)(?:一份|一张|一套|一个)?\s*([^，。；;]{1,80})/);
 if(explicit)return explicit[1].trim();
 const artifact=text.match(/(?:[^，。；;\s]{0,16}?)(?:周报|日报|月报|会议纪要|政策答复|邀约话术|分镜脚本|补货清单|盈亏报告|进度表)/);
 return artifact?.[0].replace(/^.*(?:整理|准备|撰写|编写|写|制作|提交|给出|负责)/,'').trim()||'';
}

export function draftRole(input,roles,skills,roleSkills){
 if(!input||typeof input!=='object')throw Error('请用一句话描述员工要负责的工作');
 const description=trimmed(input.description,1600,'岗位描述');
 if(!description)throw Error('请用一句话描述员工要负责的工作');
 if(input.answers!=null&&(typeof input.answers!=='object'||Array.isArray(input.answers)))throw Error('补充信息格式无效');
 const answers={};
 for(const [key,limit] of Object.entries(answerLimits)){
  if(input.answers?.[key]!=null)answers[key]=trimmed(input.answers[key],limit,'补充信息');
 }
 const full=[description,answers.responsibilities,answers.deliverable].filter(Boolean).join('，');
 const {requested}=requestParts(full);
 const clauses=full.split(/[，,；;。！？\n]/).map(s=>s.trim()).filter(Boolean);
 const bounds=clauses.filter(s=>/^(?:不负责|不承诺|禁止|仅限|仅在|无需|不需要|不做|不要|不能|只读|不允许|不可|未经|需(?:要)?审批|由.{1,12}审批|遇到.+转|超出.+转)|(?:需要|需经|必须经).{0,18}(?:审批|复核|确认|同意)/.test(s));
 const positive=requested.split('，').filter(s=>!bounds.includes(s)).join('，');
 const wanted=new Set(requestedSkills(positive).map(s=>s.capability));
 for(const skill of skills)if(positive.toLowerCase().includes(skill.name.toLowerCase())||positive.toLowerCase().includes(skill.id.toLowerCase()))wanted.add(skill.id);
 const matched=skills.filter(s=>wanted.has(s.id));
 const title=namedPosition(clauses[0]||'');
 const requestedTitle=description.match(/(?:岗位名称|取名(?:为)?|命名为|名字叫|叫做|(?:^|[，。；])叫)\s*[：:]?\s*([^，。；;\n]{1,36})/);
 const userTitle=requestedTitle?.[1]?.trim()||title;
 const role=selectRole(roles,input.roleId,userTitle||positive,userTitle?[]:matched);
 const name=userTitle||(role.id==='custom'?'自定义岗位':role.name.replace(/数字员工$/,'专员'));
 const duties=clauses.filter((clause,i)=>{
  if(i===0&&(title||requestedTitle)&&!/(?:给|向|为).+?(?:整理|提供|核对|分析|制作|准备)|负责.{2,}/.test(clause.replace(/负责人$/,'')))return false;
  return !bounds.includes(clause)&&!/^(?:服务对象|岗位名称|名字叫|取名)/.test(clause)&&action.test(clause);
 });
 const responsibilities=(answers.responsibilities||[...new Set(duties)].join('；')).slice(0,1600);
 const audience=answers.audience||inferAudience(positive.replace(/帮我(?:做|建|创建|配置|设计)(?:一个|一位|个)/g,''));
 const statedDelivery=answers.deliverable||inferDeliverable(positive);
 const ids=matched.length?matched.map(s=>s.id):(roleSkills[role.id]||[]).filter(id=>skills.some(s=>s.id===id));
 const deliverable=statedDelivery||skills.filter(s=>ids.includes(s.id)).map(s=>s.name).join('、');
 const explicitPosition=clauses.find(s=>/^(?:岗位)?定位(?:是|为|[：:])/.test(s));
 const position=explicitPosition?explicitPosition.replace(/^(?:岗位)?定位(?:是|为|[：:])\s*/,'').slice(0,120):(name==='自定义岗位'?'':name);
 const persona=clauses.filter(s=>/^(?:人设|沟通风格|语气|说话方式)/.test(s)).join('；').slice(0,300);
 const strategy=clauses.filter(s=>/^(?:策略|优先|先.+再)/.test(s)).join('；').slice(0,800);
 const tone=/温和|关怀|安抚|共情/.test(persona)?'empathetic':/简明|简短|简洁|直接/.test(persona)?'concise':'standard';
 const taobao=/淘宝|天猫/.test(positive),douyin=/抖音/.test(positive);
 const channel=taobao===douyin?'general':taobao?'taobao':'douyin';
 const profile={position,audience,responsibilities,deliverable,boundaries:bounds.join('；').slice(0,800),tone,channel,persona,strategy};
 const employee={name,roleId:role.id,instructions:responsibilities,profile,skillIds:ids.slice(0,10),mode:'skills',modelId:null,enabled:true,maxSteps:5};
 const basis=matched.length?['已从描述匹配到可执行技能：'+matched.map(s=>s.name).join('、')]:ids.length?['按岗位方向推荐技能，可在确认前增删。']:[];
 const gaps=[];
 if(!ids.length)gaps.push('当前目录还没匹配到执行这项工作的技能，可在保存前选择已有技能。');
 if(/(?:实际|直接|自动)(?:发送|群发|发布|投放|调价|报名|下单|付款|退款)/.test(positive))gaps.push('描述中包含对外执行动作，当前岗位方案仅列出已匹配的技能；请核对相应执行渠道和授权。');
 let question=null;
 if(!responsibilities)question={key:'responsibilities',text:'你想先交给这位员工哪一项具体工作？可以描述它拿到什么资料、接下来做什么。'};
 else if(!audience&&/触达|群发|通知|邀约|回复|培训/.test(positive))question={key:'audience',text:'这项工作主要服务哪一群人？我会据此调整岗位说明和交付方式。'};
 else if(!statedDelivery&&role.id==='custom')question={key:'deliverable',text:'完成后你希望收到什么，或者看到什么结果？'};
 return {employee,question,basis,gaps};
}
