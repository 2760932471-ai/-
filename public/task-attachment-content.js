const officeMime='application/vnd.openxmlformats-officedocument.';
export const taskAttachmentTypes=Object.freeze({
 jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',
 pdf:'application/pdf',docx:officeMime+'wordprocessingml.document',xlsx:officeMime+'spreadsheetml.sheet',
 csv:'text/csv',txt:'text/plain',md:'text/markdown',markdown:'text/markdown'
});
export const taskAttachmentAccept=Object.keys(taskAttachmentTypes).map(ext=>'.'+ext).join(',');
const textLimit=60000;
const partLimit=6*1024*1024;
const names={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
const formatError=()=>new Error('文件内容与所选格式不符，或文件已经损坏。');
function decodeText(bytes,legacy=false){
 const bom=bytes[0]===0xff&&bytes[1]===0xfe?'utf-16le':bytes[0]===0xfe&&bytes[1]===0xff?'utf-16be':'utf-8';
 let text;
 try{text=new TextDecoder(bom,{fatal:true}).decode(bytes);}
 catch{
  if(!legacy||bom!=='utf-8')throw formatError();
  try{text=new TextDecoder('gb18030',{fatal:true}).decode(bytes);}catch{throw formatError();}
 }
 if(/[\x00-\x08\x0b\x0e-\x1f]/.test(text))throw formatError();
 return text;
}
function textResult(text){
 if(!text.trim())return {text:'',readStatus:'original_only',readNote:'未提取到可读文字。'};
 const partial=text.length>textLimit;
 return {text:text.slice(0,textLimit),readStatus:partial?'partial':'ready',readNote:partial?'已读取前 60,000 个字符。':''};
}

function entities(text){
 return text.replace(/&(amp|lt|gt|quot|apos|#\d{1,8}|#x[\da-fA-F]{1,6});/g,(all,key)=>{
  if(key[0]!=='#')return names[key];
  const n=key[1]==='x'?parseInt(key.slice(2),16):Number(key.slice(1));
  return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):'\ufffd';
 });
}
function attribute(attrs,name){
 // name is always a fixed OOXML attribute name from the reader.
 const m=new RegExp('(?:^|\\s)'+name+'\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')').exec(attrs);
 return m?entities(m[1]??m[2]):'';
}

