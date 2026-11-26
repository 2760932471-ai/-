// Audience selection uses explicit CRM labels from a supplied export. Free-form
// descriptions never authorize sending messages or guessing traits from contact details.
const crmSource=/CRM|客户库|会员库|客户名册|客户名单|客户数据/i;
const findPeople=/筛选?|找出|找到|寻找|圈选|圈出|挑出|提取|导出|拉出/;
const outreach=/营销|触达|群发|发送|推送|邀约|联系|通知|推广/;
const draft=/方案|草稿|话术|文案|策略|建议|模板|如何|怎么做/;
const knownLabels=['年轻','女性','男性','白领','宝妈','会员','老客','新客','高意向','已购','未购'];

export function audienceRequest(text,excluded=''){
 if(!crmSource.test(text)||/(?:选型|对比|比较).{0,18}CRM|CRM.{0,18}(?:选型|迁移成本|系统对比)/i.test(text))return null;
 const clauses=text.split(/[，,。；;\n]/).map(value=>value.trim()).filter(Boolean);
 const action=clauses.find(clause=>findPeople.test(clause));
 const wantsCopy=outreach.test(text);
 if(!action&&!wantsCopy)return null;
 if(!action&&!/(?:客户|会员|人群|用户|顾客|客群|名单|老客|新客|他们|她们)/.test(text)&&!knownLabels.some(label=>text.includes(label)))return null;
 const draftOnly=clauses.every(c=>!findPeople.test(c)||draft.test(c))&&draft.test(text);
 const wantsOutreach=!/营销|联系|群发|发送|触达|推送|通知/.test(excluded)&&clauses.some(c=>outreach.test(c)&&!draft.test(c)&&!/(?:不|别|禁止|停止)(?:实际|继续|再)?(?:营销|联系|群发|发送|触达|通知)/.test(c));
 const sourceClause=action||clauses.find(c=>/(?:面向|针对|给|向)/.test(c))||'';
 const targetMatch=sourceClause.match(/(?:筛选(?:出)?|筛出|找出|找到|寻找|圈选|圈出|挑出|提取|面向|针对)\s*(.{1,65})/);
 const namedTag=text.match(/(?:CRM|客户库|会员库)(?:里|内|中|的)*([^，。；、\s]{1,32}?)的?标签/i)?.[1];
 const audience=(targetMatch?.[1]||namedTag||'').replace(/^(?:CRM|客户库|会员库)(?:中|内|里|的)*/i,'').split(/并(?:将|向|给|为|营销|发|推|进行|通过)|然后|进行营销|发(?:送|放)|推荐|推送|邀约/)[0].replace(/老客户/g,'老客').replace(/新客户/g,'新客').replace(/(?:这些人|这群人|这类人|的人群|这类客户|目标客群|客户群体|的?客户|的?顾客|的?会员|名单|人群|客群)+$/,'').trim();
 const product=text.match(/(?:上新|上线|上架|推出|销售|推广)(?:了|的)?\s*([^，,。；;\s]{1,30})/)?.[1]||'';
 const labels=knownLabels.filter(label=>audience.includes(label));
 // Split only fully understood conjunctive criteria. Other segments must have
 // their own exact CRM tag; silently dropping one condition would widen the list.
 const remainder=labels.reduce((left,label)=>left.replaceAll(label,''),audience).replace(/[的且及和与、\s]/g,'');
 const cautious=/包括|包含|选取|筛选|筛入|已购|已退订/.test(excluded)||clauses.some(c=>!c.includes(sourceClause)&&/限于|仅限|排除|除外|同时满足|并满足|仅选|优先选|年龄|地域|地区|预算|住在/.test(c));
 return {audience,product,isLaunch:/上新|上线|上架|推出/.test(text),wantsCopy,wantsSelection:(!draftOnly&&!!action)||wantsOutreach,wantsOutreach,
  labels:remainder||cautious?[]:labels,complex:cautious};
}

