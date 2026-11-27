import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {readPdfAttachment} from '../src/task-attachment-pdf.js';

function tinyPdf(content){
 const font='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
 const parts=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 400] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',font,
  '<< /Length '+content.length+' >>\nstream\n'+content+'\nendstream'];
 let out='%PDF-1.4\n';
 const offsets=[];
 for(const [i,part] of parts.entries()){offsets.push(out.length);out+=(i+1)+' 0 obj\n'+part+'\nendobj\n';}
 const xref=out.length;
 out+='xref\n0 '+(parts.length+1)+'\n0000000000 65535 f \n'+offsets.map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('');
 return Buffer.from(out+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF');
}

test('the optional PDF adapter extracts an actual page and distinguishes pages without text',async()=>{
 const noTool=spawnSync('pdftotext',['-v']).error?.code==='ENOENT';
 const text=await readPdfAttachment(tinyPdf('BT /F1 12 Tf 50 300 Td (Quarterly revenue 312) Tj ET'));
 if(noTool){assert.equal(text.readStatus,'original_only');assert.match(text.readNote,/未安装/);return;}
 assert.equal(text.readStatus,'ready');assert.equal(text.text,'Quarterly revenue 312');
 const drawing=await readPdfAttachment(tinyPdf('10 10 20 20 re S'));
 assert.equal(drawing.readStatus,'original_only');assert.equal(drawing.text,'');assert.match(drawing.readNote,/扫描件/);
});
