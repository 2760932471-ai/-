import {readBusinessTable} from '../../public/business-csv.js';

export const generalDefinitions=[
 {id:'table.profile',aliases:['CSV 概览','CSV 统计','表格分析','表格体检'],name:'表格概览',description:'统计 CSV 的行列数、逐列缺失和数值分布，保留原始列名和来源。',roleIds:['analysis','coordination'],requires:['table'],version:1},
 {id:'document.outline',aliases:['文档摘要','提炼文档要点','提取文档大纲'],name:'文档提要',description:'从纯文本或 Markdown 摘取段落要点、结论和待办，标出原文行号。',roleIds:['coordination','analysis','research'],requires:['document'],version:1}
];

export function generalSample(id){
 if(id==='table.profile')return {table:{source:'示例周报',csv:'门店,订单数,退款数\n城东,32,1\n城南,28,\n城西,24,2'}};
 return {document:{source:'示例上新会议纪要',text:'# 上新复盘\n本次试销覆盖三家门店。\n\n## 决定\n延长试销一周，继续记录到店咨询。\n\n## 待办\n- 小李周五汇总退款原因。'}};
}

export function generalInput(id,text,source){
 if(id==='table.profile')return {table:{csv:text,source}};
 if(id==='document.outline')return {document:{text,source}};
 return null;
}

