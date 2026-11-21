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
