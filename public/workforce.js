export function createWorkforceUI({imagesUI,setupUI,contentUI,businessUI,knowledgeUI,sourcesUI,state,api,esc,badge,toast,refresh,render,openRun,navigate,legacyPage}){
 const $=s=>document.querySelector(s),post=(route,data)=>api(route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data||{})});
 let roleFilter='',statusFilter='',query='',editing=null,editingModel=null;
 const data=()=>state.workforce||{employees:[],roles:[],capabilities:[],skills:[],models:[]};
 const roleName=id=>data().roles.find(r=>r.id===id)?.name||id;
 const statusName={planned:'规划中',partial:'部分实现',implemented:'已实现限定能力'};
 const head=(title,desc,button)=>`<div class="page-heading"><div><span class="eyebrow">AI WORKFORCE</span><h1>${title}</h1><p>${desc}</p></div>${button||''}</div>`;
 const metric=(label,value)=>`<div><strong>${value}</strong><span>${label}</span></div>`;
 function bridgeCard(m){
  if(!m.bridge)return '';
  const env=m.bridge;
  if(env.host==='静态预览')return '<p class="note">真实模型测试需要打开服务端工作台。</p>';
  const connected=m.lastTest?.status==='succeeded'&&env.enabled&&env.sdkInstalled;
  return `<div class="bridge-check"><strong>${esc(env.host)}环境检查</strong><ul><li>官方 SDK · ${env.sdkInstalled?'已安装':'待安装'}</li><li>桥接开关 · ${env.enabled?'已启用':'待启用'}</li><li>账号调用 · ${connected?'上次测试成功':m.lastTest?.status==='failed'?'上次测试失败':'待测试'}</li></ul><details ${connected?'':'open'}><summary>连接当前服务端</summary><p>在运行工作台的同一个终端操作。Codespaces 请将 3000 端口设为 Private。</p><ol><li>安装项目依赖 <code>npm run setup:codex</code></li><li>检查登录 <code>npx --no-install codex login status</code>。需要登录时执行 <code>npx --no-install codex login --device-auth</code>，按终端提示完成授权。</li><li>停止旧服务，在 Bash 中执行 <code>ENABLE_CODEX_LOCAL=1 npm start</code>，刷新此页并测试连接。</li></ol></details></div>`;
 }
 let directorySection='staff',employeeSearch='',employeeFilter='all';

 function employeeMode(e){
  if(e.mode==='flow')return '任务流岗位';
  if(e.mode==='model')return '模型驱动';
  return (e.skillIds||[]).some(id=>id.startsWith('external_'))?'外部能力编排':'本地代码';
 }
 function employeeSkills(e){
  if(e.mode==='flow')return (e.skillIds||[]).map(id=>state.flows?.capabilities?.find(c=>c.id===id)||{id,name:id});
  return (e.skillIds||[]).map(id=>data().skills.find(s=>s.id===id)||{id,name:id});
 }
 function employeeWork(e){
  return state.goals.filter(g=>g.assignedEmployeeId===e.id||(g.members||[]).includes(e.id)||(g.tasks||[]).some(t=>t.owner===e.id)||(g.artifacts||[]).some(a=>a.agent===e.id));
 }
 function employeeOutputs(e,goals,runs){
  return goals.flatMap(g=>(g.artifacts||[]).slice().reverse().filter(a=>(e.mode==='flow'&&g.assignedEmployeeId===e.id)||a.agent===e.id).map(a=>({g,a,at:runs.get(a.runId)||a.createdAt||g.createdAt||''}))).sort((x,y)=>y.at.localeCompare(x.at));
 }
 function employeeLink(e,tab='work'){
  return '#employees/'+encodeURIComponent(e.id)+(tab==='work'?'':'/'+tab);
 }
 function employeeAssignment(e){
  return '<button class="primary emp-assign" data-employee-goal="'+esc(e.id)+'" '+(e.readiness?.ready?'':'disabled')+'>交办任务</button>';
 }
 function employeeMark(e){
  const paths={selection:'m4 8 8-4 8 4-8 4-8-4Zm0 0v8l8 4 8-4V8m-8 4v8',creative:'M3.5 5.5h17v13h-17z M5 16l4-4 4 3 3-4 4 5 M8 9h.1',profit:'M3 19h18 M5 15l4-4 4 2 6-8 M16 5h3v3',coordination:'M9 3h6v5H9z M3 16h6v5H3z M15 16h6v5h-6z M12 8v4H6v4 M12 12h6v4',default:'M4 5h16v15H4z M8 9h8 M8 13h6 M8 16h4'};
  return '<span class="emp-mark '+(e.roleId==='creative'?'emp-violet':'')+'" aria-hidden="true"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="'+(paths[e.roleId]||paths.default)+'"/></svg></span>';
 }
 function matchesEmployee(mode,search){
  return (employeeFilter==='all'||mode===employeeFilter)&&search.includes(employeeSearch.trim().toLowerCase());
 }
 function employeeSearchText(e){
  return [e.name,e.instructions,employeeMode(e),...employeeSkills(e).map(s=>s.name)].join(' ').toLowerCase();
 }
 function employeeCard(e,runs){
  const work=employeeWork(e),latest=employeeOutputs(e,work,runs)[0],search=employeeSearchText(e);
  return '<article class="staff-card" data-staff-card '+(matchesEmployee(employeeMode(e),search)?'':'hidden')+' data-staff-mode="'+esc(employeeMode(e))+'" data-staff-search="'+esc(search)+'"><div class="emp-card-line">'+employeeMark(e)+'<span class="emp-method">'+esc(employeeMode(e))+'</span></div>'+
   '<h2><a href="'+employeeLink(e)+'">'+esc(e.name)+'</a></h2><p class="emp-description">'+esc(e.instructions||employeeSkills(e).map(s=>s.name).join('、'))+'</p>'+
   (latest?'<button class="emp-latest" data-preview="'+esc(latest.a.id)+'" data-parent="'+esc(latest.g.id)+'">最近交付 · '+esc(latest.a.title)+'</button>':'')+
   (!e.readiness?.ready?'<p class="emp-muted">当前无法交办 · '+esc((e.readiness?.blockers||[]).join('、'))+'</p>':'')+
   '<div class="emp-actions">'+employeeAssignment(e)+'<a href="'+employeeLink(e)+'">查看岗位 <span aria-hidden="true">→</span></a></div></article>';
 }
 function employeeDetails(e,runs){
  const work=employeeWork(e),outputs=employeeOutputs(e,work,runs),tab=state.employeeTab||'work',skills=employeeSkills(e);
  const nav=[['work','工作'],['deliveries','交付记录'],['settings','岗位设置']].map(([key,label])=>'<a href="'+employeeLink(e,key)+'" '+(key===tab?'aria-current="page"':'')+'>'+label+'</a>').join('');
  let content;
  if(tab==='work'){
   content='<section class="emp-section"><h2>负责的任务</h2>'+(work.length?'<div class="emp-rows">'+work.map(g=>'<button data-open="'+esc(g.id)+'" data-open-tab="discussion"><span>'+esc(g.text)+'</span><span>查看任务 →</span></button>').join('')+'</div>':'<div class="emp-empty">还没有负责的任务。点「交办任务」开始第一项工作。</div>')+'</section>';
   const pack=(data().contentPacks||[]).find(p=>p.employeeId===e.id&&e.mode==='skills'&&e.readiness?.ready&&e.skillIds?.length===1&&p.skillId===e.skillIds[0]);
   if(pack)content+='<section class="emp-section"><h2>制作'+esc(pack.name)+'</h2><div class="emp-box"><p>'+esc(pack.output)+'</p><div class="emp-actions"><button class="secondary" data-content-start="'+esc(pack.id)+'">填写商品资料</button></div></div></section>';
  }else if(tab==='deliveries'){
   content='<section class="emp-section"><h2>'+ (e.mode==='flow'?'负责的任务交付':'岗位交付')+'</h2>'+(outputs.length?'<div class="emp-rows">'+outputs.map(({g,a})=>'<button data-preview="'+esc(a.id)+'" data-parent="'+esc(g.id)+'"><span><b>'+esc(a.title)+'</b><small>'+esc(g.text)+'</small></span><span>查看交付 →</span></button>').join('')+'</div>':'<div class="emp-empty">完成工作后，可在这里查看交付内容。</div>')+'</section>';
  }else{
   const model=data().models.find(m=>m.id===e.modelId);
   const settings=e.mode==='flow'?'':'<div class="emp-actions"><button class="secondary" data-employee-edit="'+esc(e.id)+'">编辑岗位</button><button class="secondary" data-employee-test="'+esc(e.id)+'" '+(e.readiness?.ready?'':'disabled')+'>试运行</button><button class="text-button" data-employee-clone="'+esc(e.id)+'">复制员工</button></div>';
   content='<section class="emp-section"><h2>执行方式</h2><div class="emp-box"><strong>'+esc(employeeMode(e))+'</strong><p>'+esc(e.mode==='flow'?'按照任务目标编排步骤，执行进展和阻塞原因在任务中展示。':e.mode==='model'?(model?.name||'待配置模型')+' · 最多 '+e.maxSteps+' 轮调用':e.readiness?.blockers?.join('、')||'按配置的顺序执行已装配的能力。')+'</p>'+settings+'</div></section>'+
    '<section class="emp-section"><h2>岗位能力</h2><div class="emp-rows">'+(skills.length?skills.map(s=>'<div><span><b>'+esc(s.name||s.id)+'</b><small>'+esc(s.description||s.scope||'')+'</small></span>'+(e.mode==='flow'||!data().skills.some(item=>item.id===s.id)?'':'<button class="text-button" data-skill-test="'+esc(s.id)+'">测试能力</button>')+'</div>').join(''):'<p class="emp-muted">尚未装配能力。</p>')+'</div></section>';
  }
  return '<div class="staff-view"><a class="emp-back" href="#employees">← 数字员工</a><div class="emp-head"><div class="emp-detail-id">'+employeeMark(e)+'<div><h1>'+esc(e.name)+'</h1><p>'+esc(employeeMode(e))+'</p></div></div>'+employeeAssignment(e)+'</div><p class="emp-intro">'+esc(e.instructions)+'</p><nav class="emp-tabs" aria-label="岗位详情">'+nav+'</nav>'+content+'</div>';
 }
 function employeesPage(){
  const d=data(),staff=[...(state.flows?.employees||[]),...d.employees];
  const runs=new Map((state.runs||[]).map(r=>[r.id,r.finishedAt||r.createdAt]));
  if(state.employeeId){
   const e=staff.find(item=>item.id===state.employeeId);
   return e?employeeDetails(e,runs):'<div class="staff-view"><h1>找不到这位员工</h1><p>当前工作空间中没有这项岗位。</p><a class="text-button" href="#employees">返回数字员工</a></div>';
  }
  const tabs=[['staff','员工目录'],['roles','岗位模板'],['recipes','业务工作包']].map(([key,label])=>'<button data-staff-section="'+key+'" aria-pressed="'+String(key===directorySection)+'">'+label+'</button>').join('');
  let body;
  if(directorySection==='roles'){
   body='<div class="staff-grid">'+d.roles.map(r=>'<article class="staff-card"><h2>'+esc(r.name)+'</h2><p>'+esc(r.responsibility)+'</p><div class="emp-actions"><button class="secondary" data-role-new="'+esc(r.id)+'">从此岗位创建</button></div></article>').join('')+'</div>';
  }else if(directorySection==='recipes'){
   body='<div class="staff-grid">'+(d.recipes||[]).map(r=>'<article class="staff-card"><h2>'+esc(r.employeeName||r.name)+'</h2><p>'+esc(r.name)+'</p><p class="emp-muted">需要 '+esc(r.input)+'</p><p>交付 '+esc(r.output)+'</p><div class="emp-actions"><button class="secondary" data-recipe="'+esc(r.id)+'">'+(r.employeeId?'使用工作包':'添加并交办')+'</button></div></article>').join('')+'</div>';
  }else{
   const methods=[...new Set(staff.map(employeeMode))];
   if(!methods.includes(employeeFilter))employeeFilter='all';
   const anyMatch=staff.some(e=>matchesEmployee(employeeMode(e),employeeSearchText(e)));
   body='<div class="emp-tools"><label>搜索员工<input type="search" id="employee-search" value="'+esc(employeeSearch)+'" placeholder="搜索员工或能力"></label><label>执行方式<select id="employee-filter"><option value="all">全部方式</option>'+methods.map(method=>'<option '+(method===employeeFilter?'selected':'')+'>'+esc(method)+'</option>').join('')+'</select></label></div><div class="staff-grid">'+staff.map(e=>employeeCard(e,runs)).join('')+'</div><p class="emp-empty" id="employee-empty" '+(anyMatch?'hidden':'')+'>没有匹配的员工，请调整搜索或筛选。</p>';
  }
  return '<div class="staff-view"><div class="emp-head"><div><h1>数字员工</h1><p>按专长交办任务，查看每位员工负责的工作和交付。</p></div><button class="primary" data-employee-new>＋ 创建员工</button></div><nav class="emp-tabs" aria-label="数字员工目录">'+tabs+'</nav>'+body+'</div>';
 }
 function filterEmployeeCards(){
  const area=$('.staff-grid'),empty=$('#employee-empty');
  if(!area||!empty)return;
  let hits=0;
  for(const card of area.querySelectorAll('[data-staff-card]')){
   const visible=matchesEmployee(card.dataset.staffMode,card.dataset.staffSearch);
   card.hidden=!visible;if(visible)hits++;
  }
  empty.hidden=hits>0;
 }
 document.addEventListener('input',event=>{
  if(event.target.id==='employee-search'){employeeSearch=event.target.value;filterEmployeeCards();}
 });
 document.addEventListener('change',event=>{
  if(event.target.id==='employee-filter'){employeeFilter=event.target.value;filterEmployeeCards();}
 });
 document.addEventListener('click',event=>{
  const section=event.target.closest('[data-staff-section]')?.dataset.staffSection;
  if(section){directorySection=section;render(true);filterEmployeeCards();}
 });
 function applicationsPage(){return head('工作应用','选择要完成的工作，提供资料，交给数字员工处理。')+'<div class=applications-page>'+imagesUI.card()+contentUI.page()+businessUI.page()+'</div>';}
 function knowledgePage(){return knowledgeUI.page();}
 function capabilityPage(){const d=data(),tab=state.configTab||'models';let body='';
 if(tab==='market')body=setupUI.marketPage();
 else if(tab==='images')body=imagesUI.configPage();
 else if(tab==='search')body=setupUI.searchPage();
 else if(tab==='stores')body=setupUI.storesPage();
 else if(tab==='external')body=businessUI.externalPage();
 else if(tab==='legacy')body=legacyPage();
 else if(tab==='sources')body=sourcesUI.page();
 else if(tab==='catalog'){
 const entries=d.capabilities.filter(c=>(!roleFilter||c.roleId===roleFilter)&&(!statusFilter||c.state===statusFilter)&&(!query||(c.name+c.description).includes(query)));
 body=`<div class="catalog-filters"><label>搜索能力<input id="cap-search" type="search" placeholder="如：上架、利润、库存" value="${esc(query)}"></label><label>岗位<select id="cap-role"><option value="">全部岗位</option>${d.roles.map(r=>`<option value="${r.id}" ${r.id===roleFilter?'selected':''}>${esc(r.name)}</option>`).join('')}</select></label><label>实现状态<select id="cap-status"><option value="">全部状态</option>${Object.entries(statusName).map(([v,n])=>`<option value="${v}" ${v===statusFilter?'selected':''}>${n}</option>`).join('')}</select></label></div><p class="field-hint">匹配 ${entries.length} / ${d.capabilities.length} 项 · 对应 V2.4 §3.3，未去重</p><div class="catalog-list">${entries.map(c=>`<article class="catalog-row"><div><span class="eyebrow">${esc(c.id)} · ${esc(roleName(c.roleId))}</span><h3>${esc(c.name)}</h3><p>${esc(c.description)}</p></div><div>${badge(statusName[c.state],c.state==='implemented')}<p>${esc(c.scope)}</p>${c.skillIds.map(id=>`<button class="text-button" data-skill-test="${id}">测试相关 Skill →</button>`).join('')}</div></article>`).join('')||'<div class="note">没有匹配的能力，请调整筛选。</div>'}</div>`;
 }else if(tab==='skills')body=`<div class="note">本地代码与已配置的外部能力分开标注。外部能力需要测试并核验只读性后才能执行。与方案能力的完整实现范围不同，查看目录中的限制说明。</div><div class="employee-grid">${d.skills.map(s=>`<article class="panel"><div class="artifact-top"><h2>${esc(s.name)}</h2>${badge((s.type==='external'?'外部协议 · v':'代码 · v')+s.version,true)}</div><p>${esc(s.description)}</p><p class="field-hint">输入：${esc(s.requires.join(' / '))}</p><div class="action-buttons"><button class="secondary" data-skill-test="${s.id}">输入数据并测试</button></div></article>`).join('')}</div>`;
 else body=`<div class="section-title"><div><h2>模型连接</h2><p class="field-hint">支持兼容 API，以及在个人电脑使用 ChatGPT 套餐登录的 Codex。</p></div><button class="primary" data-model-new>＋ 添加模型连接</button></div><div class="note">API 模式需要服务器密钥；本机 Codex 模式使用你在电脑上登录的 ChatGPT 套餐内 Codex 配额，不是 API 余额。两种方式都需测试后才能装配。GitHub Pages 预览不能调用模型。</div>${d.models.length?`<div class="employee-grid">${d.models.map(m=>`<article class="panel"><div class="artifact-top"><h2>${esc(m.name)}</h2>${badge(m.lastTest?.status==='succeeded'?'上次测试成功':m.lastTest?.status==='failed'?'上次测试失败':'待测试',m.lastTest?.status==='succeeded')}</div><p>${esc(m.model||'Codex默认模型')}</p><p class="field-hint">${m.provider==='codex-local'?'本机 Codex · ChatGPT 套餐':esc(m.endpoint)}</p><p class="field-hint">配置 v${m.revision} · ${m.provider==='codex-local'?'本机桥接':'密钥'}${m.credentialConfigured?'已配置':'未配置'}</p>${bridgeCard(m)}<div class="action-buttons"><button class="secondary" data-model-edit="${m.id}">编辑连接</button><button class="primary" data-model-test="${m.id}">测试连接</button></div></article>`).join('')}</div>`:'<div class="empty-state"><h2>还没有模型连接</h2><p>先添加连接，再选择员工的“模型驱动”模式。</p></div>'}`;
 const sections=[['models','模型连接'],['images','图片生成'],['search','网络搜索'],['skills','Skill 配置'],['external','外部 Agent'],['market','跨平台连接器'],['stores','店铺连接'],['sources','供应商接入'],['catalog','建设进度'],['legacy','旧版适配器']];
 const previous=$('.config-section-nav');
 const sameTab=previous?.dataset.active===tab&&previous.dataset.positioned==='true';
 const left=previous?.scrollLeft||0;
 const focused=previous?.contains(document.activeElement);
 requestAnimationFrame(()=>{
  const nav=$('.config-section-nav');
  if(!nav||nav.dataset.active!==tab)return;
  nav.dataset.positioned='true';
  const button=nav.querySelector('[aria-pressed=true]');
  if(focused)button.focus({preventScroll:true});
  if(sameTab){nav.scrollLeft=left;return;}
  const bounds=nav.getBoundingClientRect(),item=button.getBoundingClientRect();
  if(item.right>bounds.right)nav.scrollLeft+=item.right-bounds.right+8;
  else if(item.left<bounds.left)nav.scrollLeft+=item.left-bounds.left-8;
 });
 const progress=tab==='catalog'?`<div class="note">查看能力的实现进度，或前往 <button class="text-button" data-view="flows">任务流 →</button></div><div class="workforce-metrics">${metric('规划能力条目',d.capabilities.length)}${metric('限定能力已实现',d.capabilities.filter(c=>c.state==='implemented').length)}${metric('部分实现',d.capabilities.filter(c=>c.state==='partial').length)}${metric('仍在规划',d.capabilities.filter(c=>c.state==='planned').length)}</div>`:'';
 return head('AI基础能力配置','配置模型、执行工具与业务数据连接。')+`<div class="config-sections"><nav class="config-section-nav" data-active="${esc(tab)}" aria-label="AI基础能力配置分类">${sections.map(([id,name])=>`<button type="button" data-cap-tab="${id}" aria-pressed="${tab===id}">${name}</button>`).join('')}</nav><div class="settings-body">${progress}${body}</div></div>`;


 }
 function memberOptions(kind,only){return data().employees.map(e=>`<label class="agent-option"><input type="checkbox" name="agents" value="${e.id}" ${e.readiness.ready?'':'disabled'} ${(only?e.id===only:kind==='analysis'?['profit','analysis','coordination'].includes(e.roleId):['employee-merchandise','employee-creative','employee-profit','employee-coordination'].includes(e.id))&&e.readiness.ready?'checked':''}><span>${esc(e.name)}<small>${esc(e.readiness.label)}${e.readiness.blockers.length?' · '+e.readiness.blockers.map(esc).join('；'):''}</small></span></label>`).join('');}
 function mount(){document.body.insertAdjacentHTML('beforeend',`
 <dialog id="employee-dialog" aria-labelledby="employee-title"><form id="employee-form"><div class="dialog-head"><div><span class="eyebrow">EMPLOYEE BUILDER</span><h2 id="employee-title">创建数字员工</h2></div><button type="button" class="icon-btn" data-close-workforce="employee-dialog" aria-label="关闭员工配置">×</button></div><div class="data-fields"><label>员工名称<input id="employee-name" required maxlength="80"></label><label>岗位模板<select id="employee-role">${data().roles.map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select></label></div><label>职责与工作要求<textarea id="employee-instructions" rows="3" maxlength="4000"></textarea></label><div class="data-fields"><label>执行方式<select id="employee-mode"><option value="model">模型驱动 · 自主选择已装配 Skill</option><option value="skills">顺序执行 · 代码 / 外部能力</option></select></label><label>模型连接<select id="employee-model"><option value="">尚未选择模型</option></select></label></div><p id="employee-mode-hint" class="field-hint"></p><fieldset><legend>装配已实现 Skill</legend><div class="skill-options">${data().skills.map(s=>`<label><input type="checkbox" name="employee-skills" value="${s.id}"><span><strong>${esc(s.name)}</strong><small>${esc(s.description)}</small></span></label>`).join('')}</div></fieldset><div class="data-fields"><label>模型循环上限<input id="employee-steps" type="number" min="1" max="8" required></label><label class="confirm-check"><input id="employee-enabled" type="checkbox">启用该员工</label></div><p id="employee-error" role="alert"></p><div class="dialog-footer"><span>未配置模型或没有 Skill 时，可保存但无法开始任务</span><button class="primary" type="submit">保存员工</button></div></form></dialog>
 <dialog id="model-dialog" aria-labelledby="model-title"><form id="model-form"><div class="dialog-head"><h2 id="model-title">模型连接</h2><button type="button" class="icon-btn" data-close-workforce="model-dialog" aria-label="关闭模型连接">×</button></div><label>接入方式<select id="model-provider"><option value="codex-local">本机 Codex · ChatGPT Plus / Pro 套餐</option><option value="api">OpenAI 兼容 API · 独立 API 额度</option></select></label><p id="model-provider-hint" class="field-hint"></p><label>连接名称<input id="model-name" required maxlength="80" placeholder="例如：团队通用模型"></label><label>模型标识<input id="model-id" required maxlength="120" placeholder="供应商提供的模型 ID"></label><label>完整 Chat Completions 地址<input id="model-endpoint" type="url" required placeholder="https://供应商域名/v1/chat/completions"></label><label>服务器密钥环境变量名<input id="model-secret" required pattern="MODEL_SECRET_[A-Z0-9_]+" placeholder="MODEL_SECRET_PRIMARY"></label><p id="model-api-note" class="field-hint">不要填写密钥值。管理员在服务器环境中设置同名变量，并将域名加入 AGENT_ALLOWED_HOSTS。</p><label>调用超时（毫秒）<input id="model-timeout" type="number" min="1000" max="60000" required value="30000"></label><p id="model-error" role="alert"></p><div class="dialog-footer"><span>修改连接后必须重新测试</span><button class="primary" type="submit">保存连接</button></div></form></dialog>
 <dialog id="skill-dialog" aria-labelledby="skill-title"><div class="dialog-head"><h2 id="skill-title">Skill 测试</h2><button class="icon-btn" data-close-workforce="skill-dialog" aria-label="关闭Skill测试">×</button></div><p class="field-hint">下方为虚构测试输入，可修改后运行。缺少字段时会返回待补充项。</p><label>测试输入（JSON）<textarea id="skill-input" rows="12" class="code-input"></textarea></label><p id="skill-error" role="alert"></p><div class="dialog-footer"><span>只读计算，不执行业务写入</span><button class="primary" id="skill-run">运行并查看记录</button></div></dialog>`);}
 function modeHint(){const model=$('#employee-mode').value==='model';$('#employee-model').disabled=!model;$('#employee-steps').disabled=!model;$('#employee-mode-hint').textContent=model?'使用真实模型选择Skill并依据结果生成说明；缺连接或测试未通过时阻止运行。':'按装配列表顺序执行代码与外部能力；本平台不做模型规划，外部服务可能调用模型。';}
 function openEmployee(item,roleId,clone=false){
 const role=data().roles.find(r=>r.id===(roleId||item?.roleId))||data().roles[2];editing=clone?null:item;
 $('#employee-title').textContent=item&&!clone?'配置数字员工':'创建数字员工';$('#employee-name').value=item?item.name+(clone?' · 副本':''):role.name;$('#employee-role').value=role.id;$('#employee-instructions').value=item?.instructions||role.responsibility;$('#employee-mode').value=item?.mode||'skills';$('#employee-steps').value=item?.maxSteps||5;$('#employee-enabled').checked=item?.enabled??true;
 $('#employee-model').innerHTML='<option value="">尚未选择模型</option>'+data().models.map(m=>`<option value="${m.id}">${esc(m.name)} · ${m.lastTest?.status==='succeeded'?'已测试':'待测试'}</option>`).join('');$('#employee-model').value=item?.modelId||'';
 $('#employee-dialog .skill-options').innerHTML=data().skills.map(s=>`<label><input type="checkbox" name="employee-skills" value="${s.id}"><span><strong>${esc(s.name)}${s.type==='external'?' · 外部':''}</strong><small>${esc(s.description)}${s.blockers?.length?' · '+s.blockers.map(esc).join('；'):''}</small></span></label>`).join('');
 const ids=item?.skillIds||role.defaultSkillIds||[];document.querySelectorAll('[name=employee-skills]').forEach(c=>c.checked=ids.includes(c.value));$('#employee-error').textContent='';modeHint();$('#employee-dialog').showModal();
 }
 function openModel(item){editingModel=item;$('#model-provider').value=item?.provider||'codex-local';for(const [key,value]of Object.entries({name:item?.name||'',id:item?.model||'',endpoint:item?.endpoint||'',secret:item?.secretEnv||'MODEL_SECRET_PRIMARY',timeout:item?.timeoutMs||120000}))$('#model-'+key).value=value;$('#model-error').textContent='';modelProviderHint();$('#model-dialog').showModal();}
 function modelProviderHint(){const local=$('#model-provider').value==='codex-local';for(const id of ['model-endpoint','model-secret']){$('#'+id).required=!local;$('#'+id).disabled=local;$('#'+id).closest('label').hidden=local;}$('#model-api-note').hidden=local;$('#model-id').required=!local;$('#model-id').placeholder=local?'可留空，使用本机 Codex 默认模型':'供应商提供的模型 ID';$('#model-timeout').max=local?'300000':'60000';if(!local&&Number($('#model-timeout').value)>60000)$('#model-timeout').value='30000';$('#model-provider-hint').textContent=local?'在运行工作台的机器上安装 Codex SDK、登录 ChatGPT 并启用桥接。保存后可查看服务端环境检查与登录命令。':'此方式使用独立 API 额度；ChatGPT Plus / Pro 订阅不能当作 API Key。';}
 let skillId;
 async function initialize(){if($('#employee-dialog'))return;mount();$('#employee-mode').onchange=modeHint;$('#model-provider').onchange=modelProviderHint;
 $('#employee-role').onchange=()=>{const role=data().roles.find(r=>r.id===$('#employee-role').value);$('#employee-instructions').value=role.responsibility;document.querySelectorAll('[name=employee-skills]').forEach(c=>c.checked=role.defaultSkillIds.includes(c.value));};
 $('#employee-form').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{await api('employees'+(editing?'/'+editing.id:''),{method:editing?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:editing?.revision,name:$('#employee-name').value,roleId:$('#employee-role').value,instructions:$('#employee-instructions').value,mode:$('#employee-mode').value,modelId:$('#employee-model').value||null,skillIds:[...document.querySelectorAll('[name=employee-skills]:checked')].map(c=>c.value),enabled:$('#employee-enabled').checked,maxSteps:Number($('#employee-steps').value)})});$('#employee-dialog').close();await refresh();toast('员工配置已保存；就绪状态取决于模型和能力');}catch(err){$('#employee-error').textContent=err.message;}finally{b.disabled=false;}};
 $('#model-form').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{await api('models'+(editingModel?'/'+editingModel.id:''),{method:editingModel?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:editingModel?.revision,provider:$('#model-provider').value,name:$('#model-name').value,model:$('#model-id').value,endpoint:$('#model-endpoint').value,secretEnv:$('#model-secret').value,timeoutMs:Number($('#model-timeout').value)})});$('#model-dialog').close();await refresh();toast('连接已保存，请测试当前配置');}catch(err){$('#model-error').textContent=err.message;}finally{b.disabled=false;}};
 $('#skill-run').onclick=async()=>{const b=$('#skill-run');b.disabled=true;try{let input;try{input=JSON.parse($('#skill-input').value);}catch{throw new Error('请输入有效JSON');}const r=await post(`skills/${skillId}/test`,{input});$('#skill-dialog').close();await refresh();await openRun(r.id);}catch(err){$('#skill-error').textContent=err.message;}finally{b.disabled=false;}};
 }
 document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;try{
 if(b.dataset.closeWorkforce)$('#'+b.dataset.closeWorkforce).close();
 if(b.hasAttribute('data-employee-new')){await initialize();openEmployee(null);}
 if(b.dataset.roleNew){await initialize();openEmployee(null,b.dataset.roleNew);}
 if(b.dataset.employeeEdit||b.dataset.employeeClone){await initialize();openEmployee(data().employees.find(x=>x.id===(b.dataset.employeeEdit||b.dataset.employeeClone)),null,!!b.dataset.employeeClone);}
 if(b.dataset.capTab)navigate('ai-config/'+b.dataset.capTab);
 if(b.hasAttribute('data-model-new')||b.dataset.modelEdit){await initialize();openModel(data().models.find(m=>m.id===b.dataset.modelEdit));}
 if(b.dataset.skillTest){await initialize();skillId=b.dataset.skillTest;const s=data().skills.find(s=>s.id===skillId);$('#skill-title').textContent=s.name+' · 测试';$('#skill-input').value=JSON.stringify(s.sample,null,2);$('#skill-error').textContent='';$('#skill-dialog').showModal();}
 if(b.dataset.employeeTest||b.dataset.modelTest){b.disabled=true;try{const route=b.dataset.employeeTest?'employees/'+b.dataset.employeeTest:'models/'+b.dataset.modelTest;const r=await post(route+'/test');await refresh();await openRun(r.id);}finally{b.disabled=false;}}
 }catch(err){toast(err.message);}});
 document.addEventListener('change',e=>{if(e.target.id==='cap-role'){roleFilter=e.target.value;render(true);}if(e.target.id==='cap-status'){statusFilter=e.target.value;render(true);}});
 document.addEventListener('input',e=>{if(e.target.id==='cap-search'){query=e.target.value;render(true);const n=$('#cap-search');n.focus();}});
 function businessFacts(g,base){
  const ids=new Set(g.executionPlan?.source==='auto-match'?g.executionPlan.steps.flatMap(s=>s.skillIds):[...new Set([...g.members,...(g.participants||[])])].flatMap(id=>data().employees.find(e=>e.id===id)?.skillIds||[])),extra=g.skillData||{};
  const candidates=ids.has('product.compare')||ids.has('selection.score'),costs=ids.has('price.break_even'),stock=ids.has('inventory.coverage');
  const basic=[...ids].some(id=>['product.validate','product.draft','content.outline','finance.calculate'].includes(id));
  if(!candidates&&!costs&&!stock)return basic||[...ids].some(id=>data().externals?.some(s=>s.id===id&&s.inputFields.some(k=>['facts','financials','proposal'].includes(k))))?base:'';
  const locked=g.paused||!['plan','draft'].includes(g.stage);
  const f=(name,label,value,type='number')=>`<label>${label}<input name="${name}" value="${esc(value??'')}" ${type==='number'?'type="number" min="0" step="any"':'type="text" maxlength="500"'}></label>`;
  let fields='';
  if(candidates){fields+='<h3>候选商品资料</h3><p class="field-hint">填写两项候选；评分均为0–100且越高越好。比较能力不会自动联网查询竞品。</p>';for(let i=0;i<2;i++){const c=extra.candidates?.[i]||{};fields+=`<fieldset><legend>候选 ${i+1}</legend><div class="data-fields">${f(`c${i}.sku`,'SKU',c.sku,'text')}${f(`c${i}.material`,'材质',c.material,'text')}${f(`c${i}.connector`,'接口 / 规格',c.connector,'text')}${f(`c${i}.price`,'售价（元）',c.price)}${f(`c${i}.source`,'资料来源',c.source,'text')}${ids.has('selection.score')?[['demand','需求评分'],['competition','竞争优势评分'],['profit','利润评分'],['supply','供货评分'],['risk','风险可控性评分']].map(([k,n])=>f(`c${i}.score.${k}`,n,c.scores?.[k])).join(''):''}</div></fieldset>`;}}
  if(costs){const c=extra.unitCosts||{};fields+=`<h3>单件成本与费率</h3><div class="data-fields">${[['goods','采购成本（元/件）'],['fulfillment','履约成本（元/件）'],['ads','广告成本（元/件）'],['returns','额外售后成本（元/件）'],['other','其他成本（元/件）'],['feeRate','平台费率（%）']].map(([k,n])=>f('cost.'+k,n,c[k])).join('')}${f('cost.source','费用依据',c.source,'text')}</div>`;}
  if(stock){const c=extra.inventory||{};fields+=`<h3>库存覆盖资料</h3><div class="data-fields">${[['stock','可售库存（件）'],['dailySales','日均销量（件）'],['leadDays','供货周期（天）'],['safetyDays','安全余量（天）']].map(([k,n])=>f('stock.'+k,n,c[k])).join('')}${f('stock.source','数据来源',c.source,'text')}</div>`;}
  return `<div class="tab-scroll">${basic?`<details><summary>商品 / 账单基础资料</summary>${base}</details>`:''}<form id="skill-data-form" data-goal="${g.id}"><p class="field-hint">按所选员工的 Skill 展示输入。未知数字请留空；保存后需重新确认计划。</p><fieldset ${locked?'disabled':''}>${fields}<button class="primary" type="submit">保存能力所需资料</button></fieldset><p id="skill-data-error" role="alert"></p></form></div>`;
 }
 document.addEventListener('submit',async e=>{
  if(e.target.id!=='skill-data-form')return;e.preventDefault();const form=e.target,b=e.submitter;b.disabled=true;
  try{
   const entries=Object.fromEntries(new FormData(form)),g=state.goals.find(g=>g.id===form.dataset.goal),context=structuredClone(g.skillData||{});
   if(Object.keys(entries).some(k=>k.startsWith('c0.')))context.candidates=[0,1].map(i=>({sku:entries[`c${i}.sku`],material:entries[`c${i}.material`],connector:entries[`c${i}.connector`],price:entries[`c${i}.price`],source:entries[`c${i}.source`],scores:Object.fromEntries(['demand','competition','profit','supply','risk'].map(k=>[k,entries[`c${i}.score.${k}`]??'']))}));
   for(const [prefix,key]of [['cost','unitCosts'],['stock','inventory']]){const values=Object.entries(entries).filter(([k])=>k.startsWith(prefix+'.'));if(values.length)context[key]=Object.fromEntries(values.map(([k,v])=>[k.slice(prefix.length+1),v]));}
   await post(`goals/${g.id}/actions`,{kind:'inputs',expectedVersion:g.version,data:context});await refresh();state.tab='tasks';render(true);toast('业务资料已保存，请确认新版本计划');
  }catch(err){$('#skill-data-error').textContent=err.message;}finally{b.disabled=false;}
 });

 return {employeesPage,filterEmployeeCards,applicationsPage,knowledgePage,capabilityPage,memberOptions,businessFacts};
}