const inputLimit=60000;
const numeric=/^[+-]?(?:(?:0|[1-9]\d*)(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const identifier=/(?:编号|编码|代码|电话|手机|邮编|账号|单号|证件)|(?:^|[\s_-])(?:id|sku|zip|phone|code)(?:$|[\s_-])|(?:客户|商品|订单)(?:id|sku)$/i;
const numberText=new Intl.NumberFormat('zh-CN',{maximumSignificantDigits:12,useGrouping:false});

function columnStats(name,values){
 const present=values.filter(Boolean),column={name,missing:values.length-present.length,present:present.length};
 if(!present.length||identifier.test(name)||/(?:Id|ID|Code|SKU)$/.test(name))return column;
 if(!present.every(value=>numeric.test(value)))return column;
 const numbers=present.map(Number);
 if(!numbers.every(n=>Number.isFinite(n)&&Math.abs(n)<=Number.MAX_SAFE_INTEGER))return column;
 column.min=Math.min(...numbers);column.max=Math.max(...numbers);
 column.mean=numbers.reduce((sum,n)=>sum+n,0)/numbers.length;
 return column;
}
function profileTable(csv){
 const {header,rows}=readBusinessTable(csv,{maxChars:inputLimit,maxRows:2000,keepEmptyRecords:true});
 if(header.some(label=>!label))throw Error('请为每一列填写列名。');
 const columns=header.map((name,i)=>columnStats(name,rows.map(row=>row[i])));
 const body=[`${rows.length} 行数据，${header.length} 列。`];
 for(const column of columns){
  let line=`${column.name} · ${column.present} 个有值，${column.missing} 个空缺`;
  if(column.mean!==undefined)line+=` · 最小 ${numberText.format(column.min)}，最大 ${numberText.format(column.max)}，平均 ${numberText.format(column.mean)}`;
  body.push(line);
 }
 return {body:body.join('\n'),metrics:{rowCount:rows.length,columnCount:header.length,columns}};
}

function outlineDocument(text){
 const lines=text.replace(/^\uFEFF/,'').split(/\r\n|\r|\n/);
 const candidates=[];
 let section='',paragraphStart=true,fence='';
 for(const [index,raw] of lines.entries()){
  const line=raw.trim();
  const marker=line.match(/^(`{3,}|~{3,})/)?.[1];
  if(marker){if(!fence)fence=marker;else if(marker.startsWith(fence))fence='';continue;}
  if(fence)continue;
  if(!line){paragraphStart=true;continue;}
  const heading=line.match(/^#{1,6}\s+(.+)/);
  if(heading){section=heading[1].slice(0,160);paragraphStart=true;continue;}
  const item=line.replace(/^(?:[-*+]\s+|\d+[.)、]\s*)/,'');
  const priority=/^(?:结论|决定|决议|待办|行动项|下一步|负责人|截止日期|风险|建议)(?:[：:\s]|$)/.test(item)||/^(?:结论|决定|待办|行动项|决议)$/.test(section);
  if(paragraphStart||item!==line||priority){
   const sentence=item.match(/^.*?[。！？!?](?:[”」])?(?:\s|$|(?=[^\x00-\x7f]))|^.*?\.(?=\s|$)/u)?.[0]?.trim()||item;
   const excerpt=sentence.length>180?sentence.slice(0,180)+'…':sentence;
   candidates.push({line:index+1,section,excerpt,priority});
  }
  paragraphStart=/[。！？.!?][”」"]?$/.test(line);
 }
 // Reserve space across sections; an early list must not consume the whole outline.
 const ordered=candidates.toSorted((a,b)=>Number(b.priority)-Number(a.priority));
 const sections=new Set();
 const first=ordered.filter(item=>{if(sections.has(item.section))return false;sections.add(item.section);return true;});
 const chosen=[...new Set([...first,...ordered])].slice(0,8).sort((a,b)=>a.line-b.line);
 if(!chosen.length)throw Error('请提供包含正文段落的文档，当前只读到了空白、标题或代码块。');
 const body=chosen.map(item=>`第 ${item.line} 行${item.section?' · '+item.section:''}\n${item.excerpt}`).join('\n\n');
 return {body,metrics:{lineCount:lines.length,excerptCount:chosen.length,lines:chosen.map(item=>item.line)}};
}

export function executeGeneral(id,input){
 const table=id==='table.profile',material=table?input?.table:input?.document;
 if(Array.isArray(material?.files)){
  if(!material.files.length||material.files.length>200||material.files.some(file=>!file||Array.isArray(file.files)))
   return {status:'needs_input',summary:'资料列表格式无效。',missing:['请提供一组文档或表格。'],artifacts:[],metrics:{}};
  const results=material.files.map(file=>executeGeneral(id,{[table?'table':'document']:file}));
  const missing=results.flatMap(r=>r.missing);
  const artifacts=results.flatMap(r=>r.artifacts.map(a=>({...a,title:a.title+' · '+a.evidence})));
  const summary='已完成 '+artifacts.length+'/'+results.length+' 项资料的'+(table?'概览':'提要');
  return {status:missing.length?'needs_input':'succeeded',summary:missing.length?summary+'。'+missing.join('；'):summary,
   missing,artifacts,metrics:{fileCount:results.length,completed:artifacts.length}};
 }
 const value=table?material?.csv:material?.text;
 const title=table?'表格概览':'文档提要';
 const question=table?'请粘贴带列名的 CSV，或在任务资料中补充表格。':'请粘贴要整理的文档正文，或在任务资料中补充原文。';
 try{
  if(typeof value!=='string'||!value.trim())throw Error(material?.note||question);
  if(value.length>inputLimit)throw Error('单次最多处理 60000 字符，请缩短资料后重试。');
  if(material.source!=null&&(typeof material.source!=='string'||material.source.length>160))throw Error('来源请填写 160 字符以内的名称。');
  const {body,metrics}=table?profileTable(value):outlineDocument(value);
  const evidence=material.source?.trim()||'本次提供的'+(table?' CSV':'文档');
  const artifact={title,body:material.note?body+'\n\n读取范围：'+String(material.note).slice(0,350):body,evidence,skillId:id};
  if(table)artifact.tableMetrics=metrics;
  return {status:'succeeded',summary:title,artifacts:[artifact],metrics,missing:[]};
 }catch(error){
  const summary=(material?.source?'「'+material.source+'」':'')+(error.message===question?question:error.message+' '+question);
  return {status:'needs_input',summary,question,missing:[summary],artifacts:[],metrics:{}};
 }
}
