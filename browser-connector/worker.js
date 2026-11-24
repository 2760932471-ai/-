import {readOfferCards} from "./offer-cards.js";
import {readProduct,fillDraft} from './pages.js';
const patterns={source:'https://*.meituan.com/*',target:'https://*.goofish.com/*'};
async function run(cmd,sender){
 const {pair}=await chrome.storage.session.get('pair');
 if(!pair||sender.tab?.id!==pair.tabId||sender.documentId!==pair.doc||cmd.workspace!==pair.workspace)throw Error('请从当前工作空间重新连接扩展。');
 if(cmd.op==='disconnect'){await chrome.storage.session.remove('pair');return true;}
 if(cmd.op==='tabs'){
  const tabs=await Promise.all(Object.entries(patterns).map(async([role,url])=>
   (await chrome.tabs.query({url,windowId:sender.tab.windowId})).map(t=>({role,id:t.id,title:t.title||new URL(t.url).hostname}))));
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

// The goal opens a search tab with a random fragment. Only return visible offers
// from that exact search, in the sender's window. No site session data is read.
chrome.runtime.onMessageExternal?.addListener((cmd,sender,reply)=>{
 if(!sender.tab||!cmd||cmd.op!=='pick1688'||typeof cmd.key!=='string'||!/^[a-z0-9-]{32,64}$/i.test(cmd.key)||typeof cmd.query!=='string'||!cmd.query||cmd.query.length>60)return;
 const searchOrigin=new URL(sender.url).origin;
 if(searchOrigin==='https://2760932471-ai.github.io'&&!new URL(sender.url).pathname.startsWith('/-/'))return;
 (async()=>{
  const tabs=await chrome.tabs.query({url:'https://s.1688.com/*',windowId:sender.tab.windowId});
  const tab=tabs.find(t=>{const u=new URL(t.url);return u.pathname==='/selloffer/offer_search.htm'&&u.searchParams.get('keywords')===cmd.query&&u.hash==='#pick-'+cmd.key;});
  if(!tab)return {message:'请打开此目标的 1688 搜索页。登录后若页面跳转，请从目标重新打开搜索。'};
  const [{result}]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:readOfferCards});
  return {rows:result,message:'等待搜索结果。请在 1688 完成登录，并滚动到能看到商品标题和报价的位置。'};
 })().then(reply,()=>reply({message:'当前页面无法读取，请重新打开此目标的搜索页。'}));return true;
});
