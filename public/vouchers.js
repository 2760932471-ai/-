export function createVoucherUI({api,post,esc,render,toast,state,currentWorkspace}){
 let stock=null,loading=false,loadedFor='',error='',demoStep=0;
 const states={pending:'已锁定 · 待核对交付',unknown:'发送结果待核对',sent:'已发券'};
 const input=(name,label,attrs='')=>`<label>${label}<input required name="${name}" ${attrs}></label>`;
 const shopFields=input('shop','闲鱼店铺 ID')+input('listing','闲鱼商品 ID');
 async function reload(){
  if(loading)return;loading=true;const ws=currentWorkspace();
  try{const data=await api('vouchers');if(ws===currentWorkspace()){stock=data;error='';loadedFor=ws;}}
  catch(e){error=e.message;loadedFor=ws;}
  finally{loading=false;render(true);}
 }
 function page(){
  if(currentWorkspace()!==loadedFor&&!loading){stock=null;queueMicrotask(reload);}
  if(error)return `<p role="alert">${esc(error)}</p><button data-voucher-action="reload">重新加载</button>`;
  if(!stock)return '<p>正在读取券库…</p>';
  if(stock.preview)return `<section class="panel"><h2>静态券库 · 示例订单</h2><p>样例库存 1 张 · 可售 ${demoStep?0:1} 张 · ${['待分配','已锁给订单 A','订单 A 已发券'][demoStep]}</p>
   <p>${demoStep?'订单 B 无可用库存；订单 A 再次处理仍绑定原券。':'在完整后端可导入真实静态二维码，并按订单交付。'}</p><button class="secondary" data-voucher-action="demo">${['模拟订单 A 锁券','模拟确认送达','重置示例'][demoStep]}</button></section>`;
  const gateways=(state.integrations?.stores||[]).filter(s=>s.enabled&&s.platform==='xianyu'&&s.driver==='gateway'&&s.connection?.status==='succeeded'&&['order.read','voucher.deliver'].every(scope=>s.connection.scopes.includes(scope)));
  return `<div class="section-title"><h2>静态券库</h2><button class="secondary" data-voucher-action="reload">刷新库存</button></div>
  ${stock.inventory.map(r=>`<p>店铺 ${esc(r.shop)} · 商品 ${esc(r.listing)} · 可售 <strong>${r.available}</strong> / 入库 ${r.total}</p>`).join('')||'<p>尚无库存。先按店铺和商品导入一张券。</p>'}
  <details><summary>二维码入库</summary><form data-voucher-form="add" class="panel"><div class="data-fields">${shopFields}${input('serial','供应方唯一券号')}${input('expiry','有效期（北京时间）','type="date"')}${input('file','静态二维码 PNG（最大 2 MB）','type="file" accept="image/png"')}</div><button class="primary">保存到券库</button></form></details>
  <details><summary>云电脑订单 · 人工核实付款后取券</summary><form data-voucher-form="manual" class="panel"><div class="data-fields">${shopFields}${input('orderNo','已付款订单号')}${input('buyer','订单对应买家 ID')}${input('qty','订单张数','type="number" min="1" max="20" value="1"')}</div><label class="confirm-check"><input required type="checkbox" name="verified">已在闲鱼核对付款、商品及买家</label><button class="primary">锁券给该订单</button></form></details>
  <details><summary>授权网关 · 按订单发送</summary>${gateways.length?`<form data-voucher-form="deliver" class="panel"><label>发券店铺<select name="storeId">${gateways.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></label>${input('orderNo','订单号')}<button class="primary">核验付款并发送给订单买家</button></form>`:'<p>需连接支持订单读取和发券的闲鱼网关。</p>'}</details>
  <h3>订单交付记录</h3>${stock.deliveries.map(r=>{
   const store=gateways.find(s=>s.shopId===r.shop);
   return `<article class="panel"><strong>订单 ${esc(r.orderNo)} · ${esc(states[r.state])}</strong><p>买家 ${esc(r.buyer)} · 商品 ${esc(r.listing)} · ${r.qty} 张</p>${r.method==='manual'?`<button class="secondary" data-voucher-action="original" data-id="${esc(r.id)}">查看该订单原券</button>`:r.state!=='sent'&&store?`<button class="secondary" data-voucher-action="reconcile" data-id="${esc(r.id)}" data-store="${esc(store.id)}">查询送达回执</button>`:''}</article>`;
  }).join('')||'<p>暂无已分配订单。</p>'}`;
 }
 async function original(id){
  const {order,images}=await post('vouchers/original',{id});
  const dialog=document.createElement('dialog');dialog.setAttribute('aria-label','订单原券');
  dialog.innerHTML=`<h2>订单 ${esc(order.orderNo)} 的原券</h2><p>只发送给买家 <strong>${esc(order.buyer)}</strong> · ${order.qty} 张</p>
   ${images.map((row,i)=>`<div><img width="180" src="data:image/png;base64,${row.png}" alt="本单第 ${i+1} 张券"><a href="data:image/png;base64,${row.png}" download="订单原券-${i+1}.png">下载第 ${i+1} 张</a></div>`).join('')}
   ${order.state==='sent'?'<p>此订单已发券</p>':'<button class="primary" data-confirm>已核对原买家聊天记录，全部券已发送</button>'}<button class="secondary" data-close>关闭</button>`;
  document.body.append(dialog);dialog.onclose=()=>dialog.remove();dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  const confirm=dialog.querySelector('[data-confirm]');if(confirm)confirm.onclick=async()=>{confirm.disabled=true;try{await post('vouchers/confirm',{id,buyer:order.buyer,confirmed:true});dialog.close();await reload();}catch(e){toast(e.message);}finally{confirm.disabled=false;}};
  dialog.showModal();
 }
 document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-voucher-action]');if(!b)return;b.disabled=true;
  try{switch(b.dataset.voucherAction){
   case 'demo':demoStep=(demoStep+1)%3;render(true);break;
   case 'reload':await reload();break;
   case 'original':await original(b.dataset.id);break;
   case 'reconcile':await post('vouchers/reconcile',{id:b.dataset.id,storeId:b.dataset.store});await reload();break;
  }}catch(err){toast(err.message);}finally{b.disabled=false;}
 });
 document.addEventListener('submit',async e=>{
  const f=e.target;if(!f.dataset.voucherForm)return;e.preventDefault();const b=e.submitter;b.disabled=true;
  try{const data=Object.fromEntries(new FormData(f)),op=f.dataset.voucherForm;
   if(op==='add'){const file=data.file;if(file.size>2097152)throw Error('请使用 2 MB 以内的 PNG');
    data.png=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.onerror=()=>reject(Error('图片读取失败'));r.readAsDataURL(file);});delete data.file;
   }
   if(op==='manual'){data.qty=Number(data.qty);data.verified=data.verified==='on';}
   await post('vouchers/'+op,data);await reload();toast('券库状态已更新');
  }catch(err){toast(err.message);}finally{b.disabled=false;}
 });
 return {page};
}
