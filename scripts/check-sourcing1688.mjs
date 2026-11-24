import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {readOfferCards} from '../public/offer-cards.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
let server,dir;const live=process.argv.includes('--server');
try{
 if(live){dir=await mkdtemp('/tmp/pick-browser-');server=spawn(process.execPath,['src/server.js'],{env:{...process.env,PORT:'3095',DATA_DIR:dir,CODESPACES:'true'},stdio:['ignore','pipe','pipe']});await once(server.stdout,'data');}
 const ctx=await browser.newContext(),base='http://127.0.0.1:3095';
 const html=await readFile('deliverables/ai-platform-preview.html','utf8');
 const auto=process.argv.includes('--auto');
 const cards='<main>'+[31,42].map((p,i)=>'<article><a href="https://detail.1688.com/offer/'+(1200+i)+'.html"><h3>露营灯 '+i+'</h3><span>¥'+p+'</span><small>2 件起批 回购率 '+(40-i*4)+'%</small></a></article>').join('')+'</main>';
 if(!live)await ctx.route(base+'/**',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:html}));await ctx.route('https://s.1688.com/**',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:auto?cards.replace(/<article>(?:(?!<article>)[\s\S])*?露营灯 1[\s\S]*?<\/article>/,'')+'<div style="height:3500px"></div>':cards}));
 const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/#ai-config/sources');
 await page.locator('[data-material-new]').first().click();const form=page.locator('#material-form');await form.locator('[name=url]').fill('1688');await form.getByRole('button',{name:'保存资料'}).click();
 assert.equal(await form.locator('[name=title]').getAttribute('aria-invalid'),'true');assert.equal(await form.locator('[name=url]').getAttribute('aria-invalid'),'true');
 await form.locator('[name=title]').fill('露营灯报价');assert.equal(await form.locator('[name=title]').getAttribute('aria-invalid'),null);
 await form.getByRole('button',{name:'关闭资料登记'}).click();await page.locator('.sidebar-create').click();await page.locator('#goal').fill('在1688上选品');await page.locator('#submit-task').click();assert.match(await page.locator('#form-error').textContent(),/品类/);
 await page.locator('#goal').fill('在1688上找高性价比的露营灯，预计售价 89 元，单件其他成本 12 元');
 const next=ctx.waitForEvent('page');await page.locator('#submit-task').click();const search=await next;await search.waitForURL('https://s.1688.com/**');
 assert.equal(new URL(search.url()).searchParams.get('keywords'),'露营灯');const rows=await search.evaluate(readOfferCards);assert.equal(rows.length,auto?1:2);
 await page.bringToFront();await page.locator('.goal-tabs [data-tab=tasks]').click();const paste=page.locator('[data-pick-paste]');await page.locator('.pick-import').waitFor();
 const step=page.locator('[data-flow-node=pick1688]');await step.locator('summary').click();await step.locator('[data-run]').click();
 await page.getByRole('heading',{name:'筛选 1688 商品报价 · 等待商品报价'}).waitFor();
 assert.match(await page.locator('#run-diagnosis').innerText(),/已保存 0\/2 件/);
 assert(!((await page.locator('#run-meta').innerText()).includes('undefined')));assert.equal(await page.locator('#run-data').evaluate(d=>d.open),false);
 await page.getByRole('button',{name:'查看自动采集进度'}).click();assert(await page.locator('.pick-import').evaluate(f=>f===document.activeElement));
 if(auto){
  // Real collector and DOM; only Chrome's extension transport is simulated.
  const delayed=cards.match(/<article>[\s\S]*?<\/article>/g)[1];
  await search.evaluate(card=>addEventListener('scroll',()=>document.querySelector('main').insertAdjacentHTML('beforeend',card),{once:true}),delayed);
  const tab={id:22,windowId:2,url:search.url()},cache={},listeners={};
  globalThis.chrome={
   tabs:{query:async()=>[tab],onUpdated:{addListener:f=>listeners.updated=f}},
   runtime:{onMessage:{addListener(){}},onMessageExternal:{addListener:f=>listeners.external=f}},
   scripting:{executeScript:async({func,args,target})=>{
    assert.equal(target.tabId,tab.id);return [{documentId:'offer-page',result:await search.evaluate(func,args?.[0])}];
   }},
   storage:{session:{get:async k=>k===null?structuredClone(cache):{[k]:structuredClone(cache[k])},set:async values=>Object.assign(cache,structuredClone(values))}}
  };
  await import('../browser-connector/worker.js');
  // Verify that the connector collects before any message from the workbench.
  listeners.updated(tab.id,{status:'complete'},tab);
  await search.waitForFunction(()=>document.querySelectorAll('article').length===2);
  await page.exposeFunction('extensionRead',cmd=>new Promise(resolve=>listeners.external(cmd,{url:base,tab:{windowId:2}},resolve)));
  await page.evaluate(()=>{window.chrome.runtime={sendMessage:(id,cmd,cb)=>window.extensionRead(cmd).then(cb)};});
 }else{
  await page.getByText('手动补充报价（可选）',{exact:true}).click();
  for(const [i,card] of (cards.match(/<article>[\s\S]*?<\/article>/g)||[]).entries()){
   await paste.evaluate((el,html)=>{const data=new DataTransfer();data.setData('text/html',html);el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));},card);
   if(i===0)await page.getByText('已保存 1/2 件',{exact:true}).waitFor();
  }
 }
 await page.locator('.pick-results article').first().waitFor({timeout:20000});assert.match(await page.locator('.pick-results').innerText(),/估算单件收益 ¥46.00/);
 assert.equal(await page.locator('.pick-results a').count(),2);
 await page.getByText('按我的售价试算收益',{exact:true}).click();const calculator=page.locator('[data-pick-estimate]');await calculator.locator('[name=retail]').fill('100');await calculator.getByRole('button').click();assert.match(await page.locator('.pick-results').innerText(),/估算单件收益 ¥57.00/);
 await page.locator('.goal-tabs [data-tab=discussion]').click();await page.locator('.chat-message.coordinator').filter({hasText:'我推荐「露营灯 0」'}).waitFor();
 await page.locator('.goal-tabs [data-tab=artifacts]').click();await page.locator('.delivery-report').waitFor();
 assert.equal(await page.locator('.delivery-report a').getAttribute('href'),'https://detail.1688.com/offer/1200.html');
 assert.deepEqual(errors,[]);
 console.log('PASS inline validation, category clarification, automatic category search tab, two sourced offers and unit estimates ('+(process.argv.includes('--auto')?'simulated extension transport':'manual paste')+')');
}finally{await browser.close();if(server&&server.exitCode===null){server.kill();await once(server,'exit');}if(dir)await rm(dir,{recursive:true,force:true});}
