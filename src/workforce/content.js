import {normalizeChannel,placeholderFact} from './content-preparation.js';
// Deterministic content assembly: every product claim comes from the confirmed brief.
export const contentPacks=[
 {id:'titles',name:'商品标题',employeeName:'商品标题数字员工',output:'3 组标题候选、字符数与取舍依据',description:'调整信息顺序，保留关键规格，形成可比较的标题。'},
 {id:'selling_points',name:'商品卖点',employeeName:'卖点文案数字员工',output:'短卖点、参数说明与证据对应表',description:'将已核验特点组织为可追溯的文案，避免凭空推导功效。'},
 {id:'detail',name:'详情页文案',employeeName:'详情页文案数字员工',output:'首屏、参数、细节、选购、售后五个模块',description:'交付可交给设计师排版的文字稿和待补素材清单。'},
 {id:'video',name:'短视频脚本',employeeName:'短视频脚本数字员工',output:'30 / 60 秒分镜、画面、口播与字幕',description:'围绕商品事实组织镜头节奏，明确拍摄所需素材。'},
 {id:'image_brief',name:'主图设计简报',employeeName:'主图策划数字员工',output:'3 版构图方向、画面文字与素材清单',description:'准备可交给设计师的制作要求；本能力不生成图片。'}
].map(p=>({...p,skillId:'copy.'+p.id,employeeId:'employee-copy-'+p.id}));
export const contentDefinitions=contentPacks.map(p=>({id:p.skillId,name:p.name+'编排',description:p.description+'可从已有资料自动提取并编排；输出需审核。',roleIds:['creative','merchandise'],requires:['商品名称；渠道默认全渠道，受众与特点可由系统从已有资料自动整理'],version:1}));
export function validateCopyBrief(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('请填写内容制作资料');
 value={...value,channel:normalizeChannel(value.channel)};
 const b={};for(const [key,label,max]of [['productName','商品名称',80],['channel','使用渠道',40],['audience','目标人群',120],['source','资料来源',500]]){if(typeof value[key]!=='string'||!value[key].trim()||value[key].trim().length>max)throw new Error(label+'必填，最多 '+max+' 字');b[key]=value[key].trim();}
 if(!Array.isArray(value.facts)||value.facts.length<1||value.facts.length>8||value.facts.some(v=>typeof v!=='string'||!v.trim()||v.trim().length>120))throw new Error('请提供 1–8 条已核验特点，每条最多 120 字');
 if(placeholderFact(value.source)||value.facts.some(placeholderFact))throw new Error('内容特点或来源是占位文字，请使用自动整理或填写具体信息');
 b.facts=[...new Set(value.facts.map(v=>v.trim()))];
 if(value.confirmed!==true)throw new Error('请先核对商品特点与来源并确认');b.confirmed=true;
 b.duration=Number(value.duration??30);if(![30,60].includes(b.duration))throw new Error('视频时长请选择 30 或 60 秒');
 const hits=['全网最低','永久不漏','百分百','100%','零风险','国家级','顶级'].filter(w=>[b.productName,...b.facts].join('\n').includes(w));if(hits.length)throw new Error('以下表述需核验并修改后再生成：'+hits.join('、'));
 return b;
}
export function contentSample(){return {goal:'为示例角阀制作内容草稿',kind:'analysis',scope:{store:'虚构示例店',sku:'COPY-DEMO',product:'示例角阀'},copyBrief:{productName:'示例黄铜角阀',channel:'全渠道',audience:'核对管件规格的家庭用户',facts:['材质：黄铜（虚构样例）','接口：G1/2（虚构样例）','包装：1 只装（虚构样例）'],source:'虚构测试资料，请替换为真实核验资料',confirmed:true,duration:30}};}
export function executeContent(id,input){
 const pack=contentPacks.find(p=>p.skillId===id);if(!pack)throw new Error('未知内容能力');let b;try{b=validateCopyBrief(input.autoContent?{...input.autoContent,confirmed:true}:input.copyBrief);}catch(error){return {status:'needs_input',summary:'内容草稿尚未生成。',missing:[error.message],artifacts:[],metrics:{}};}
 const facts=b.facts,numbered=facts.map((f,i)=>`[${i+1}] ${f}`).join('\n');let body='',metrics={factCount:facts.length};
 if(id==='copy.titles'){
  const candidates=[`${b.productName}｜${facts[0]}`,`${facts[0]}｜${b.productName}${facts[1]?'｜'+facts[1]:''}`,`${b.productName}｜${facts.join(' / ')}`];
  body=candidates.map((title,i)=>`方案 ${i+1} · ${['商品名称优先','首项特点优先','规格信息完整'][i]}\n${title}\n字符数：${Array.from(title).length}；${Array.from(title).length>60?'较长，发布前请按实际平台限制精简':'仍需按实际平台标题限制核对'}。`).join('\n\n')+'\n\n当前未查询平台词库、搜索量或排名，不保证 SEO 效果。';metrics={...metrics,candidates};
 }else if(id==='copy.selling_points'){
  body=facts.map((f,i)=>`卖点 ${i+1}\n短文案：${f}\n说明：选购 ${b.productName} 时可核对这一项：${f}。\n依据：输入事实 [${i+1}]；来源：${b.source}`).join('\n\n')+'\n\n应用收益、适用场景和性能优势如无资料支持，暂不补写。';
 }else if(id==='copy.detail'){
  body=`01 首屏\n${b.productName}\n${facts[0]}\n画面：经核验的商品实拍，避免改变结构。\n\n02 参数一览\n${numbered}\n\n03 细节展示\n${facts.map((f,i)=>`模块 ${i+1}：${f}\n配图需求：能证明事实 [${i+1}] 的实拍或规格标注。`).join('\n')}\n\n04 选购前核对\n请对照上述参数与实际需求；尺寸、安装条件和兼容性未提供时，先咨询客服并核对供应商资料。\n\n05 售后说明\n待补：适用店铺的退换、质保和安装政策。不得直接承诺免费安装或无条件退换。\n\n设计交接清单\n商品实拍、规格图、事实依据、已确认售后政策。当前交付为文字稿。`;
 }else if(id==='copy.video'){
  const step=b.duration/5;
  const shots=[['商品全景',`这是${b.productName}，一起核对它的商品信息。`,b.productName],['第一处参数特写',facts[0],facts[0]],['第二处细节或包装',facts[1]||facts[0],facts[1]||facts[0]],['参数卡汇总',facts.slice(2).join('；')||'选购前，请对照完整参数。',facts.slice(2).join('；')||'核对完整参数'],['商品定格与咨询入口','请先确认规格是否符合需求，再咨询客服了解未列明的条件。','核对规格，再做选择']];
  body=shots.map(([shot,voice,subtitle],i)=>`${i*step}–${(i+1)*step} 秒｜${shot}\n画面：${i===1||i===2?'使用可证明对应参数的真实素材；没有素材则待补，不用虚构演示。':shot}\n口播：${voice}\n字幕：${subtitle}`).join('\n\n')+`\n\n总时长：${b.duration} 秒。拍摄前需试读调整语速；未提供安装说明，不编造安装步骤。`;
 }else{
  body=['白底商品与参数卡','细节特写与证据标注','包装与规格核对'].map((direction,i)=>`方向 ${i+1}：${direction}\n主标题：${b.productName}\n画面文字：${facts[i%facts.length]}\n构图要求：商品主体清晰，文字与实物分区；留出平台裁切安全区。\n素材需求：对应实拍和可核验参数；保留原有结构，不增添虚构配件。`).join('\n\n')+'\n\n未生成图片。尺寸、背景、文字比例以实际渠道规范为准；第三方素材须确认使用权限。';
 }
 const header=`${pack.name}草稿 · 待审核\n商品：${b.productName}\n渠道：${b.channel}\n目标受众：${b.audience}\n制作方式：${input.autoContent?'自动检索与资料提取；建议人群不是已验证画像':'基于确认事实的代码编排'}，未调用大模型。\n\n`;
 const evidence=`资料来源：${b.source}\n${input.autoContent?'自动提取的来源陈述（不等于独立核验）':'已确认的输入事实'}：\n${numbered}`;
 return {status:'succeeded',summary:pack.name+'草稿已编排，请人工审核。',missing:[],artifacts:[{title:pack.name+'草稿（待审核）',body:header+body+'\n\n'+evidence,evidence}],metrics};
}
