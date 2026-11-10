import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const offline=process.argv.includes('--offline'),base=process.env.UI_TEST_URL||'http://127.0.0.1:3046';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const expand=async()=>{const el=page.locator('.collaboration-status');await el.waitFor();if(!await el.evaluate(e=>e.open))await el.locator('summary').first().click();};
try{
 if(offline){const html=await readFile('deliverables/ai-platform-preview.html','utf8');await page.route(base+'/preview',r=>r.fulfill({contentType:'text/html',body:html}));await page.context().setOffline(true);await page.goto(base+'/preview');}else await page.goto(base);
 await page.locator('.sidebar-create').click();await page.locator('#goal').fill('寻找市面上性价比高的淋浴头');await page.locator('#submit-task').click();await page.locator('#create-step-two').waitFor();assert.equal(await page.locator('#create-sku').inputValue(),'待比较候选');assert.equal(await page.locator('#goal-kind').inputValue(),'analysis');assert.equal(await page.locator('#team-selection').inputValue(),'auto');
 await page.locator('#submit-task').click();await page.locator('#task-dialog').waitFor({state:'hidden'});await expand();await page.locator('.collaboration-card').waitFor();assert.match(await page.locator('.chat-log').innerText(),/网络搜索需先连接/);assert.match(await page.locator('.collaboration-card').innerText(),/先查找已有来源/);
 await page.screenshot({path:'deliverables/collaboration-missing-v011.png'});
 await page.locator('.collaboration-card [data-tab=facts]').click();const f=page.locator('#skill-data-form');await f.waitFor();
 for(let i=0;i<2;i++){for(const [key,value]of Object.entries({sku:'SHOWER-'+(i+1),material:'测试材质',connector:'G1/2',price:String(40+i*10),source:'浏览器验收用虚构报价表'}))await f.locator(`[name="c${i}.${key}"]`).fill(value);for(const key of ['demand','competition','profit','supply','risk'])await f.locator(`[name="c${i}.score.${key}"]`).fill(String(80-i*10));}
 await f.locator('[type=submit]').click();await page.locator('.goal-tabs [data-tab=discussion]').click();await page.locator('.collaboration-card [data-action=plan]').click();await page.locator('.collaboration-card').filter({hasText:'本轮成果已交付'}).waitFor({timeout:25000});
 assert.match(await page.locator('.chat-log').innerText(),/已接收 [1-9] 份前序成果/);const summary=page.locator('.chat-log [data-preview]').filter({hasText:'任务交付摘要'});await summary.click();assert.match(await page.locator('#artifact-body').innerText(),/SHOWER-1/);assert.match(await page.locator('#artifact-body').innerText(),/候选商品加权评分/);await page.locator('#close-artifact').click();
 await page.locator('.chat-log').evaluate(el=>el.scrollTop=el.scrollHeight);await page.screenshot({path:'deliverables/collaboration-delivery-v011.png'});await page.reload();await page.locator('.goal-item').filter({hasText:'寻找市面上性价比高的淋浴头'}).first().click();await expand();await page.locator('.collaboration-card').filter({hasText:'本轮成果已交付'}).waitFor();
 for(const width of [390,768]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}await page.screenshot({path:'deliverables/collaboration-mobile-v011.png'});assert.deepEqual(errors,[]);console.log('Collaboration '+(offline?'offline':'server')+' passed: natural goal → team → missing inputs → actual handoff → summary → persistence → responsive.');
}finally{await browser.close();}
