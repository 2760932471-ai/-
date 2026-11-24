import {collectSearch,readSearch,rememberSearch} from './collect-1688.js';
import {readProduct,fillDraft} from './pages.js';
const sites=[
 {url:'https://*.meituan.com/*',roles:['source']},
 {url:'https://*.goofish.com/*',roles:['source','target']},
 {url:'https://detail.1688.com/*',roles:['source']},
 {url:'https://s.1688.com/selloffer/offer_search.htm*',roles:['sourcing']}
];
async function siteTabs(site,windowId){
 return chrome.tabs.query({url:site.url,windowId});
}
function matchesPair(pair,cmd,sender,restored){
 if(!pair||pair.tabId!==sender.tab?.id||pair.workspace!==cmd.workspace)return false;
 if(pair.doc===sender.documentId)return true;
 if(!restored||!pair.scope||!sender.url)return false;
 const page=new URL(sender.url);return pair.scope===page.origin+page.pathname;
}
async function run(cmd,sender,restored=false){
 const {pair}=await chrome.storage.session.get('pair');
 if(!matchesPair(pair,cmd,sender,restored))throw Error('请从当前工作空间重新连接扩展。');
 if(cmd.op==='disconnect'){await chrome.storage.session.remove('pair');return true;}
 if(cmd.op==='tabs'){
  const groups=await Promise.all(sites.map(async site=>{
   const tabs=await siteTabs(site,sender.tab.windowId);
   const found=[];
   for(const t of tabs){
    for(const role of site.roles){
     if(role!=='sourcing'){
      try{
       const [probe]=await chrome.scripting.executeScript({target:{tabId:t.id},func:role==='source'?readProduct:fillDraft,args:[role==='source'?true:null]});
       if(probe?.result!==true)continue;
      }catch{continue;}
     }
     found.push({role,id:t.id,title:t.title||new URL(t.url).hostname,eligible:true});
    }
   }
   return found;
  }));
  return groups.flat();
 }
 if(cmd.op==='openSearch'){
  if(typeof cmd.query!=='string'||!cmd.query.trim()||cmd.query.length>60||!/^([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.test(cmd.key))throw Error('目标搜索参数无效');
  const url=new URL('https://s.1688.com/selloffer/offer_search.htm');
  url.searchParams.set('keywords',cmd.query);url.searchParams.set('charset','utf8');url.hash='pick-'+cmd.key;
  const windowId=sender.tab.windowId,open=await chrome.tabs.query({windowId,url:'https://s.1688.com/*'});
  if(!open.some(t=>t.url===url.href))await chrome.tabs.create({windowId,url:url.href,active:false});
  return true;
 }
 if(!['read','fill'].includes(cmd.op)||!Number.isInteger(cmd.tab))throw Error('无效的浏览器操作。');
 const reading=cmd.op==='read',role=reading?'source':'target';
 const allowed=await Promise.all(sites.filter(site=>site.roles.includes(role)).map(site=>siteTabs(site,sender.tab.windowId)));
 if(!allowed.flat().some(t=>t.id===cmd.tab))throw Error('请选择当前窗口内支持此操作的页面。');
 const d=cmd.draft;
 if(!reading&&(!d||d.confirmed!==true||typeof d.title!=='string'||!d.title.trim()||d.title.length>160||typeof d.description!=='string'||!d.description.trim()||d.description.length>2000||!/^\d{1,8}(\.\d{1,2})?$/.test(d.price)||Number(d.price)<=0))throw Error('请核对转售授权、商品资料和售价。');
 const [r]=await chrome.scripting.executeScript({target:{tabId:cmd.tab},func:reading?readProduct:fillDraft,args:reading?[]:[d]});
 if(!r.result)throw Error('网页未能确认字段，请直接核对目标页面。');
 return r.result;
}
chrome.runtime.onMessage.addListener((cmd,sender,reply)=>{
 run(cmd,sender).then(value=>reply({value}),err=>reply({error:err.message}));return true;
});

chrome.tabs?.onUpdated?.addListener((id,change,tab)=>{
 if(!tab.url?.startsWith('https://s.1688.com/'))return;
 if(change.status==='complete')collectSearch(tab).catch(()=>{});
 else if(change.url)rememberSearch(tab).catch(()=>{});
});
chrome.runtime.onMessageExternal?.addListener((cmd,sender,reply)=>{
 if(!sender.tab||!cmd||sender.frameId>0||!sender.url)return;
 const page=new URL(sender.url);
 if(page.origin==='https://2760932471-ai.github.io'&&!page.pathname.startsWith('/-/'))return;
 if(cmd.op==='workspaceBrowser'){
  (async()=>{
   const {pair}=await chrome.storage.session.get('pair');
   const paired=matchesPair(pair,cmd,sender,true)&&
    await chrome.permissions.contains({origins:['https://*.meituan.com/*','https://*.goofish.com/*']});
   if(cmd.action==='status')return {installed:true,paired};
   if(!paired||!['tabs','disconnect','read','fill','openSearch'].includes(cmd.action))throw Error('请先在扩展中连接当前工作空间。');
   // A restored tab may have a new document. The external request already
   // proved its approved tab, exact workbench URL and workspace above.
   return run({...cmd,op:cmd.action},sender,true);
  })().then(value=>reply({value}),e=>reply({error:e.message}));return true;
 }
 if(cmd.op!=='pick1688'||typeof cmd.key!=='string'||!/^[a-z0-9-]{32,64}$/i.test(cmd.key)||typeof cmd.query!=='string'||!cmd.query||cmd.query.length>60)return;
 readSearch(cmd,sender).then(({rows,phase,message})=>reply({rows,phase,message}),()=>reply({phase:'unavailable',message:'搜索页已变化，请返回原搜索结果，工作台将再次读取。'}));return true;
});