export function normalizeAudienceData(data){
 if(!data||typeof data.source!=='string'||!data.source.trim()||data.source.length>200||!Array.isArray(data.records)||data.records.length>2000)
  throw Error('CRM 资料需包含报表来源和客户记录数组，最多 2000 条。');
 const ids=new Set();
 const records=data.records.map(row=>{
  if(!row||typeof row.id!=='string'||!/^[-\w.]{1,64}$/.test(row.id)||/^\d{11}$/.test(row.id))throw Error('请为每行使用脱敏客户编号，示例 C001。');
  if(ids.has(row.id))throw Error('CRM 报表含重复编号，请合并同一客户的记录后再导入。');
  ids.add(row.id);
  if(!Array.isArray(row.tags)||row.tags.length>30||row.tags.some(tag=>typeof tag!=='string'||!tag.trim()||tag.length>100))
   throw Error('每条 CRM 记录需要标签数组，请使用原报表中的实际标签。');
  if(row.contactable!=null&&typeof row.contactable!=='boolean')throw Error('可触达状态应为 true、false 或空。');
  return {id:row.id,tags:[...new Set(row.tags.map(tag=>tag.trim()))],contactable:row.contactable??null};
 });
 return {source:data.source.trim(),records};
}

export function audiencePreparation(request){
 const {audience,product,labels,wantsCopy}=request;
 const criteria=request.complex?'先按原需求在 CRM 核准所有附加条件，再导出对应客群。':!audience?'先明确要找的客群或 CRM 标签。':
  '选择 CRM 中已有的「'+audience+'」标签'+(labels.length>1?'，或同时满足「'+labels.join('」「')+'」':'')+'。';
 const sections=[criteria,'同一客户按编号去重。'];
 if(wantsCopy){
  sections.push('营销名单仅保留已标记允许本次触达的人，状态为空或已拒绝的人单独计数。');
  const opening=product?(request.isLaunch?'我们新上了':'想向你介绍')+product+'。':'想向你介绍一下我们的产品。';
  sections.push('邀约草稿\n你好，'+opening+'如果感兴趣，我可以发一份产品介绍给你看看。');
 }
 return sections.join('\n\n');
}

export function inspectAudience(request,data,confirmedTag){
 if(!data)return {missing:'当前工作空间没有可读取的 CRM 客户报表。请导入含脱敏客户编号、实际标签和可触达状态的 CRM 报表，才能统计匹配客户。'};
 const actualTags=new Set(data.records.flatMap(row=>row.tags));
 const hasComponents=request.labels.length>0&&request.labels.every(label=>actualTags.has(label));
 const hasUsableFilter=!request.complex&&(actualTags.has(request.audience)||hasComponents);
 if(data.records.length&&!hasUsableFilter){
  const tag=String(confirmedTag||'').trim();
  if(!actualTags.has(tag)){
   const question='报表中哪个现成的 CRM 客群标签完整对应你要找的人？请回复准确的标签名称。';
   return {missing:'当前报表的标签无法直接核对全部筛选条件。'+question+'也可以重新导入包含这些标签的报表。',question};
  }
  request={...request,audience:tag,labels:[]};
 }
 const matching=data.records.filter(row=>row.tags.includes(request.audience)||request.labels.length>0&&request.labels.every(label=>row.tags.includes(label)));
 const contactable=matching.filter(row=>row.contactable===true);
 const unknown=matching.filter(row=>row.contactable==null).length;
 const list=request.wantsOutreach?contactable:matching;
 const count=data.records.length?'按「'+request.audience+'」筛选 '+data.records.length+' 条客户记录，匹配 '+matching.length+' 人。':'导入报表包含 0 条客户记录，匹配 0 人。';
 const summary=['来源：'+data.source,count,
  '允许触达 '+contactable.length+' 人，已标记不可触达 '+(matching.length-contactable.length-unknown)+' 人，触达状态未知 '+unknown+' 人。'].join('\n');
 const body=summary+'\n'+(request.wantsOutreach?'可触达客户编号':'匹配客户编号')+'：'+(list.map(row=>row.id).join('、')||'无');
 return {body,summary,matched:matching.length,contactable:contactable.length};
}
