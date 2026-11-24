import {readOfferCards} from './offer-cards.js';

const active=new Map();
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function searchTab(url){
 try{const u=new URL(url);if(u.origin==='https://s.1688.com'&&u.pathname==='/selloffer/offer_search.htm')return {query:u.searchParams.get('keywords'),key:u.hash.match(/^#pick-([\da-f-]{36})$/i)?.[1]};}catch{}
}
function pageState({query,key,advance=false}){
 const u=new URL(location.href);
 if(u.searchParams.get('keywords')!==query||u.hash&&u.hash!=='#pick-'+key)return 'changed';
 const body=document.body?.innerText||'';
 if(/安全验证|请完成验证|滑动验证|拖动滑块|访问受限/.test(document.title+' '+body.slice(0,1000)))return 'verify';
 if(document.querySelector('input[type=password]')||/请先登录|登录后查看|登录后可见/.test(body.slice(0,1000)))return 'login';
 if(advance)window.scrollBy(0,Math.max(450,Math.floor(innerHeight*.85)));
 return 'ready';
}
function bindingKey(id){return 'pick1688:'+id;}
const lifetime=12*60*60*1000;
export async function rememberSearch(tab){
 const s=searchTab(tab.url);
 if(!s?.key||!s.query||s.query.length>60)return;
 const store=bindingKey(tab.id),records=await chrome.storage.session.get(null);
 const expired=Object.keys(records).filter(k=>k.startsWith('pick1688:')&&Date.now()-records[k].checked>lifetime);
 if(expired.length)await chrome.storage.session.remove(expired);
 if(records[store]?.key!==s.key||expired.includes(store)){
  await chrome.storage.session.set({[store]:{...s,windowId:tab.windowId,phase:'scanning',checked:Date.now(),rows:[],scrolls:0}});
 }
}
const messages={
 scanning:'正在浏览搜索结果，读取商品名称、报价和详情链接。',
 login:'请在已打开的 1688 标签页完成登录，返回搜索结果后会自动继续。',
 verify:'1688 要求验证。请在原标签页完成验证，工作台会自动继续。',
 unavailable:'原搜索标签页已关闭或跳转。请回到该品类的搜索结果，或重新打开搜索。',
 exhausted:'已检查当前搜索结果，完整报价仍不足两件。稍后会再次检查页面。',
 complete:'商品报价已收集，正在交给工作台比较。'
};
async function execute(tabId,documentId,func,args=[]){
 const [entry]=await chrome.scripting.executeScript({target:documentId?{tabId,documentIds:[documentId]}:{tabId},func,args});
 return entry;
}
// Bind to the tab opened for this goal. Keep its public offers in session
// storage so a sleeping workbench can receive them when it next runs.
export async function collectSearch(tab){
 const search=searchTab(tab.url);if(!search?.query)return;
 const storage=bindingKey(tab.id),saved=(await chrome.storage.session.get(storage))[storage];
 const key=search.key||(saved?.query===search.query&&Date.now()-saved.checked<lifetime&&saved.key);
 if(!key||search.query.length>60)return;
 const jobId=tab.id+'/'+key;
 if(active.has(jobId))return active.get(jobId);
 const job=(async()=>{
  const {documentId,result}=await execute(tab.id,null,pageState,[{query:search.query,key}]);
  if(result==='changed')return;
  const old=saved?.key===key&&saved.query===search.query?saved:null;
  if(old?.documentId===documentId&&(old.phase==='complete'||Date.now()-old.checked<7000))return old;
  const record={key,query:search.query,windowId:tab.windowId,documentId,rows:old?.rows||[],scrolls:old?.documentId===documentId?old.scrolls:0,checked:Date.now(),phase:'scanning'};
  const save=async phase=>{record.phase=phase;record.message=messages[phase];record.checked=Date.now();await chrome.storage.session.set({[storage]:record});return record;};
  if(result!=='ready')return save(result);
  await save('scanning');
  for(;;){
   const state=(await execute(tab.id,documentId,pageState,[{query:search.query,key}])).result;
   if(state!=='ready')return save(state==='changed'?'unavailable':state);
   const {result:rows}=await execute(tab.id,documentId,readOfferCards);
   const found=new Map(record.rows.map(row=>[row.url,row]));
   for(const row of rows)found.set(row.url,row);
   record.rows=[...found.values()].slice(0,40);
   if(record.rows.length>=12||record.scrolls>=4)return save(record.rows.length>=2?'complete':'exhausted');
   const moved=(await execute(tab.id,documentId,pageState,[{query:search.query,key,advance:true}])).result;
   if(moved!=='ready')return save(moved==='changed'?'unavailable':moved);
   record.scrolls++;await save('scanning');await pause(750);
  }
 })();
 active.set(jobId,job);try{return await job;}finally{active.delete(jobId);}
}
export async function readSearch(cmd,sender){
 const tabs=await chrome.tabs.query({windowId:sender.tab.windowId,url:'https://s.1688.com/*'});
 const exact=tabs.find(t=>{const s=searchTab(t.url);return s?.key===cmd.key&&s.query===cmd.query;});
 if(exact)return await collectSearch(exact)||{phase:'unavailable',message:messages.unavailable};
 const entries=await chrome.storage.session.get(null);
 for(const [name,rec] of Object.entries(entries)){
  if(!name.startsWith('pick1688:')||Date.now()-rec.checked>lifetime||rec.key!==cmd.key||rec.query!==cmd.query||rec.windowId!==sender.tab.windowId)continue;
  if(rec.phase==='complete')return rec;
  const tab=tabs.find(t=>bindingKey(t.id)===name&&searchTab(t.url)?.query===cmd.query&&!new URL(t.url).hash);
  if(tab)return await collectSearch(tab)||{phase:'unavailable',message:messages.unavailable};
  if(['login','verify'].includes(rec.phase))return rec;
 }
 return {phase:'unavailable',message:messages.unavailable};
}
