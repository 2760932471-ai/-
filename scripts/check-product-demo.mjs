import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {once} from 'node:events';import {mkdtemp,rm,readFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright'),offline=process.argv.includes('--offline'),base='http://127.0.0.1:3092',dir=await mkdtemp('/tmp/product-demo-');let child,browser;const errors=[];
try{
 if(!offline){child=spawn(process.execPath,['--import','./scripts/fixtures/gemini-platform.mjs','src/server.js'],{env:{...process.env,PORT:'3092',DATA_DIR:dir,CODESPACES:'true',IMAGE_SECRET_TEST:'fake-test-key',AGENT_ALLOWED_HOSTS:'generativelanguage.googleapis.com'},stdio:['ignore','pipe','pipe']});await once(child.stdout,'data');}
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
 if(offline){const html=await readFile('deliverables/ai-platform-preview.html','utf8');await page.route(base+'/**',r=>r.fulfill({contentType:'text/html',body:html}));await page.context().setOffline(true);}else{const r=await page.request.put(base+'/api/images/config',{data:{revision:0,enabled:true,provider:'gemini',endpoint:'https://generativelanguage.googleapis.com/v1beta',model:'gemini-2.5-flash-image',secretEnv:'IMAGE_SECRET_TEST'}});assert(r.ok());}
 await page.goto(base+'/#flows');await page.locator('.product-demo-image').waitFor();await page.waitForFunction(()=>document.querySelector('.product-demo-image')?.naturalWidth>0);assert.match(await page.locator('.product-demo-card').innerText(),/预先生成/);await page.screenshot({path:'/tmp/product-demo-showcase.png'});await page.locator('[data-product-demo]').click();await page.locator('.flow-panel').waitFor();
 if(!offline){await page.waitForFunction(()=>document.querySelector('.flow-panel')?.innerText.includes('待验收'));await page.locator('.goal-tabs [data-tab=artifacts]').click();await page.waitForFunction(()=>document.querySelectorAll('.image-thumbnail img').length>=2);assert.equal(await page.locator('.image-thumbnail img').count(),2);const goals=await page.request.get(base+'/api/goals').then(r=>r.json());const g=goals.find(g=>g.mode==='flow');assert(g.flow.nodes.some(n=>n.capability==='image.main'&&n.status==='succeeded'));assert(g.flow.nodes.some(n=>n.capability==='image.detail'&&n.status==='succeeded'));}
 else{await page.waitForFunction(()=>document.querySelector('.flow-panel')?.innerText.includes('图片服务未就绪'));}
 if(!offline){
  await page.locator('.goal-tabs [data-tab=discussion],.goal-tabs [data-tab=chat]').first().click();
  await page.locator('[data-product-upload]').click();
  const dialog=page.getByRole('dialog',{name:'上传商品图出图'});
  await dialog.locator('input[type=file]').setInputFiles('public/product-demo.png');
  await dialog.locator('textarea').fill('保留上传商品的外观');
  await dialog.getByRole('button',{name:'生成并发回协作'}).click();
  await dialog.waitFor({state:'detached'});
  await page.waitForFunction(()=>document.querySelector('.chat-log')?.innerText.includes('详情图 · 图片已生成'));
 }
 await page.setViewportSize({width:375,height:812});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);console.log('PASS '+(offline?'offline sample visible, backend limitation explicit':'server sample and two actual mock image deliveries')+'; mobile layout');
}finally{await browser?.close();if(child&&child.exitCode===null){child.kill();await once(child,'exit');}await rm(dir,{recursive:true,force:true});}
