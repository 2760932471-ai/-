export function createCloudBrowser({esc,render,currentWorkspace,post,refresh}){
 let connected=false,tabs=[],product=null,message='',source='',target='',pending=false,workspace=currentWorkspace();
 let draft={title:'',price:'',description:'',confirmed:false};
 const receiptKey=()=> 'cloud-published-draft-'+currentWorkspace();
 function fills(){try{return JSON.parse(localStorage.getItem(receiptKey()))||[];}catch{return [];}}
 function saveFills(rows){localStorage.setItem(receiptKey(),JSON.stringify(rows));}
 let detecting=false,pairedDuringCheck=false;
 const waits=new Map();
 document.addEventListener('commerce-cloud-result',e=>{
  try{const r=JSON.parse(e.detail),wait=waits.get(r.id);if(wait){waits.delete(r.id);r.error?wait.reject(Error(r.error)):wait.resolve(r.value);}}catch{}
 });
 function command(op,extra={}){
  return new Promise((resolve,reject)=>{
   const id=crypto.randomUUID();
   const timer=setTimeout(()=>{waits.delete(id);reject(Error('当前标签页未收到扩展回复。请在此页点击 Chrome 工具栏里的连接器，选择「连接此工作台」；刚更新过扩展时先刷新此页。'));},5000);
   waits.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});
   document.dispatchEvent(new CustomEvent('commerce-cloud-command',{detail:JSON.stringify({op,id,...extra})}));
  });
 }
 function reset(){connected=false;tabs=[];product=null;source='';target='';draft={title:'',description:'',price:'',confirmed:false};}
 function page(){
  if(workspace!==currentWorkspace()){reset();message='';workspace=currentWorkspace();}
  const options=(role,selected)=>'<option value="">选择已打开的页面</option>'+tabs.filter(t=>t.role===role).map(t=>`<option value="${Number(t.id)}" ${String(t.id)===selected?'selected':''}>${esc(t.title)}</option>`).join('');
  const receipts=fills();
  return `<section class="panel" data-cloud-workspace="${esc(workspace)}"><div class="section-title"><h2>云电脑浏览器</h2><span class="badge">${connected?'当前浏览器已连接':'等待连接'}</span></div>
  <div class="cloud-setup"><h3>${connected?'平台页面检查':'连接当前 Chrome 窗口'}</h3>
  <ol><li><strong>安装扩展</strong> · <a class="text-button" href="/cloud-browser.zip" download="云电脑浏览器连接器.zip">下载 Chrome 扩展</a>，解压，在 chrome://extensions 开启开发者模式，加载解压后的目录。</li>
  <li><strong>配对工作台</strong> · 在云电脑的 Chrome 打开本页，点工具栏连接器 →「连接此工作台」，允许访问美团与闲鱼。切换工作空间或刷新页面后重新配对。</li>
  <li><strong>检查业务页面</strong> · 在同一窗口登录平台，打开美团商品详情和闲鱼发布页。</li></ol></div>
  ${connected?`<div class="cloud-counts"><span>美团页面 · ${tabs.filter(t=>t.role==='source').length} 个</span><span>闲鱼页面 · ${tabs.filter(t=>t.role==='target').length} 个</span></div>`:''}
  <div class="action-buttons"><button class="primary" data-cloud="tabs" ${pending?'disabled':''}>${pending?'正在检测…':'检测连接与页面'}</button>${connected?'<button class="text-button" data-cloud="disconnect">断开连接</button>':''}</div>
  <p role="status" class="field-hint">${esc(message)}</p>
  ${connected?`<label>美团商品详情页<select id="cloud-source">${options('source',source)}</select></label><button class="secondary" data-cloud="read" ${source?'':'disabled'}>读取这件商品</button>`:''}
  ${receipts.map(saved=>`<form data-cloud-receipt="${esc(saved.id)}" class="panel"><h3>核实闲鱼上架结果</h3><p>货源：${esc(saved.sourceName)}</p><label>最终商品标题<input name="title" required maxlength="200" value="${esc(saved.title)}"></label><label>实际上架售价（元）<input name="price" required type="number" step="0.01" min="0.01" value="${(saved.priceFen/100).toFixed(2)}"></label><label>闲鱼店铺 ID<input name="shopId" required maxlength="160"></label><label>发布成功的商品编号<input name="listingId" required maxlength="160"></label><label class="confirm-check"><input required type="checkbox">已在闲鱼核实该商品正在出售</label><button class="primary">确认已上架，生成备券提醒</button></form>`).join('')}
  ${product?`<form id="cloud-draft"><p>来自 ${esc(product.host)} · ${esc(product.title)} · 来源报价 ${esc(product.price||'未识别')}</p>
  <label>闲鱼发布页<select id="cloud-target" required>${options('target',target)}</select></label>
  <label>标题<input name="title" required maxlength="160" value="${esc(draft.title)}"></label><label>描述、履约方式与使用条件<textarea name="description" required maxlength="2000">${esc(draft.description)}</textarea></label>
  <label>闲鱼售价（元）<input type="number" name="price" required step="0.01" min="0.01" max="99999999.99" value="${esc(draft.price)}"></label><label class="confirm-check"><input name="confirmed" type="checkbox" required ${draft.confirmed?'checked':''}>我已核对商品允许在闲鱼转售，并可按上述条件履约</label>
  <button class="primary" ${pending?'disabled':''}>填写到闲鱼，停在发布前</button></form>`:''}</section>`;
 }
 async function act(op){
  if(pending)return;pending=true;const startWorkspace=currentWorkspace();
  if(op==='tabs'){detecting=true;message='正在联系当前标签页的扩展…';render(true);}
  try{
   if(op==='tabs'){const found=await command(op);if(currentWorkspace()!==startWorkspace)return;tabs=found;connected=true;if(!tabs.some(t=>String(t.id)===source)){source='';product=null;}
    if(!tabs.some(t=>String(t.id)===target))target='';
    message=!tabs.some(t=>t.role==='source')?'已配对。请在同一 Chrome 窗口打开美团商品详情，然后再次检测。':!tabs.some(t=>t.role==='target')?'已找到美团页面。填写草稿前请打开闲鱼发布页，再次检测。':'已找到两个平台的页面，请选择要读取的商品。';}
   if(op==='disconnect'){await command(op);reset();message='已断开当前工作台。';}
   if(op==='read'){
    const tab=source;product=null;const result=await command(op,{tab:Number(tab)});if(currentWorkspace()!==startWorkspace||source!==tab)return;product=result;draft={title:product.title,description:product.terms,price:'',confirmed:false};message='已读取商品，请核对履约条件与销售价格。';
   }
   if(op==='fill'){const filled={...draft},ref=product;await command(op,{tab:Number(target),draft:filled});
    if(currentWorkspace()!==startWorkspace)return;
    saveFills([...fills(),{id:crypto.randomUUID(),title:filled.title,priceFen:Math.round(Number(filled.price)*100),sourceName:ref.host+' · '+ref.title}]);
    message='已填入网页的标题、描述和售价。请切换到闲鱼核对类目、图片和其他必填项，发布由你操作。';}
  }catch(e){message=e.message;if(op==='tabs')reset();}
  finally{pending=false;detecting=false;render(true);if(pairedDuringCheck){pairedDuringCheck=false;if(!connected&&document.querySelector('[data-cloud-workspace]'))act('tabs');}}
 }
 document.addEventListener('commerce-cloud-ready',()=>{if(!document.querySelector('[data-cloud-workspace]'))return;if(detecting)pairedDuringCheck=true;else act('tabs');});
 document.addEventListener('click',e=>{const b=e.target.closest('[data-cloud]');if(b)act(b.dataset.cloud);});
 document.addEventListener('change',e=>{
  if(e.target.id==='cloud-source'){source=e.target.value;product=null;message='';render(true);}
  if(e.target.id==='cloud-target')target=e.target.value;
 });
 document.addEventListener('input',e=>{if(e.target.closest('#cloud-draft')&&Object.hasOwn(draft,e.target.name))draft[e.target.name]=e.target.type==='checkbox'?e.target.checked:e.target.value;});
 document.addEventListener('submit',async e=>{if(e.target.dataset.cloudReceipt){
  e.preventDefault();const button=e.submitter;button.disabled=true;
  try{const id=e.target.dataset.cloudReceipt,saved=fills().find(n=>n.id===id);if(!saved)throw Error('该记录已处理，请刷新');
   const fields=Object.fromEntries(new FormData(e.target));await post('integrations/market/confirmBrowser',{...saved,...fields,priceFen:Math.round(Number(fields.price)*100),confirmed:true});
   saveFills(fills().filter(n=>n.id!==id));message='已登记上架，备券通知已保存';await refresh();render(true);
  }catch(err){message=err.message;render(true);}finally{button.disabled=false;}
 }else if(e.target.id==='cloud-draft'){e.preventDefault();act('fill');}});
 return {page};
}
