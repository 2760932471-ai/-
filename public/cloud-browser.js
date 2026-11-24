export function createCloudBrowser({startPick,esc,render,currentWorkspace,post,refresh}){
 let connected=false,tabs=[],product=null,message='',source='',target='',pending=false,workspace=currentWorkspace();
 let draft={title:'',price:'',description:'',confirmed:false};
 const receiptKey=()=> 'cloud-published-draft-'+currentWorkspace();
 function fills(){try{return JSON.parse(localStorage.getItem(receiptKey()))||[];}catch{return [];}}
 function saveFills(rows){localStorage.setItem(receiptKey(),JSON.stringify(rows));}
 let detecting=false,pairedDuringCheck=false;
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
 function reset(){sourcePicked=false;targetPicked=false;direct=false;connected=false;tabs=[];product=null;source='';target='';draft={title:'',description:'',price:'',confirmed:false};}
 function candidates(role){
  const opened=tabs.filter(t=>t.role===role),matched=opened.filter(t=>t.eligible!==false);
  return !matched.length&&role==='source'?opened:matched;
 }
 function tabChoice(role,current,label,id){
  const list=candidates(role);if(list.length<2)return '';
  return `<label>${label}<select id="${id}" required><option value="">选择本次使用的页面</option>${list.map(t=>`<option value="${Number(t.id)}" ${String(t.id)===current?'selected':''}>${esc(t.title)}</option>`).join('')}</select></label>`;
 }
 function choose(role,current,picked){
  const list=candidates(role);return picked&&list.some(t=>String(t.id)===current)?current:list.length===1?String(list[0].id):'';
 }
 function tabStatus(role,label){
  if(!connected)return '连接工作空间后自动识别';
  const list=candidates(role);
  if(!list.length)return '等待打开'+label;
  if(list.length===1)return (list[0].eligible===true?'已匹配 · ':list[0].eligible===false?'待核对页面 · ':'已打开 · ')+list[0].title;
  return '已找到 '+list.length+' 个候选页面';
 }
 function page(){
  if(workspace!==currentWorkspace()){reset();installed=false;nextScan=0;message='';workspace=currentWorkspace();}
  const receipts=fills(),picks=tabs.filter(t=>t.role==='sourcing').length;
  const row=(name,description,status,action)=>`<article class="browser-platform"><div><h3>${name}</h3><p>${description}</p><small>${esc(status)}</small></div><div>${action}</div></article>`;
  return `<section class="panel" data-cloud-workspace="${esc(workspace)}"><div class="section-title"><div><h2>浏览器连接器</h2><p>在同一个 Chrome 窗口中工作，平台页面由连接器识别。</p></div><span class="badge">${connected?'当前浏览器已连接':installed?'已识别扩展':'浏览器连接'}</span></div>
  <div class="browser-platforms">
  ${row('1688','从目标打开品类搜索，采集报价并比较商品。',picks?'已发现 '+picks+' 个搜索页':installed?'连接器可用 · 按目标打开搜索':'从目标启动选品','<button class="primary" data-cloud-pick>开始 1688 选品</button>')}
  ${row('美团联盟','读取商品详情与履约条件。',tabStatus('source','商品详情页'),source?`<button class="secondary" data-cloud="read">${tabs.find(t=>String(t.id)===source)?.eligible===false?'尝试读取此页':'读取这件商品'}</button>`:'<a class="secondary" href="https://union.meituan.com/" target="_blank" rel="noopener noreferrer">打开美团联盟 ↗</a>')}
  ${tabChoice('source',source,'选择本次要读取的美团商品','cloud-source')}
  ${row('闲鱼','将核对后的标题、描述和售价填入发布草稿。',tabStatus('target','发布表单'),'<a class="secondary" href="https://www.goofish.com/" target="_blank" rel="noopener noreferrer">打开闲鱼 ↗</a>')}
  </div>
  <details class="cloud-setup"><summary>${connected?'连接与权限':'安装扩展或连接工作空间'}</summary><p><a class="text-button" href="/cloud-browser.zip" download="云电脑浏览器连接器.zip">下载 Chrome 扩展</a>，解压后在 chrome://extensions 加载解压后的目录。1688 可从目标直接启动。美团和闲鱼首次使用时，在本页点击扩展图标 →「连接此工作台」，一次授予两个平台权限。</p><p>在支持的工作台地址，同一标签页刷新后会恢复本工作空间的连接。</p>${connected?'<button class="text-button" data-cloud="disconnect">断开美团和闲鱼连接</button>':''}</details>
  <button class="text-button" data-cloud="tabs" ${pending?'disabled':''}>刷新连接状态</button>
  <p role="status" class="field-hint">${esc(message)}</p>
  ${receipts.map(saved=>`<form data-cloud-receipt="${esc(saved.id)}" class="panel"><h3>核实闲鱼上架结果</h3><p>货源：${esc(saved.sourceName)}</p><label>最终商品标题<input name="title" required maxlength="200" value="${esc(saved.title)}"></label><label>实际上架售价（元）<input name="price" required type="number" step="0.01" min="0.01" value="${(saved.priceFen/100).toFixed(2)}"></label><label>闲鱼店铺 ID<input name="shopId" required maxlength="160"></label><label>发布成功的商品编号<input name="listingId" required maxlength="160"></label><label class="confirm-check"><input required type="checkbox">已在闲鱼核实该商品正在出售</label><button class="primary">确认已上架，生成备券提醒</button></form>`).join('')}
  ${product?`<form id="cloud-draft"><p>来自 ${esc(product.host)} · ${esc(product.title)} · 来源报价 ${esc(product.price||'未识别')}</p>
  ${tabChoice('target',target,'选择本次填写的闲鱼发布页','cloud-target')}
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
    if(installed&&!direct){reset();message='使用美团或闲鱼时，请在扩展里连接一次此工作空间。';return;}
    const found=await command(op);if(currentWorkspace()!==startWorkspace)return;
    const previousSource=source,previousTarget=target;tabs=found;connected=true;
    source=choose('source',source,sourcePicked);target=choose('target',target,targetPicked);
    if(source!==previousSource){product=null;sourcePicked=false;}
    if(target!==previousTarget){draft.confirmed=false;targetPicked=false;}
    if(!silent||!beforeConnected)message='';
   }
   if(op==='disconnect'){await command(op);reset();nextScan=Date.now()+10000;message='已断开美团和闲鱼，可在扩展里重新连接。';}
   if(op==='read'){
    const tab=source;product=null;const result=await command(op,{tab:Number(tab)});if(currentWorkspace()!==startWorkspace||source!==tab)return;product=result;draft={title:product.title,description:product.terms,price:'',confirmed:false};message='已读取商品，请核对履约条件与销售价格。';
   }
   if(op==='fill'){const filled={...draft},ref=product;await command(op,{tab:Number(target),draft:filled});
    if(currentWorkspace()!==startWorkspace)return;
    saveFills([...fills(),{id:crypto.randomUUID(),title:filled.title,priceFen:Math.round(Number(filled.price)*100),sourceName:ref.host+' · '+ref.title}]);
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
 document.addEventListener('click',e=>{if(e.target.closest('[data-cloud-pick]')){startPick();return;}const b=e.target.closest('[data-cloud]');if(b)act(b.dataset.cloud);});
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
 return {page};
}
