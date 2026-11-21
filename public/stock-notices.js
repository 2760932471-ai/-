export function createStockNotices({state,api,post,esc,toast,currentWorkspace,refresh}){
 let seen=new Set(),space='',opened=false;
 const label=n=>n.method==='gateway'?'平台发布回执':'人工核实上架';
 function update(){
  const ws=currentWorkspace();if(space!==ws){seen=new Set();space=ws;}
  const notes=state.integrations?.stockNotices||[],unread=notes.filter(n=>!n.read);
  const button=document.querySelector('#stock-notices');if(!button)return;
  button.textContent='备券通知'+(unread.length?' · '+unread.length:'');
  const fresh=unread.filter(n=>!seen.has(n.id));
  if(fresh.length){
   const n=fresh[0],msg=n.title+'已在闲鱼上架，请核对券库存。';
   toast(fresh.length===1?msg:'有 '+fresh.length+' 条新的闲鱼上架备券提醒');
   if(globalThis.Notification?.permission==='granted'){
    try{const notification=new Notification('闲鱼上架 · 待备券',{body:msg,tag:ws+'-'+n.id});notification.onclick=()=>{window.focus();open();};}catch{}
   }
  }
  for(const n of notes)seen.add(n.id);
  if(!opened&&new URLSearchParams(location.search).get('method')==='notices'){opened=true;open();}
 }
 async function open(){
  let dialog=document.querySelector('#stock-notice-dialog');
  if(dialog)return;
  dialog=document.createElement('dialog');dialog.id='stock-notice-dialog';dialog.setAttribute('aria-label','备券通知');
  document.body.append(dialog);dialog.onclose=()=>dialog.remove();dialog.showModal();
  dialog.innerHTML='<p>正在读取上架记录…</p>';
  const ws=currentWorkspace();
  async function draw(){
   const {items,channel,preview}=await api('stock-notices');if(!dialog.isConnected||ws!==currentWorkspace())return;
   dialog.innerHTML=`<div class="dialog-head"><h2>备券通知</h2><button class="secondary" data-close>关闭</button></div><p>闲鱼上架成功后，提醒你核对货源并备券。</p>
   <p class="field-hint">${preview?'静态预览 · 示例保存在此浏览器':channel?'站外推送：'+esc(channel):'当前使用工作台提醒。关闭网页后接收提醒，可在服务端配置企业微信或钉钉机器人。'}</p>
   ${preview?'<button class="secondary" data-demo>体验一条上架提醒</button>':''}
   ${globalThis.Notification?.permission==='default'?'<button class="text-button" data-desktop>开启浏览器通知</button>':''}
   ${items.map(n=>`<article class="panel"><div class="section-title"><h3>${esc(n.title)}</h3><span class="badge">${n.read?'已读':'未读'}</span></div>
    <p>${esc(n.storeName)} · 闲鱼商品 ${esc(n.listingId)} · ¥${(n.priceFen/100).toFixed(2)}</p><p>货源：${esc(n.sourceName)}</p>
    <p>当前可售 ${Number.isInteger(n.available)?n.available+' 张':'库存待查询'} · ${esc(label(n))}</p>
    <small>${esc(new Date(n.createdAt).toLocaleString('zh-CN'))}${channel?' · '+({sent:'机器人已接收',failed:'推送未送达，请检查机器人配置',pending:'等待推送'}[n.push]||''):''}</small>
    <div class="action-buttons"><button class="primary" data-stock="${esc(n.id)}">去券库备券</button>${n.read?'':`<button class="text-button" data-read="${esc(n.id)}">标为已读</button>`}</div></article>`).join('')||'<p>目前没有已确认上架的闲鱼商品。</p>'}`;
   dialog.onclick=async e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.hasAttribute('data-close'))return dialog.close();
    b.disabled=true;
    try{
     if(b.hasAttribute('data-desktop')){await Notification.requestPermission();}
     if(b.hasAttribute('data-demo')){await post('stock-notices/demo',{});}
     if(b.dataset.read||b.dataset.stock){
      const n=items.find(n=>n.id===(b.dataset.read||b.dataset.stock));
      if(!n.read)await post('integrations/market/readNotice',{id:n.id});
      if(b.dataset.stock){const u=new URL(location.href);u.searchParams.set('method','vouchers');u.searchParams.set('stockShop',n.shopId);u.searchParams.set('stockListing',n.listingId);u.hash='ai-config/market';location.href=u.href;return;}
     }
     await refresh();await draw();
    }catch(err){toast(err.message);}finally{b.disabled=false;}
   };
  }
  try{await draw();}catch(err){dialog.close();toast(err.message);}
 }
 document.addEventListener('click',e=>{if(e.target.closest('#stock-notices'))open();});
 return {update};
}
