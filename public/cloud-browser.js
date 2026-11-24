export function createCloudBrowser({esc,render,currentWorkspace,post,refresh}){
 let connected=false,tabs=[],product=null,message='',source='',target='',pending=false,workspace=currentWorkspace();
 let draft={title:'',price:'',description:'',confirmed:false};
 const receiptKey=()=> 'cloud-published-draft-'+currentWorkspace();
 function fills(){try{return JSON.parse(localStorage.getItem(receiptKey()))||[];}catch{return [];}}
 function saveFills(rows){localStorage.setItem(receiptKey(),JSON.stringify(rows));}
 let setupExpanded=false,detecting=false,pairedDuringCheck=false;
 let direct=false,installed=false,nextScan=0,sourcePicked=false,targetPicked=false;
 const extension='mbbgfpiakdofbpceibocmbbnenocfdeb';
 function external(action,extra={}){
  return new Promise((resolve,reject)=>{
   if(!globalThis.chrome?.runtime?.sendMessage)return resolve(null);
   const timer=setTimeout(()=>resolve(null),action==='status'?1250:8000);
   chrome.runtime.sendMessage(extension,{op:'workspaceBrowser',action,workspace:currentWorkspace(),...extra},reply=>{
    clearTimeout(timer);if(chrome.runtime.lastError||!reply)return resolve(null);
    if(reply.error)return reject(Error(reply.error));resolve(reply.value??null);
   });
  });
 }
 const waits=new Map();
 document.addEventListener('commerce-cloud-result',e=>{
  try{const r=JSON.parse(e.detail),wait=waits.get(r.id);if(wait){waits.delete(r.id);r.error?wait.reject(Error(r.error)):wait.resolve(r.value);}}catch{}
 });
 function command(op,extra={}){
  if(direct)return external(op,extra).then(value=>{if(value===null)throw Error('连接器未响应，请刷新连接状态。');return value;});
  return new Promise((resolve,reject)=>{
   const id=crypto.randomUUID();
   const timer=setTimeout(()=>{waits.delete(id);reject(Error('当前标签页未收到扩展回复。请在此页点击 Chrome 工具栏里的连接器，选择「连接此工作台」；刚更新过扩展时先刷新此页。'));},5000);
   waits.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});
   document.dispatchEvent(new CustomEvent('commerce-cloud-command',{detail:JSON.stringify({op,id,...extra})}));
  });
 }
 function reset(){setupExpanded=false;sourcePicked=false;targetPicked=false;direct=false;connected=false;tabs=[];product=null;source='';target='';draft={title:'',description:'',price:'',confirmed:false};}
 function candidates(role){
  return tabs.filter(t=>t.role===role&&t.eligible!==false);
 }
 function tabChoice(role,current,label,id){
  const list=candidates(role);if(list.length<2)return '';
  return `<label>${label}<select id="${id}" required><option value="">选择本次使用的页面</option>${list.map(t=>`<option value="${Number(t.id)}" ${String(t.id)===current?'selected':''}>${esc(t.title)}</option>`).join('')}</select></label>`;
 }
 function choose(role,current,picked){
  const list=candidates(role);return picked&&list.some(t=>String(t.id)===current)?current:list.length===1?String(list[0].id):'';
 }
 function page(){
  if(workspace!==currentWorkspace()){reset();installed=false;nextScan=0;message='';workspace=currentWorkspace();}
  const receipts=fills();
  const sources=candidates('source'),targets=candidates('target');
  return `<section class="panel browser-connector" data-cloud-workspace="${esc(workspace)}"><div class="section-title"><div><h2>浏览器连接器</h2><p>连接当前 Chrome 窗口，识别已打开的搜索结果、商品详情和发布表单。</p></div><span class="badge">${connected?'当前浏览器已连接':installed?'扩展已安装':'等待连接'}</span></div>
  <a class="secondary browser-download" href="/cloud-browser.zip" download="cloud-browser.zip">下载 Chrome 扩展 v1.4.0</a>
  <div class="section-title"><h3>当前窗口</h3><button class="text-button" data-cloud="tabs" ${pending?'disabled':''}>刷新连接状态</button></div>
  ${connected?`<p class="field-hint">${[tabs.filter(t=>t.role==='sourcing').length+' 个搜索页',sources.length+' 个商品页',targets.length+' 个发布表单'].join(' · ')}</p>${tabChoice('source',source,'选择要读取的商品','cloud-source')}${source?`<div class="action-buttons"><button class="secondary" data-cloud="read">读取这件商品</button><small>${esc(tabs.find(t=>String(t.id)===source)?.title||'')}</small></div>`:sources.length?'':'<p>打开商品详情页后，这里会显示可读取的商品。</p>'}`:'<p class="field-hint">连接后可直接读取已打开的商品。</p>'}
  <details class="cloud-setup" ${!connected||setupExpanded?'open':''}><summary>安装、更新与连接</summary>
  <p><strong>更新已有扩展</strong>　解压下载包，把里面的文件复制到上次加载的扩展文件夹，替换同名文件。在 Chrome 地址栏输入 <code>chrome://extensions</code>，找到「电商工作台 · 云电脑连接器」，点击卡片上的重新加载按钮（↻），核对版本为 1.4.0。</p>
  <p><strong>首次安装</strong>　在同一扩展管理页打开「开发者模式」，点击「加载已解压的扩展程序」，选择包含 <code>manifest.json</code> 的文件夹。</p>
  <p>安装或更新后，刷新此工作台页面，点 Chrome 工具栏中的连接器图标，选择「连接此工作台」。</p>${connected?'<button class="text-button" data-cloud="disconnect">断开工作空间连接</button>':''}</details>
  <p role="status" class="field-hint">${esc(message)}</p>
  ${receipts.map(saved=>`<form data-cloud-receipt="${esc(saved.id)}" class="panel"><h3>核实闲鱼上架结果</h3><p>货源：${esc(saved.sourceName)}</p><label>最终商品标题<input name="title" required maxlength="200" value="${esc(saved.title)}"></label><label>实际上架售价（元）<input name="price" required type="number" step="0.01" min="0.01" value="${(saved.priceFen/100).toFixed(2)}"></label><label>闲鱼店铺 ID<input name="shopId" required maxlength="160"></label><label>发布成功的商品编号<input name="listingId" required maxlength="160"></label><label class="confirm-check"><input required type="checkbox">已在闲鱼核实该商品正在出售</label><button class="primary">确认已上架，生成备券提醒</button></form>`).join('')}
  ${product?`<form id="cloud-draft"><p>来自 ${esc(product.host)} · ${esc(product.title)} · 来源报价 ${esc(product.price||'未识别')}</p>
  ${!targets.length?'<p>要准备销售草稿，请在同一窗口打开<a href="https://www.goofish.com/" target="_blank" rel="noopener noreferrer">闲鱼发布表单 ↗</a>。</p>':''}
  ${tabChoice('target',target,'选择本次填写的发布页','cloud-target')}
  <label>标题<input name="title" required maxlength="160" value="${esc(draft.title)}"></label><label>描述、履约方式与使用条件<textarea name="description" required maxlength="2000">${esc(draft.description)}</textarea></label>
  <label>闲鱼售价（元）<input type="number" name="price" required step="0.01" min="0.01" max="99999999.99" value="${esc(draft.price)}"></label><label class="confirm-check"><input name="confirmed" type="checkbox" required ${draft.confirmed?'checked':''}>我已核对商品允许在闲鱼转售，并可按上述条件履约</label>
  <button class="primary" ${pending||!target?'disabled':''}>填写到闲鱼，停在发布前</button></form>`:''}</section>`;
 }
 async function act(op,silent=false){
  if(pending)return;pending=true;const startWorkspace=currentWorkspace();
  const beforeConnected=connected,before=JSON.stringify([installed,connected,tabs,message,source,target]);
  if(op==='tabs'){detecting=true;nextScan=Date.now()+10000;}
  try{
   if(op==='tabs'){
    const status=await external('status');
    if(currentWorkspace()!==startWorkspace)return;
    installed=!!status?.installed;direct=!!status?.paired;
    if(installed&&!direct){reset();message='请在扩展中连接此工作空间。';return;}
    const found=await command(op);if(currentWorkspace()!==startWorkspace)return;
    const previousSource=source,previousTarget=target;tabs=found;connected=true;
    source=choose('source',source,sourcePicked);target=choose('target',target,targetPicked);
    if(source!==previousSource){product=null;sourcePicked=false;}
    if(target!==previousTarget){draft.confirmed=false;targetPicked=false;}
    if(!silent||!beforeConnected)message='';
   }
   if(op==='disconnect'){await command(op);reset();nextScan=Date.now()+10000;message='已断开工作空间连接。';}
   if(op==='read'){
    const tab=source;product=null;const result=await command(op,{tab:Number(tab)});if(currentWorkspace()!==startWorkspace||source!==tab)return;product=result;draft={title:product.title,description:product.terms,price:'',confirmed:false};message='已读取商品，请核对履约条件与销售价格。';
   }
   if(op==='fill'){const filled={...draft},ref=product;await command(op,{tab:Number(target),draft:filled});
    if(currentWorkspace()!==startWorkspace)return;
    if(/(^|\.)meituan\.com$/.test(ref.host))saveFills([...fills(),{id:crypto.randomUUID(),title:filled.title,priceFen:Math.round(Number(filled.price)*100),sourceName:ref.host+' · '+ref.title}]);
    message='已填入网页的标题、描述和售价。请切换到闲鱼核对类目、图片和其他必填项，发布由你操作。';}
  }catch(e){if(currentWorkspace()!==startWorkspace)return;if(!silent||connected||op!=='tabs')message=e.message;if(op==='tabs')reset();}
  finally{pending=false;detecting=false;if(!silent||before!==JSON.stringify([installed,connected,tabs,message,source,target]))render(true);if(pairedDuringCheck){pairedDuringCheck=false;if(!connected&&document.querySelector('[data-cloud-workspace]'))act('tabs');}}
 }
 function autoScan(){
  if(pending||document.hidden||Date.now()<nextScan||!document.querySelector('[data-cloud-workspace]'))return;
  if(document.activeElement?.closest('#cloud-draft,[data-cloud-receipt],.select-control')||document.querySelector('.select-trigger[aria-expanded=true]'))return;
  act('tabs',true);
 }
 setInterval(autoScan,1100);window.addEventListener('focus',()=>{nextScan=0;autoScan();});
 document.addEventListener('commerce-cloud-ready',()=>{if(!document.querySelector('[data-cloud-workspace]'))return;if(detecting)pairedDuringCheck=true;else act('tabs');});
 document.addEventListener('click',e=>{const b=e.target.closest('[data-cloud]');if(b)act(b.dataset.cloud);});
 document.addEventListener('toggle',e=>{
  if(connected&&e.target.isConnected&&e.target.matches('.cloud-setup'))setupExpanded=e.target.open;
 },true);
 document.addEventListener('change',e=>{
  if(e.target.id==='cloud-source'){source=e.target.value;sourcePicked=!!source;product=null;message='';render(true);}
  if(e.target.id==='cloud-target'){target=e.target.value;targetPicked=!!target;draft.confirmed=false;render(true);}
 });
 document.addEventListener('input',e=>{if(e.target.closest('#cloud-draft')&&Object.hasOwn(draft,e.target.name))draft[e.target.name]=e.target.type==='checkbox'?e.target.checked:e.target.value;});
 document.addEventListener('submit',async e=>{if(e.target.dataset.cloudReceipt){
  e.preventDefault();const button=e.submitter;button.disabled=true;
  try{const id=e.target.dataset.cloudReceipt,saved=fills().find(n=>n.id===id);if(!saved)throw Error('该记录已处理，请刷新');
   const fields=Object.fromEntries(new FormData(e.target));await post('integrations/market/confirmBrowser',{...saved,...fields,priceFen:Math.round(Number(fields.price)*100),confirmed:true});
   saveFills(fills().filter(n=>n.id!==id));message='已登记上架，备券通知已保存';await refresh();render(true);
  }catch(err){message=err.message;render(true);}finally{button.disabled=false;}
 }else if(e.target.id==='cloud-draft'){e.preventDefault();act('fill');}});
 async function readQuotes(){
  const scope=currentWorkspace(),status=await external('status');
  if(status&&!status.paired)throw Error('请在浏览器连接器中连接当前工作空间，然后重新读取。');
  const request=(op,extra)=>status?.paired?external(op,extra):command(op,extra);
  const found=await request('tabs');
  if(!Array.isArray(found))throw Error('浏览器连接器未响应，请检查工作空间连接。');
  const pages=found.filter(t=>t.role==='source'&&t.eligible===true);
  const results=await Promise.allSettled(pages.slice(0,50).map(t=>request('read',{tab:t.id})));
  if(scope!==currentWorkspace())throw Error('工作空间已切换，请重新读取。');
  const quotes=new Map();
  for(const entry of results){
   if(entry.status!=='fulfilled'||!entry.value)continue;
   const row=entry.value,amount=/^\s*[¥￥]?\s*(\d+(?:\.\d{1,2})?)\s*元?\s*$/.exec(row.price);
   if(!amount||Number(amount[1])<=0||!row.url||!row.title)continue;
   quotes.set(row.url,{sku:row.title,price:Number(amount[1]),source:row.url});
  }
  if(!quotes.size)throw Error('尚未读到带明确单价的商品。请在同一窗口打开商品详情，再点「从浏览器读取」。');
  return [...quotes.values()];
 }
 return {page,readQuotes};
}
