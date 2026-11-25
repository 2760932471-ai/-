// Public claims are checked against the chosen product. Search snippets, sibling
// SKUs and words from a planning prompt are not proof of a product attribute.
const claimRules=[
 {kind:'restricted',pattern:/全网最低(?:价)?|永久不漏|零风险|(?:百分百|100[%％])(?:有效|可靠|治愈)|(?:世界第一|行业第一|顶级)(?:品质|品牌|产品)?|根治|包治百病|保证治愈/gi,
  reason:'绝对化或医疗功效承诺，需改用可核对的事实'},
 {kind:'price',pattern:/(?:活动价|到手价|确认售价|零售价格)[：:\s]*[¥￥]?\d+(?:\.\d{1,2})?元?/gi,
  reason:'缺少商家确认的本次对外售价'},
 {kind:'promotion',pattern:/买[一二三四五六七八九十\d]+[赠送][一二三四五六七八九十\d]+|无条件退换|免费安装|终身(?:质保|保修)|全场包邮/gi,
  reason:'缺少商家确认的本次活动或服务条件'},
 {kind:'qualification',pattern:/食品级|医用级|有机认证|国家级(?:认证|品牌|品质)?|国家认证|FDA认证|欧盟认证/gi,
  reason:'缺少适用于本商品的证明文件'},
 {kind:'material',pattern:/纯棉|真皮|纯羊毛|纯钛|纯银/gi,
  reason:'缺少该商品的材质依据'},
 {kind:'spec',pattern:/(?:保温|保冷|续航|防水)(?:(?:时间|时长|长达|可达|达|约)|[：:\s])*\d+(?:\.\d+)?\s*(?:小时|h)|\d+(?:\.\d+)?\s*(?:小时|h)\s*(?:长效)?(?:保温|保冷|续航)|(?<![a-z\d])(?:SUS\s*)?(?:316L?|304)(?:\s*不锈钢|钢)?(?![a-z\d])|\d+(?:\.\d+)?\s*(?:毫升|ml|升|mAh|毫安时)(?![a-z])/gi,
  reason:'缺少该 SKU 对应的规格或性能依据'}
];
const uncertain=/(?:待核(?:实|对)?|待确认|未经(?:核实|确认)|尚未(?:确认|验证)|未(?:确认|核实|提供|验证)|示例|假设|仅供参考|例如|可能|据说|无法确认|不是|并无|非(?:食品级|医用级|真皮|纯棉|316|304)|不得声称|禁止宣称|不保证|未达到|不具备|不支持|并非|不含|不能保温|无法保温)/;
const clauses=text=>String(text||'').split(/[，,。！？；;\n]+/).map(part=>part.trim()).filter(Boolean);
const cleankey=text=>text.toLowerCase().replace(/\s+|长效|时间|时长|长达|可达|[：:]/g,'').replace(/毫升/g,'ml').replace(/小时/g,'h')
 .replace(/^(\d+(?:\.\d+)?h)(保温|保冷|续航)$/,'$2$1').replace(/^(保温|保冷|续航)(?:约|达)/,'$1')
 .replace(/^(?:sus)?(316l?|304)(不锈钢|钢)?$/,'$1')
 .replace(/^(?:活动价|到手价|确认售价|零售价格)[¥￥]?(\d+(?:\.\d+)?)元?$/,(_,price)=>'零售价'+Number(price));

function matches(text,rule){
 const content=String(text||'').replace(/https?:\/\/[^\s；，。]+/gi,'');
 return [...content.matchAll(rule.pattern)].map(match=>({term:match[0],key:cleankey(match[0])}));
}

function eligibleEvidence(row,prep,kind,claimText){
 if(!row.source||uncertain.test(row.text)||/^(?:商品品类|品名)[：:]/.test(row.text))return false;
 const sku=prep.selectedSku||prep.candidate?.sku;
 const legacyOffer=!row.sku&&row.kind==='offer'&&row.source===prep.candidate?.source&&/^https:\/\//.test(row.source);
 if(sku&&row.sku!==sku&&!legacyOffer)return false;
 if(!sku&&['knowledge','material'].includes(row.kind)&&!(prep.productName&&row.source.includes(prep.productName)))return false;
 const component=String(row.text).match(/^(内胆|外壳|外壁|杯盖|镜片|镜框|镜架|表带|鞋底|鞋面|面料|里料)(?:的)?(?:材质|材料|颜色|规格)[：:]/)?.[1];
 if(component&&!String(claimText).includes(component))return false;
 const conditions=String(row.text).match(/(?:在|仅限|适用于|限于)([^，。；：（）()]{1,24}?)(?:时|下|条件下|使用时|参加时)/g)||[];
 if(conditions.some(condition=>!String(claimText).includes(condition)))return false;
 if(!['manual','offer','knowledge','material'].includes(row.kind))return false;
 if(kind==='promotion'||kind==='price')return row.kind==='manual';
 if(kind==='qualification')return ['knowledge','material'].includes(row.kind)&&/检测报告|认证证书|资质证明/.test(row.source);
 return true;
}

