import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const dir=await mkdtemp('/tmp/kb250-ui-'),base='http://127.0.0.1:3191';
const server=spawn(process.execPath,['src/server.js'],{env:{...process.env,CODESPACES:'true',PORT:'3191',DATA_DIR:dir},stdio:['ignore','pipe','pipe']});
let browser;
try{
 await once(server.stdout,'data');
 execFileSync('ffmpeg',['-loglevel','error','-f','lavfi','-i','color=c=blue:s=160x96','-t','1','-pix_fmt','yuv420p',dir+'/clip.mp4']);
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 for(const mode of ['server','preview']){
  const page=await browser.newPage();page.setDefaultTimeout(9000);page.on('pageerror',console.error);
  if(mode==='preview')await page.route(base+'/**',r=>r.fulfill({contentType:'text/html; charset=utf-8',path:'deliverables/ai-platform-preview.html'}));
  await page.goto(base+'/#knowledge');await page.locator('.sidebar [data-view=knowledge]').click();
  for(const [path,name,caption] of [['public/product-demo.png','商品实拍','猫粮包装'],[dir+'/clip.mp4','试装视频','淋浴安装过程']]){
   await page.locator('[data-kb-import]').first().click();
   const f=page.locator('#kb-document-form');await f.locator('#kb-file').setInputFiles(path);
   await f.locator('[name=title]').fill(name);await f.locator('[name=body]').fill(caption);
   await f.locator('[name=confirmed]').check();await f.getByRole('button',{name:'保存并切片入库'}).click();
   await page.locator('#kb-document-dialog').waitFor({state:'hidden'});await page.reload();await page.locator('.sidebar [data-view=knowledge]').click();
   const search=page.locator('#kb-search');await search.locator('[name=query]').fill(caption);
   await search.getByRole('button',{name:'测试召回'}).click();await page.locator('#kb-results [data-kb-chunks]').first().click();
   const player=page.locator('.kb-media-preview');
   if(path.endsWith('.mp4')){await player.evaluate(v=>v.play());assert(await player.evaluate(v=>v.readyState>=2&&v.videoWidth>0));}
   else {await player.evaluate(i=>i.decode());assert(await player.evaluate(i=>i.naturalWidth>0));}
   await page.locator('[data-kb-close=kb-chunks-dialog]').click();
  }
  console.log('PASS '+mode+': upload -> reload -> caption search -> open original image and play MP4');await page.close();
 }
}finally{await browser?.close();server.kill();await once(server,'exit');await rm(dir,{recursive:true,force:true});}
