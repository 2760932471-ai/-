import './environment.js';
import {pushOne,destination} from './stock-push.js';
import {accessPolicy} from './access-policy.js';
import {createWorkspaceManager} from './workspaces.js';
import {chunkText} from './knowledge-retrieval.js';
import { previewGoal } from './agents/builtins.js';
import { createPlatform } from './platform.js';
import { createGoal, goalAction, tickGoal } from './goals.js';
import http from 'node:http';
import { createRoom, sendMessage, tickRoom } from './chat.js';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { agents, createTask, tick, decide, planGoal } from './engine.js';

const access = accessPolicy();
const root = fileURLToPath(new URL('../', import.meta.url));
const dataDir = process.env.DATA_DIR || path.join(root, '.data');
await mkdir(dataDir, { recursive: true });
const auth=access.authenticationRequired?await (await import('./accounts.js')).accounts(dataDir):null;
const storeFile = path.join(dataDir, 'tasks.json');
let tasks = [];
try { tasks = JSON.parse(await readFile(storeFile, 'utf8')); if (!Array.isArray(tasks)) throw new Error('任务存储格式错误'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
let saving = Promise.resolve();
function save() {
  const snapshot = JSON.stringify(tasks, null, 2);
  saving = saving.then(async () => { await writeFile(storeFile + '.tmp', snapshot); await rename(storeFile + '.tmp', storeFile); });
  return saving;
}
const roomsFile=path.join(dataDir,'rooms.json');
let rooms=[];
try { rooms=JSON.parse(await readFile(roomsFile,'utf8')); if(!Array.isArray(rooms))throw new Error('群存储格式错误'); } catch(error){if(error.code!=='ENOENT')throw error;}
let roomSaving=Promise.resolve();
function saveRooms(){const snapshot=JSON.stringify(rooms,null,2);roomSaving=roomSaving.then(async()=>{await writeFile(roomsFile+'.tmp',snapshot);await rename(roomsFile+'.tmp',roomsFile);});return roomSaving;}
let voucherDB;
const vouchers=()=>(voucherDB??=import('./vouchers.js').then(m=>m.openVouchers(path.join(dataDir,'vouchers.sqlite'))));
const workspaces=await createWorkspaceManager(dataDir);
function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); }
async function body(req, maxBytes) {
  const limit=maxBytes ?? (/^\/api\/(knowledge|goals|skills|external-skills)(\/|$)/.test(req.url)?512000:64000);
  const chunks=[]; let length=0; for await(const chunk of req){length+=chunk.length;if(length>limit)throw Object.assign(new Error('请求内容过长'),{status:413});chunks.push(chunk);}
  const raw=Buffer.concat(chunks).toString('utf8');
  try { return JSON.parse(raw); } catch { throw new Error('请求 JSON 无效'); }
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if(url.pathname.startsWith('/api/')){
      if(access.mode==='local'&&(!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(req.headers.host||'')||req.headers['x-forwarded-host']||req.headers['x-forwarded-proto']))return json(res,403,{error:'本机模式仅供本机使用；远程部署请启用账号登录'});
      if(req.method!=='GET'&&req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return json(res,403,{error:'不允许跨站修改工作空间'});
      const secure=!!req.socket.encrypted||(access.trustHttpsProxy&&req.headers['x-forwarded-proto']==='https');
      if(url.pathname==='/api/health')return json(res,200,{ok:true,mode:'platform',storeAdapter:'configured-official-adapters',goalStoreAdapter:'simulation',authenticationRequired:!!auth,accessMode:access.mode,secureTransport:secure,accountReady:auth?.ready()??false,authenticated:auth?secure&&auth.accepts(req.headers.cookie):true});
      if(auth&&!secure)return json(res,403,{error:'请通过 HTTPS 打开工作台，并检查 HTTPS 反向代理配置'});
      if(auth&&url.pathname==='/api/auth/login'&&req.method==='POST'){
        if(!req.headers['content-type']?.startsWith('application/json'))return json(res,415,{error:'请使用 JSON 登录'});
        const session=await auth.login(await body(req,8192));res.setHeader('Set-Cookie',session);return json(res,200,{ok:true});
      }
      if(auth&&!auth.accepts(req.headers.cookie))return json(res,401,{error:'请登录工作台'});
      if(auth&&url.pathname==='/api/auth/logout'&&req.method==='POST'){
        res.setHeader('Set-Cookie',auth.logout(req.headers.cookie));return json(res,200,{ok:true});
      }
    }
    if(url.pathname==='/api/workspaces'&&req.method==='GET')return json(res,200,workspaces.list());
    if(url.pathname==='/api/workspaces'&&req.method==='POST')return json(res,201,await workspaces.save(null,await body(req)));
    const workspaceMatch=url.pathname.match(/^\/api\/workspaces\/([^/]+)$/);if(workspaceMatch&&req.method==='PUT')return json(res,200,await workspaces.save(workspaceMatch[1],await body(req)));
    const workspaceId=req.headers['x-workspace-id']||'default';
    const platform=url.pathname.startsWith('/api/')?await workspaces.get(workspaceId):null;
    if(workspaceId!=='default'&&/^\/api\/(rooms|tasks|plan)(\/|$)/.test(url.pathname))return json(res,404,{error:'旧版演示接口仅属于默认工作空间'});
    const voucherRoute=url.pathname.match(/^\/api\/vouchers(?:\/(add|manual|original|confirm|deliver|reconcile|returns|refund))?$/);
    if(voucherRoute){
      const db=await vouchers();
      const op=voucherRoute[1];
      if(req.method==='GET'&&!op)return json(res,200,db.view(workspaceId));
      if(req.method==='POST'&&op){
        const input=await body(req,['add','refund'].includes(op)?2850000:64000);
        return json(res,200,await db[op](workspaceId,input,()=>platform.integrations.view().stores.find(s=>s.id===input.storeId)));
      }
      return json(res,405,{error:'请求方法无效'});
    }
    if(url.pathname==='/api/stock-notices'&&req.method==='GET'){
     let channel;try{channel=destination(workspaceId)?.channel||'';}catch{channel='配置无效';}
     const notices=platform.integrations.market.listNotices();
     const db=notices.length?await vouchers():null;
     return json(res,200,{channel,items:notices.map(n=>({...n,available:db.available(workspaceId,n.shopId,n.listingId)}))});
    }
    const marketOp=url.pathname.match(/^\/api\/integrations\/market\/(search|prepare|publish|confirmBrowser|readNotice)$/);
    if(marketOp&&req.method==='POST')return json(res,200,await platform.integrations.market[marketOp[1]](await body(req)));
    if(url.pathname==='/api/flows'&&req.method==='GET')return json(res,200,platform.flows.view());
    if(url.pathname==='/api/flows/settings'&&req.method==='PUT')return json(res,200,await platform.flows.saveSettings(await body(req)));
    const flowTemplateMatch=url.pathname.match(/^\/api\/flows\/goals\/([^/]+)\/template$/);if(flowTemplateMatch&&req.method==='POST')return json(res,200,await platform.flows.saveTemplate(flowTemplateMatch[1],await body(req)));
    if(url.pathname==='/api/images'&&req.method==='GET')return json(res,200,platform.images.view());
    if(url.pathname==='/api/images/config'&&req.method==='PUT')return json(res,200,await platform.images.save(await body(req)));
    if(url.pathname==='/api/images/test'&&req.method==='POST')return json(res,200,await platform.images.test());
    if(url.pathname==='/api/images/upload'&&req.method==='POST')return json(res,202,await platform.images.fromUpload(await body(req,7020000)));
    if(url.pathname==='/api/images/jobs'&&req.method==='POST')return json(res,202,await platform.images.create(await body(req)));
    const imageMatch=url.pathname.match(/^\/api\/images\/jobs\/([a-zA-Z0-9_-]+)\/image$/);if(imageMatch&&req.method==='GET')return json(res,200,await platform.images.image(imageMatch[1]));
    if(url.pathname==='/api/integrations'&&req.method==='GET')return json(res,200,platform.integrations.view());
    if(url.pathname==='/api/integrations/search'&&req.method==='PUT')return json(res,200,await platform.integrations.saveSearch(await body(req)));
    const searchMatch=url.pathname.match(/^\/api\/integrations\/search\/(test|query)$/);if(searchMatch&&req.method==='POST')return json(res,200,await platform.integrations[searchMatch[1]==='test'?'testSearch':'query'](await body(req)));
    const productMatch=url.pathname.match(/^\/api\/integrations\/stores\/([^/]+)\/(products|operations)(?:\/([^/]+)\/(confirm|verify|resolve))?$/);
    if(productMatch){const [,shop,type,id,op]=productMatch;
      if(type==='operations'&&!id&&req.method==='GET')return json(res,200,platform.storeOperations.history(shop));
      if(req.method==='POST')return json(res,200,await (type==='products'?platform.storeOperations.list(shop,await body(req)):id?platform.storeOperations[op](shop,id,await body(req)):platform.storeOperations.prepare(shop,await body(req))));
    }
    const shopMatch=url.pathname.match(/^\/api\/integrations\/stores(?:\/([^/]+))?(?:\/(test))?$/);if(shopMatch){const [,id,op]=shopMatch;if(op==='test'&&req.method==='POST')return json(res,200,await platform.integrations.testStore(id));if(!op&&((id&&req.method==='PUT')||(!id&&req.method==='POST')))return json(res,200,await platform.integrations.saveStore(id,await body(req)));}
    if(url.pathname==='/api/knowledge'&&req.method==='GET')return json(res,200,platform.knowledge.view());
    if(url.pathname==='/api/knowledge/search'&&req.method==='POST')return json(res,200,await platform.knowledge.search(await body(req)));
    if(url.pathname==='/api/knowledge/preview'&&req.method==='POST'){const input=await body(req);return json(res,200,chunkText(input.body,{size:Number(input.size),overlap:Number(input.overlap)}));}
    const kbMatch=url.pathname.match(/^\/api\/knowledge\/(bases|documents)(?:\/([^/]+))?(?:\/(index|toggle|media))?$/);
    if(kbMatch){const [,type,id,op]=kbMatch;
      if(id&&!op&&req.method==='DELETE')return json(res,200,await platform.knowledge[type==='bases'?'deleteBase':'deleteDocument'](id,await body(req)));
      if(type==='documents'&&id&&!op&&req.method==='GET')return json(res,200,platform.knowledge.document(id));
      if(type==='documents'&&id&&op==='media'&&req.method==='GET')return json(res,200,await platform.knowledge.media(id));
      if(type==='documents'&&['index','toggle'].includes(op)&&req.method==='POST')return json(res,200,await platform.knowledge[op](id,await body(req)));
      if(!op&&(req.method==='PUT'&&id||req.method==='POST'&&!id))return json(res,200,await platform.knowledge[type==='bases'?'saveBase':'saveDocument'](id,await body(req,type==='documents'?45000000:undefined)));
    }
    if(url.pathname==='/api/sources'&&req.method==='GET')return json(res,200,platform.sources.view());
    const sourceMatch=url.pathname.match(/^\/api\/(sources|materials)(?:\/([^/]+))?(?:\/(sync|review))?$/);
    if(sourceMatch){const [,type,id,op]=sourceMatch;
      if(type==='sources'&&op==='sync'&&req.method==='POST')return json(res,200,await platform.sources.sync(id));
      if(type==='materials'&&op==='review'&&req.method==='POST')return json(res,200,await platform.sources.review(id,await body(req)));
      if(!op&&(req.method==='PUT'&&id||req.method==='POST'&&!id))return json(res,200,await platform.sources[type==='sources'?'saveSource':'saveMaterial'](id,await body(req)));
    }
    if(url.pathname==='/api/workforce/install'&&req.method==='POST')return json(res,200,await platform.workforce.install((await body(req)).recipeId));
    if(url.pathname==='/api/workforce/recommend'&&req.method==='POST')return json(res,200,platform.workforce.recommend((await body(req)).text));
    const extMatch=url.pathname.match(/^\/api\/external-skills(?:\/([^/]+))?(?:\/(test))?$/);
    if(extMatch){const [,id,op]=extMatch;
      if(op==='test'&&req.method==='POST')return json(res,202,await platform.workforce.testExternal(id,(await body(req)).input));
      if(!op&&(req.method==='PUT'&&id||req.method==='POST'&&!id))return json(res,200,await platform.workforce.saveExternal(id,await body(req)));
    }
    if(url.pathname==='/api/workforce'&&req.method==='GET')return json(res,200,platform.workforce.view());
    const workforceMatch=url.pathname.match(/^\/api\/(employees|models|skills)(?:\/([^/]+))?(?:\/(test))?$/);
    if(workforceMatch){const [,type,id,op]=workforceMatch;
      if(type==='employees'&&op==='test'&&req.method==='POST')return json(res,202,await platform.workforce.testEmployee(id));
      if(type==='models'&&op==='test'&&req.method==='POST')return json(res,202,await platform.workforce.testModel(id));
      if(type==='skills'&&op==='test'&&req.method==='POST')return json(res,202,await platform.workforce[id.startsWith('external_')?'testExternal':'testSkill'](id,(await body(req)).input));
      if(!op&&(req.method==='PUT'&&id||req.method==='POST'&&!id)&&['employees','models'].includes(type))return json(res,200,await platform.workforce[type==='employees'?'saveEmployee':'saveModel'](id,await body(req)));
    }
    if(url.pathname==='/api/goal-preview'&&req.method==='POST')return json(res,200,previewGoal((await body(req)).text));
    if(url.pathname==='/api/goals'&&req.method==='GET')return json(res,200,platform.goals());
    if(url.pathname==='/api/goals'&&req.method==='POST')return json(res,201,await platform.create(await body(req)));
    const contextMatch=url.pathname.match(/^\/api\/goals\/([^/]+)\/context$/);
    if(contextMatch&&req.method==='GET')return json(res,200,platform.workforce.context(contextMatch[1],url.searchParams.get('question')));
    const planningMatch=url.pathname.match(/^\/api\/goals\/([^/]+)\/planning$/);
    if(planningMatch&&req.method==='POST')return json(res,200,await platform.planning.propose(planningMatch[1],await body(req)));
    const photoMatch=url.pathname.match(/^\/api\/goals\/([^/]+)\/offer-photo$/);
    if(photoMatch&&req.method==='POST'){
      const input=await body(req,7020000);
      return json(res,200,await platform.action(photoMatch[1],{kind:'offerDetail',expectedVersion:input.expectedVersion,detail:input.detail}));
    }
    const goalMatch=url.pathname.match(/^\/api\/goals\/([^/]+)\/actions$/);
    if(goalMatch&&req.method==='POST')return json(res,200,await platform.action(goalMatch[1],await body(req)));
    if(url.pathname==='/api/agents'&&req.method==='GET')return json(res,200,platform.agents());
    const agentMatch=url.pathname.match(/^\/api\/agents\/([^/]+)(?:\/(test|sample))?$/);
    if(agentMatch&&req.method==='PUT'&&!agentMatch[2])return json(res,200,await platform.saveAgent(agentMatch[1],await body(req)));
    if(agentMatch&&req.method==='POST'&&agentMatch[2]==='test')return json(res,202,await platform.testAgent(agentMatch[1],(await body(req)).input));
    if(agentMatch&&req.method==='GET'&&agentMatch[2]==='sample')return json(res,200,platform.sample(agentMatch[1]));
    if(url.pathname==='/api/runs'&&req.method==='GET')return json(res,200,platform.runs());
    if(url.pathname.startsWith('/api/runs/')&&req.method==='GET')return json(res,200,platform.run(url.pathname.slice('/api/runs/'.length)));
    if(url.pathname==='/api/rooms'&&req.method==='GET')return json(res,200,rooms);
    if(url.pathname==='/api/rooms'&&req.method==='POST'){const input=await body(req);const room=createRoom(input.goal,input.agents);rooms.unshift(room);await saveRooms();return json(res,201,room);}
    const roomMatch=url.pathname.match(/^\/api\/rooms\/([^/]+)\/(messages|pause)$/);
    if(roomMatch&&req.method==='POST'){const room=rooms.find(r=>r.id===roomMatch[1]);if(!room)return json(res,404,{error:'协作群不存在'});const input=await body(req);if(roomMatch[2]==='messages')sendMessage(room,input.text,input.target);else{if(typeof input.paused!=='boolean')throw new Error('无效暂停状态');room.paused=input.paused;}await saveRooms();return json(res,200,room);}
    if (url.pathname === '/api/plan' && req.method === 'POST') return json(res, 200, planGoal((await body(req)).goal));
    if (url.pathname === '/api/tasks' && req.method === 'GET') return json(res, 200, tasks);
    if (url.pathname === '/api/tasks' && req.method === 'POST') {
      const input = await body(req); const task = createTask(input.goal, input.agents); tasks.unshift(task); await save(); return json(res, 201, task);
    }
    const match = url.pathname.match(/^\/api\/tasks\/([^/]+)\/(decision|cancel)$/);
    if (match && req.method === 'POST') {
      const task = tasks.find(t => t.id === match[1]); if (!task) return json(res, 404, { error: '任务不存在' });
      if (match[2] === 'decision') decide(task, (await body(req)).decision);
      else { if (task.status !== 'running') throw new Error('只能暂停正在执行的任务'); task.status = 'cancelled'; task.events.push({ type: 'cancel', title: '任务已停止', detail: '已保留当前执行记录与交付物。', at: new Date().toISOString() }); }
      await save(); return json(res, 200, task);
    }
    if (url.pathname.startsWith('/api/')) return json(res, 404, { error: '接口不存在' });
    const files = { '/business-csv.js':['business-csv.js','text/javascript'], '/employees.css':['employees.css','text/css'], '/shell.css':['shell.css','text/css'], '/offer-photos.js':['offer-photos.js','text/javascript'], '/offer-cards.js':['offer-cards.js','text/javascript'], '/goal-language.js':['goal-language.js','text/javascript'], '/sourcing.js':['sourcing.js','text/javascript'], '/market-comparison.js':['market-comparison.js','text/javascript'], '/pick-browser.js':['pick-browser.js','text/javascript'], '/stock-notices.js':['stock-notices.js','text/javascript'], '/vouchers.js':['vouchers.js','text/javascript'], '/cloud-browser.zip':['cloud-browser.zip','application/zip'], '/cloud-browser.js':['cloud-browser.js','text/javascript'], '/product-demo.png':['product-demo.png','image/png'], '/flows.js': ['flows.js','text/javascript'], '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/workforce.js': ['workforce.js', 'text/javascript'], '/sources.js': ['sources.js', 'text/javascript'], '/knowledge.js': ['knowledge.js', 'text/javascript'], '/business.js': ['business.js', 'text/javascript'], '/content.js': ['content.js', 'text/javascript'], '/planning.js': ['planning.js', 'text/javascript'], '/discussion.js': ['discussion.js', 'text/javascript'], '/setup.js': ['setup.js', 'text/javascript'], '/store-operations.js': ['store-operations.js', 'text/javascript'], '/images.js': ['images.js','text/javascript'], '/selects.js': ['selects.js','text/javascript'], '/style.css': ['style.css', 'text/css'] };
    const file = files[url.pathname]; if (!file) return json(res, 404, { error: '页面不存在' });
    res.writeHead(200, { 'Content-Type': file[1] + '; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'" }); res.end(await readFile(path.join(root, 'public', file[0])));
  } catch (error) { json(res, error.status || 400, { error: error.message }); }
});
let pushing=false;
const pushTimer=setInterval(async()=>{
 if(pushing)return;pushing=true;
 try{await Promise.allSettled(workspaces.list().map(async w=>{
  const platform=await workspaces.get(w.id);
  await pushOne({market:platform.integrations.market,workspace:w.id,name:w.name,stock:async(ws,shop,id)=>(await vouchers()).available(ws,shop,id)});
 }));}finally{pushing=false;}
},10000);
let ticking = false;
const timer = setInterval(async () => {
  void workspaces.pumpImages().catch(()=>console.error('图片任务状态保存失败'));
  if (ticking) return; ticking = true;
  try { await workspaces.pump(); const activeRooms=rooms.filter(r=>!r.paused&&r.queue.length);for(const room of activeRooms)await tickRoom(room);if(activeRooms.length)await saveRooms(); const active = tasks.filter(t => t.status === 'running'); for (const task of active) await tick(task); if (active.length) await save(); }
  catch (error) { console.error('任务保存失败:', error.message); }
  finally { ticking = false; }
}, 600);
server.listen(Number(process.env.PORT || 3000), access.host, () => console.log('AI数字员工协作工作台 · port ' + server.address().port + ' · access: ' + access.mode + (access.mode==='codespaces'?' · Codespaces 端口请保持 Private（私有）':'')));
function shutdown() { clearInterval(pushTimer);clearInterval(timer); server.close(() => process.exit(0)); }
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