// OOXML uses bounded ZIP members and XML elements. Read only named parts and
// never evaluate formulas, resolve a remote relationship, or expand XML entities.
function* tokens(xml){
 let i=0;
 while(i<xml.length){
  const start=xml.indexOf('<',i);
  if(start!==i)yield {value:entities(xml.slice(i,start===-1?undefined:start))};
  if(start===-1)return;
  const skip=xml.startsWith('<!--',start)?'-->':xml.startsWith('<?',start)?'?>':xml.startsWith('<![CDATA[',start)?']]>':'';
  if(skip){
   const end=xml.indexOf(skip,start+2);
   if(end<0)throw formatError();
   if(skip===']]>')yield {value:xml.slice(start+9,end)};
   i=end+skip.length;continue;
  }
  if(xml[start+1]==='!')throw formatError();
  const end=xml.indexOf('>',start+1);
  if(end<0)throw formatError();
  const raw=xml.slice(start+1,end),match=/^(\/?)([\w.:-]+)([\s\S]*)$/.exec(raw);
  if(!match)throw formatError();
  const tag=match[2].split(':').at(-1),closing=!!match[1];
  yield {tag,closing,attrs:match[3]};
  if(!closing&&raw.endsWith('/'))yield {tag,closing:true};
  i=end+1;
 }
}
function zipParts(bytes){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const u16=p=>view.getUint16(p,true),u32=p=>view.getUint32(p,true);
 let e=bytes.length-22;
 for(;e>=Math.max(0,bytes.length-65557);e--)if(u32(e)===0x06054b50&&e+22+u16(e+20)===bytes.length)break;
 if(e<0||e<bytes.length-65557||u16(e+4)||u16(e+6)||u16(e+8)!==u16(e+10))throw formatError();
 const count=u16(e+10),parts=new Map();
 let p=u32(e+16),budget=12*1024*1024;
 if(count>8192||p+u32(e+12)!==e)throw formatError();
 for(let i=0;i<count;i++){
  if(p+46>e||u32(p)!==0x02014b50)throw formatError();
  const next=p+46+u16(p+28)+u16(p+30)+u16(p+32);
  if(next>e)throw formatError();
  const path=new TextDecoder().decode(bytes.subarray(p+46,p+46+u16(p+28)));
  if(parts.has(path))throw formatError();
  parts.set(path,{local:u32(p+42),size:u32(p+24),compressed:u32(p+20),method:u16(p+10),flags:u16(p+8)});
  p=next;
 }
 if(p!==e)throw formatError();
 async function xml(path){
  const entry=parts.get(path);
  if(!entry)throw formatError();
  const {size,compressed,method,local,flags}=entry;
  if(size>partLimit||size>budget)throw new RangeError('Office 文件内容超过本次提取范围。');
  budget-=size;
  if(flags&1||local+30>e||u32(local)!==0x04034b50||u16(local+8)!==method)throw formatError();
  const start=local+30+u16(local+26)+u16(local+28);
  if(start+compressed>e)throw formatError();
  const input=bytes.subarray(start,start+compressed);
  if(method===0){if(compressed!==size)throw formatError();return decodeText(input);}
  if(method!==8)throw formatError();
  const reader=new Blob([input]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const output=new Uint8Array(size);
  let length=0;
  try{
   for(;;){
    const {done,value}=await reader.read();
    if(done)break;
    if(value.length>size-length){await reader.cancel();throw formatError();}
    output.set(value,length);length+=value.length;
   }
  }catch{throw formatError();}
  if(length!==size)throw formatError();
  return decodeText(output);
 }
 return {has:path=>parts.has(path),xml};
}
async function word(parts){
 const xml=await parts.xml('word/document.xml'),chunks=[];
 let inText=false,document=false;
 for(const {tag,closing,value} of tokens(xml)){
  if(tag==='document')document=true;
  if(tag==='t')inText=!closing;
  if(value!==undefined&&inText)chunks.push(value);
  if(tag==='p'&&closing||tag==='br'&&!closing)chunks.push('\n');
  if(tag==='tab'&&!closing)chunks.push('\t');
 }
 if(!document)throw formatError();
 return textResult(chunks.join('').trim());
}
function strings(xml){
 const items=[];
 let entry=null,inText=false,phonetic=false;
 for(const {tag,closing,value} of tokens(xml)){
  if(tag==='si'){
   if(closing)items.push(entry?.join('')||'');
   entry=closing?null:[];
  }
  if(tag==='t')inText=!closing;
  if(tag==='rPh')phonetic=!closing;
  if(entry&&inText&&!phonetic&&value!==undefined)entry.push(value);
  if(items.length>200000)throw new RangeError('共享字符串数量超出本次提取范围。');
 }
 return items;
}
const csvCell=s=>/[",\r\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;
function worksheet(xml,shared,limit){
 const rows=[];
 let rowSize=0;
 let row=null,capture='',type='',value='',col=0,lastCol=-1,width=0,size=0,partial=false,uncached=false,formula=false,inSheet=false;
 for(const node of tokens(xml)){
  const {tag,closing,attrs}=node;
  if(tag==='sheetData'){inSheet=!closing;continue;}
  if(!inSheet)continue;
  if(tag==='row'){
   if(!closing){row=[];rowSize=0;lastCol=-1;}
   else if(row?.length){
    width=Math.max(width,row.length);
    size+=rowSize+Math.max(0,row.length-1)+1;
    if(size>limit||rows.length===2001){partial=true;break;}
    rows.push(row);row=null;
   }
  }else if(tag==='c'&&row){
   if(!closing){
    const ref=attribute(attrs,'r'),letters=/^([A-Z]+)\d+$/.exec(ref)?.[1];
    col=letters?[...letters].reduce((n,ch)=>n*26+ch.charCodeAt(0)-64,0)-1:lastCol+1;
    if(col>255){partial=true;col=-1;}
    type=attribute(attrs,'t');value='';formula=false;capture='';
   }else if(col>=0){
    let raw=value;
    if(type==='s'){
     if(!/^\d+$/.test(raw)||!Object.hasOwn(shared,raw))throw formatError();
     raw=shared[Number(raw)];
    }
    if(formula&&!raw)uncached=true;
    // Cells with styling but no content do not extend the right edge.
    if(raw){
     if(raw.length>limit-size-rowSize){partial=true;break;}
     const cell=csvCell(raw);
     const nextSize=rowSize-(row[col]?.length||0)+cell.length;
     if(nextSize+Math.max(col,row.length-1)>limit-size){partial=true;break;}
     row[col]=cell;rowSize=nextSize;
    }
    lastCol=col;
   }
  }else if(tag==='f'&&!closing)formula=true;
  else if(tag==='v'||tag==='t'&&type==='inlineStr')capture=closing?'':tag;
  else if(node.value!==undefined&&capture)value+=node.value;
 }
 const lines=[];
 let length=0;
 for(const current of rows){
  current.length=width;
  const line=current.join(',');
  if(length+line.length+(lines.length?1:0)>limit){partial=true;break;}
  lines.push(line);length+=line.length+1;
 }
 return {csv:lines.join('\n'),partial,uncached};
}
async function workbook(parts){
 const xml=await parts.xml('xl/workbook.xml'),rels=await parts.xml('xl/_rels/workbook.xml.rels');
 const targets=new Map();
 let sharedPath='xl/sharedStrings.xml';
 for(const {tag,closing,attrs} of tokens(rels)){
  if(tag!=='Relationship'||closing||attribute(attrs,'TargetMode')==='External')continue;
  const target=attribute(attrs,'Target'),type=attribute(attrs,'Type');
  // Resolve package paths only. No network or filesystem calls are performed.
  const path=new URL(target,'https://package.invalid/xl/workbook.xml');
  if(path.origin!=='https://package.invalid')continue;
  const member=path.pathname.slice(1);
  if(type.endsWith('/worksheet'))targets.set(attribute(attrs,'Id'),member);
  if(type.endsWith('/sharedStrings'))sharedPath=member;
 }
 const shared=parts.has(sharedPath)?strings(await parts.xml(sharedPath)):[];
 const sheets=[],blocks=[];
 let length=0,partial=false,uncached=false,workbookTag=false;
 for(const {tag,closing,attrs} of tokens(xml)){
  if(tag==='workbook')workbookTag=true;
  if(tag!=='sheet'||closing)continue;
  const target=targets.get(attribute(attrs,'(?:[\\w.-]+:)?id'));
  if(!target)continue;
  const name=attribute(attrs,'name'),label='工作表：'+name+'\n';
  const remaining=textLimit-length-label.length-(blocks.length?2:0);
  if(remaining<=0||sheets.length===40){partial=true;break;}
  let sheet;
  try{sheet=worksheet(await parts.xml(target),shared,remaining);}
  catch(err){if(err instanceof RangeError){partial=true;break;}throw err;}
  partial||=sheet.partial;uncached||=sheet.uncached;
  if(!sheet.csv)continue;
  sheets.push({name,csv:sheet.csv});blocks.push(label+sheet.csv);
  length+=label.length+sheet.csv.length+(blocks.length>1?2:0);
 }
 if(!workbookTag)throw formatError();
 const result=textResult(blocks.join('\n\n'));
 if(partial||uncached){
  result.readStatus=sheets.length?'partial':'original_only';
  result.readNote=[partial?'仅提取了容量限制内的工作表内容。':'',uncached?'部分公式没有已保存的计算结果。':''].filter(Boolean).join('');
 }
 return {...result,sheets};
}

// Keep a CSV excerpt on a complete record boundary, including multiline cells.
function csvResult(text,name){
 const result=textResult(text);
 if(result.readStatus==='partial'){
  let quoted=false,lastEnd=0;
  for(let i=0;i<result.text.length;i++){
   const ch=result.text[i];
   if(ch==='"')quoted=!quoted;
   else if(!quoted&&(ch==='\r'||ch==='\n'))lastEnd=i+1;
  }
  result.text=result.text.slice(0,lastEnd).trimEnd();
  result.readNote='仅提取了前 60,000 个字符范围内的完整 CSV 行。';
 }
 return {...result,sheets:result.text?[{name,csv:result.text}]:[]};
}

export async function inspectTaskAttachment({name,mime,bytes},{readPdf}={}){
 const ext=typeof name==='string'&&name.includes('.')?name.split('.').at(-1).toLowerCase():'';
 if(!Object.hasOwn(taskAttachmentTypes,ext))throw Error('不支持此附件格式，请选择图片、文档或表格。');
 if(!(bytes instanceof Uint8Array)||!bytes.length)throw Error('附件为空或无法读取。');
 const type=taskAttachmentTypes[ext];
 // Some browsers label CSV as Excel and Markdown as plain text. Validate the
 // bytes below, and use the extension's canonical MIME for storage/download.
 const supplied=String(mime||'').split(';')[0].toLowerCase();
 if(supplied.startsWith('image/')&&supplied!==type&&!(supplied==='image/jpg'&&type==='image/jpeg'))throw formatError();
 if(type.startsWith('image/')){
  const head=String.fromCharCode(...bytes.subarray(0,24));
  const valid=type==='image/jpeg'?head.startsWith('\xff\xd8\xff'):type==='image/png'?
    head.startsWith('\x89PNG\r\n\x1a\n')&&head.slice(12,16)==='IHDR':
    head.startsWith('RIFF')&&head.slice(8,12)==='WEBP';
  if(!valid)throw formatError();
  return {kind:'image',mime:type,text:'',readStatus:'original_only',readNote:bytes.length>5*1024*1024?'已保存原图，当前生图参考图上限为 5 MiB。':'已保留原图，可作为图片参考。'};
 }
 const kind=['xlsx','csv'].includes(ext)?'table':'document';
 let result;
 if(ext==='pdf'){
  if(!/^%PDF-\d\.\d/.test(String.fromCharCode(...bytes.subarray(0,8))))throw formatError();
  result=readPdf?await readPdf(bytes):{text:'',readStatus:'original_only',readNote:'已保存 PDF，可下载原件；当前环境未启用 PDF 文字提取。'};
 }else if(ext==='docx'||ext==='xlsx'){
  const parts=zipParts(bytes);
  if(!parts.has('[Content_Types].xml')||!parts.has(ext==='docx'?'word/document.xml':'xl/workbook.xml'))throw formatError();
  try{result=ext==='docx'?await word(parts):await workbook(parts);}
  catch(err){
   if(!(err instanceof RangeError))throw err;
   result={text:'',readStatus:'original_only',readNote:'已保存原件，Office 内容超过本次提取范围。'};
  }
 }else{
  const text=decodeText(bytes,true);
  result=ext==='csv'?csvResult(text,name):textResult(text);
 }
 return {kind,mime:type,...result};
}
