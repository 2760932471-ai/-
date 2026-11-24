document.querySelector('#pair').onclick=async()=>{
 const status=document.querySelector('#status');
 try{
  const granted=await chrome.permissions.request({origins:['https://*.meituan.com/*','https://*.goofish.com/*','https://detail.1688.com/*']});
  if(!granted)throw Error('请允许连接器访问支持的平台页面，再连接工作空间。');
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  const [probe]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>({
   workspace:document.querySelector('[data-cloud-workspace]')?.dataset.cloudWorkspace,
   secure:isSecureContext,scope:location.origin+location.pathname
  })});
  if(!probe.result.secure)throw Error('请通过 HTTPS 或 localhost 打开工作台后配对。');
  if(!probe.result.workspace)throw Error('请切换到工作台标签，打开 AI基础能力配置 → 跨平台连接器 → 云电脑浏览器，再点击扩展配对。');
  await chrome.storage.session.set({pair:{tabId:tab.id,doc:probe.documentId,workspace:probe.result.workspace,scope:probe.result.scope}});
  await chrome.scripting.executeScript({target:{tabId:tab.id,documentIds:[probe.documentId]},files:['bridge.js']});
  status.textContent='已连接。工作台会自动识别同一窗口中的平台页面。';
 }catch(e){status.textContent=e.message;}
};
