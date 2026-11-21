// Exercise the packaged extension with local pages routed to the two platform hosts.
// Test profile pre-grants the sites and the workbench instead of interacting with Chrome permission UI.
import assert from 'node:assert/strict';
import {mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const simulated=process.argv.includes('--simulate-extension-api');
const dir=await mkdtemp('/tmp/cloud-check-'),ext=dir+'/extension';
let ctx;
try{
 await cp('browser-connector',ext,{recursive:true});
 const manifest=JSON.parse(await readFile(ext+'/manifest.json'));
 manifest.host_permissions=[...manifest.optional_host_permissions,'http://127.0.0.1/*'];delete manifest.optional_host_permissions;
 await writeFile(ext+'/manifest.json',JSON.stringify(manifest));
 ctx=await chromium.launchPersistentContext(dir+'/profile',{executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox',...(simulated?[]:['--disable-extensions-except='+ext,'--load-extension='+ext])]});
 const sw=simulated?null:ctx.serviceWorkers()[0]||await ctx.waitForEvent('serviceworker',{timeout:10000});
 const page=await ctx.newPage(),source=await ctx.newPage(),target=await ctx.newPage();
 await page.route('http://127.0.0.1/**',r=>r.fulfill({contentType:'text/html; charset=utf-8',path:'deliverables/ai-platform-preview.html'}));
 await source.route('https://example.meituan.com/**',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:'<h1>周末双人餐</h1><span itemprop="price">98</span><p itemprop="description">限周末预约</p>'}));
 await target.route('https://example.goofish.com/**',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:'<form><input aria-label="商品标题"><textarea aria-label="商品描述"></textarea><input aria-label="销售价"><button type="submit">发布</button></form>'}));
 await source.goto('https://example.meituan.com/deal');await target.goto('https://example.goofish.com/sell');
 await target.evaluate(()=>document.addEventListener('submit',e=>{e.preventDefault();document.title='submitted';}));
 await page.goto('http://127.0.0.1/#ai-config/market');await page.getByRole('button',{name:'云电脑浏览器',exact:true}).click();
 assert.match(await page.getByText('下载 Chrome 扩展').getAttribute('href'),/^data:application\/zip/);
 await page.bringToFront();
 // Same document-bound binding used after the user grants activeTab in the extension popup.
 if(simulated){
  let listener,pair={tabId:1,doc:'document',workspace:'default'};
  const pages=new Map([[2,source],[3,target]]);
  globalThis.chrome={
   runtime:{onMessage:{addListener:fn=>{listener=fn;}}},
   storage:{session:{get:async()=>({pair}),remove:async()=>{pair=null;}}},
   tabs:{query:async({url})=>[...pages].filter(([,p])=>p.url().includes(url.includes('meituan')?'meituan.com':'goofish.com')).map(([id,p])=>({id,url:p.url()}))},
   scripting:{executeScript:async({target,func,args})=>[{result:await pages.get(target.tabId).evaluate(func,args[0])}]}
  };
  await import('../browser-connector/worker.js');
  await page.exposeFunction('simulateMessage',cmd=>new Promise(resolve=>listener(cmd,{tab:{id:1,windowId:1},documentId:'document'},resolve)));
  await page.evaluate(()=>{window.chrome.runtime={sendMessage:window.simulateMessage};});
  await page.addScriptTag({content:await readFile(ext+'/bridge.js','utf8')});
 }else await sw.evaluate(async()=>{
  const [tab]=await chrome.tabs.query({url:'http://127.0.0.1/*'});
  const [probe]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>document.querySelector('[data-cloud-workspace]').dataset.cloudWorkspace});
  await chrome.storage.session.set({pair:{tabId:tab.id,doc:probe.documentId,workspace:probe.result}});
  await chrome.scripting.executeScript({target:{tabId:tab.id},files:['bridge.js']});
 });
 await page.getByText('当前浏览器已连接',{exact:true}).waitFor();await page.locator('#cloud-source').selectOption({index:1});
 await page.getByText('读取这件商品',{exact:true}).click();
 await page.locator('#cloud-draft').waitFor();assert.equal(await page.locator('#cloud-draft [name=title]').inputValue(),'周末双人餐');
 await page.locator('#cloud-target').selectOption({index:1});await page.locator('#cloud-draft [name=price]').fill('110.50');
 await page.locator('#cloud-draft [name=confirmed]').check();
 await target.locator('textarea').fill('已有草稿');
 await page.getByRole('button',{name:'填写到闲鱼，停在发布前'}).click();
 await page.waitForFunction(()=>document.querySelector('[data-cloud-workspace] [role=status]')?.textContent.includes('已有不同内容')||document.querySelector('[data-cloud-workspace] [role=status]')?.textContent.includes('核对目标页面'));
 assert.equal(await target.locator('input').first().inputValue(),'');
 await target.locator('textarea').fill('');
 await page.getByRole('button',{name:'填写到闲鱼，停在发布前'}).click();await page.getByText(/已填入网页的标题/).waitFor();
 assert.deepEqual(await target.locator('input,textarea').evaluateAll(els=>els.map(el=>el.value)),['周末双人餐','限周末预约','110.50']);assert.notEqual(await target.title(),'submitted');
 await page.getByRole('button',{name:'断开连接'}).click();await page.getByText('等待连接',{exact:true}).waitFor();
 console.log((simulated?'SIMULATED EXTENSION API: ':'')+'PASS bound document, tab discovery, product read, existing draft protection, field fill without submit, disconnect');
}finally{await ctx?.close();await rm(dir,{recursive:true,force:true});}
