import assert from 'node:assert/strict';
import test from 'node:test';
import {deflateRawSync} from 'node:zlib';
import {inspectTaskAttachment} from '../public/task-attachment-content.js';
import {createOfficeExport} from '../public/office-export.js';

function inspect(name,bytes,options){
 return inspectTaskAttachment({name,bytes:typeof bytes==='string'?Buffer.from(bytes):bytes},options);
}
function zip(parts){
 const locals=[],headers=[];
 let offset=0;
 for(const [path,body] of Object.entries(parts)){
  const name=Buffer.from(path),data=Buffer.from(body),encoded=deflateRawSync(data);
  const local=Buffer.alloc(30),central=Buffer.alloc(46);
  local.writeUInt32LE(0x04034b50);local.writeUInt16LE(8,8);
  local.writeUInt32LE(encoded.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(name.length,26);
  central.writeUInt32LE(0x02014b50);local.copy(central,6,4,28);central.writeUInt32LE(offset,42);
  locals.push(local,name,encoded);headers.push(central,name);offset+=local.length+name.length+encoded.length;
 }
 const directory=Buffer.concat(headers),end=Buffer.alloc(22),count=Object.keys(parts).length;
 end.writeUInt32LE(0x06054b50);end.writeUInt16LE(count,8);end.writeUInt16LE(count,10);
 end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...locals,directory,end]);
}

test('office attachments read real exported Word paragraphs without XML; unsupported and mislabeled files fail',async()=>{
 const doc=createOfficeExport('document.outline',{status:'succeeded',artifacts:[{title:'会议记录',body:'参考价 < 400 元\n下周核对',evidence:'运营组'}]});
 const result=await inspect(doc.filename,new Uint8Array(await doc.blob.arrayBuffer()));
 assert.equal(result.kind,'document');assert.equal(result.readStatus,'ready');assert.match(result.text,/参考价 < 400 元\n下周核对/);
 for(const [extension,data] of [['png','普通文本'],['pdf','伪装内容'],['xlsx',Buffer.from(await doc.blob.arrayBuffer())],['docx','PK'],['txt',Buffer.from([0,1,7])],['exe','ignored']]){
  await assert.rejects(inspect('附件.'+extension,data));
 }
});

test('Excel uses workbook relationship order, shared strings, sparse cells, inline strings and cached formula values',async()=>{
 const workbook='<workbook><sheets><sheet name="销量" r:id="r12"/><sheet name="政策 &amp; 费用" r:id="r4"/></sheets></workbook>';
 const links='<Relationships><Relationship Id="r4" Type="office/worksheet" Target="/xl/worksheets/sheet1.xml"/><Relationship Id="r12" Type="office/worksheet" Target="worksheets/sheet12.xml"/><Relationship Id="r13" Type="office/sharedStrings" Target="strings.xml"/></Relationships>';
 const sheet='<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="inlineStr"><is><t>成交价</t></is></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="C2"><f>A5+B5</f><v>24</v></c></row></sheetData></worksheet>';
 const other='<worksheet><sheetData><row><c r="A1" t="inlineStr"><is><t>费用</t></is></c></row><row><c r="A2"><f>SUM(A1)</f></c></row></sheetData></worksheet>';
 const shared='<sst><si><t>门店</t></si><si><r><t>华</t></r><r><t>东,门店</t></r><rPh><t>pinyin</t></rPh></si></sst>';
 const bytes=zip({'[Content_Types].xml':'<Types/>','xl/workbook.xml':workbook,'xl/_rels/workbook.xml.rels':links,'xl/strings.xml':shared,'xl/worksheets/sheet12.xml':sheet,'xl/worksheets/sheet1.xml':other});
 const result=await inspect('销售.XLSX',bytes);
 assert.equal(result.readStatus,'partial');assert.match(result.readNote,/公式/);assert.equal(result.kind,'table');
 assert.deepEqual(result.sheets,[{name:'销量',csv:'门店,,成交价\n"华东,门店",,24'},{name:'政策 & 费用',csv:'费用'}]);
 assert.match(result.text,/工作表：政策 & 费用/);
});

test('plain text and CSV support common text encodings and give a record-aligned partial extract',async()=>{
 const utf16=Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from('门店,数量\r\n东城,25','utf16le')]);
 assert.equal((await inspect('销售.csv',utf16)).sheets[0].csv,'门店,数量\r\n东城,25');
 const gb=Buffer.from([0xd6,0xd0,0xce,0xc4]);
 assert.equal((await inspect('说明.txt',gb)).text,'中文');
 const csv='门店,备注\n东城,正常\n西城,"分行\n'+'文'.repeat(60000)+'"';
 const result=await inspect('备注.csv',csv);
 assert.equal(result.readStatus,'partial');assert.equal(result.sheets[0].csv,'门店,备注\n东城,正常');
 const text=await inspect('说明.md','# 简报\n'+'x'.repeat(61000));
 assert.equal(text.readStatus,'partial');assert.equal(text.text.length,60000);
});

test('image and PDF originals remain accessible when text extraction is inapplicable',async()=>{
 const big=Buffer.alloc(5*1024*1024+1);
 Buffer.from([255,216,255,224]).copy(big);
 const r=await inspect('原图.jpg',big);assert.equal(r.kind,'image');assert.match(r.readNote,/5 MiB/);
 const pdf='%PDF-1.7\n%%EOF';
 const offline=await inspect('brief.pdf',pdf);assert.equal(offline.readStatus,'original_only');assert.equal(offline.text,'');
 const parsed=await inspect('brief.pdf',pdf,{readPdf:async bytes=>({text:String(bytes.length),readStatus:'ready',readNote:''})});
 assert.equal(parsed.text,String(Buffer.byteLength(pdf)));
});
