import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createOfficeExport} from '../public/office-export.js';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const offline=process.argv.includes('--offline');
const directory=await mkdtemp(join(tmpdir(),'task-attachments-ui-'));
const word=createOfficeExport('document.outline',{status:'succeeded',artifacts:[{
 title:'门店会议纪要',evidence:'东湖门店周会',body:'决定：周五起调整夜间配送路线。'
}]});
const documents=[
 {name:'货架照片.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVQIHWP4zwAAAgEBAMbRBrsAAAAASUVORK5CYII=','base64')},
 {name:'周会记录.docx',mimeType:word.blob.type,buffer:Buffer.from(await word.blob.arrayBuffer())},
 {name:'配送统计.csv',mimeType:'text/csv',buffer:Buffer.from('门店,配送单数\n东湖,13\n河西,27')}
];
const excluded={name:'移除的草稿.txt',mimeType:'text/plain',buffer:Buffer.from('这份文件只用于验证移除。')};

let server,browser;
try{
 let base='http://127.0.0.1:3163';
 if(!offline){
  server=spawn(process.execPath,['src/server.js'],{env:{...process.env,DATA_DIR:directory,CODESPACES:'true',PORT:'0'},stdio:['ignore','pipe','inherit']});
  const [banner]=await once(server.stdout,'data');
  const port=banner.toString().match(/port (\d+)/);
  assert.ok(port,'测试服务未报告实际端口');
  base='http://127.0.0.1:'+port[1];
 }
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:960},acceptDownloads:true});
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.setDefaultTimeout(12000);
 if(offline){
  const html=await readFile('deliverables/ai-platform-preview.html','utf8');
  await page.route(base+'/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:html}));
  await page.context().setOffline(true);
 }
 await page.goto(base+'/#overview');
 await page.locator('#main [data-new]:visible').first().click();
 const dialog=page.locator('#task-dialog'),input=dialog.locator('input[data-task-files]');
 assert.equal(await input.getAttribute('multiple'),'');
 await dialog.locator('#goal').fill('整理附件的文档摘要，统计附件的表格。');
 await input.setInputFiles([...documents,excluded]);
 const remove=name=>dialog.getByRole('button',{name:'移除 '+name,exact:true});
 await remove(excluded.name).click();
 assert.equal(await remove(excluded.name).count(),0);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'移动端附件超出对话框');
 await page.setViewportSize({width:1440,height:960});

 if(!offline){
  await page.route('**/api/goals',route=>{
   if(route.request().method()!=='POST')return route.continue();
   return route.fulfill({status:503,json:{error:'测试创建暂时失败'}});
  });
  await dialog.locator('#submit-task').click();
  await dialog.locator('#form-error').filter({hasText:'测试创建暂时失败'}).waitFor();
  assert.equal(await dialog.locator('[data-remove-task-file]').count(),3);
  await page.unroute('**/api/goals');
 }
 await dialog.locator('#submit-task').click();
 await dialog.waitFor({state:'hidden'});
 const facts=page.locator('#task-tab-facts');
 await facts.click();
 await page.reload();
 for(const file of documents){
  const downloadFile=page.getByRole('button',{name:'下载 '+file.name,exact:true});
  const [download]=await Promise.all([page.waitForEvent('download'),downloadFile.click()]);
  assert.equal(download.suggestedFilename(),file.name);
  assert.deepEqual(await readFile(await download.path()),file.buffer);
 }
 assert.equal(await page.locator('[data-download-task-file]').count(),3);
 await page.locator('#task-tab-artifacts').click();
 for(const [title,filename,content] of [
  ['文档提要','周会记录.docx',/周五起调整夜间配送路线/],
  ['表格概览','配送统计.csv',/最小 13，最大 27，平均 20/]
 ]){
  const card=page.locator('.artifact-card').filter({has:page.getByRole('heading',{name:title,exact:true})});
  await card.locator('[data-preview]').click({timeout:30000});
  assert.match(await page.locator('#artifact-body').innerText(),content);
  assert.ok((await page.locator('#artifact-evidence').innerText()).includes(filename));
  await page.locator('#close-artifact').click();
 }
 assert.deepEqual(errors,[]);
 console.log('PASS '+(offline?'offline':'server')+' create with mixed attachments, remove, mobile layout, original downloads after reload, document and table results');
}finally{
 await browser?.close();
 if(server&&server.exitCode===null){server.kill();await once(server,'exit');}
 await rm(directory,{recursive:true,force:true});
}
