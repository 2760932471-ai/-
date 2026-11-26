import {createSkillLibrary} from './skill-library.js';

export function createWorkforceUI({imagesUI,setupUI,contentUI,businessUI,knowledgeUI,sourcesUI,state,api,esc,badge,toast,refresh,render,openRun,navigate,assignEmployee,legacyPage}){
 const skillLibrary=createSkillLibrary({state,api,esc});
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
 let directorySection='staff',employeeSearch='',employeeFilter='all',employeeRole='all';
 let roleDesign=null;
 const roleFields=[
  ['position','岗位定位',120],['audience','服务对象',300],['responsibilities','工作安排',1600],
  ['deliverable','交付要求',600],['boundaries','职责边界',800]
 ];

 function employeeMode(e){
  if(e.mode==='flow')return '任务流岗位';
  if(e.mode==='model')return '模型驱动';
  return (e.skillIds||[]).some(id=>id.startsWith('external_'))?'外部能力编排':'本地代码';
 }
 function employeeSkills(e){
  if(e.mode==='flow')return (e.skillIds||[]).map(id=>state.flows?.capabilities?.find(c=>c.id===id)||{id,name:id});
  return (e.skillIds||[]).map(id=>data().skills.find(s=>s.id===id)||{id,name:id});
 }
 function profileLabel(group,id){
  return data().profileOptions?.[group]?.find(option=>option.id===id)?.name||'';
 }
 function workStyle(e){
  const profile=e.profile||{};
  return [
   profile.tone&&profile.tone!=='standard'?profileLabel('tones',profile.tone):'',
   profile.channel&&profile.channel!=='general'?profileLabel('channels',profile.channel):''
  ].filter(Boolean).join(' · ');
 }
 function profileDetail(e){
  if(!e.profile)return '';
  const {tone,channel,persona,strategy}=e.profile;
  const rows=[...roleFields.map(([key,label])=>[label,e.profile[key]]),
   ['沟通风格',tone!=='standard'&&profileLabel('tones',tone)],['运营平台',channel!=='general'&&profileLabel('channels',channel)],
   ['人设说明',persona],['工作策略',strategy]
  ].filter(([,value])=>value);
  if(!rows.length)rows.push(['已装配技能',employeeSkills(e).map(s=>s.name).join('、')||'尚未装配']);
  return '<section class="emp-section"><div class="emp-section-head"><h2>岗位安排</h2>'+
   (e.mode==='flow'?'':'<button class="text-button" data-employee-edit="'+esc(e.id)+'">编辑岗位安排</button>')+
   '</div><dl class="emp-profile">'+rows.map(([label,value])=>'<div><dt>'+esc(label)+'</dt><dd>'+esc(value)+'</dd></div>').join('')+'</dl></section>';
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
  const paths={supply:'M3 8l9-5 9 5-9 5-9-5Zm0 0v9l9 5 9-5V8m-9 5v9m-5-17 9 5',service:'M3.5 12a8.5 8.5 0 0 1 17 0v2 M3.5 12h3.8v6H5a1.5 1.5 0 0 1-1.5-1.5V12Zm17 0h-3.8v6h2.2 M20.5 16.5v1.2a3.3 3.3 0 0 1-3.3 3.3h-4',growth:'M3.5 19.5h17 M6 16v-4 M11 16v-7 M16 16v-5 M4.5 8l5-3 4 1.5L20 3',selection:'m4 8 8-4 8 4-8 4-8-4Zm0 0v8l8 4 8-4V8m-8 4v8',creative:'M3.5 5.5h17v13h-17z M5 16l4-4 4 3 3-4 4 5 M8 9h.1',profit:'M3 19h18 M5 15l4-4 4 2 6-8 M16 5h3v3',coordination:'M9 3h6v5H9z M3 16h6v5H3z M15 16h6v5h-6z M12 8v4H6v4 M12 12h6v4',default:'M4 5h16v15H4z M8 9h8 M8 13h6 M8 16h4'};
  return '<span class="emp-mark '+(e.roleId==='creative'?'emp-violet':'')+'" aria-hidden="true"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="'+(paths[e.roleId]||paths.default)+'"/></svg></span>';
 }
 function matchesEmployee(mode,role,search){
  return (employeeFilter==='all'||mode===employeeFilter)&&(employeeRole==='all'||role===employeeRole)&&search.includes(employeeSearch.trim().toLowerCase());
 }
 function employeeSearchText(e){
  return [e.name,roleName(e.roleId),e.instructions,employeeMode(e),workStyle(e),...roleFields.map(([key])=>e.profile?.[key]),e.profile?.persona,e.profile?.strategy,...employeeSkills(e).map(s=>s.name)].join(' ').toLowerCase();
 }
 function employeeCard(e,runs){
  const work=employeeWork(e),latest=employeeOutputs(e,work,runs)[0],search=employeeSearchText(e);
  const style=workStyle(e),profile=e.profile||{};
  const summary=profile.responsibilities||profile.position;
  return '<article class="staff-card" data-staff-card '+(matchesEmployee(employeeMode(e),e.roleId,search)?'':'hidden')+' data-staff-mode="'+esc(employeeMode(e))+'" data-staff-role="'+esc(e.roleId)+'" data-staff-search="'+esc(search)+'"><div class="emp-card-line">'+employeeMark(e)+'<span class="emp-method">'+esc(employeeMode(e))+'</span></div>'+
   '<h2><a href="'+employeeLink(e)+'">'+esc(e.name)+'</a></h2>'+
   (style?'<span class="emp-style">'+esc(roleName(e.roleId).replace(/数字员工$/,''))+' · '+esc(style)+'</span>':'')+
   '<p class="emp-description">'+esc(summary||e.instructions||employeeSkills(e).map(s=>s.name).join('、'))+'</p>'+
   (latest?'<button class="emp-latest" data-preview="'+esc(latest.a.id)+'" data-parent="'+esc(latest.g.id)+'">最近交付 · '+esc(latest.a.title)+'</button>':'')+
   (!e.readiness?.ready?'<p class="emp-muted">当前无法交办 · '+esc((e.readiness?.blockers||[]).join('、'))+'</p>':'')+
   '<div class="emp-actions">'+employeeAssignment(e)+'<a href="'+employeeLink(e)+'">查看岗位 <span aria-hidden="true">→</span></a></div></article>';
 }
 function employeeDetails(e,runs){
  const work=employeeWork(e),outputs=employeeOutputs(e,work,runs),tab=state.employeeTab||'work',skills=employeeSkills(e);
  const nav=[['work','工作'],['deliveries','交付记录'],['settings','岗位设置']].map(([key,label])=>'<a href="'+employeeLink(e,key)+'" '+(key===tab?'aria-current="page"':'')+'>'+label+'</a>').join('');
  let content;
  if(tab==='work'){
   content=profileDetail(e)+'<section class="emp-section"><h2>负责的任务</h2>'+(work.length?'<div class="emp-rows">'+work.map(g=>'<button data-open="'+esc(g.id)+'" data-open-tab="discussion"><span>'+esc(g.text)+'</span><span>查看任务 →</span></button>').join('')+'</div>':'<div class="emp-empty">还没有负责的任务。点「交办任务」开始第一项工作。</div>')+'</section>';
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
  return '<div class="staff-view"><a class="emp-back" href="#employees">← 数字员工</a><div class="emp-head"><div class="emp-detail-id">'+employeeMark(e)+'<div><h1>'+esc(e.name)+'</h1><p>'+esc(employeeMode(e))+'</p></div></div>'+employeeAssignment(e)+'</div>'+(e.instructions&&e.instructions!==e.profile?.responsibilities?'<p class="emp-intro">'+esc(e.instructions)+'</p>':'')+'<nav class="emp-tabs" aria-label="岗位详情">'+nav+'</nav>'+content+'</div>';
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
   const directoryRoles=[...new Set(staff.map(e=>e.roleId))];
   if(!directoryRoles.includes(employeeRole))employeeRole='all';
   const anyMatch=staff.some(e=>matchesEmployee(employeeMode(e),e.roleId,employeeSearchText(e)));
   body='<div class="emp-tools"><label>搜索员工<input type="search" id="employee-search" value="'+esc(employeeSearch)+'" placeholder="姓名、职责或技能"></label><label>岗位<select id="staff-role-filter"><option value="all">全部岗位</option>'+directoryRoles.map(id=>'<option value="'+esc(id)+'" '+(id===employeeRole?'selected':'')+'>'+esc(roleName(id).replace(/数字员工$/,''))+'</option>').join('')+'</select></label><label>执行方式<select id="employee-filter"><option value="all">全部方式</option>'+methods.map(method=>'<option '+(method===employeeFilter?'selected':'')+'>'+esc(method)+'</option>').join('')+'</select></label></div><div class="staff-grid">'+staff.map(e=>employeeCard(e,runs)).join('')+'</div><p class="emp-empty" id="employee-empty" '+(anyMatch?'hidden':'')+'>没有匹配的员工，请调整搜索或筛选。</p>';
  }
  return '<div class="staff-view"><div class="emp-head"><div><h1>数字员工</h1><p>按岗位交办工作，也可以描述需求，创建自己的数字员工。</p></div><button class="primary" data-employee-new>＋ 创建员工</button></div><nav class="emp-tabs" aria-label="数字员工目录">'+tabs+'</nav>'+body+'</div>';
 }
 function filterEmployeeCards(){
  const area=$('.staff-grid'),empty=$('#employee-empty');
  if(!area||!empty)return;
  let hits=0;
  for(const card of area.querySelectorAll('[data-staff-card]')){
   const visible=matchesEmployee(card.dataset.staffMode,card.dataset.staffRole,card.dataset.staffSearch);
   card.hidden=!visible;if(visible)hits++;
  }
  empty.hidden=hits>0;
 }
 document.addEventListener('input',event=>{
  if(event.target.id==='employee-search'){employeeSearch=event.target.value;filterEmployeeCards();}
 });
 document.addEventListener('change',event=>{
  if(event.target.id==='staff-role-filter'){employeeRole=event.target.value;filterEmployeeCards();}
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
 }else if(tab==='skills'){
  const list=items=>items.map(s=>`<article class="panel"><div class="artifact-top"><h3>${esc(s.name)}</h3>${badge((s.type==='external'?'外部协议 · v':'代码 · v')+s.version,true)}</div><p>${esc(s.description)}</p><p class="field-hint">输入：${esc(s.requires.join(' / '))}</p><button class="secondary" data-skill-test="${esc(s.id)}">输入数据并测试</button></article>`).join('');
  const other=d.skills.filter(s=>s.type!=='external'&&!skillLibrary.includes(s.id));
  const external=d.skills.filter(s=>s.type==='external');
  body=skillLibrary.page()
   +(other.length?`<section><div class="section-title"><h2>其他内置技能</h2></div><div class="employee-grid">${list(other)}</div></section>`:'')
   +(external.length?`<section><div class="section-title"><h2>已接入的外部技能</h2></div><div class="employee-grid">${list(external)}</div></section>`:'');
 }
 else body=`<div class="section-title"><div><h2>模型连接</h2><p class="field-hint">支持兼容 API，以及在个人电脑使用 ChatGPT 套餐登录的 Codex。</p></div><button class="primary" data-model-new>＋ 添加模型连接</button></div><div class="note">API 模式需要服务器密钥；本机 Codex 模式使用你在电脑上登录的 ChatGPT 套餐内 Codex 配额，不是 API 余额。两种方式都需测试后才能装配。GitHub Pages 预览不能调用模型。</div>${d.models.length?`<div class="employee-grid">${d.models.map(m=>`<article class="panel"><div class="artifact-top"><h2>${esc(m.name)}</h2>${badge(m.lastTest?.status==='succeeded'?'上次测试成功':m.lastTest?.status==='failed'?'上次测试失败':'待测试',m.lastTest?.status==='succeeded')}</div><p>${esc(m.model||'Codex默认模型')}</p><p class="field-hint">${m.provider==='codex-local'?'本机 Codex · ChatGPT 套餐':esc(m.endpoint)}</p><p class="field-hint">配置 v${m.revision} · ${m.provider==='codex-local'?'本机桥接':'密钥'}${m.credentialConfigured?'已配置':'未配置'}</p>${bridgeCard(m)}<div class="action-buttons"><button class="secondary" data-model-edit="${m.id}">编辑连接</button><button class="primary" data-model-test="${m.id}">测试连接</button></div></article>`).join('')}</div>`:'<div class="empty-state"><h2>还没有模型连接</h2><p>先添加连接，再选择员工的“模型驱动”模式。</p></div>'}`;
 const sections=[['models','模型连接'],['images','图片生成'],['search','搜索连接'],['skills','Skill'],['external','外部 Agent'],['market','跨平台连接器'],['stores','店铺连接'],['sources','供应商接入'],['catalog','建设进度'],['legacy','旧版适配器']];
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
 <dialog id="role-brief-dialog" aria-labelledby="role-brief-title"><form id="role-brief-form">
  <div class="dialog-head"><h2 id="role-brief-title">创建数字员工</h2><button type="button" class="icon-btn" data-close-workforce="role-brief-dialog" aria-label="关闭创建员工">×</button></div>
  <label>希望这位员工负责什么？<textarea id="role-brief" required maxlength="1600" rows="4" placeholder="例如，给华东门店设一个补货专员，每周检查库存和销量，把补货清单交给区域经理。"></textarea></label>
  <label id="role-followup" hidden><span id="role-question"></span><textarea id="role-answer" rows="2" maxlength="800"></textarea></label>
  <p id="role-brief-error" class="form-error" role="alert"></p>
  <div class="dialog-footer"><button id="role-current-draft" type="button" class="text-button" hidden>查看当前草案</button><button id="role-design-submit" class="primary" type="submit">梳理岗位安排</button></div>
 </form></dialog>
 <dialog id="employee-dialog" aria-labelledby="employee-title"><form id="employee-form">
  <div class="dialog-head"><h2 id="employee-title">创建数字员工</h2><button type="button" class="icon-btn" data-close-workforce="employee-dialog" aria-label="关闭员工配置">×</button></div>
  <div class="data-fields"><label>岗位名称<input id="employee-name" required maxlength="80"></label><label>岗位方向<select id="employee-role">${data().roles.map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select></label></div>
  <div class="employee-scope-fields">${roleFields.map(([key,label,limit])=>`<label>${esc(label)}<textarea id="employee-${key}" rows="2" maxlength="${limit}"></textarea></label>`).join('')}</div>
  <p class="employee-skill-summary"><b>已选技能</b> <span id="employee-skill-summary"></span> <button type="button" class="text-button" id="employee-adjust-skills">调整</button></p>
  <p id="employee-design-gaps" class="field-hint" hidden></p>
  <details id="employee-profile-details"><summary>沟通风格与工作策略</summary>
  <div class="employee-profile-form">
   <div class="data-fields"><label>沟通风格<select id="employee-tone"></select></label><label>运营平台<select id="employee-channel"></select></label></div>
   <p class="field-hint">客服分诊按沟通风格起草回复，运营漏斗按平台给出建议。</p>
   <details id="employee-custom-profile"><summary>人设与策略说明</summary>
    <p class="field-hint">模型员工执行任务时会参考这些说明。</p>
    <label>人设说明<textarea id="employee-persona" maxlength="300" rows="2" placeholder="例如，接到售后咨询时，先向客户确认诉求。"></textarea></label>
    <label>工作策略<textarea id="employee-strategy" maxlength="800" rows="2" placeholder="例如，优先分析自然搜索带来的成交。"></textarea></label>
   </details>
  </div></details>
  <details id="employee-execution"><summary>执行方式与装配技能</summary>
   <div class="data-fields"><label>执行方式<select id="employee-mode"><option value="skills">顺序执行 · 代码 / 外部能力</option><option value="model">模型驱动 · 自主选择技能</option></select></label><label>模型连接<select id="employee-model"><option value="">尚未选择模型</option></select></label></div>
   <p id="employee-mode-hint" class="field-hint"></p><label>补充执行要求<textarea id="employee-instructions" rows="2" maxlength="4000"></textarea></label><fieldset><legend>装配技能</legend><div class="skill-options"></div></fieldset>
   <label>模型循环上限<input id="employee-steps" type="number" min="1" max="8" required></label>
  </details>
  <label class="confirm-check"><input id="employee-enabled" type="checkbox">启用该员工</label><p id="employee-error" class="form-error" role="alert"></p>
  <div class="dialog-footer"><button id="role-revise" type="button" class="text-button" hidden>修改岗位需求</button><button id="employee-save" type="submit" class="primary">保存员工</button><button id="employee-delegate" type="submit" class="primary" hidden>创建并交办</button></div></form></dialog>
 <dialog id="model-dialog" aria-labelledby="model-title"><form id="model-form"><div class="dialog-head"><h2 id="model-title">模型连接</h2><button type="button" class="icon-btn" data-close-workforce="model-dialog" aria-label="关闭模型连接">×</button></div><label>接入方式<select id="model-provider"><option value="codex-local">本机 Codex · ChatGPT Plus / Pro 套餐</option><option value="api">OpenAI 兼容 API · 独立 API 额度</option></select></label><p id="model-provider-hint" class="field-hint"></p><label>连接名称<input id="model-name" required maxlength="80" placeholder="例如：团队通用模型"></label><label>模型标识<input id="model-id" required maxlength="120" placeholder="供应商提供的模型 ID"></label><label>完整 Chat Completions 地址<input id="model-endpoint" type="url" required placeholder="https://供应商域名/v1/chat/completions"></label><label>服务器密钥环境变量名<input id="model-secret" required pattern="MODEL_SECRET_[A-Z0-9_]+" placeholder="MODEL_SECRET_PRIMARY"></label><p id="model-api-note" class="field-hint">不要填写密钥值。管理员在服务器环境中设置同名变量，并将域名加入 AGENT_ALLOWED_HOSTS。</p><label>调用超时（毫秒）<input id="model-timeout" type="number" min="1000" max="60000" required value="30000"></label><p id="model-error" role="alert"></p><div class="dialog-footer"><span>修改连接后必须重新测试</span><button class="primary" type="submit">保存连接</button></div></form></dialog>
 <dialog id="skill-dialog" aria-labelledby="skill-title"><div class="dialog-head"><h2 id="skill-title">Skill 测试</h2><button class="icon-btn" data-close-workforce="skill-dialog" aria-label="关闭Skill测试">×</button></div><p class="field-hint">下方为虚构测试输入，可修改后运行。缺少字段时会返回待补充项。</p><label>测试输入（JSON）<textarea id="skill-input" rows="12" class="code-input"></textarea></label><p id="skill-error" role="alert"></p><div class="dialog-footer"><span>只读计算，不执行业务写入</span><button class="primary" id="skill-run">运行并查看记录</button></div></dialog>`);}
 function modeHint(){const model=$('#employee-mode').value==='model';$('#employee-model').disabled=!model;$('#employee-steps').disabled=!model;$('#employee-mode-hint').textContent=model?'使用真实模型选择Skill并依据结果生成说明；缺连接或测试未通过时阻止运行。':'按装配列表顺序执行代码与外部能力；本平台不做模型规划，外部服务可能调用模型。';}
 function openRoleBrief(roleId){
  const role=data().roles.find(r=>r.id===roleId);
  roleDesign={roleId,description:role?.name.replace(/数字员工$/,'')||'',answers:{},result:null};
  $('#role-brief').value=roleDesign.description;
  showRoleBrief();
 }
 function showRoleBrief(){
  const question=roleDesign.result?.question;
  $('#role-brief-error').textContent='';
  $('#role-followup').hidden=!question;
  $('#role-answer').required=!!question;
  $('#role-answer').maxLength=roleFields.find(([key])=>key===question?.key)?.[2]||800;
  $('#role-answer').value=question?roleDesign.answers[question.key]||'':'';
  $('#role-question').textContent=question?.text||'';
  $('#role-current-draft').hidden=!roleDesign.result;
  $('#role-design-submit').textContent=question?'更新岗位安排':'梳理岗位安排';
  if(!$('#role-brief-dialog').open)$('#role-brief-dialog').showModal();
  $(question?'#role-answer':'#role-brief').focus();
 }
 function reviewRole(){
  $('#role-brief-dialog').close();
  openEmployee(roleDesign.result.employee,null,false,true);
 }
 async function requestRoleDesign(e){
  e.preventDefault();
  const session=roleDesign,button=$('#role-design-submit'),brief=$('#role-brief'),answer=$('#role-answer');
  if(!session||button.disabled)return;
  const description=brief.value.trim();
  if(!description){$('#role-brief-error').textContent='请描述这个岗位要负责的工作。';brief.focus();return;}
  const question=session.result?.question;
  if(question){
   if(!answer.value.trim()){answer.focus();return;}
   session.answers[question.key]=answer.value.trim();
  }
  session.description=description;button.disabled=true;brief.readOnly=true;answer.readOnly=true;
  try{
   const result=await post('workforce/role-design',{description,roleId:session.roleId,answers:session.answers});
   if(session!==roleDesign||!$('#role-brief-dialog').open)return;
   session.result=result;
   if(result.question)showRoleBrief();else reviewRole();
  }catch(err){$('#role-brief-error').textContent=err.message;}
  finally{button.disabled=false;brief.readOnly=false;answer.readOnly=false;}
 }
 function updateSkillSummary(){
  const ids=[...document.querySelectorAll('[name=employee-skills]:checked')].map(c=>c.value);
  $('#employee-skill-summary').textContent=ids.length?ids.map(id=>data().skills.find(s=>s.id===id)?.name||id).join('、'):'尚未装配技能';
 }
 function openEmployee(item,roleId,clone=false,proposed=false){
 const role=data().roles.find(r=>r.id===(roleId||item?.roleId))||data().roles[2];editing=clone||proposed?null:item;
 $('#employee-title').textContent=proposed?'确认岗位安排':editing?'编辑数字员工':'复制数字员工';
 $('#employee-delegate').hidden=!!editing;$('#role-revise').hidden=!proposed;
 $('#employee-save').textContent=editing?'保存修改':'创建员工';$('#employee-save').className=editing?'primary':'secondary';
 const gaps=proposed?roleDesign.result.gaps||[]:[];
 $('#employee-design-gaps').textContent=gaps.join(' ');$('#employee-design-gaps').hidden=!gaps.length;
 $('#employee-name').value=item?item.name+(clone?' · 副本':''):role.name;$('#employee-role').value=role.id;$('#employee-instructions').value=item?.instructions||role.responsibility;$('#employee-mode').value=item?.mode||'skills';$('#employee-steps').value=item?.maxSteps||5;$('#employee-enabled').checked=item?.enabled??true;
 const profile=item?.profile||{};
 for(const [key] of roleFields)$('#employee-'+key).value=profile[key]||'';
 $('#employee-profile-details').open=false;
 for(const [field,group,fallback] of [['tone','tones','standard'],['channel','channels','general']]){
  const select=$('#employee-'+field);
  select.innerHTML=(data().profileOptions?.[group]||[]).map(option=>'<option value="'+esc(option.id)+'">'+esc(option.name)+'</option>').join('');
  select.value=profile[field]||fallback;
 }
 $('#employee-persona').value=profile.persona||'';$('#employee-strategy').value=profile.strategy||'';
 $('#employee-custom-profile').open=!!(profile.persona||profile.strategy);
 $('#employee-execution').open=false;
 $('#employee-model').innerHTML='<option value="">尚未选择模型</option>'+data().models.map(m=>`<option value="${m.id}">${esc(m.name)} · ${m.lastTest?.status==='succeeded'?'已测试':'待测试'}</option>`).join('');$('#employee-model').value=item?.modelId||'';
 $('#employee-dialog .skill-options').innerHTML=data().skills.map(s=>`<label><input type="checkbox" name="employee-skills" value="${s.id}"><span><strong>${esc(s.name)}${s.type==='external'?' · 外部':''}</strong><small>${esc(s.description)}${s.blockers?.length?' · '+s.blockers.map(esc).join('；'):''}</small></span></label>`).join('');
 const ids=item?.skillIds||role.defaultSkillIds||[];document.querySelectorAll('[name=employee-skills]').forEach(c=>c.checked=ids.includes(c.value));$('#employee-error').textContent='';modeHint();updateSkillSummary();$('#employee-dialog').showModal();
 }
 function openModel(item){editingModel=item;$('#model-provider').value=item?.provider||'codex-local';for(const [key,value]of Object.entries({name:item?.name||'',id:item?.model||'',endpoint:item?.endpoint||'',secret:item?.secretEnv||'MODEL_SECRET_PRIMARY',timeout:item?.timeoutMs||120000}))$('#model-'+key).value=value;$('#model-error').textContent='';modelProviderHint();$('#model-dialog').showModal();}
 function modelProviderHint(){const local=$('#model-provider').value==='codex-local';for(const id of ['model-endpoint','model-secret']){$('#'+id).required=!local;$('#'+id).disabled=local;$('#'+id).closest('label').hidden=local;}$('#model-api-note').hidden=local;$('#model-id').required=!local;$('#model-id').placeholder=local?'可留空，使用本机 Codex 默认模型':'供应商提供的模型 ID';$('#model-timeout').max=local?'300000':'60000';if(!local&&Number($('#model-timeout').value)>60000)$('#model-timeout').value='30000';$('#model-provider-hint').textContent=local?'在运行工作台的机器上安装 Codex SDK、登录 ChatGPT 并启用桥接。保存后可查看服务端环境检查与登录命令。':'此方式使用独立 API 额度；ChatGPT Plus / Pro 订阅不能当作 API Key。';}
 let skillId;
 async function initialize(){if($('#employee-dialog'))return;mount();$('#employee-mode').onchange=modeHint;$('#model-provider').onchange=modelProviderHint;
 $('#role-brief-form').onsubmit=requestRoleDesign;
 $('#role-current-draft').onclick=reviewRole;
 $('#role-brief').oninput=()=>{
  if(roleDesign.result){
   roleDesign.result=null;roleDesign.answers={};
   $('#role-followup').hidden=true;$('#role-answer').required=false;$('#role-current-draft').hidden=true;
   $('#role-design-submit').textContent='梳理岗位安排';
  }
 };
 $('#role-revise').onclick=()=>{$('#employee-dialog').close();showRoleBrief();};
 $('#employee-role').onchange=()=>{
  const role=data().roles.find(r=>r.id===$('#employee-role').value);
  document.querySelectorAll('[name=employee-skills]').forEach(c=>c.checked=role.defaultSkillIds.includes(c.value));
  updateSkillSummary();
 };
 $('#employee-form').onchange=event=>{if(event.target.name==='employee-skills')updateSkillSummary();};
 $('#employee-adjust-skills').onclick=()=>{
  const panel=$('#employee-execution');panel.open=true;
  panel.querySelector('[name=employee-skills]')?.focus();
 };
 $('#employee-form').onsubmit=async e=>{
  e.preventDefault();
  const save=$('#employee-save'),delegate=$('#employee-delegate'),assign=e.submitter===delegate;
  if(save.disabled)return;
  save.disabled=true;delegate.disabled=true;
  try{
   const profile=Object.fromEntries([...roleFields.map(([key])=>key),'tone','channel','persona','strategy'].map(key=>[key,$('#employee-'+key).value]));
   const employee=await api('employees'+(editing?'/'+editing.id:''),{method:editing?'PUT':'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({revision:editing?.revision,name:$('#employee-name').value,roleId:$('#employee-role').value,instructions:$('#employee-instructions').value,
     profile,mode:$('#employee-mode').value,modelId:$('#employee-model').value||null,skillIds:[...document.querySelectorAll('[name=employee-skills]:checked')].map(c=>c.value),
     enabled:$('#employee-enabled').checked,maxSteps:Number($('#employee-steps').value)})});
   $('#employee-dialog').close();await refresh();
   if(!editing)navigate('employees/'+encodeURIComponent(employee.id));
   const saved=data().employees.find(item=>item.id===employee.id);
   if(assign&&saved?.enabled&&saved.readiness?.ready)assignEmployee(saved);
   else if(assign)toast('岗位已创建，暂时无法交办。'+(saved?.readiness?.blockers||[]).join('、'));
   else toast(editing?'岗位安排已保存':'岗位已创建');
  }catch(err){$('#employee-error').textContent=err.message;}
  finally{save.disabled=false;delegate.disabled=false;}
 };
 $('#model-form').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{await api('models'+(editingModel?'/'+editingModel.id:''),{method:editingModel?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:editingModel?.revision,provider:$('#model-provider').value,name:$('#model-name').value,model:$('#model-id').value,endpoint:$('#model-endpoint').value,secretEnv:$('#model-secret').value,timeoutMs:Number($('#model-timeout').value)})});$('#model-dialog').close();await refresh();toast('连接已保存，请测试当前配置');}catch(err){$('#model-error').textContent=err.message;}finally{b.disabled=false;}};
 $('#skill-run').onclick=async()=>{const b=$('#skill-run');b.disabled=true;try{let input;try{input=JSON.parse($('#skill-input').value);}catch{throw new Error('请输入有效JSON');}const r=await post(`skills/${skillId}/test`,{input});$('#skill-dialog').close();await refresh();await openRun(r.id);}catch(err){$('#skill-error').textContent=err.message;}finally{b.disabled=false;}};
 }
 document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;try{
 if(b.dataset.closeWorkforce)$('#'+b.dataset.closeWorkforce).close();
 if(b.hasAttribute('data-employee-new')){await initialize();openRoleBrief();}
 if(b.dataset.roleNew){await initialize();openRoleBrief(b.dataset.roleNew);}
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
