// Browser smoke test for restoring a goal when only the paired browser can fetch its reference.
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
import {spawn} from 'node:child_process';import {once} from 'node:events';import assert from 'node:assert/strict';import {mkdtemp,readFile,rm} from 'node:fs/promises';
const dir=await mkdtemp('/tmp/offer-photo-http-'),base='http://127.0.0.1:3169';
const server=spawn(process.execPath,['--import','./scripts/fixtures/gemini-platform.mjs','--import','./scripts/fixtures/browser-offer-photo.mjs','src/server.js'],{env:{...process.env,PORT:'3169',DATA_DIR:dir,CODESPACES:'true',IMAGE_SECRET_TEST:'fixture-key',AGENT_ALLOWED_HOSTS:'generativelanguage.googleapis.com'},stdio:['ignore','pipe','pipe']});
let browser;
try{
 await once(server.stdout,'data');browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 const page=await browser.newPage(),api=page.request;
 assert((await api.put(base+'/api/images/config',{data:{revision:0,enabled:true,provider:'gemini',endpoint:'https://generativelanguage.googleapis.com/v1beta',model:'gemini-2.5-flash-image',secretEnv:'IMAGE_SECRET_TEST'}})).ok());
 const g=await api.post(base+'/api/goals',{data:{requestId:crypto.randomUUID(),executionMode:'flow',text:'在1688上找墨镜，做淘宝主图'}}).then(r=>r.json());
 assert(g.id);const png=(await readFile('public/product-demo.png')).toString('base64');
 let downloads=0;
 await page.exposeFunction('extension',async msg=>{
  if(msg.action!=='offerDetail'||!msg.download)return {};
  assert.equal(msg.sku,'123');downloads++;
  return {value:{sku:'123',facts:[],photo:'https://cbu01.alicdn.com/img/ibank/123.png',...(downloads>1?{base64:png}:{reason:'图片还在加载中'})}};
 });
 await page.addInitScript(id=>{sessionStorage.setItem('selectedGoal',id);window.chrome.runtime={sendMessage:(extension,msg,cb)=>window.extension(msg).then(cb)};},g.id);
 await page.goto(base);
 await page.waitForFunction(()=>document.querySelector('.chat-log')?.textContent.includes('图片交付'),undefined,{timeout:90000});
 const done=(await (await api.get(base+'/api/goals')).json()).find(v=>v.id===g.id);
 assert.equal(done.stage,'review');assert.equal(done.version,1);assert.equal(done.artifacts.filter(a=>a.imageJobId).length,1);
 assert(downloads>=2);console.log('PASS automatic browser retry -> offer-photo HTTP upload -> saved supplier pixels in provider request -> same goal review');
}finally{await browser?.close();if(server.exitCode===null){server.kill();await once(server,'exit');}await rm(dir,{recursive:true,force:true});}
