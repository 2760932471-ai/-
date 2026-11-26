// Build small, self-contained Office files from completed skill results. All package
// paths and relationship targets are fixed here; input only becomes document text.
const ns='http://schemas.openxmlformats.org';
const rel=ns+'/officeDocument/2006/relationships';
const sheetNs=ns+'/spreadsheetml/2006/main';
const officeMime='application/vnd.openxmlformats-officedocument.';
const xmlHeader='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function xmlText(value){
 return String(value??'').replace(/[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu,'\ufffd')
  .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
}

// A ZIP with stored entries only. Datasheets are small and need no compression
// dependency. Header offsets follow the ZIP local/central/end record formats.
function archive(entries,mime){
 const encoder=new TextEncoder(),files=[],directory=[];
 let offset=0,directorySize=0;
 for(const [path,xml] of entries){
  const name=encoder.encode(path),body=encoder.encode(xmlHeader+xml);
  let crc=0xffffffff;
  for(const byte of body){
   crc^=byte;
   for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  crc=(~crc)>>>0;
  const local=new DataView(new ArrayBuffer(30));
  local.setUint32(0,0x04034b50,true);local.setUint16(4,20,true);
  local.setUint16(12,0x21,true); // ZIP epoch, 1980-01-01
  local.setUint32(14,crc,true);local.setUint32(18,body.length,true);local.setUint32(22,body.length,true);
  local.setUint16(26,name.length,true);
  const central=new DataView(new ArrayBuffer(46));
  central.setUint32(0,0x02014b50,true);central.setUint16(4,20,true);
  // version needed through file-name length have the same layout in both records.
  new Uint8Array(central.buffer,6,24).set(new Uint8Array(local.buffer,4,24));
  central.setUint32(42,offset,true);
  files.push(local.buffer,name,body);directory.push(central.buffer,name);
  offset+=local.byteLength+name.length+body.length;
  directorySize+=central.byteLength+name.length;
 }
 const end=new DataView(new ArrayBuffer(22));
 end.setUint32(0,0x06054b50,true);
 end.setUint16(8,entries.length,true);end.setUint16(10,entries.length,true);
 end.setUint32(12,directorySize,true);end.setUint32(16,offset,true);
 return new Blob([...files,...directory,end.buffer],{type:mime});
}

function relationships(entries){
 return '<Relationships xmlns="'+ns+'/package/2006/relationships">'+entries.map(([type,target],i)=>
  '<Relationship Id="rId'+(i+1)+'" Type="'+rel+'/'+type+'" Target="'+target+'"/>').join('')+'</Relationships>';
}

function makePackage(mainPath,parts,links=[]){
 const types='<Types xmlns="'+ns+'/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'+
  parts.map(([path,type])=>'<Override PartName="/'+path+'" ContentType="'+officeMime+type+'"/>').join('')+'</Types>';
 return [['[Content_Types].xml',types],['_rels/.rels',relationships([['officeDocument',mainPath]])],
  ...parts.map(([path,,xml])=>[path,xml]),...links];
}

function wordParagraph(text,size=22,bold=false){
 return '<w:p><w:pPr><w:spacing w:after="100"/></w:pPr><w:r><w:rPr>'+
  (bold?'<w:b/>':'')+'<w:sz w:val="'+size+'"/></w:rPr><w:t xml:space="preserve">'+xmlText(text)+'</w:t></w:r></w:p>';
}

function outlineFile(artifact){
 const parts=[wordParagraph(artifact.title,34,true),wordParagraph('来源　'+artifact.evidence,20)];
 for(const line of artifact.body.split(/\r\n?|\n/)){
  const location=/^第 \d+ 行(?: · .*|)$/.test(line);
  parts.push(wordParagraph(line,location?24:22,location));
 }
 const path='word/document.xml';
 const xml='<w:document xmlns:w="'+ns+'/wordprocessingml/2006/main"><w:body>'+parts.join('')+
  '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1200" w:bottom="1440" w:left="1200"/></w:sectPr></w:body></w:document>';
 return {filename:'文档提要.docx',blob:archive(makePackage(path,[[path,'wordprocessingml.document.main+xml',xml]]),officeMime+'wordprocessingml.document')};
}

function cell(value,address){
 if(value==null)return '';
 if(typeof value==='number'&&Number.isFinite(value))return '<c r="'+address+'"><v>'+value+'</v></c>';
 // Always inline text even for a column name starting with '='. Escape literal
 // OOXML character escapes as well, so a field like "_x000D_" stays literal.
 const text=xmlText(value).replace(/_(?=x[0-9a-fA-F]{4}_)/g,'_x005F_');
 return '<c r="'+address+'" t="inlineStr"><is><t xml:space="preserve">'+text+'</t></is></c>';
}

function tableFile(artifact,metrics){
 const rows=[[artifact.title],['来源',artifact.evidence],['数据行数',metrics.rowCount,'列数',metrics.columnCount],[],
  ['列名','有值个数','缺失个数','最小值','最大值','平均值'],
  ...metrics.columns.map(({name,present,missing,min,max,mean})=>[name,present,missing,min,max,mean])];
 const data=rows.map((row,i)=>'<row r="'+(i+1)+'">'+row.map((value,j)=>cell(value,'ABCDEF'[j]+(i+1))).join('')+'</row>').join('');
 const workbook='<workbook xmlns="'+sheetNs+'" xmlns:r="'+rel+'"><sheets><sheet name="表格概览" sheetId="1" r:id="rId1"/></sheets></workbook>';
 const sheet='<worksheet xmlns="'+sheetNs+'"><cols><col min="1" max="1" width="32" customWidth="1"/><col min="2" max="6" width="18" customWidth="1"/></cols><sheetData>'+data+'</sheetData><autoFilter ref="A5:F'+rows.length+'"/></worksheet>';
 const path='xl/workbook.xml';
 const files=makePackage(path,[[path,'spreadsheetml.sheet.main+xml',workbook],['xl/worksheets/sheet1.xml','spreadsheetml.worksheet+xml',sheet]],
  [['xl/_rels/workbook.xml.rels',relationships([['worksheet','worksheets/sheet1.xml']])]]);
 return {filename:'表格概览.xlsx',blob:archive(files,officeMime+'spreadsheetml.sheet')};
}

export function createOfficeExport(skillId,result){
 const artifact=result?.artifacts?.[0];
 if(result?.status!=='succeeded'||typeof artifact?.body!=='string')return null;
 if(skillId==='document.outline')return outlineFile(artifact);
 if(skillId==='table.profile'&&Array.isArray(result.metrics?.columns))return tableFile(artifact,result.metrics);
 return null;
}