function merchantCopy(goal){
 const confirmed=[];
 for(const line of clauses(goal?.text)){
  if(/^(?:商家确认|确认活动|活动名称|活动文案|活动|售后政策|活动价|到手价|确认售价)[：:]/.test(line)&&!uncertain.test(line))confirmed.push(line);
 }
 // A direct instruction to replace advertising copy is scoped to that image.
 return confirmed;
}

// Read explicitly maintained, literal vocabulary only. Natural-language notes
// and other products' policies do not become executable instructions.
export function publishingRules(records,sku,channel){
 const rules=[];
 for(const entry of records){
  if(entry.sku&&entry.sku!==sku)continue;
  for(const line of String(entry.text||'').split('\n')){
   const match=line.trim().match(/^(?:(淘宝|天猫|抖音|小红书|京东|拼多多|1688)[ ·]*)?(?:品牌禁用词|发布禁用词|禁用词)[：:]([^\n]{1,500})$/);
   if(!match||match[1]&&!channel.includes(match[1])&&channel!=='全渠道')continue;
   const terms=match[2].split(/[，,、；;|]/).map(s=>s.trim().replace(/^[“「"']|[”」"']$/g,'')).filter(s=>s.length>1&&s.length<=30);
   if(terms.length)rules.push({kind:entry.kind,id:entry.id,revision:entry.revision,source:entry.title,terms});
  }
 }
 return rules;
}

export function reviewText(text,prep={},approvedCampaigns=[]){
 const findings=[];
 for(const policy of prep.publishingRules||[]){
  for(const term of policy.terms){
   if(String(text||'').includes(term))findings.push({claim:term,kind:'policy',reason:'发布禁用词，依据《'+policy.source+'》'});
  }
 }
 for(const rule of claimRules){
  for(const hit of matches(text,rule)){
   if(findings.some(f=>f.kind===rule.kind&&f.claim===hit.term))continue;
   const supported=rule.kind!=='restricted'&&(
    ['promotion','price'].includes(rule.kind)&&approvedCampaigns.some(line=>matches(line,rule).some(m=>m.key===hit.key))||
    (prep.evidence||[]).some(row=>eligibleEvidence(row,prep,rule.kind,text)&&matches(row.text,rule).some(m=>m.key===hit.key)));
   if(!supported)findings.push({claim:hit.term,kind:rule.kind,reason:rule.reason});
  }
 }
 return findings;
}

function omitClaims(text,issues){
 let clean=String(text||'');
 for(const issue of issues)clean=clean.replaceAll(issue.claim,'');
 return clean.trim();
}
function distinct(items){
 const seen=new Set();
 return items.filter(item=>{const key=item.claim+'|'+item.reason;if(seen.has(key))return false;seen.add(key);return true;});
}

export function preparePublicContent(prep,goal){
 const campaign=merchantCopy(goal),evidence=prep.evidence||[],omitted=[];
 const recordIssues=text=>{const found=reviewText(text,prep,campaign);omitted.push(...found);return found;};
 const productName=omitClaims(prep.productName,recordIssues(prep.productName))||(prep.productName?'所选商品':'');
 const facts=prep.facts.filter(fact=>!recordIssues(fact).length);
 if(!facts.length&&productName)facts.push('商品品类：'+productName);
 const audience=omitClaims(prep.audience,recordIssues(prep.audience));
 const categoryOnly=facts.every(f=>f.startsWith('商品品类：'));
 return {...prep,productName,facts,audience,evidence,claimOmissions:distinct(omitted),
  boundary:categoryOnly?'仅有商品品类依据，图文使用可见外观。规格、性能及活动条件需另行核对。':prep.boundary};
}

// Render only assessed public claims into image instructions. Keep source text
// intact in the underlying evidence and audit records.
export function publicImageBrief({description,layoutBrief,edits=[],preparation={},goal}){
 const approvedCampaigns=merchantCopy(goal);
 if(edits.length){
  const replacement=String(edits.at(-1)).match(/(?:换成|改成|改为|替换为)[：:\s]*([^，。；！？\n]{1,32})[。！]?$/)?.[1];
  if(replacement&&!uncertain.test(replacement))approvedCampaigns.push(replacement);
 }
 const omitted=[...(preparation.claimOmissions||[])];
 const check=text=>{
  const issues=reviewText(text,preparation,approvedCampaigns);omitted.push(...issues);
  return omitClaims(text,issues);
 };
 const facts=(preparation.facts||[]).filter(fact=>{
  const issues=reviewText(fact,preparation,approvedCampaigns);
  omitted.push(...issues);
  return !issues.length;
 });
 return {description:check(description),layoutBrief:check(layoutBrief),productName:check(preparation.productName),facts,edits:edits.map(check),omitted:distinct(omitted)};
}

function confirmedBrief(goal){
 const brief=goal?.skillData?.copyBrief;
 if(!brief?.confirmed||!brief.source)return {};
 return {selectedSku:brief.sku,evidence:(brief.facts||[]).map(text=>({text,source:brief.source,kind:'manual',sku:brief.sku}))};
}

export function reviewDeliverables({goal,steps,files,imageJobs=[]}){
 const publicSteps=steps.filter(n=>/^(?:image|copy)\./.test(n.capability)||['product.draft','content.outline'].includes(n.capability));
 const omitted=[],blocking=[],reviewed=[],imageNotes=[];
 const sources=new Set();
 for(const step of publicSteps){
  const items=files.filter(file=>step.artifactIds?.includes(file.id)&&file.status!=='superseded');
  if(!items.length){blocking.push('缺少「'+step.title+'」当前版本的交付文件');continue;}
  const preparation=step.preparation||goal?.autoContent||confirmedBrief(goal);
  omitted.push(...(preparation.claimOmissions||[]));
  const sku=preparation.selectedSku||preparation.candidate?.sku;
  for(const row of preparation.evidence||[]){
   if((sku&&row.sku!==sku)||!row.source||!preparation.facts?.includes(row.text))continue;
   sources.add((sku?'SKU '+sku+' · ':'')+row.text+'（'+row.source+'）');
  }
  for(const file of items){
   if(file.imageJobId){
    const job=imageJobs.find(entry=>entry.id===file.imageJobId);
    if(!job||job.status!=='succeeded'){blocking.push('图片结果尚未就绪：'+file.title);continue;}
    omitted.push(...(job.claimOmissions||[]));
    imageNotes.push(file.title+' · '+(job.mode==='reference'?'已使用参考图':'概念图，正式上架前需核对实物')+'。生成请求已核对。请核对成图中的实际文字、商品结构及配件。');
   }else{
    // Internal citations and reference sections are not proposed customer copy.
    const copy=String(file.body||'').split(/\n(?:资料来源|已确认的输入事实)[：:]/)[0];
    for(const part of clauses(copy)){
     if(/^(?:依据|来源|供应商资料|商品详情|配图需求|构图要求|待补)[：:]/.test(part))continue;
     if(/^(?:不得|禁止|切勿|请勿|不承诺|不能承诺)/.test(part))continue;
     const hits=reviewText(part,preparation,merchantCopy(goal));
     for(const hit of hits)blocking.push(file.title+' · '+hit.claim+'（'+hit.reason+'）');
    }
   }
   reviewed.push(file.title);
  }
 }
 const checked=[...new Set(reviewed)];
 const findings=[...new Set(blocking)];
 if(!publicSteps.length)findings.push('当前计划没有可核对的对外文案或图片。');
 const body=['本次核对的交付物：'+(checked.join('、')||'尚缺文件')+'。',
  ...Array.from(sources,source=>'所用依据：'+source),
  ...distinct(omitted).map(issue=>'生成前已剔除「'+issue.claim+'」：'+issue.reason+'。'),
  ...findings.map(issue=>'待修改：'+issue),...imageNotes,
  '核对范围为已登记商品依据、商家确认的活动条件和常见宣传风险词。'].join('\n');
 const summary=findings.length?'对外发布前需修正 '+findings.length+' 项':'已核对本次对外文案与商品依据'+(imageNotes.length?'，成图请核对实物与实际文字':'');
 return {status:findings.length?'needs_input':'succeeded',summary,missing:findings,artifacts:[{title:'发布前核对记录',body,evidence:'本任务当前版本的文字稿、图片任务和商品依据'}]};
}
