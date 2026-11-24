import {collectSearch,readSearch,rememberSearch} from './collect-1688.js';
import {readProduct,fillDraft} from './pages.js';
const patterns={source:'https://*.meituan.com/*',target:'https://*.goofish.com/*',sourcing:'https://s.1688.com/selloffer/offer_search.htm*'};
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
  const tabs=await Promise.all(Object.entries(patterns).map(async([role,url])=>{
   const matches=await chrome.tabs.query({url,windowId:sender.tab.windowId});
   return Promise.all(matches.map(async t=>{
    let eligible=role==='sourcing';
    if(!eligible){
     try{const [probe]=await chrome.scripting.executeScript({target:{tabId:t.id},func:role==='source'?readProduct:fillDraft,args:[role==='source'?true:null]});eligible=probe.result===true;}catch{}
    }
    return {role,id:t.id,title:t.title||new URL(t.url).hostname,eligible};
   }));
  }));
  return tabs.flat();
 }
 if(!['read','fill'].includes(cmd.op)||!Number.isInteger(cmd.tab))throw Error('无效的浏览器操作。');
 const reading=cmd.op==='read';
 const allowed=await chrome.tabs.query({url:reading?patterns.source:patterns.target,windowId:sender.tab.windowId});
 if(!allowed.some(t=>t.id===cmd.tab))throw Error('请选择当前窗口内对应平台的标签页。');
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
    await chrome.permissions.contains({origins:[patterns.source,patterns.target]});
   if(cmd.action==='status')return {installed:true,paired};
   if(!paired||!['tabs','disconnect','read','fill'].includes(cmd.action))throw Error('请先在扩展中连接当前工作空间。');
   // A restored tab may have a new document. The external request already
   // proved its approved tab, exact workbench URL and workspace above.
   return run({...cmd,op:cmd.action},sender,true);
  })().then(value=>reply({value}),e=>reply({error:e.message}));return true;
 }
 if(cmd.op!=='pick1688'||typeof cmd.key!=='string'||!/^[a-z0-9-]{32,64}$/i.test(cmd.key)||typeof cmd.query!=='string'||!cmd.query||cmd.query.length>60)return;
 readSearch(cmd,sender).then(({rows,phase,message})=>reply({rows,phase,message}),()=>reply({phase:'unavailable',message:'搜索页已变化，请返回原搜索结果，工作台将再次读取。'}));return true;
});
