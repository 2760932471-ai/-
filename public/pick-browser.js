import {sourcingIntent,sourcingURL,rankedOffers} from './sourcing.js';
import {readOfferCards} from './offer-cards.js';

export function createPickBrowser({state,act,esc,render}){
 const extension='mbbgfpiakdofbpceibocmbbnenocfdeb',jobs=new Map();
 const estimates=new Map();
 const storageKey=g=>'pick1688-'+g.id+'-'+g.version;
 function session(g){try{return JSON.parse(sessionStorage.getItem(storageKey(g)));}catch{return null;}}
 function openSearch(g,tab){
  const query=sourcingIntent(g.text)?.query;if(!query){tab?.close();return;}
  const key=crypto.randomUUID(),url=sourcingURL(query)+'#pick-'+key;
  try{sessionStorage.setItem(storageKey(g),JSON.stringify({key,at:Date.now()}));}catch{}
  jobs.delete(storageKey(g));
  if(tab&&!tab.closed)tab.location.replace(url);else jobs.set(storageKey(g),{last:0,message:'浏览器拦截了新窗口。允许此站点打开弹窗后，点「打开 1688 搜索」。'});
  render(true);
 }
 function reserve(){const tab=window.open('about:blank','_blank');if(tab)tab.opener=null;return tab;}
 function scan(g,entry){
  const key=storageKey(g),s=session(g),node=g.flow.nodes.find(n=>n.capability==='sourcing.1688');
  if(!s||!node||node.status!=='needs_input'||g.paused||!entry||entry.busy||Date.now()-entry.last<2500||Date.now()-s.at>180000)return;
  entry.last=Date.now();entry.busy=true;const query=sourcingIntent(g.text).query;
  const getReply=()=>new Promise((resolve,reject)=>{
   if(!globalThis.chrome?.runtime?.sendMessage){reject(Error('未检测到选品扩展。可直接复制搜索结果，或安装扩展自动读回。'));return;}
   chrome.runtime.sendMessage(extension,{op:'pick1688',key:s.key,query},res=>{
    if(chrome.runtime.lastError||!res)reject(Error('未连接选品扩展。可复制搜索结果，或安装新版扩展后刷新工作台。'));else resolve(res);
   });
  });
  getReply().then(async res=>{
   if(jobs.get(key)!==entry||!state.goals.some(x=>x.id===g.id&&x.version===g.version)||session(g)?.key!==s.key)return;
   const rows=res.rows||[];
   if(!rows.length){entry.message=res.message;return;}
   if(rows.every(r=>node.offers?.some(o=>o.url===r.url&&o.price===r.price))){entry.message='当前页面只读到已保存的商品。向下滚动，让另一件商品的名称和报价显示出来。';return;}
   await act('browserOffers',{expectedVersion:g.version,query,rows:res.rows},g.id);
   entry.message='已读回商品报价。';
  }).catch(e=>{entry.message=e.message;}).finally(()=>{entry.busy=false;
   if(jobs.get(key)===entry&&entry.shown!==entry.message){entry.shown=entry.message;render(true);}
  });
 }
 function panel(g){
  const intent=sourcingIntent(g.text),n=g.flow.nodes.find(n=>n.capability==='sourcing.1688');
  if(!intent?.query||!n)return '';
  if(n.status==='succeeded'){
   const basis=estimates.get(storageKey(g))||intent,sorted=rankedOffers(n.offers||[],basis);
   return `<section class="pick-results"><h3>${esc(intent.query)} · ${sorted.length} 个候选</h3><p>有回购率的商品，优先展示报价和回购率未被其他候选同时超越的款式；其余按报价升序。规格和起订量以详情页为准。</p><details><summary>按我的售价试算收益</summary><form novalidate data-pick-estimate="${esc(g.id)}"><div class="data-fields"><label>预计售价（元）<input name="retail" type="number" min="0.01" step="0.01" value="${basis.retail??''}"></label><label>每件其他成本（元）<input name="expenses" type="number" min="0" step="0.01" value="${basis.expenses??''}"></label></div><p>其他成本包括运费、平台费等。试算只更新当前页面。</p><button class="secondary">计算单件收益</button><span role="status"></span></form></details>${sorted.map(r=>`<article><div><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.title)} ↗</a><small>${esc(r.terms)} · ${r.repurchase===null?'回购率未披露':'回购率 '+r.repurchase+'%'}</small></div><div><strong>¥${esc(r.price)}</strong><small>${r.margin===null?'利润待算':'估算单件收益 ¥'+r.margin.toFixed(2)}</small></div></article>`).join('')}</section>`;
  }
  if(n.status!=='needs_input'||g.paused)return '';
  const key=storageKey(g);if(!jobs.has(key))jobs.set(key,{last:0});const entry=jobs.get(key);
  const expired=session(g)&&Date.now()-session(g).at>180000;
  const count=n.offers?.length||0;
  return `<section class="pick-import"><h3>等待「${esc(intent.query)}」的商品报价</h3><p><strong>已保存 ${count}/2 件</strong> · 还需 ${2-count} 件不同商品。每件需要商品名、页面报价和 1688 详情链接。</p>${count?`<p>已保存：${n.offers.map(r=>esc(r.title)+' · ¥'+esc(r.price)).join('、')}</p>`:''}<p role="status">${esc(expired?'自动读取已暂停。重新打开搜索即可继续。':entry.message||'公开搜索页暂未提供足够报价。打开搜索后可从当前页面带回商品。')}</p><button class="primary" data-pick-open="${esc(g.id)}">打开 1688 搜索 ↗</button>
  <label>粘贴选中的商品卡片<textarea data-pick-paste="${esc(g.id)}" rows="2" placeholder="从已打开的 1688 搜索页复制商品卡片，可逐件粘贴。收齐两件后自动比较。"></textarea></label>
  <details><summary>使用 Chrome 自动读回</summary><p><a href="/cloud-browser.zip" download="工作台浏览器连接器.zip">下载选品扩展</a>，解压，在 chrome://extensions 开启开发者模式并加载解压后的目录。回到工作台刷新，再点「打开 1688 搜索」。支持 Codespaces、项目 GitHub Pages 与本机地址。</p></details></section>`;
 }
 document.addEventListener('click',e=>{const b=e.target.closest('[data-pick-open]');if(b){const g=state.goals.find(g=>g.id===b.dataset.pickOpen);if(g)openSearch(g,reserve());}});
 document.addEventListener('submit',e=>{
  const f=e.target;if(!f.dataset.pickEstimate)return;e.preventDefault();
  const g=state.goals.find(x=>x.id===f.dataset.pickEstimate);if(!g)return;
  const retail=f.elements.retail.valueAsNumber,expenses=f.elements.expenses.valueAsNumber;
  if(!(retail>0)||!(expenses>=0)){f.querySelector('[role=status]').textContent='请填入售价和单件其他成本；确认为零的成本可填 0。';return;}
  estimates.set(storageKey(g),{retail,expenses});render(true);
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
  field.disabled=true;try{await act('browserOffers',{expectedVersion:g.version,query:sourcingIntent(g.text).query,rows},g.id);}
  catch(error){notice.textContent=error.message;}finally{field.disabled=false;}
 });
 setInterval(()=>{const g=state.goals.find(x=>x.id===state.goal);if(g?.mode==='flow')scan(g,jobs.get(storageKey(g)));},3000);
 return {reserve,openSearch,panel,hasQuery:g=>!!sourcingIntent(g.text)?.query};
}
