export function createFlowsUI({readQuotes,pickBrowser,state,api,esc,badge,act,receive,refresh,render,toast,openCreate,knowledgeUI,sourcesUI,discussionUI,drafts,openGoal}){
 const labels={awaiting_context:'等你补充使用场景',planning:'正在规划',planning_running:'模型规划中',planning_failed:'规划未完成',running:'执行中',pending:'等待前置任务',succeeded:'已完成',failed:'执行失败',needs_input:'需要处理',needs_capability:'新能力待验证',waiting_external:'等待图片结果',blocked:'存在阻塞',review:'待验收',completed:'已验收'};
 const label=s=>labels[s]||s;
 function nodeIssue(n){
  const missing=(n.missing||[]).filter(Boolean);
  if(missing.length)return missing.join('；');
  if(n.status==='needs_input'&&n.capability==='product.compare'&&/业务输入/.test(n.error||''))return '比较至少需要两个有来源的候选商品。请核对商品编号和报价。';
  return n.error||'';
 }
 function intervention(g,n){
  if(g.paused)return '<button class="primary" data-action="pause">恢复后续执行</button>';
  if(g.flow.calls>=g.flow.policy?.maxCalls)return '<small>本轮调用次数已用完。</small><button class="secondary" data-flow-replan="'+esc(g.id)+'">重新规划</button>';
  const id=esc(n.id),goal=esc(g.id);
  const retry='<button class="secondary" data-flow-retry="'+id+'" data-goal="'+goal+'">从此步继续</button>';
  if(n.status==='needs_input'&&n.capability==='product.compare')return '<button class="primary" data-offer-input="'+id+'" data-goal="'+goal+'">读取或补入候选报价</button><button class="text-button" data-view="ai-config/sources">管理供应商来源</button>'+retry;
  if(n.status==='needs_capability')return '<button class="secondary" data-flow-replan="'+goal+'">换一种方法重新规划</button>';
  if(n.capability==='sourcing.1688')return n.status==='failed'?retry:'';
  if(n.detailDeadline&&n.error?.includes('正在读取所选商品'))return '<small>工作台正在收集属性，完成后会继续。</small>';
  if(n.error?.includes('所选商品的参考图'))return '<small role="status">'+esc(pickBrowser.photoStatus(g,n)||'正在尝试获取白底图或商品图，取到后会继续生图。')+'</small><button class="secondary" data-flow-retry="'+id+'" data-goal="'+goal+'">立即重新取图</button><button class="text-button" data-product-upload="'+goal+'">使用我自己的底图</button>';
  if(n.imageJobId)return `<button class="primary" data-flow-retry="${id}" data-goal="${goal}" data-previous-image="${esc(n.imageJobId)}">从生图步骤继续</button><button class="text-button" data-view="ai-config/images">查看生图配置</button>`;
  if(n.capability==='analysis.reason'&&!g.flow.model){
   if(state.flows?.modelReady)return retry;
   return '<button class="primary" data-view="flows">选择分析模型</button><small>选择后回到这里，可继续当前步骤。</small>';
  }
  if(n.capability==='market.offers')return '<button class="primary" data-view="ai-config/market" data-market-method="browser">在浏览器中处理</button><button class="text-button" data-view="ai-config/market" data-market-method="api">管理授权接口</button>'+retry;
  const images=n.capability.startsWith('image.')&&/服务|模型/.test(n.error||'');
  return (images?'<button class="primary" data-view="ai-config/images">打开连接配置</button>':'<button class="secondary" data-tab="facts">查看与补充资料</button>')+retry;
 }
 function panel(g){
  const f=g.flow,nodes=f.nodes;
  const done=nodes.filter(n=>n.status==='succeeded').length;
  const blocked=nodes.filter(n=>['failed','needs_input','needs_capability'].includes(n.status));
  const active=nodes.filter(n=>['running','waiting_external'].includes(n.status));
  const pick=nodes.find(n=>n.capability==='sourcing.1688');
  const status=g.paused?'已暂停':blocked.length?blocked.length+' 步待处理':label(f.status);
  const pause='<button class="secondary" data-action="pause">暂停后续执行</button>';
  const card=(title,body='',actions='')=>`<section class="flow-current" data-current-task-action tabindex="-1"><h3>${esc(title)}</h3>${body?`<p>${esc(body)}</p>`:''}${actions?`<div class="action-buttons">${actions}</div>`:''}</section>`;
  let current;
  if(g.paused){
   current=card('后续执行已暂停','恢复后会从当前进度继续。','<button class="primary" data-action="pause">恢复执行</button>');
  }else if(f.status==='awaiting_context'){
   current=card('补充使用场景',f.question,'<button class="primary" data-tab="discussion">在讨论中回复</button>');
  }else if(f.status==='planning_failed'){
   current=card('规划未完成',f.error,`<button class="primary" data-flow-retry data-goal="${esc(g.id)}">重试规划</button><button class="text-button" data-view="flows">查看总控设置</button>`);
  }else if(blocked.length){
   current=blocked.map((n,i)=>{
    const location=`data-flow-intervention="${esc(n.id)}" tabindex="-1" ${i===0?'data-current-task-action':''}`;
    if(n===pick&&n.status==='needs_input'&&pickBrowser.hasQuery(g)&&!(f.calls>=f.policy?.maxCalls)){
     return `<div ${location}>${pickBrowser.panel(g)}</div>`;
    }
    const actions=intervention(g,n)||'<button class="primary" data-tab="discussion">在讨论中补充商品信息</button>';
    return `<section class="flow-attention" ${location}><span class="flow-kicker">待处理 · 第 ${nodes.indexOf(n)+1} 步</span><h3>${esc(n.title)}</h3><p>${esc(nodeIssue(n))}</p><div class="action-buttons">${actions}</div></section>`;
   }).join('');
  }else if(g.stage==='review'||g.stage==='completed'){
   const delivered=g.artifacts.filter(a=>a.version===g.version&&a.status!=='superseded').length;
   const files='<button class="secondary" data-tab="artifacts">查看交付物</button>';
   current=g.stage==='review'?card('交付物待验收',`本轮共有 ${delivered} 份交付物，可逐项核对后确认。`,'<button class="primary" data-tab="review">查看并验收</button>'+files):card('任务已验收','',files);
  }else{
   const next=active.length?active:nodes.filter(n=>n.status==='pending'&&n.dependsOn.every(id=>nodes.some(parent=>parent.id===id&&parent.status==='succeeded')));
   const title=!nodes.length?'正在规划执行步骤':active.length?'正在执行':'等待调度';
   current=card(title,next.map(n=>n.title).join('、'),pause);
  }
  const steps=nodes.map((n,i)=>{
   const waiting=n.dependsOn.map(id=>nodes.find(x=>x.id===id)).filter(x=>x&&x.status!=='succeeded');
   const checking=['pending','running'].includes(n.status)&&n.investigation;
   const assignment=n.assignment;
   const owner=assignment?'<p>'+esc(assignment.employeeName)+' · '+esc(assignment.reason)+'</p>':'';
   const stateLabel=checking?(n.investigation.phase==='search'?'正在补查资料':'正在复核判断'):n.status==='pending'&&!waiting.length?'等待调度':label(n.status);
   return `<li class="flow-node" data-flow-node="${esc(n.id)}" data-status="${esc(n.status)}" tabindex="-1"><span class="step-mark" aria-hidden="true">${n.status==='succeeded'?'✓':i+1}</span><div class="step-body"><details ${disclosure(g.id+'/'+g.version+'/step/'+n.id)}><summary aria-label="${esc(n.title)} · ${esc(stateLabel)} · 执行详情"><strong>${esc(n.title)}</strong>${badge(stateLabel,active.includes(n))}</summary>${waiting.length?`<p>等待「${waiting.map(x=>esc(x.title)).join('、')}」完成</p>`:''}${owner}${checking?`<p>${esc(n.investigation.query)} · ${esc(n.investigation.why)}</p>`:''}<p>${esc(n.objective)} · ${esc(n.acceptance)}</p><small>${esc(state.flows?.capabilities.find(c=>c.id===n.capability)?.name||n.capability)} · 已执行 ${n.attempts||0} 次</small>${n.runId?`<button class="text-button" data-run="${esc(n.runId)}">查看本步运行记录</button>`:''}${n.capabilityProposal?`<p>${esc(n.capabilityProposal.description)}</p><pre>${esc(n.capabilityProposal.implementation)}</pre><p>验证要求：${esc(n.capabilityProposal.tests)}</p>`:''}</details></div></li>`;
  }).join('');
  return `<section class="flow-panel" aria-label="任务流执行"><header class="flow-overview"><h2>${esc(f.plan?.name||'任务执行')}</h2>${badge(status,true)}</header>
   ${current}
   ${nodes.length?`<div class="task-steps-heading"><h3 class="flow-step-heading">执行步骤</h3><small>${done} / ${nodes.length} 步完成</small><progress value="${done}" max="${nodes.length}" aria-label="已完成步骤"></progress></div><ol class="execution-steps">${steps}</ol>`:''}
   ${pick?.status==='succeeded'?pickBrowser.panel(g):''}
   <details class="flow-policy" ${disclosure(g.id+'/'+g.version+'/policy')}><summary>规划依据与执行设置</summary><p>${esc(f.plan?.rationale||'正在选择任务路径。')}</p>${(f.plan?.corrections?.length||0)>0?`<p>总控已校正计划</p><ul>${f.plan.corrections.map(note=>`<li>${esc(note)}</li>`).join('')}</ul>`:''}<small>${f.plan?.planner==='model'?'模型参与规划':'工作台规划'} · 调用 ${f.calls} / ${f.policy?.maxCalls||24} 次 · 并行上限 ${f.policy?.parallel||3}</small>
   <div class="action-buttons">${g.stage==='completed'?`<button class="secondary" data-flow-save="${esc(g.id)}">保存为可复用任务流</button>`:`<button class="secondary" data-flow-replan="${esc(g.id)}" ${g.paused||f.status==='planning_running'?'disabled':''}>重新规划</button>${!g.paused&&(blocked.length||['review','planning_failed','awaiting_context'].includes(f.status))?pause:''}`}<button class="text-button" data-view="flows">总控设置</button></div></details></section>`;
 }
 function enterOffers(g,nodeId){
  const dialog=document.createElement('dialog');
  dialog.setAttribute('aria-label','比较候选报价');
  const row=(i,c={})=>`<fieldset class="offer-fields"><legend>候选商品 ${i+1}</legend><label>商品名称或编号<input name="sku" required maxlength="160" value="${esc(c.sku||'')}"></label><label>报价（元）<input name="price" type="number" min="0.01" step="0.01" required value="${esc(String(c.price||''))}"></label><label>来源链接或报价单名称<input name="source" maxlength="1000" required value="${esc(c.source||'')}"></label><button type="button" class="text-button" data-remove-quote>移除</button></fieldset>`;
  dialog.innerHTML=`<form><div class="dialog-head"><h2>比较候选报价</h2><button type="button" class="icon-btn" aria-label="关闭">×</button></div><p>自动读取同一窗口里已打开商品的名称、单价和来源。保留本次要比较的商品后即可继续。</p><button type="button" class="secondary" data-read-quotes>从浏览器读取</button><div data-quote-rows>${row(0)+row(1)}</div><button type="button" class="text-button" data-add-quote>添加候选</button><p class="form-error" role="alert"></p><button class="primary" type="submit">保存并继续比较</button></form>`;
  const rows=dialog.querySelector('[data-quote-rows]'),error=dialog.querySelector('[role=alert]');
  dialog.querySelector('[data-add-quote]').onclick=()=>{if(rows.children.length<50)rows.insertAdjacentHTML('beforeend',row(rows.children.length));};
  rows.onclick=e=>{if(e.target.closest('[data-remove-quote]'))e.target.closest('fieldset').remove();};
  dialog.querySelector('[data-read-quotes]').onclick=async e=>{
   const button=e.currentTarget;button.disabled=true;error.textContent='';
   try{
    const quotes=await readQuotes(),existing=new Set([...rows.querySelectorAll('[name=source]')].map(el=>el.value));
    for(const quote of quotes){
     if(existing.has(quote.source))continue;
     const empty=[...rows.children].find(f=>[...f.querySelectorAll('input')].every(el=>!el.value));
     if(empty){for(const el of empty.querySelectorAll('input'))el.value=quote[el.name];}
     else if(rows.children.length<50)rows.insertAdjacentHTML('beforeend',row(rows.children.length,quote));
    }
   }catch(err){error.textContent=err.message;}finally{button.disabled=false;}
  };
  document.body.append(dialog);dialog.onclose=()=>dialog.remove();dialog.querySelector('.icon-btn').onclick=()=>dialog.close();
  dialog.querySelector('form').onsubmit=async e=>{
   e.preventDefault();const b=e.submitter;b.disabled=true;
   try{const candidates=[...dialog.querySelectorAll('fieldset')].map(row=>({sku:row.querySelector('[name=sku]').value,source:row.querySelector('[name=source]').value,price:row.querySelector('[name=price]').valueAsNumber}));
    if(candidates.length<2)throw Error('至少保留两件不同商品才能比较');
    await act('supplyOffers',{nodeId,candidates,expectedVersion:g.version},g.id);dialog.close();toast('报价已保存，任务将继续比较');
   }catch(error){dialog.querySelector('.form-error').textContent=error.message;}finally{b.disabled=false;}
  };dialog.showModal();
 }
 document.addEventListener('click',e=>{const b=e.target.closest('[data-offer-input]');if(b)enterOffers(state.goals.find(g=>g.id===b.dataset.goal),b.dataset.offerInput);});
 function showcase(){return `<section class="product-demo-card panel" aria-label="单商品出图体验"><div class="section-title"><div><h2>商品图片制作示例</h2><p>银色台盆水龙头 · 商品主图 + 详情图片模块</p></div>${badge('概念样例')}</div><img class="product-demo-image" src="/product-demo.png" alt="银色水龙头的主图和详情图概念效果样张" loading="lazy"><p class="field-hint">这是预先生成的概念效果样张，不是本次实时生成结果，也不是供应商实拍。未确认材质、性能、认证或在售信息。</p><div class="action-buttons"><button class="primary" data-product-demo>用这款商品开始出图</button><a class="secondary" href="/product-demo.png" download="水龙头概念效果样张.png">下载效果样张</a></div><p class="field-hint">创建后自动整理画面要求，生成 1 张主图和 1 张竖版详情图片模块，最终在交付物中查看和下载。真实出图需完整后端和图片服务；静态预览会如实显示连接缺口。</p></section>`;}
 function page(){const d=state.flows;if(!d)return '<p>正在加载任务流…</p>';const c=d.settings;return `<div class="page-heading flow-page-heading"><div><h1>任务流与总控</h1><p>选择一个方法开始，或直接提出目标，由总控规划步骤。</p></div><button class="primary" data-new>新建任务</button></div><div class="section-title"><h2>可复用任务流</h2><span>${d.templates.length} 个模板</span></div><div class="flow-template-grid">${d.templates.map(t=>`<article class="panel flow-template"><div class="template-heading"><h3>${esc(t.name)}</h3>${t.sourceGoal?'<small>来自已验收任务</small>':''}</div><p>${esc(t.description||t.rationale)}</p><div class="template-controls"><details><summary>${t.nodes.length} 个步骤</summary><ol>${t.nodes.map(n=>`<li>${esc(n.title)}</li>`).join('')}</ol></details><button class="secondary" data-flow-template="${esc(t.id)}">使用任务流 →</button></div></article>`).join('')}</div>${showcase()}<section class="panel"><div class="section-title"><h2>总控执行设置</h2>${badge(d.modelReady?'模型可用':'基础组合')}</div><form id="flow-settings-form"><label>规划与分析模型<select name="modelId"><option value="">基础组合 · 不调用规划模型</option>${(state.workforce?.models||[]).map(m=>`<option value="${esc(m.id)}" ${m.id===c.modelId?'selected':''}>${esc(m.name)}${m.credentialConfigured&&m.lastTest?.status==='succeeded'?'':' · 待连接测试'}</option>`).join('')}</select></label><p class="field-hint">选择模型后，总控可判断模板适用性、生成新任务流与能力构想；业务数据只发给所选模型服务。</p><div class="data-fields"><label>并行任务上限<input name="parallel" type="number" min="1" max="4" value="${c.parallel}" required></label><label>每条流程步骤上限<input name="maxNodes" type="number" min="2" max="16" value="${c.maxNodes}" required></label><label>每轮执行调用上限<input name="maxCalls" type="number" min="4" max="40" value="${c.maxCalls}" required></label></div><p class="field-hint">上限控制运行资源，不限制可以提出什么方案；不是精确费用预算。已有执行使用创建时的设置快照。</p><p class="form-error" id="flow-settings-error" role="alert"></p><button class="primary" type="submit">保存总控设置</button></form></section><section class="panel"><h3>开放构思，验证后执行</h3><p>允许新分析方法、新流程和新能力设计。当前能执行已连接工具、代码 Skill 与模型分析；新代码的自动隔离构建尚未接通，会保留方案并显示待验证。</p><p>真实店铺修改仍通过店铺操作入口授权。不会把任务流生成成功当成业务执行成功。</p></section>`;}
 function remakeAction(g){
  if(g.paused||g.stage==='completed'||!g.flow?.nodes.some(n=>n.capability==='sourcing.1688'&&n.offers?.length))return '';
  const main=g.flow.nodes.find(n=>n.capability==='image.main'&&n.status==='succeeded');
  const artifact=main?.imageJobId&&g.artifacts.find(a=>a.imageJobId===main.imageJobId&&a.title.includes('概念'));
  if(!artifact||g.flow.nodes.some(n=>n.dependsOn.includes(main.id)&&n.capability!=='result.compile'))return '';
  return '<button class="secondary" data-remake-main="'+esc(main.imageJobId)+'" data-goal="'+esc(g.id)+'">用商品原图重做主图</button>';
 }
 document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-remake-main]');if(!b||!window.confirm('用已选商品重新生成一张主图？将使用一次生图额度。'))return;
  b.disabled=true;
  try{await act('remakeMain',{previousImageJob:b.dataset.remakeMain},b.dataset.goal);}catch(err){toast(err.message);}finally{b.disabled=false;}
 });
 const openActivity=new Set();
 function disclosure(key){
  return `data-flow-activity="${esc(key)}" ${openActivity.has(key)?'open':''}`;
 }
 document.addEventListener('toggle',e=>{
  const key=e.target.dataset?.flowActivity;
  if(key&&e.target.isConnected){if(e.target.open)openActivity.add(key);else openActivity.delete(key);}
 },true);
 function discussionMessages(g,messageView){
  const parts=[],entries=[];
  const receipts=new Set(g.flow.nodes.flatMap(n=>(n.artifactIds||[]).map(id=>n.title+'：'+g.artifacts.find(a=>a.id===id)?.title)));
  function flush(){
   if(entries.length>1){
    const key=g.id+'/'+entries[0].id;
    parts.push(`<details class="flow-activity" ${disclosure(key)}><summary>执行记录 <span>${entries.length} 条</span></summary>${entries.map(m=>messageView(m,g)).join('')}</details>`);
   }else if(entries.length)parts.push(messageView(entries[0],g));
   entries.length=0;
  }
  for(const m of g.messages){
   const receipt=m.role==='coordinator'&&!m.reportVersion&&!m.artifactIds?.length&&!m.links?.length&&!m.replyTo&&
    (receipts.has(m.text)||/^(基础组合器|总控模型)已(创建|选择)任务流/.test(m.text));
   if(receipt)entries.push(m);
   else{flush();parts.push(messageView(m,g));}
  }
  flush();return parts.join('');
 }
 function discussion(g,messageView,legacyReport){
  const final=['review','completed'].includes(g.stage);
  const old=final&&!g.messages.some(m=>m.reportVersion===g.version)?legacyReport(g):null;
  return `<div class="chat-area"><div class="chat-log" tabindex="0" aria-label="群聊消息记录">${discussionMessages(g,messageView)}${remakeAction(g)}${old?messageView({id:'report-'+g.version,derived:true,author:'目标总控',role:'coordinator',text:old.text,at:g.updatedAt,artifactIds:old.imageIds,links:[{title:'查看所选商品',url:old.source,snippet:''}]},g):''}</div><form id="chat-form" class="chat-composer flow-composer" novalidate data-goal="${g.id}">${discussionUI.composer(g)}<label class="sr-only" for="chat-input">目标讨论</label><textarea id="chat-input" aria-describedby="chat-error" rows="1" maxlength="2000" placeholder="${g.flow.status==='awaiting_context'?'在这里回复总控的问题…':'说说你的想法，或告诉总控下一步怎么做…'}">${esc(drafts[g.id]||'')}</textarea><select id="chat-target" hidden><option value="coordinator">总控</option></select><div class="composer-bottom">${discussionUI.uploadButton(g)}<div class="flow-send">${discussionUI.modelPicker(g)}<span>Enter 发送</span><button class="primary" type="submit">发送 ↑</button></div></div><p id="chat-error" class="form-error" role="alert"></p></form></div>`;}
 function context(g){
  const f=g.flow,blocked=f.nodes.filter(n=>['failed','needs_input','needs_capability'].includes(n.status));
  const done=f.nodes.filter(n=>n.status==='succeeded').length;
  return `<div class="tab-scroll task-detail-view">
   <section class="context-section"><h3>执行进度</h3><p class="progress-readout"><strong>${done}</strong> / ${f.nodes.length} 项任务完成</p><progress class="progress-bar" max="${f.nodes.length||1}" value="${done}" aria-label="目标执行进度"></progress>
   ${blocked.length?`<p>待处理 · ${blocked.map(n=>esc(n.title)).join('、')}</p><button class="text-button" data-tab="tasks">查看阻塞与处理方式 →</button>`:''}</section>
   <section class="context-section"><h3>任务范围</h3><div class="scope-row"><span>店铺</span><strong>${esc(g.scope.store)}</strong></div><div class="scope-row"><span>范围</span><strong>${esc(g.scope.sku)}</strong></div><div class="scope-row"><span>计划版本</span><strong>v${g.version}</strong></div></section>
   ${g.artifacts.some(a=>a.version===g.version&&a.status!=='superseded')?`<section class="context-section"><h3>本轮交付</h3><ul class="context-deliveries">${g.artifacts.filter(a=>a.version===g.version&&a.status!=='superseded').slice(-3).reverse().map(a=>`<li><button class="text-button" data-preview="${esc(a.id)}" data-parent="${esc(g.id)}">${esc(a.title)} ↗</button></li>`).join('')}</ul><button class="text-button" data-tab="artifacts">全部交付物 →</button></section>`:''}
   ${/上架|铺货/.test(g.text)?`<section class="context-section"><h3>店铺上架</h3><p>此流程尚未向店铺提交上架。已有商品可在授权店铺中核对并提交。</p><button class="text-button" data-view="ai-config/stores">打开店铺商品管理 →</button></section>`:''}
   ${g.stage!=='completed'?`<section class="context-section"><h3>运行控制</h3><button class="secondary" data-action="pause">${g.paused?'恢复执行':'暂停后续执行'}</button></section>`:''}</div>`;
 }
 function facts(g){return `<div class="tab-scroll"><h3>目标上下文与资料</h3><p>优先读取已接入的知识和来源；补充资料是可选入口，不要求重复整理卖点或受众。</p>${knowledgeUI.goal(g)}${sourcesUI.goal(g)}<details><summary>补充结构化业务数据（高级）</summary><form id="flow-data-form" data-goal="${g.id}"><label>业务数据 JSON<textarea name="data" rows="8" spellcheck="false">${esc(JSON.stringify(g.skillData||{},null,2))}</textarea></label><p class="field-hint">用于已有账单、候选商品等结构化数据。保存后会新建计划版本。</p><p class="form-error" role="alert"></p><button class="secondary" type="submit">保存并重新规划</button></form></details></div>`;}
 document.addEventListener('submit',async e=>{if(!['flow-settings-form','flow-data-form'].includes(e.target.id))return;e.preventDefault();const f=e.target,b=e.submitter;b.disabled=true;try{const values=Object.fromEntries(new FormData(f));if(f.id==='flow-settings-form')await api('flows/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:state.flows.settings.revision,modelId:values.modelId,parallel:Number(values.parallel),maxNodes:Number(values.maxNodes),maxCalls:Number(values.maxCalls)})});else await act('inputs',{data:JSON.parse(values.data)},f.dataset.goal);await refresh();toast('已保存');}catch(error){f.querySelector('.form-error').textContent=error.message;}finally{b.disabled=false;}});
 document.addEventListener('click',async e=>{const start=e.target.closest('[data-product-demo]');if(start){start.disabled=true;try{const g=await api('goals',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({executionMode:'flow',requestId:globalThis.crypto?.randomUUID?.()||'product-demo-'+Date.now(),text:'为一款银色台盆水龙头制作商品主图和详情图。概念设计：圆柱形主体、短弯出水嘴、单杆把手，白灰背景和少量蓝色点缀；主图突出商品，详情图片模块展示外观细节和台盆搭配。全渠道通用，明确标注概念图，不添加未经确认的材质、尺寸、性能、认证、售价或保修声明。'})});receive(g);openGoal(g.id);}catch(error){toast(error.message);}finally{start.disabled=false;}return;}const b=e.target.closest('[data-flow-replan],[data-flow-retry],[data-flow-save],[data-flow-template]');if(!b)return;b.disabled=true;try{if(b.dataset.flowTemplate){const t=state.flows.templates.find(t=>t.id===b.dataset.flowTemplate);openCreate('按“'+t.name+'”的方法，完成：');return;}const id=b.dataset.flowReplan||b.dataset.flowSave||b.dataset.goal;if(b.dataset.previousImage&&!window.confirm('将重新提交一次生图，可能产生用量。已有选品结果会保留。确认继续？'))return;if(b.dataset.flowSave){await api(`flows/goals/${id}/template`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedVersion:state.goals.find(g=>g.id===id).version})});await refresh();toast('已沉淀为可复用任务流');}else await act(b.dataset.flowReplan?'replan':'retry',b.dataset.flowRetry?{nodeId:b.dataset.flowRetry,previousImageJob:b.dataset.previousImage,confirmUnknown:!!b.dataset.previousImage}:{},id);}catch(error){toast(error.message);}finally{b.disabled=false;}});
 return {panel,page,discussion,remakeAction,context,facts,showcase,label,nodeIssue};
}
