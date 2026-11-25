import {offerPhoto,offerPhotos} from './offer-photos.js';
import {businessBrief,sourcingIntent,sourcingURL,decisionOrder,selectedOffer} from './sourcing.js';
import {readOfferCards} from './offer-cards.js';

export function createPickBrowser({state,act,esc,render}){
 const extension='mbbgfpiakdofbpceibocmbbnenocfdeb',jobs=new Map();
 const estimates=new Map(),lifetime=12*60*60*1000;
 const storageKey=g=>'pick1688-'+g.id+'-'+g.version;
 function session(g){try{return JSON.parse(sessionStorage.getItem(storageKey(g)));}catch{return null;}}
 function openSearch(g,tab){
  const query=sourcingIntent(businessBrief(g))?.query;if(!query){tab?.close();return;}
  const key=crypto.randomUUID(),url=sourcingURL(query)+'#pick-'+key;
  jobs.delete(storageKey(g));
  if(tab&&!tab.closed){
   tab.location.replace(url);
   try{sessionStorage.setItem(storageKey(g),JSON.stringify({key,at:Date.now()}));}catch{}
  }else{sessionStorage.removeItem(storageKey(g));}
  render(true);
 }
 function reserve(){const tab=window.open('about:blank','_blank');if(tab)tab.opener=null;return tab;}
 async function readSelected(sku,download=false,g){
  const runtime=globalThis.chrome?.runtime;
  if(!runtime?.sendMessage)return {sku,reason:'当前浏览器没有可用的 1688 连接器'};
  const send=(message,timeout)=>new Promise(resolve=>{
   const timer=setTimeout(()=>resolve(null),timeout);
   try{runtime.sendMessage(extension,message,r=>{
    clearTimeout(timer);resolve(runtime.lastError?null:r);
   });}catch{clearTimeout(timer);resolve(null);}
  });
  const response=await send({op:'workspaceBrowser',action:'offerDetail',workspace:sessionStorage.getItem('workspaceId')||'default',sku,download},download?47000:9000);
  const detail=response?.value?.sku===sku?response.value:null;
  const saved=g&&session(g);
  if(download&&!detail?.base64&&saved){
   const card=await send({op:'pick1688',key:saved.key,query:sourcingIntent(businessBrief(g))?.query,photoSku:sku,cardOnly:!!detail},47000);
   if(card?.sku===sku&&(card.base64||!detail))return {...card,facts:detail?.facts||card.facts||[]};
  }
  return detail||{sku,reason:response?.error||'请在当前窗口连接已安装的 1688 浏览器扩展'};
 }
 function scan(g,entry){
  const key=storageKey(g),s=session(g),node=g.flow.nodes.find(n=>n.capability==='sourcing.1688');
  if(!s||!node||node.status!=='needs_input'||g.paused||!entry||entry.busy||Date.now()-entry.last<2500||Date.now()-s.at>lifetime)return;
  entry.last=Date.now();entry.busy=true;const query=sourcingIntent(businessBrief(g)).query;
  const getReply=()=>new Promise((resolve,reject)=>{
   if(!globalThis.chrome?.runtime?.sendMessage){resolve({phase:'unpaired',message:'可将 1688 商品详情链接发到讨论里，由总控读取公开报价。'});return;}
   chrome.runtime.sendMessage(extension,{op:'pick1688',key:s.key,query},res=>{
    if(chrome.runtime.lastError||!res)resolve({phase:'unpaired',message:'当前 Chrome 未响应。已安装连接器时，可在工具栏重新连接工作台。也可以直接发商品链接。'});else resolve(res);
   });
  });
  getReply().then(async res=>{
   if(jobs.get(key)!==entry||!state.goals.some(x=>x.id===g.id&&x.version===g.version)||session(g)?.key!==s.key)return;
   if(!res.phase&&Array.isArray(res.rows)&&res.rows.length<2){
    entry.phase='install';entry.message='检测到旧版连接器。更新到 1.7.2 后，工作台会自动向下浏览并读取更多商品。';
    if(!res.rows?.length)return;
   }else entry.phase=res.phase||'scanning';
   const rows=res.rows||[];
   if(!rows.length){
    entry.message=res.message;
    if(res.phase==='unavailable'&&Date.now()-s.at>12000&&g.id===state.goal&&!document.hidden)autoOpen(g,entry,s);
    return;
   }
   if(rows.every(r=>node.offers?.some(o=>o.url===r.url&&o.price===r.price&&o.terms===r.terms&&o.repurchase===r.repurchase))){entry.message=res.message||'当前报价已保存，继续检测搜索页。';return;}
   if(rows.length+(node.offers?.length||0)>=2&&g.flow.nodes.some(n=>/^(copy|image)\./.test(n.capability))){
    const chosen=selectedOffer([...rows,...(node.offers||[])],sourcingIntent(businessBrief(g)),businessBrief(g));
    if(chosen){
     entry.message='正在打开所选商品详情，读取属性和参考图。';render(true);
     const detail=await readSelected(chosen.sku);
     if(detail)rows.unshift({...chosen,facts:detail.facts,photo:offerPhoto(detail.photo)||chosen.photo,photos:offerPhotos(detail.photos,chosen.photos)});
    }
   }
   await act('browserOffers',{expectedVersion:g.version,query,rows},g.id);
   entry.message='已读回商品报价。';
  }).catch(e=>{entry.message=e.message;}).finally(()=>{entry.busy=false;
   if(jobs.get(key)===entry&&entry.shown!==entry.message){entry.shown=entry.message;render(true);}
  });
 }
 function panel(g){
  const intent=sourcingIntent(businessBrief(g)),n=g.flow.nodes.find(n=>n.capability==='sourcing.1688');
  if(!intent?.query||!n)return '';
  if(n.status==='succeeded'){
   const basis={...intent,...estimates.get(storageKey(g))},sorted=decisionOrder(n.offers||[],basis,businessBrief(g));
   const prep=g.flow.nodes.find(step=>step.capability.startsWith('image.')&&step.preparation?.candidate)?.preparation;
   return `<section class="pick-results"><h3>${esc(intent.query)} · ${sorted.length} 个候选</h3>${prep?`<p><strong>本次制图商品</strong> · ${esc(prep.productName)}<br>${esc(prep.selectionReason)}</p>`:''}<p>按本目标的比较口径排列。报价规格与起订量可在商品详情页核对。</p><details><summary>按我的售价试算收益</summary><form novalidate data-pick-estimate="${esc(g.id)}"><div class="data-fields"><label>预计售价（元）<input name="retail" type="number" min="0.01" step="0.01" value="${basis.retail??''}"></label><label>每件其他成本（元）<input name="expenses" type="number" min="0" step="0.01" value="${basis.expenses??''}"></label></div><p>其他成本包括运费、平台费等。试算只更新当前页面。</p><button class="secondary">计算单件收益</button><span role="status"></span></form></details>${sorted.map(r=>`<article><div><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.title)} ↗</a><small>${esc(r.terms)} · ${r.repurchase===null?'回购率未披露':'回购率 '+r.repurchase +'%'}${r.eligibilityReasons.length?' · '+esc((r.eligibility==='excluded'?'已排除：':'待核实：')+r.eligibilityReasons.join('；')):''}</small></div><div><strong>¥${esc(r.price)}</strong><small>${r.margin===null?'利润待算':'估算单件收益 ¥'+r.margin.toFixed(2)}</small></div></article>`).join('')}</section>`;
  }
  if(n.status!=='needs_input'||g.paused)return '';
  const key=storageKey(g);if(!jobs.has(key))jobs.set(key,{last:0});const entry=jobs.get(key);
  const attached=session(g),expired=attached&&Date.now()-attached.at>lifetime;
  const phase=expired?'expired':entry.phase||'scanning',count=n.offers?.length||0;
  const headline=count>=2?'正在核对采购条件':{unpaired:'等待商品来源',scanning:'正在自动收集报价',install:'需要连接浏览器',verify:'等待 1688 页面验证',login:'等待 1688 登录',unavailable:'等待搜索页就绪',exhausted:'当前结果中的报价不足',expired:'本次浏览器采集已结束'}[phase]||'正在接收商品报价';
  const install=phase==='install';
  return `<section class="pick-import" tabindex="-1"><h3>${esc(headline)} · ${esc(intent.query)}</h3><p><strong>${count<2?'已保存 '+count+'/2 件':'已保存 '+count+' 件'}</strong> · ${count<2?'收齐两件不同商品的名称、报价和详情链接后，总控会自动比较。':esc(n.error||'请核实这些报价是否满足本次采购条件。')}</p>${count?`<p>已保存：${n.offers.map(r=>esc(r.title)+' · ¥'+esc(r.price)).join('、')}</p>`:''}
  <p role="status">${esc(entry.message||(!attached||expired?'正在连接当前窗口，准备打开品类搜索。':'正在检测搜索页与浏览器连接器。'))}</p>
  ${phase==='unavailable'||(!attached&&!globalThis.chrome?.runtime?.sendMessage)||expired?`<button class="primary" data-pick-open="${esc(g.id)}">打开本目标的 1688 搜索 ↗</button>`:''}
  ${install?`<p><a href="/cloud-browser.zip" download="工作台浏览器连接器.zip">下载 Chrome 连接器</a></p><p>解压后在 chrome://extensions 开启开发者模式，加载解压后的目录，再刷新工作台。保持 1688 搜索页打开，采集会自动继续。</p>`:''}
  <p>可直接在目标讨论里发 1688 商品详情链接，工作台会尝试读取公开报价。需要使用已登录页面时，在同一 Chrome 窗口连接已安装的扩展。</p><details><summary>手动补充报价（可选）</summary><label>粘贴选中的商品卡片<textarea data-pick-paste="${esc(g.id)}" rows="2" placeholder="从 1688 搜索结果复制商品卡片，可逐件粘贴。"></textarea></label></details></section>`;

 }
 document.addEventListener('click',e=>{const b=e.target.closest('[data-pick-open]');if(b){const g=state.goals.find(g=>g.id===b.dataset.pickOpen);if(g)openSearch(g,reserve());}});
 document.addEventListener('submit',e=>{
  const f=e.target;if(!f.dataset.pickEstimate)return;e.preventDefault();
  const g=state.goals.find(x=>x.id===f.dataset.pickEstimate);if(!g)return;
  const retail=f.elements.retail.valueAsNumber,expenses=f.elements.expenses.valueAsNumber;
  if(!(retail>0)||!(expenses>=0)){f.querySelector('[role=status]').textContent='请填入售价和单件其他成本；确认为零的成本可填 0。';return;}
  estimates.set(storageKey(g),{retail,expenses,fees:undefined});render(true);
 });
 document.addEventListener('paste',async e=>{
  const field=e.target.closest('[data-pick-paste]');if(!field)return;e.preventDefault();
  const g=state.goals.find(x=>x.id===field.dataset.pickPaste);if(!g)return;
  const html=e.clipboardData?.getData('text/html')||'';const t=document.createElement('template');
  const notice=field.closest('section').querySelector('[role=status]');
  if(html.length>4000000){notice.textContent='选中的范围太大，请只复制商品卡片。';return;}
  t.innerHTML=html;const rows=readOfferCards(t.content);
  if(!rows.length){notice.textContent='这次粘贴未识别到完整商品。请在搜索结果中选中并复制含商品名、价格和详情链接的整张卡片。';return;}
  const saved=g.flow.nodes.find(n=>n.capability==='sourcing.1688')?.offers||[];
  if(rows.every(r=>saved.some(o=>o.url===r.url&&o.price===r.price))){notice.textContent='这件商品的报价已经保存，请复制另一件商品。';return;}
  field.disabled=true;try{await act('browserOffers',{expectedVersion:g.version,query:sourcingIntent(businessBrief(g)).query,rows},g.id);}
  catch(error){notice.textContent=error.message;}finally{field.disabled=false;}
 });
 function autoOpen(g,entry,existing){
  if(entry.opening||entry.tried)return;
  const runtime=globalThis.chrome?.runtime,query=sourcingIntent(businessBrief(g))?.query;
  if(!query||!runtime?.sendMessage)return;
  const key=existing?.key||crypto.randomUUID(),storage=storageKey(g);
  entry.opening=true;
  function finish(ok){
   entry.opening=false;entry.tried=true;
   if(jobs.get(storage)!==entry||session(g)?.key!==existing?.key)return;
   if(ok){
    sessionStorage.setItem(storage,JSON.stringify({key,at:Date.now()}));
    entry.phase='scanning';entry.message='搜索页已在当前窗口打开，正在读取报价。';
   }else{
    entry.phase='unavailable';entry.message='自动打开需要已配对的新版连接器。也可手动打开本目标的搜索页。';
   }
   render(true);
  }
  try{
   runtime.sendMessage(extension,{op:'workspaceBrowser',action:'openSearch',workspace:sessionStorage.getItem('workspaceId')||'default',key,query},reply=>finish(!runtime.lastError&&reply?.value===true));
  }catch{finish(false);}
 }
 function checkGoals(){
  for(const g of state.goals){
   if(g.mode!=='flow'||g.paused)continue;
   const missing=g.flow.nodes.find(n=>n.status==='needs_input'&&(n.error?.includes('所选商品的参考图')||n.detailDeadline)&&n.preparation?.candidate);
   if(missing&&(g.id===state.goal||session(g))){
    const sku=missing.preparation.candidate.sku,key=storageKey(g)+'-detail-'+sku;
    const previous=jobs.get(key);
    if(!previous?.busy&&(!previous||previous.attempt!==missing.attempts||Date.now()>=previous.next)){
     const request={attempt:missing.attempts,busy:true,message:previous?.message,failures:previous?.failures||0};jobs.set(key,request);
     const download=g.flow.nodes.some(n=>n.capability.startsWith('image.')&&n.status==='needs_input'&&n.preparation?.candidate?.sku===sku&&n.error?.includes('所选商品的参考图'));
     readSelected(sku,download,g).then(async detail=>{
      const row=g.flow.nodes.find(n=>n.capability==='sourcing.1688')?.offers?.find(o=>o.sku===sku);
      const known=offerPhotos(row?.photo,row?.photos);
      const fresh=offerPhotos(detail?.photo,detail?.photos).some(url=>!known.includes(url));
      if(detail&&(detail.base64||missing.detailDeadline||fresh))await act('offerDetail',{detail,expectedVersion:g.version},g.id);
      else request.message=detail?.reason||'连接器暂未读到商品图，请确认已打开所选商品且工作台已连接。';
     }).catch(e=>{request.message=e.message;}).finally(()=>{
      request.busy=false;request.next=Date.now()+Math.min(120000,15000*2**Math.min(request.failures++,3));
      if(request.message)render(true);
     });
    }
   }
   if(!g.flow.nodes.some(n=>n.capability==='sourcing.1688'&&n.status==='needs_input'))continue;
   const key=storageKey(g);if(!jobs.has(key))jobs.set(key,{last:0});const entry=jobs.get(key),saved=session(g);
   if(saved&&Date.now()-saved.at<=lifetime)scan(g,entry);
   else if(g.id===state.goal&&!document.hidden){if(saved)sessionStorage.removeItem(key);autoOpen(g,entry);}
  }
 }
 setInterval(checkGoals,3000);window.addEventListener('focus',()=>{
  for(const key of jobs.keys())if(key.includes('-detail-')&&!jobs.get(key).busy)jobs.delete(key);
  checkGoals();
 });

 function photoStatus(g,n){return jobs.get(storageKey(g)+'-detail-'+n.preparation?.candidate?.sku)?.message||'';}
 return {reserve,openSearch,panel,photoStatus,hasQuery:g=>!!sourcingIntent(businessBrief(g))?.query};
}
