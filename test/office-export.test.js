import test from 'node:test';
import assert from 'node:assert/strict';
import {createOfficeExport} from '../public/office-export.js';
import {executeGeneral} from '../src/workforce/general-skills.js';

async function readPackage(blob){
 const bytes=Buffer.from(await blob.arrayBuffer());
 const end=bytes.length-22;
 assert.equal(bytes.readUInt32LE(end),0x06054b50);
 const count=bytes.readUInt16LE(end+10);
 let entry=bytes.readUInt32LE(end+16);
 const parts=new Map();
 for(let index=0;index<count;index++){
  assert.equal(bytes.readUInt32LE(entry),0x02014b50);
  const nameLength=bytes.readUInt16LE(entry+28);
  const extraLength=bytes.readUInt16LE(entry+30),commentLength=bytes.readUInt16LE(entry+32);
  const local=bytes.readUInt32LE(entry+42);
  assert.equal(bytes.readUInt32LE(local),0x04034b50);
  const name=bytes.toString('utf8',entry+46,entry+46+nameLength);
  const start=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28);
  assert.equal(bytes.readUInt16LE(local+8),0); // Stored entries require no decompressor.
  parts.set(name,bytes.toString('utf8',start,start+bytes.readUInt32LE(local+18)));
  entry+=46+nameLength+extraLength+commentLength;
 }
 assert.equal(entry,end);
 return parts;
}

test('Word export contains the actual excerpts, line references and escaped source',async()=>{
 const out=executeGeneral('document.outline',{document:{source:'A&B',text:'# 决定\n继续试销。\n\n## 待办\n- 核对成本 < 30 的商品。'}});
 const {filename,blob}=createOfficeExport('document.outline',out);
 assert.match(filename,/\.docx$/);
 const parts=await readPackage(blob);
 assert.match(parts.get('_rels/.rels'),/Target="word\/document\.xml"/);
 assert.match(parts.get('[Content_Types].xml'),/wordprocessingml\.document\.main\+xml/);
 const document=parts.get('word/document.xml');
 for(const expected of ['A&amp;B','第 2 行 · 决定','第 5 行 · 待办','核对成本 &lt; 30 的商品。'])assert.ok(document.includes(expected));
});

test('Excel exports aggregates as numeric cells and formula-like input as text',async()=>{
 const out=executeGeneral('table.profile',{table:{source:'导出批次 1',csv:'=SUM(A1),金额\n甲,1.5\n乙,2.5\n丙,'}});
 const {filename,blob}=createOfficeExport('table.profile',out);
 assert.match(filename,/\.xlsx$/);
 const parts=await readPackage(blob);
 assert.match(parts.get('xl/_rels/workbook.xml.rels'),/Target="worksheets\/sheet1\.xml"/);
 const sheet=parts.get('xl/worksheets/sheet1.xml');
 assert.match(sheet,/<c r="A6" t="inlineStr"><is><t[^>]*>=SUM\(A1\)<\/t>/);
 assert.match(sheet,/<c r="C7"><v>1<\/v>/);
 assert.match(sheet,/<c r="F7"><v>2<\/v>/);
 assert.match(sheet,/导出批次 1/);
 assert.doesNotMatch(sheet,/<f[ >]/);
 assert.equal(createOfficeExport('table.profile',{status:'needs_input',artifacts:[]}),null);
});
