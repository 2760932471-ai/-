document.querySelector('#pair').onclick=async()=>{
 const status=document.querySelector('#status');
 try{
  const granted=await chrome.permissions.request({origins:['https://*.meituan.com/*','https://*.goofish.com/*']});
  if(!granted)throw Error('需要这两个平台的页面权限才能读取商品和填写草稿。');
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  const [probe]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>({
   workspace:document.querySelector('[data-cloud-workspace]')?.dataset.cloudWorkspace,
   secure:isSecureContext,route:location.hash
  })});
  if(!probe.result.secure||probe.result.route!=='#ai-config/market'||!probe.result.workspace)throw Error('请在云电脑浏览器配置页面点击连接。');
  await chrome.storage.session.set({pair:{tabId:tab.id,doc:probe.documentId,workspace:probe.result.workspace}});
  await chrome.scripting.executeScript({target:{tabId:tab.id,documentIds:[probe.documentId]},files:['bridge.js']});
  status.textContent='已连接。请回工作台选择已打开的商品页面。';
 }catch(e){status.textContent=e.message;}
};
