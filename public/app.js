import {createPickBrowser} from './pick-browser.js';
import {businessBrief,sourcingReport,sourcingIntent} from './sourcing.js';
import {createFlowsUI} from './flows.js';
import {createImagesUI} from './images.js';
import {initializeSelects} from './selects.js';
import {createSetupUI} from './setup.js';
import {createContentUI} from './content.js';
import {createDiscussionUI} from './discussion.js';
import {createPlanningUI} from './planning.js';
import {createBusinessUI} from './business.js';
import {createKnowledgeUI} from './knowledge.js';
import {createSourcesUI} from './sources.js';
import {createWorkforceUI} from './workforce.js';
const $=s=>document.querySelector(s);
$('.skip-link').addEventListener('click',event=>{event.preventDefault();$('#main').focus();});
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={search:'M10 3a7 7 0 1 0 .01 0 M15 15l6 6',chat:'M4 4h16v12H9l-5 4z',photo:'M3 4h18v16H3z M3 16l5-5 4 4 3-3 6 6 M15 8h.01',chart:'M3 3v18h18 M7 16v-4 M12 16V8 M17 16V5',arrow:'M5 12h14 M13 6l6 6-6 6',back:'M19 12H5 M11 6l-6 6 6 6',clock:'M12 3a9 9 0 1 0 .01 0 M12 7v5l3 2',grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',layers:'m12 3 10 5-10 5L2 8z M2 12l10 5 10-5 M2 16l10 5 10-5',users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M17 4a4 4 0 0 1 0 8',file:'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h6',link:'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2 M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2'};
Object.assign(paths,{
 'task-list':'M8 5H5a1.5 1.5 0 0 0-1.5 1.5v13A1.5 1.5 0 0 0 5 21h14a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 19 5h-3 M9 3h6v4H9z M7 12l1 1 2-2 M12.5 12H17 M7.5 17H9 M12.5 17H17',
 'chevron-right':'m9 5 7 7-7 7',
 'check':'m5 12 4.5 4.5L19 7',
 'plus':'M12 5v14 M5 12h14',
 'task-review':'M9 4H5a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-4 M9 2.5h6v4H9z m-.5 11 2.5 2.5 4.5-5',
 'task-hold':'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z M9.5 9v6 M14.5 9v6',
 'task-progress':'M4 15h3l3.5-7 3 9 2.5-5h4'
});
const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.file}"/></svg>`;
document.querySelectorAll('[data-icon]').forEach(e=>e.innerHTML=icon(e.dataset.icon));
const stageNames={facts:'等待资料',plan:'待确认计划',draft:'待准备草案',approval:'待我审批',ready:'待提交',submitted:'待核验',observing:'观察中',review:'待验收',completed:'已结束'};
const taskNames={completed:'已完成',pending:'待开始',active:'进行中',approval:'待审批',waiting:'等待资料',paused:'已暂停',observing:'观察中',confirmation:'待确认',acceptance:'待验收'};
const artNames={draft:'草案',accepted:'已验收',verified:'已模拟核验',superseded:'已替代'};
const viewNames={overview:'任务',employees:'数字员工',tasks:'执行明细',knowledge:'知识库','ai-config':'AI基础能力配置',runs:'运行记录',flows:'任务流',artifacts:'交付物'};
const tabNames={discussion:'讨论',tasks:'执行步骤',artifacts:'交付物',review:'复盘',facts:'资料',details:'详情'};
let state={flows:null,images:null,workspaces:[],integrations:null,knowledge:null,sources:null,workforce:null,goals:[],agents:[],runs:[],view:'overview',configTab:'models',goal:sessionStorage.getItem('selectedGoal'),tab:'discussion',filter:'all'};
let fingerprint='',drafts={},targets={},intents={},positions={},sending=new Set(),busy=false,createStep=1,preview=null,sourceGoal=null,createPermission='draft',changeEpoch=0;
sessionStorage.removeItem('platformToken');
async function api(route, options) { const res=await fetch('/api/'+route,{...options,credentials:'same-origin',headers:{'X-Workspace-ID':sessionStorage.getItem('workspaceId')||'default',...options?.headers}});const data=await res.json();if(!res.ok)throw new Error(data.error||'请求失败');return data; }
function canEnter(health){
 const locked=health.authenticationRequired&&!health.authenticated;
 if(locked&&state.agents.length){location.reload();return false;}
 $('#login-screen').hidden=!locked;document.querySelector('.shell').hidden=!!locked;
 $('#logout').hidden=!health.authenticationRequired||locked;
 if(locked){
  const hint=health.accessMode!=='account'?'服务端仍在运行旧版本，请更新并重启后端。':(location.protocol!=='https:'||!health.secureTransport)?'请通过 HTTPS 打开工作台，并核对服务端 HTTPS 代理配置。':!health.accountReady?'管理员尚未初始化。请在服务端设置初始账号密码后重启。':'';
  const first=$('#login-form').hidden;
  $('#login-hint').textContent=hint;$('#login-hint').hidden=!hint;$('#login-form').hidden=!!hint;
  if(!hint&&first)$('#login-form').elements.username.focus();
 }
 return !locked;
}
const post=(route,input)=>api(route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
const current=()=>state.goals.find(g=>g.id===state.goal);
const agentName=id=>state.workforce?.employees.find(e=>e.id===id)?.name||state.agents.find(a=>a.id===id)?.name||'数字员工';
const shortName=id=>agentName(id).replace(' Agent','');
const date=v=>new Date(v).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
const money=v=>'¥'+Number(v).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
const badge=(text,blue=false)=>`<span class="badge ${blue?'blue':''}">${esc(text)}</span>`;
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('visible');setTimeout(()=>$('#toast').classList.remove('visible'),4000);}
function heading(title,desc){return `<div class="page-heading"><div><h1>${title}</h1><p>${desc}</p></div><button class="primary" data-new>＋ 新建任务</button></div>`;}
function empty(text,desc){return `<div class="empty-state"><h2>${text}</h2><p>${desc}</p><button class="primary" data-new>新建目标 ↗</button></div>`;}
function scopeRow(label,value){return `<div class="scope-row"><span>${label}</span><strong>${esc(value)}</strong></div>`;}
function context(g){if(g.mode==='flow')return flowsUI.context(g);const done=g.tasks.filter(t=>t.status==='completed').length;return `<div class="tab-scroll task-detail-view"><section class="context-section"><div class="context-title"><h3>目标进展</h3>${badge(g.paused?'已暂停':stageNames[g.stage],true)}</div><progress class="progress-bar" value="${done}" max="${g.tasks.length||1}" aria-label="已完成任务">${done} / ${g.tasks.length}</progress><p>${done} / ${g.tasks.length} 项任务完成 · 计划 v${g.version}</p><p>当前进度代表任务步骤，不代表经营收益。</p></section><section class="context-section"><h3 class="context-heading">业务范围</h3>${scopeRow('店铺',g.scope.store)}${scopeRow('平台',g.scope.platform)}${scopeRow('SKU',g.scope.sku)}${scopeRow('执行边界',g.permission==='approval'?'发布前审批':'只准备草案')}<p>${esc(g.criterion)}</p></section><section class="context-section"><h3 class="context-heading">协作成员</h3><div class="member"><span class="avatar">你</span><div><strong>你</strong><small>目标负责人 · 审批与验收</small></div></div><div class="member"><span class="avatar">AI</span><div><strong>${esc(g.coordinator)}</strong><small>统一协调目标与任务</small></div></div>${discussionUI.people(g).map(id=>`<button class="member" data-mention="${id}"><span class="avatar">${esc(shortName(id).slice(0,1))}</span><div><strong>${esc(agentName(id))}</strong><small>${g.mode==='team'?esc(state.workforce?.employees.find(e=>e.id===id)?.readiness.label||'员工'):g.mode==='platform'?'代码 / HTTP 能力':'历史演示能力'}</small></div><span>@</span></button>`).join('')}</section><section class="context-section"><h3>运行控制</h3><p>暂停目标会阻止后续推进；已提交的动作不能撤回。群聊可继续。</p>${g.stage!=='completed'?`<button class="secondary" data-action="pause">${g.paused?'恢复目标推进':'暂停目标推进'}</button>`:'<p>目标已结束，历史成果已保留。</p>'}</section></div>`;}
let inboxFilter='all', historySearch='', historySort='updated', historyReturn=null;
const blockedStep=n=>['needs_input','failed','needs_capability'].includes(n.status);
function goalInboxState(g){
 const status=g.flow?.status||g.stage;
 if(g.stage==='completed')return {label:'已完成',group:'done',tab:'artifacts',action:'查看成果'};
 if(g.paused)return {label:'已暂停',group:'paused',tab:'tasks',action:'查看断点'};
 if(g.stage==='review')return {label:'待验收',group:'review',tab:'artifacts',action:'查看交付物'};
 if(status==='awaiting_context')return {label:'等你回复',group:'attention',tab:'discussion',action:'回复问题'};
 if(['blocked','planning_failed','approval','facts'].includes(status)||g.flow?.nodes?.some(blockedStep)||['needs_input','failed'].includes(g.runtime?.status)||(!g.flow&&g.tasks?.some(t=>['approval','waiting','confirmation'].includes(t.status))))return {label:'待处理',group:'attention',tab:'tasks',action:'去处理'};
 return {label:'进行中',group:'active',tab:'tasks',action:'查看进度'};
}
const inboxFilters=[['all','全部任务'],['attention','待处理'],['review','待验收'],['active','进行中'],['done','已完成'],['paused','已暂停']];
function historyDetail(g,status){
 if(status.group==='done'||status.group==='review')return g.artifacts?.filter(a=>a.status!=='superseded'&&a.version===g.version).at(-1)?.title||'';
 if(g.flow?.question)return g.flow.question;
 if(g.flow?.status==='planning_failed')return g.flow.error||'任务规划失败';
 const blocked=g.flow?.nodes?.find(blockedStep);
 if(blocked){
  const issue=flowsUI.nodeIssue(blocked);
  return issue&&issue!==blocked.title?blocked.title+(blocked.missing?.length?' · 待补资料：':' · ')+issue:blocked.title;
 }
 const tasks=g.tasks||[];
 const step=tasks.find(t=>['waiting','approval','confirmation','acceptance','active'].includes(t.status))||tasks.find(t=>t.status!=='completed');
 return step?.title||g.flow?.plan?.name||'';
}
function historyRow({g,status,detail}){
 const tasks=g.tasks||[];
 const done=tasks.filter(t=>t.status==='completed').length;
 const updated=g.updatedAt||g.createdAt;
 const mark=g.mode==='team'?'users':g.kind==='listing'?'photo':'task-list';
 const next=['attention','paused','active'].includes(status.group)?taskDestination(g):{tab:status.tab,label:status.action};
 return `<li><button class="inbox-row" data-open="${esc(g.id)}" data-open-tab="discussion">
  <span class="history-title"><span class="history-icon ${mark}">${icon(mark)}</span><span class="history-name"><strong>${esc(g.text)}</strong>${detail?`<small title="${esc(detail)}">${esc(detail)}</small>`:''}</span></span>
  <span class="history-state ${status.group}">${status.label}</span>
  <span class="history-progress">${tasks.length?`<progress max="${tasks.length}" value="${done}" aria-label="步骤完成进度"></progress><small>${done} / ${tasks.length} 步</small>`:'待规划'}</span>
  <time class="history-time" datetime="${esc(updated)}">${updated?date(updated):'—'}</time>
 </button><button class="history-open" data-open="${esc(g.id)}" data-open-tab="${next.tab}" data-open-focus="${next.focus||''}" data-step-id="${esc(next.node||'')}" aria-label="${esc(g.text)}：${esc(next.label)}">${esc(next.label)} ${icon('chevron-right')}</button></li>`;
}
function historyParts(){
 const rows=state.goals.map(g=>{
  const status=goalInboxState(g);
  return {g,status,detail:historyDetail(g,status)};
 });
 const filters=inboxFilters.filter(([key])=>key!=='paused'||inboxFilter===key||rows.some(r=>r.status.group===key));
 const query=historySearch.trim().toLocaleLowerCase();
 const matching=rows.filter(({g,detail})=>!query||[g.text,detail].some(v=>v.toLocaleLowerCase().includes(query)));
 const visible=matching.filter(r=>inboxFilter==='all'||r.status.group===inboxFilter).sort(({g:a},{g:b})=>{
  if(historySort==='name')return a.text.localeCompare(b.text,'zh-CN');
  if(historySort==='created')return Date.parse(b.createdAt)-Date.parse(a.createdAt);
  const difference=Date.parse(b.updatedAt||b.createdAt)-Date.parse(a.updatedAt||a.createdAt);
  return historySort==='oldest'?-difference:difference;
 });
 const filtersHTML=filters.map(([key,label])=>{
  const count=key==='all'?matching.length:matching.filter(r=>r.status.group===key).length;
  return `<button data-inbox-filter="${key}" aria-pressed="${inboxFilter===key}">${label} <span>${count}</span></button>`;
 }).join('');
 const rowsHTML=visible.length?`<div class="history-columns" aria-hidden="true"><span>任务名称</span><span>状态</span><span>执行进度</span><span>更新时间</span><span>下一步</span></div><ul class="history-rows">${visible.map(historyRow).join('')}</ul>`:`<div class="history-empty">${icon('task-list')}<h2>${query?'没有找到匹配的任务':rows.length?'没有符合此状态的任务':'还没有任务'}</h2>${query?'<button class="text-button" data-clear-search>清除搜索</button>':rows.length?'<button class="text-button" data-inbox-filter="all">查看全部任务</button>':'<p>新建任务后，可以在这里跟进执行、查看交付物。</p>'}</div>`;
 return {filtersHTML,rowsHTML};
}
function workspaceHome(){
 const {filtersHTML,rowsHTML}=historyParts();
 return `<section class="task-history" aria-labelledby="history-title">
  <header class="history-heading"><div><h1 id="history-title">任务</h1></div><button class="primary" data-new>${icon('plus')}新建任务</button></header>
  <nav class="history-filters" aria-label="按任务状态筛选">${filtersHTML}</nav>
  <div class="history-controls">
   <label class="history-search"><span aria-hidden="true">${icon('search')}</span><input type="search" id="history-search" aria-label="搜索任务或当前事项" placeholder="搜索任务或当前事项" value="${esc(historySearch)}" maxlength="200"></label>
   <div class="history-sort-field"><select id="history-sort" aria-label="任务排序">${[['updated','最近更新'],['created','最近创建'],['name','名称排序'],['oldest','最早更新']].map(([value,label])=>`<option value="${value}" ${historySort===value?'selected':''}>${label}</option>`).join('')}</select></div>
  </div>
  <div class="history-panel">${rowsHTML}</div></section>`;
}
function workspace(){
 const g=current();
 if(state.home||!g)return workspaceHome();
 const sections={discussion,tasks:goalTasks,artifacts:goalArtifacts,review:reviewView,facts:factsView,details:context};
 const status=g.paused?'已暂停':g.mode==='flow'?flowsUI.label(g.flow.status):stageNames[g.stage];
 const tabs=Object.entries(tabNames).map(([key,label])=>{
  const selected=state.tab===key;
  return `<button role="tab" id="task-tab-${key}" aria-selected="${selected}" tabindex="${selected?0:-1}" aria-controls="task-section" class="${selected?'active':''}" data-tab="${key}">${label}${key==='artifacts'&&g.artifacts.length?' '+g.artifacts.length:''}</button>`;
 }).join('');
 return `<div class="workbench"><section class="goal-space">
  <header class="goal-header"><button class="back-to-goals" data-inbox-home>${icon('back')} 返回任务列表</button>
   <div class="goal-header-top"><h2>${esc(g.text)}</h2>${badge(status,true)}</div>
   ${g.assignedEmployeeId?`<button class="text-button goal-lead" data-view="employees/${esc(encodeURIComponent(g.assignedEmployeeId))}">负责人 · ${esc(g.assignedEmployeeName)} ↗</button>`:''}
  </header>
  <div class="goal-tabs" role="tablist" aria-label="任务内容">${tabs}</div>
  <div class="goal-content" role="tabpanel" id="task-section" aria-labelledby="task-tab-${state.tab}" tabindex="0">${sections[state.tab](g)}</div>
 </section></div>`;
}
document.addEventListener('keydown',e=>{
 const tab=e.target.closest('.goal-tabs [role=tab]');
 if(!tab)return;
 const tabs=Array.from(tab.parentElement.children);
 const index=tabs.indexOf(tab);
 const next={ArrowRight:(index+1)%tabs.length,ArrowLeft:(index+tabs.length-1)%tabs.length,Home:0,End:tabs.length-1}[e.key];
 if(next===undefined)return;
 e.preventDefault();
 tabs[next].click();
});

// Discussion links describe the live task. Opening one never approves or executes a step.
function taskDestination(g){
 const tasks=g.tasks||[],completed=tasks.filter(t=>t.status==='completed').length;
 const task=tasks.find(t=>!['pending','completed'].includes(t.status))||tasks.find(t=>t.status==='pending');
 const base={title:task?.title||'执行计划',meta:tasks.length?`${completed} / ${tasks.length} 步完成`:'',tab:'tasks',focus:'action',icon:'task-list'};
 if(g.paused)return {...base,status:'已暂停',focus:'resume',label:'查看恢复选项',icon:'task-hold'};
 if(g.stage==='completed')return {...base,title:'交付已验收',tab:'review',focus:'section',label:'查看验收记录',icon:'check'};
 if(g.stage==='review')return {...base,title:'交付物已就绪',status:'待验收',tab:'review',focus:'section',label:'验收交付物',icon:'task-review'};
 if(g.mode==='flow'){
  const flow=g.flow;
  if(flow.status==='awaiting_context')return {...base,title:flow.question||'补充任务信息',status:'等待你的回复',tab:'discussion',focus:'reply',label:'回复问题'};
  const blocked=flow.nodes.find(n=>['needs_input','failed','needs_capability'].includes(n.status));
  if(blocked){
   if(blocked.question)return {...base,title:blocked.question,status:'等你回复',tab:'discussion',focus:'reply',node:blocked.id,label:'回复问题'};
   const label=flowsUI.needsResearchSources(g,blocked)?'查看缺少的资料':blocked.capability==='sourcing.1688'?'查看采集进度':blocked.capability==='product.compare'?'核对候选报价':'处理这一步';
   return {...base,title:blocked.title,status:flowsUI.label(blocked.status),focus:'intervention',node:blocked.id,label,icon:'task-hold'};
  }
  const running=flow.nodes.find(n=>['running','waiting_external'].includes(n.status));
  const next=running||flow.nodes.find(n=>n.status==='pending'&&(n.dependsOn||[]).every(id=>flow.nodes.some(step=>step.id===id&&step.status==='succeeded')));
  if(next)return {...base,title:next.title,status:flowsUI.researchProgress(next)?.label||(next.status==='pending'?'等待执行':flowsUI.label(next.status)),focus:'step',node:next.id,label:'查看步骤详情',icon:'task-progress'};
  return {...base,title:flow.plan?.name||'规划执行步骤',status:flowsUI.label(flow.status),label:flow.status==='planning_failed'?'查看规划问题':'查看执行计划'};
 }
 if(g.production&&g.production.blocked)return {...base,status:'制作受阻',label:'查看制作要求',icon:'task-hold'};
 if(g.stage==='draft'&&g.runtime?.status==='needs_input')return {...base,status:'待补资料',tab:'facts',focus:'section',label:'补充业务资料',icon:'task-hold'};
 if(g.stage==='draft'&&g.runtime?.status==='failed')return {...base,status:'执行受阻',label:'查看失败原因',icon:'task-hold'};
 if(g.stage==='plan'&&g.planProposal)return {...base,title:'分工草案待确认',status:'待确认',focus:'proposal',label:'核对分工草案'};
 if(g.stage==='plan'&&g.teamSelection==='auto'&&g.matching?.missing?.length)return {...base,title:'调整任务分工',status:'待补成员',tab:'discussion',focus:'team',label:'查看能力缺口',icon:'task-hold'};
 const labels={facts:'核对业务资料',plan:'核对执行计划',draft:'查看执行步骤',approval:'审核发布内容',ready:'核对提交内容',submitted:'核对发布回执',observing:'查看观察数据'};
 return {...base,status:stageNames[g.stage],tab:g.stage==='facts'?'facts':'tasks',focus:g.stage==='facts'?'section':'action',label:labels[g.stage]||'查看执行计划',icon:g.stage==='approval'?'task-review':'task-list'};
}
function taskLinkAttributes(next){
 return `data-tab="${next.tab}" data-task-destination="${next.focus}" ${next.node?`data-step-id="${esc(next.node)}"`:''}`;
}
function discussionTask(g){
 const next=taskDestination(g),meta=[next.meta,next.status].filter(Boolean).join(' · ');
 return `<button type="button" class="discussion-task" ${taskLinkAttributes(next)}>
  <span class="discussion-task-icon">${icon(next.icon)}</span><span class="discussion-task-body"><strong class="discussion-task-title">${esc(next.title)}</strong>${meta?`<small class="discussion-task-meta">${esc(meta)}</small>`:''}</span>
  <span class="discussion-task-link">${esc(next.label)} ${icon('chevron-right')}</span></button>`;
}
function focusTaskDestination(destination,nodeId){
 const panel=$('#task-section');
 if(!panel)return;
 const escapedId=CSS.escape(nodeId||'');
 const targets={
  action:'[data-current-task-action]',proposal:'.planning-panel',resume:'[data-action="pause"]',
  reply:'#chat-input',team:'[data-team-edit]',intervention:`[data-flow-intervention="${escapedId}"], [data-flow-node="${escapedId}"]`,
  step:`[data-flow-node="${escapedId}"]`,section:'.tab-scroll h2, .tab-scroll h3'
 };
 const target=panel.querySelector(targets[destination])||panel.querySelector('[data-current-task-action]')||panel;
 if(destination==='step'){const details=target.querySelector('details');if(details)details.open=true;}
 const enclosing=target.closest('details');
 if(enclosing)enclosing.open=true;
 if(!target.matches('button,textarea,input,[tabindex]'))target.tabIndex=-1;
 target.focus({preventScroll:true});
 target.scrollIntoView({block:'nearest'});
}
function openTaskDestination(id,tab,destination,nodeId){
 const focus=()=>{if(state.goal===id&&state.tab===tab)focusTaskDestination(destination,nodeId);};
 if(state.view==='overview'&&!state.home&&state.goal===id&&state.tab===tab){focus();return;}
 openGoal(id,tab);
 focus();
 // Reapply after the router processes the same navigation in its hashchange listener.
 window.addEventListener('hashchange',focus,{once:true});
}
function messageView(m,g){const source=g.messages.find(x=>x.id===m.replyTo);
 const report=m.reportVersion===g.version&&g.mode==='flow'?sourcingReport(g):null;
 const currentReport=report&&m.text===report.text;
 const outcome=currentReport?`<div class="chat-outcome"><small>${esc(report.verdict)}</small><h3>${esc(report.selection.title)}</h3><p>${report.candidateCount} 款候选中选出 · ${report.selection.margin==null?'单件收益待核算':'预计单件收益 ¥'+report.selection.margin.toFixed(2)}</p><button class="primary" data-tab="artifacts">查看选品报告 ${icon('arrow')}</button></div>`:'';
 return `<article class="chat-message ${m.role}${m.reportVersion?' decision-message':''}"><span class="avatar">${m.role==='human'?'你':m.role==='coordinator'?'AI':esc(m.author.slice(0,1))}</span><div class="message-body"><div class="message-meta"><strong>${esc(m.author)}</strong><span>${m.role==='human'?'人类':m.workflow==='check'?'本地能力检查':m.workflow==='handoff'?'任务接收':m.workflow==='delivery'?'实际交付':m.role==='agent'?'专业 Agent':'目标统筹'}</span><time>${date(m.at)}</time></div><div class="message-bubble">${source?`<div class="message-quote">回复：${esc(source.text.slice(0,75))}</div>`:''}${currentReport?outcome:esc(m.text)}</div>${(m.links||[]).map(l=>/^https?:\/\//.test(l.url)?`<article class="message-source"><a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.title)} ↗</a><p>${esc(l.snippet)}</p></article>`:'').join('')}${m.mentionAll?`<p class="broadcast-receipt">已通知本群 ${m.targets.length} 位员工${m.skippedTargets?.length?` · ${m.skippedTargets.length} 位暂不可用，已跳过`:""}</p>`:""}${(m.artifactIds||m.upstreamArtifactIds||[]).map(id=>{const a=g.artifacts.find(a=>a.id===id);return a?`${a.imageJobId?imagesUI.thumbnail(a.imageJobId):''}<button class="event-link" data-preview="${esc(id)}" data-parent="${g.id}">${icon('file')} ${esc(a.title)} →</button>`:'';}).join('')}${imagesUI.chatCard(m,g)}${m.derived?'':discussionUI.controls(m,g)}${m.card==='facts'?`<button type="button" class="text-button message-resource" data-tab="facts" data-task-destination="section">查看相关资料 ${icon('chevron-right')}</button>`:''}</div></article>`;}
const expandedPanels=new Set();
function collaborationPanel(g){
 if(g.production)return imagesUI.productionCard(g);
 if(g.mode!=='team'||g.stage==='completed')return '';
 const plan=g.planProposal||g.executionPlan,checks=g.planProposal?.checks||g.collaboration?.checks||[];
 const missing=[...new Set(checks.filter(c=>c.status==='missing').flatMap(c=>c.missing||[]))];
 const unmatched=g.matching?.missing||[],completed=g.runtime?.completed||[];
 const ids=g.planProposal?plan.steps.map(s=>s.employeeId):g.members;
 const people=ids.map(id=>{
  const employee=state.workforce?.employees.find(e=>e.id===id);
  const step=plan?.steps?.find(s=>s.employeeId===id)||g.collaboration?.steps?.find(s=>s.employeeId===id);
  const skills=(step?.skillIds||employee?.skillIds||[]).map(id=>state.workforce?.skills.find(s=>s.id===id)?.name).filter(Boolean);
  return {id,name:step?.employeeName||agentName(id),duty:step?.objective||skills.join('、')||employee?.instructions||'职责待确认'};
 });
 const next=people.find(p=>!completed.includes(p.id));
 const blocked=['needs_input','failed'].includes(g.runtime?.status),review=g.stage==='review',planning=g.stage==='plan';
 const teamEdit='<button class="text-button" data-team-edit>调整分工</button>';
 const facts=style=>`<button class="${style}" data-tab="facts">补充资料</button>`;
 let title='团队正在执行',tone='working',issue='',actions='';
 if(g.paused){
  title='任务已暂停';tone='paused';actions=actionButton('pause','恢复执行');
 }else if(review){
  title='员工交付情况';tone='complete';
  actions='<button class="text-button" data-tab="artifacts">查看全部交付物</button>';
 }else if(planning){
  tone='ready';
  if(unmatched.length){
   title='需要调整分工';tone='attention';issue=unmatched.join('；');
   actions='<button class="primary" data-team-edit>调整目标与成员</button>';
  }else if(g.planProposal){
   title='请审阅新的分工';actions='<button class="primary" data-tab="tasks">审阅分工草案</button>'+teamEdit;
  }else if(!g.collaboration&&!g.executionPlan){
   title='请确认团队分工';actions=actionButton('plan','确认分工并开始')+actionButton('kickoff','检查分工与资料',true)+teamEdit;
  }else{
   title='请确认团队分工';
   if(missing.length)tone='attention';
   actions=missing.length?facts('primary')+actionButton('plan','按现有资料开始',true):actionButton('plan','确认分工并开始');
   actions+=teamEdit;
  }
  if(missing.length&&!issue){issue='待补资料：'+missing.join('、');}
 }else if(blocked){
  title=g.runtime.status==='needs_input'?'需要补充资料':'执行中断';tone='attention';
  issue=g.runtime.missing?.length?g.runtime.missing.join('、'):g.runtime.error||'';
  actions=g.runtime.status==='needs_input'?facts('primary')+actionButton('retry','从这里继续',true):actionButton('retry','重试当前步骤')+facts('text-button');
 }else if(next){
  title=(g.researchRequest?'正在查找资料':next.name+'正在处理');
 }
 if(g.research&&!g.paused&&!review&&(planning||blocked))actions+=actionButton('research',g.researchRequest?'正在查找资料…':'查找可用来源',true,g.researchRequest?'disabled':'');
 const names=people.slice(0,2).map(p=>p.name.replace(/数字员工$/,'')).join('、');
 const summary=people.length?[people.length+' 位员工',names+(people.length>2?' 等':''),planning&&missing.length?missing.length+' 项资料待补':''].filter(Boolean).join(' · '):'待安排成员';
 const rows=people.map((person,i)=>{
  const current=!planning&&!review&&next?.id===person.id;
  const status=review||completed.includes(person.id)?'已交付':planning?'':current?(g.paused?'已暂停':blocked?'待处理':'当前负责'):'待交接';
  const artifact=review&&g.artifacts.find(item=>item.agent===person.id&&item.version===g.version&&item.status!=='superseded');
  const statusView=artifact?`<button class="text-button assignment-state" data-preview="${esc(artifact.id)}" data-parent="${esc(g.id)}" aria-label="预览${esc(person.name)}的${esc(artifact.title)}">预览成果</button>`:status?`<span class="assignment-state">${status}</span>`:'';
  return `<li><span class="assignment-person" aria-hidden="true">${i+1}</span><span class="assignment-duty"><strong>${esc(person.name)}</strong><small>${esc(person.duty)}</small></span>${statusView}</li>`;
 }).join('');
 const issueContent=planning&&!g.paused&&!unmatched.length&&missing.length>3
  ?`<details class="assignment-missing" data-missing-checklist="missing-${esc(g.id)}" ${expandedPanels.has('missing-'+g.id)?'open':''}><summary>待补资料 · ${missing.length} 项 ${icon('chevron-right')}</summary><ul>${missing.map(item=>`<li>${esc(item)}</li>`).join('')}</ul></details>`
  :issue?`<p class="assignment-issue">${esc(issue)}</p>`:'';
 return `<details class="collaboration-status team-assignment" data-collaboration="${esc(g.id)}" data-tone="${tone}" ${expandedPanels.has(g.id)?'open':''}><summary class="assignment-summary"><span class="assignment-mark">${icon('users')}</span><span class="assignment-heading"><strong>${esc(title)}</strong><small>${esc(summary)}</small></span><svg class="assignment-chevron" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m5 8 5 5 5-5"/></svg></summary><div class="assignment-body">${issueContent}${rows?`<ol class="assignment-list" aria-label="员工交付顺序" data-selection="${g.teamSelection==='auto'?'auto':'manual'}">${rows}</ol>`:''}${actions?`<footer class="assignment-actions">${actions}</footer>`:''}</div></details>`;
}
function discussion(g){if(g.mode==='flow')return discussionTask(g)+flowsUI.discussion(g,messageView,sourcingReport);const target=targets[g.id]||'coordinator',intent=intents[g.id]||'discuss';return `${discussionUI.toolbar(g)}${imagesUI.goalAction(g)}${discussionTask(g)}<div class="chat-area"><div class="chat-log" tabindex="0" aria-label="群聊消息记录">${g.messages.map(m=>messageView(m,g)).join('')}${collaborationPanel(g)}<div class="chat-queue" role="status">${g.repliesPaused?`AI 回复已暂停 · ${g.queue.length} 条待处理`:g.queue.length?`数字员工正在协调回复 · ${g.queue.length} 条待处理`:''}</div></div><form id="chat-form" class="chat-composer" novalidate data-goal="${g.id}">${discussionUI.composer(g)}<label class="sr-only" for="chat-input">群聊消息</label><textarea id="chat-input" rows="1" required maxlength="2000" placeholder="说点什么… 输入 @ 可选员工或所有员工" aria-describedby="chat-input-help">${esc(drafts[g.id]||'')}</textarea><div class="composer-bottom"><div class="composer-shortcuts">${discussionUI.uploadButton(g)}<button type="button" class="text-button" data-chat-choose aria-label="在消息中插入提及" title="在消息中插入 @">@</button><span>输入 @ 提及员工或所有员工</span><span class="sr-only" id="chat-input-help">Enter 发送，Shift + Enter 换行</span></div><div class="composer-send">${discussionUI.modelPicker(g)}<button class="primary" type="submit" ${sending.has(g.id)?'disabled':''}>${sending.has(g.id)?'发送中…':'发送 ↗'}</button></div></div><details class="chat-options"><summary>消息设置</summary><div class="composer-tools"><label for="chat-target">发送给</label><select id="chat-target"><option value="coordinator">数字员工协调</option>${discussionUI.people(g).map(id=>`<option value="${id}" ${target===id?'selected':''}>@${esc(shortName(id))}</option>`).join('')}</select><label class="sr-only" for="chat-intent">消息用途</label><select id="chat-intent">${[['discuss','讨论 / 提问'],['context','补充背景'],['change','请求变更']].map(([v,n])=>`<option value="${v}" ${intent===v?'selected':''}>${n}</option>`).join('')}</select><button type="button" class="text-button reply-pause" data-action="pauseReplies">${g.repliesPaused?'恢复 AI 回复':'暂停 AI 回复'}</button></div></details><p id="chat-error" role="alert"></p></form></div>`;}
function actionButton(kind,text,secondary=false,extra=''){return `<button class="${secondary?'secondary':'primary'}" data-action="${kind}" ${extra}>${text}</button>`;}
function actionCard(g){if(g.paused)return `<section class="action-card"><h3>目标推进已暂停</h3><p>讨论和查看历史不受影响；恢复后从当前检查点继续。</p><div class="action-buttons">${actionButton('pause','恢复目标推进')}</div></section>`;
 if(g.production)return imagesUI.productionCard(g);
 if(['platform','team'].includes(g.mode)&&g.stage==='draft')return platformRuntime(g);
 let title='',desc='',detail='',buttons='';
 if(g.stage==='facts'){title='先核验商品事实，再准备上新';desc='请录入并确认材质、适用规格、成本和库存。代码 Agent 将校验必需信息与配置的价差约束。';buttons='<button class="primary" data-tab="facts">查看并确认资料 →</button>';}
 if(g.stage==='plan'){title='核对执行计划';desc=g.mode==='team'?`核对下方 ${g.members.length} 位员工的分工后，即可开始执行。`:'确认后将按下方步骤执行。';buttons=actionButton('plan','确认计划',false,g.planProposal||g.matching?.missing?.length?'disabled':'')+(g.mode==='team'?'<button class="secondary" data-team-edit>调整成员</button><button class="text-button" data-tab="facts">补充业务资料</button>':'');}
 if(g.stage==='draft'){title='准备有来源的交付物';desc=g.kind==='listing'?'基于已确认样例规格生成标题、参数与售价草案。':'生成分析建议结构；未连接经营数据，不会声称已验证经营结论。';buttons=actionButton('draft','生成演示草案');}
 if(g.stage==='approval'){title=`请审批：新增商品发布 · v${g.version}`;desc='此次授权只覆盖当前版本的单次发布，不包含投放、调价或后续自动经营。';detail=publishDetails(g);buttons=actionButton('approve',g.mode==='platform'?'批准并提交此版本（模拟）':'批准此版本')+'<button class="secondary" data-reject>退回修改</button>';}
 if(g.stage==='ready'){title=`v${g.version} 已批准，尚未提交`;desc='请核对批准内容。此按钮只产生演示回执，不连接真实店铺。';detail=publishDetails(g);buttons=actionButton('execute','模拟提交发布');}
 if(g.stage==='submitted'){title=g.execution.status==='mismatch'?'回读不一致，保持待核验':'请求已提交，等待状态核验';desc=g.execution.status==='mismatch'?g.execution.error+'。重试只回读，不再次发布。':'提交成功不代表上架成功，需要比对平台 SKU、标题、售价与可售状态。';detail=`<p class="note">演示回执 ${esc(g.execution.receipt)} · ${date(g.execution.submittedAt)}</p>`;buttons=actionButton('verify',g.execution.status==='mismatch'?'重试模拟回读':'模拟核验通过')+actionButton('verify','演示回读不一致',true,'data-mismatch="true"');}
 if(g.stage==='observing'){title='核验通过，进入经营观察';desc='观察窗口为上架后7天。尚无实际经营结果；可载入虚构账单体验复盘。';buttons=actionButton('observe','载入 7 天演示观察数据');}
 if(g.stage==='review'){title=g.review?'经营复盘已准备，等待验收':'交付物已准备，等待验收';desc=g.review?'请检查观察窗口、费用口径与目标差距。演示结果不能用于证明真实经营提升。':'此目标只准备草案或建议。请查看交付内容，再决定是否结束。';buttons=`<button class="primary" data-tab="review">查看${g.review?'经营复盘':'交付验收'} →</button>`;}
 if(g.stage==='completed'){title='目标已结束，结果已保留';desc='讨论可以继续。需要新的分析或优化时，另建下一轮目标。';buttons='<button class="secondary" data-followup>创建下一轮优化目标 ↗</button>';}
 if(g.kind==='listing'&&['plan','draft','approval','ready'].includes(g.stage))buttons+='<button class="text-button" data-edit>调整发布内容</button>';
 return `<section class="action-card"><div class="action-kicker">当前事项</div><h3>${title}</h3><p>${desc}</p>${detail}<div class="action-buttons">${buttons}</div></section>`;
}
function publishDetails(g){return `<div class="inline-facts"><span>作用范围<strong>${esc(g.scope.store)} / ${esc(g.scope.sku)}</strong></span><span>变更前<strong>无平台商品（模拟新增）</strong></span><span>发布标题<strong>${esc(g.proposal.title)}</strong></span><span>售价 / 库存<strong>${money(g.proposal.price)} / ${g.facts.stock} 件</strong></span></div><p>成本 ${money(g.facts.cost)}，不含完整平台、履约与广告费用，不能作为贡献利润结论。</p><button class="text-button" data-tab="artifacts">先预览当前版本草案 →</button>`;}
function tasksRows(g,global=false){
 const tasks=g.tasks||[];
 return tasks.map((t,i)=>{
  const human=['approval','confirmation','acceptance'].includes(t.status);
  const needsAttention=human||['waiting','paused'].includes(t.status);
  if(global&&state.filter!=='all'&&!(state.filter==='attention'&&needsAttention)&&!(state.filter==='active'&&['active','observing'].includes(t.status))&&!(state.filter==='completed'&&t.status==='completed'))return '';
  const reviewStep=/^(负责人验收|验收|审批|确认(?:协作|分析|分工))/.test(t.title);
  const owner=human||reviewStep?'任务负责人':t.owner==='coordinator'?'总控':t.owner==='任务实例'?'任务流执行':t.owner?shortName(t.owner):'';
  const tag=global?'button':'li';
  const attrs=global?`data-open="${esc(g.id)}" data-open-tab="tasks"`:`data-step="${esc(t.id)}"`;
  return `<${tag} class="task-row ${esc(t.status)}" data-status="${esc(t.status)}" ${attrs}>
   <span class="task-number" aria-hidden="true">${t.status==='completed'?icon('check'):i+1}</span>
   <div class="task-text"><strong>${esc(t.title)}</strong><small>${[global?g.text:'',owner].filter(Boolean).map(esc).join(' · ')}</small></div>
   ${badge(taskNames[t.status]||t.status,needsAttention||t.status==='active')}</${tag}>`;
 }).join('');
}
const expandedPlans=new Set();
document.addEventListener('toggle',event=>{
 const id=event.target.dataset?.taskPlanning;
 if(!id||!event.target.isConnected)return;
 if(event.target.open)expandedPlans.add(id);else expandedPlans.delete(id);
},true);
function goalTasks(g){
 if(g.mode==='flow')return `<div class="tab-scroll task-detail-panel">${flowsUI.panel(g)}</div>`;
 const tasks=g.tasks||[],done=tasks.filter(t=>t.status==='completed').length;
 const plan=g.production?'':planningUI.panel(g);
 const proposal=Boolean(plan&&g.planProposal&&g.stage==='plan'&&!g.paused);
 const planLabel=g.stage==='plan'?'查看与调整分工':'查看分工记录';
 const otherPlan=plan&&!proposal?`<details class="task-planning" data-task-planning="${esc(g.id)}" ${expandedPlans.has(g.id)?'open':''}><summary>${planLabel}</summary>${plan}</details>`:'';
 const audit=g.audit||[];
 return `<div class="tab-scroll task-detail-panel">
  <div data-current-task-action tabindex="-1">${proposal?plan:actionCard(g)}</div>
  <section class="task-steps" aria-label="执行步骤"><div class="task-steps-heading"><h3>执行步骤</h3><small>${done} / ${tasks.length} 步已完成</small><progress value="${done}" max="${tasks.length||1}" aria-label="执行进度"></progress></div>
   <ol class="task-step-list">${tasksRows(g)}</ol></section>
  ${otherPlan}
  ${g.criterion?`<div class="task-criterion"><strong>验收标准</strong><p>${esc(g.criterion)}</p></div>`:''}
  ${audit.length?`<details class="audit-list"><summary>操作记录 <span>${audit.length}</span></summary>${[...audit].reverse().map(a=>`<div class="audit-row"><small>${date(a.at)}</small><div><strong>${esc(a.action)} · v${a.version}</strong><p>${esc(a.detail)}</p></div></div>`).join('')}</details>`:''}</div>`;
}
function artifactCard(a,g){return `<article class="artifact-card"><div class="artifact-top">${icon('file')}${badge(artNames[a.status],a.status==='draft')}</div><h3>${esc(a.title)}</h3>${a.imageJobId?imagesUI.thumbnail(a.imageJobId):''}<p>${esc(g.text)}</p><small>v${a.version} · ${esc(g.scope.sku)}</small><p>${esc(a.evidence)}</p><div class="artifact-actions"><button class="text-button" data-preview="${a.id}" data-parent="${g.id}">预览完整内容 ↗</button><button class="text-button" data-download="${a.id}" data-parent="${g.id}">下载 ↓</button></div></article>`;}
function goalArtifacts(g){
 const report=['review','completed'].includes(g.stage)?sourcingReport(g):null;
 const images=report?.imageIds.map(id=>g.artifacts.find(a=>a.id===id)).filter(Boolean)||[];
 if(report){
  const pictures=images.map(a=>`<button class="report-image" data-preview="${esc(a.id)}" data-parent="${esc(g.id)}">${imagesUI.thumbnail(a.imageJobId)}<span>${esc(a.title)} · 查看原图</span></button>`).join('');
  return `<div class="tab-scroll"><section class="panel delivery-report"><header class="report-head"><h2>选品交付报告 · ${esc(report.verdict)}</h2><span>计划 v${g.version}</span></header><div class="report-summary ${pictures?'has-pictures':''}"><div><h3 class="report-pick">${esc(report.selection.title)}</h3><a href="${esc(report.source)}" target="_blank" rel="noopener noreferrer">查看所选商品 ↗</a></div>${pictures?'<div class="report-pictures">'+pictures+'</div>':''}</div><dl class="decision-metrics"><div><dt>候选商品</dt><dd>${report.candidateCount} <small>款</small></dd></div><div><dt>采购展示价</dt><dd>¥${esc(report.selection.price)}</dd></div><div><dt>${report.periodGoal?'按历史销量估算贡献':'预计单件收益'}</dt><dd>${(report.periodGoal?report.selection.periodMargin:report.selection.margin)===null?'待核算':'¥'+(report.periodGoal?report.selection.periodMargin:report.selection.margin).toFixed(2)}</dd></div></dl>${report.paragraphs.slice(1).map(line=>`<p>${esc(line)}</p>`).join('')}${flowsUI.remakeAction(g)}</section><details><summary>全部交付物（${g.artifacts.length}）</summary><div class="artifact-grid">${g.artifacts.map(a=>artifactCard(a,g)).join('')}</div></details></div>`;
 }
 return `<div class="tab-scroll"><div class="section-title"><div><h3>目标交付物</h3><p>保留历史版本；审批与发布只使用当前版本。</p></div></div><div class="artifact-grid">${g.artifacts.map(a=>artifactCard(a,g)).join('')||(g.contentDraft&&g.stage==='draft'?'<div class=note role=status>正在编排内容草稿，完成后会显示在这里。若需补充资料或重试，请查看任务标签。</div>':'<div class="note">当前还没有交付物。完成资料和计划确认后，可在任务标签准备草案。</div>')}</div></div>`;}
function factsView(g){if(g.mode==='flow')return flowsUI.facts(g);if(g.production)return '<div class="tab-scroll">'+contentUI.facts(g)+knowledgeUI.goal(g)+sourcesUI.goal(g)+'</div>';if(g.mode==='team')return '<div class="tab-scroll">'+contentUI.facts(g)+businessUI.facts(g)+knowledgeUI.goal(g)+sourcesUI.goal(g)+workforceUI.businessFacts(g,platformFacts(g))+'</div>';if(g.mode==='platform')return platformFacts(g);if(g.kind!=='listing')return `<div class="tab-scroll"><h3>经营资料范围</h3><table class="fact-table"><tr><th>店铺</th><td>${esc(g.scope.store)}</td></tr><tr><th>数据范围</th><td>商品、订单、平台费用与广告费用</td></tr><tr><th>接入状态</th><td>未接入。分析建议仅展示格式，不能据此作出经营决策。</td></tr></table><div class="note">生产接入后，每项分析结论需关联可追溯的数据来源和观察时间。</div><button class="secondary" data-tab="tasks">返回任务计划 →</button></div>`;
 const f=g.facts;return `<div class="tab-scroll"><div class="section-title"><h3>商品事实卡</h3>${badge(f.confirmed?'已确认样例':'待核验',true)}</div><p class="field-hint">商品规格必须来自权威资料，不能由模型猜测补全。</p><table class="fact-table"><caption>${esc(g.scope.product)} · ${esc(g.scope.sku)}</caption>${[['材质',f.material],['接口',f.connector],['采购成本',f.cost===null?'待确认':money(f.cost)],['可售库存',f.stock===null?'待确认':f.stock+' 件'],['资料来源',f.source],['确认记录',f.confirmed?f.confirmedBy+' · '+date(f.confirmedAt):'尚未确认']].map(([k,v])=>`<tr><th>${k}</th><td>${esc(v)}</td></tr>`).join('')}</table><div class="note">全部为虚构样例。原型不会将聊天中的规格直接写入此卡；真实上传、ERP对接与来源冲突处理后续接入。</div>${!f.confirmed?actionButton('facts','载入并确认演示资料',false,g.paused?'disabled':''):'<button class="primary" data-tab="tasks">查看任务计划 →</button>'}${g.paused?'<p class="field-hint">目标暂停中，请从目标详情恢复后再确认。</p>':''}</div>`;}
function reviewView(g){const r=g.review||(g.kind==='analysis'?g.analysis:null);let body='';if(r){body=`<div class="section-title"><h3>经营复盘</h3>${badge(g.review?'虚构样例':'录入账单 · 代码计算')}</div><p class="field-hint">${esc(r.window)} · ${esc(r.source)}</p><div class="review-stats"><div><span>净销售额</span><strong>${money(r.netSales)}</strong></div><div><span>贡献利润</span><strong>${money(r.profit)}</strong></div><div><span>贡献利润率</span><strong>${r.rate===null?'—':esc(r.rate)+'%'}</strong></div></div><table class="fact-table"><caption>贡献利润 = 净销售额 − 全部归属可变成本</caption>${[['净销售额',r.netSales],['商品成本',r.goods],['平台与支付费用',r.fees],['履约费用',r.fulfillment],['归因广告费用',r.ads],['售后额外损失',r.returns],['其他可变费用',r.other],['贡献利润',r.profit]].map(([k,v])=>`<tr><th>${k}</th><td>${money(v)}</td></tr>`).join('')}</table><div class="note">净销售额已扣除退款本金；售后损失只记额外成本，避免重复扣减。<br>${esc(r.result)}</div>`;}
 else if(['review','completed'].includes(g.stage))body=`<h3>交付验收</h3><p class="field-hint">本目标仅准备${g.mode==='flow'?'任务流成果':g.production?'商品图片':g.contentDraft?'内容草稿':g.kind==='listing'?'上新草案':'分析建议'}，没有执行真实或模拟发布。</p><div class="note">验收标准：${esc(g.criterion)}</div>${g.artifacts.filter(a=>a.version===g.version).map(a=>artifactCard(a,g)).join('')}`;
 else {const next=taskDestination(g);body=`<h3>复盘等待中</h3><p class="field-hint">${g.permission==='approval'?'先完成发布核验，再观察7天数据。动作核验通过与经营达标是两个不同结果。':'完成交付物后，在这里确认验收。'}</p><div class="note">当前没有足够资料评估结果，不将缺失数据展示为零收入。</div><button class="secondary" ${taskLinkAttributes(next)}>${esc(next.label)}</button>`;}
 if(g.stage==='review')body+=`<div class="action-buttons">${actionButton('complete',r?'确认复盘并结束目标':'确认交付并结束目标',false,g.paused?'disabled':'')}<button class="text-button" data-tab="discussion">回群继续讨论</button></div>${g.paused?'<p class="field-hint">目标暂停中，请先恢复。</p>':''}`;
 if(g.stage==='completed')body+='<div class="note">负责人已验收，目标已结束。历史结果和讨论将保留。</div><button class="primary" data-followup>创建下一轮优化目标 ↗</button>';
 return `<div class="tab-scroll">${body}</div>`;}
function globalTasks(){const rows=state.goals.map(g=>tasksRows(g,true)).join('');return heading('执行明细','查看各项任务下的执行步骤和待处理事项。')+`<div class="global-filters" role="group" aria-label="筛选任务">${[['all','全部任务'],['attention','待我处理'],['active','执行中'],['completed','已完成']].map(([v,n])=>`<button data-filter="${v}" class="${state.filter===v?'active':''}" aria-pressed="${state.filter===v}">${n}</button>`).join('')}</div><div class="panel">${rows||'<div class="empty-state"><h2>这里暂时没有任务</h2><p>创建目标后，会同步建立相关执行任务。</p></div>'}</div>`;}
function globalArtifacts(){return heading('交付物','目标内与全局视图共享成果，版本和来源始终可追溯。')+`<div class="artifact-grid">${state.goals.flatMap(g=>g.artifacts.map(a=>artifactCard(a,g))).join('')||'<div class="panel"><h2>等待第一份成果</h2><p>从目标的任务计划生成草案后，这里会同步展示。</p></div>'}</div>`;}
function legacyEmployees(){return heading('数字员工','业务岗位负责目标，专业 Agent 按需提供能力。')+`<div class="role-note"><div><h3>一位目标协调者，组织一支专业团队</h3><p>上新由商品运营数字员工负责；分析由经营分析数字员工负责。每个目标拥有独立的上下文和任务记录。</p></div><span>规划 → 执行 → 检查 → 继续</span></div><div class="agent-grid">${state.agents.map(a=>`<article class="panel agent-card"><div class="artifact-top"><span class="avatar">${esc(a.initials)}</span>${badge('专业能力 · 演示')}</div><h2>${esc(a.name)}</h2><p>${esc(a.role)}</p><p class="field-hint">按需参与目标；尚未接入真实模型与外部工具。</p><button class="text-button" data-agent="${a.id}">邀请到新目标 ↗</button></article>`).join('')}</div>`;}

function renderSidebarRecent(){
 const list=$('#rail-recent-list');
 const recent=[...state.goals].sort((a,b)=>Date.parse(b.updatedAt||b.createdAt)-Date.parse(a.updatedAt||a.createdAt)).slice(0,3);
 list.innerHTML=recent.map(g=>{
  const selected=state.view==='overview'&&!state.home&&state.goal===g.id;
  return `<a class="rail-recent-item" href="#overview/goal/${encodeURIComponent(g.id)}" title="${esc(g.text)}"${selected?' aria-current="page"':''}>${icon('clock')}<span>${esc(g.text)}</span></a>`;
 }).join('');
}
function fitChatInput(){const el=$('#chat-input');if(el){el.style.height='44px';el.style.height=Math.min(120,Math.max(44,el.scrollHeight))+'px';}}
document.addEventListener('input',e=>{if(e.target.id==='chat-input'){fitChatInput();e.target.removeAttribute('aria-invalid');const error=$('#chat-error');if(error)error.textContent='';}});
function capture(){
 // A native toggle event is asynchronous. Snapshot live disclosure state
 // before replacing the DOM, including an interaction in the current tick.
 for(const panel of document.querySelectorAll('details[data-collaboration],details[data-missing-checklist],details[data-flow-activity]')){
  const key=panel.dataset.collaboration||panel.dataset.missingChecklist||panel.dataset.flowActivity;
  if(panel.open)expandedPanels.add(key);else expandedPanels.delete(key);
 }
 const form=$('#chat-form'),input=$('#chat-input'),log=$('.chat-log');if(!form)return null;
 const id=form.dataset.goal,s={id,focus:document.activeElement===input,start:input?.selectionStart,end:input?.selectionEnd,scroll:log?.scrollTop||0,bottom:!log||log.scrollHeight-log.scrollTop-log.clientHeight<70};positions[id]=s;return s;}
function render(force=false){const next=JSON.stringify(state);if(!force&&next===fingerprint)return;if(!force&&(document.querySelector('#mention-menu')?.hidden===false||document.querySelector('#discussion-dialog')?.open))return;if(!force&&document.querySelector('.select-trigger[aria-expanded=true]'))return;if(!force&&!busy&&document.activeElement?.closest('[data-pick-estimate],[data-cloud-receipt],[data-voucher-form],#market-search,#market-results,#flow-settings-form,#flow-data-form,#image-config-form,#facts-form,#ledger-form,#skill-data-form,#reference-form,#source-search,#kb-search,#kb-goal-form,#business-data-form,#copy-data-form,#search-config-form,#search-query-form,#employee-search'))return;const search=document.activeElement?.id==='history-search'?document.activeElement:null;const focusedRow=document.activeElement?.closest('.inbox-row')?.dataset.open;const restoreTab=document.activeElement?.matches('.goal-tabs [role=tab]');capture();discussionUI.hide();fingerprint=next;$('#main').classList.toggle('conversation-page',state.view==='overview'&&!state.home&&!!current());$('#main').innerHTML=({overview:workspace,employees:workforceUI.employeesPage,flows:flowsUI.page,tasks:globalTasks,artifacts:globalArtifacts,knowledge:workforceUI.knowledgePage,'ai-config':workforceUI.capabilityPage,runs:runsView}[state.view])();if(search&&$('#history-search')){const input=$('#history-search');input.focus({preventScroll:true});input.setSelectionRange(search.selectionStart,search.selectionEnd);}
 if($('.task-history')&&(historyReturn||focusedRow)){
  const id=historyReturn?.id||focusedRow;
  const row=Array.from(document.querySelectorAll('.inbox-row')).find(button=>button.dataset.open===id);
  (row||$('#history-search'))?.focus({preventScroll:true});
  if(historyReturn){window.scrollTo(0,historyReturn.scroll);historyReturn=null;}
 }
 renderSidebarRecent();
 $('#page-crumb').textContent=viewNames[state.view];$('#nav-count').textContent=state.goals.flatMap(g=>g.tasks).filter(t=>['waiting','approval','confirmation','acceptance'].includes(t.status)).length;document.querySelectorAll('.sidebar .nav-item[data-view],#navigation-dialog .nav-item[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view.split('/')[0]===state.view);b.setAttribute('aria-current',b.dataset.view.split('/')[0]===state.view?'page':'false');});const saved=positions[state.goal]||{bottom:true},log=$('.chat-log'),input=$('#chat-input');fitChatInput();if(log)log.scrollTop=saved.bottom?log.scrollHeight:saved.scroll;if(restoreTab){$('.goal-tabs [aria-selected=true]')?.focus({preventScroll:true});}else if(input&&saved.focus){input.focus({preventScroll:true});input.setSelectionRange(saved.start,saved.end);}imagesUI.hydrate();}
function applyRoute(route){
 const aliases={applications:'flows',capabilities:'flows',connections:'ai-config/models',agents:'ai-config/legacy',sources:'ai-config/sources'};
 route=Object.hasOwn(aliases,route)?aliases[route]:route;
 const [view,tab,section]=route.split('/');
 state.view=Object.hasOwn(viewNames,view)?view:'overview';
 state.employeeId=state.view==='employees'&&/^[a-zA-Z0-9_-]+$/.test(tab||'')?tab:null;
 state.employeeTab=state.employeeId&&['deliveries','settings'].includes(section)?section:'work';
 state.configTab=['market','models','images','search','stores','skills','external','sources','catalog','legacy'].includes(tab)?tab:'models';
 state.home=state.view==='overview'&&tab!=='goal';
 if(view==='overview'&&tab==='goal'&&route.split('/')[2]){
  const [, ,id,section]=route.split('/');state.goal=id;state.tab=Object.hasOwn(tabNames,section)?section:'discussion';sessionStorage.setItem('selectedGoal',id);
 }
 if(state.employeeId)return 'employees/'+state.employeeId+(state.employeeTab==='work'?'':'/'+state.employeeTab);
 const canonical=state.home?'overview/home':view==='overview'&&tab==='goal'&&state.goal?'overview/goal/'+state.goal+(state.tab==='discussion'?'':'/'+state.tab):state.view==='ai-config'?'ai-config/'+state.configTab:state.view;
 return canonical;
}
function go(route){const canonical=applyRoute(route);$('#navigation-dialog')?.close();location.hash=canonical;render(true);}

function openGoal(id,tab='discussion'){capture();state.goal=id;state.tab=tab;sessionStorage.setItem('selectedGoal',id);go('overview/goal/'+id+(tab==='discussion'?'':'/'+tab));}
function receive(g){changeEpoch++;const i=state.goals.findIndex(x=>x.id===g.id);if(i<0)state.goals.unshift(g);else state.goals[i]=g;render();}
async function act(kind,extra={},id=state.goal){const result=await post(`goals/${id}/${kind==='offerDetail'&&extra.detail?.base64?'offer-photo':'actions'}`,{kind,expectedVersion:state.goals.find(g=>g.id===id)?.version,...extra});receive(result);return result;}
async function refresh(){const epoch=changeEpoch;try{const health=await api('health');if(!canEnter(health))return;const [agents,goals,runs,workforce,sources,knowledge,workspaces,integrations,images,flows]=await Promise.all([api('agents'),api('goals'),api('runs'),api('workforce'),api('sources'),api('knowledge'),api('workspaces'),api('integrations'),api('images'),api('flows')]);if(busy||epoch!==changeEpoch)return;state.agents=agents;state.goals=goals;state.runs=runs;state.workforce=workforce;state.sources=sources;state.knowledge=knowledge;state.workspaces=workspaces;state.integrations=integrations;state.images=images;state.flows=flows;setupUI.update();await updateRunPreview();$('#connection-state').textContent='服务已连接';render();}catch(err){$('#connection-state').textContent='连接中断';if(!state.agents.length)$('#main').innerHTML='<div class="panel empty-state"><h2>暂时无法连接</h2><p>请确认服务已启动，页面将自动重试。</p></div>';}}
let assignedEmployee=null;
function openCreate(text='',kind='analysis',only=null,source=null,assigned=null){assignedEmployee=assigned;sourceGoal=source;createMembersTouched=false;createKindManual=kind==='listing'||!!only;createRequestId=globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);createStep=1;createPermission='draft';$('#goal').value=text;$('#pick-example').hidden=!!assignedEmployee;$('#team-recommendation').textContent='';$('#goal-kind').value=kind;$('#create-store').value='未关联店铺';$('#create-store').readOnly=false;$('#create-connected-store').innerHTML='<option value="">未关联店铺 · 仅草案</option>'+(state.integrations?.stores||[]).filter(s=>s.enabled).map(s=>`<option value="${s.id}">${esc(s.name)} · ${s.platform==='taobao'?'淘宝 / 天猫':s.platform==='douyin'?'抖店':esc(s.platform)}</option>`).join('');$('#create-sku').value=kind==='listing'?'DEMO-JF-001':'全店汇总';$('#create-product').value=kind==='listing'?'角阀':'经营分析';$('#create-price').value='29.90';clearCreateError();$('#create-engine').value=only&&state.agents.some(a=>a.id===only)?'legacy':only?'team':'flow';$('#team-selection').value=only?'manual':'auto';syncTeamChoice();updateCreateMembers(kind,only);$('#goal-advanced').hidden=!only;$('#goal-advanced').open=!!only;showCreateStep();pickHint();$('#task-dialog').showModal();$('#goal').focus();}
$('#pick-example').onclick=()=>{$('#create-engine').value='flow';$('#goal').value='在 1688 上找高性价比、高利润的露营灯';syncTeamChoice();clearCreateError();$('#goal').focus();$('#goal').setSelectionRange($('#goal').value.length-3,$('#goal').value.length);};
function creationPickIntent(text){
 if(assignedEmployee&&assignedEmployee.mode!=='flow')return null;
 return sourcingIntent(businessBrief({text,assignedEmployeeId:assignedEmployee?.id}));
}
function pickHint(){const hint=$('#pick-intent'),intent=$('#create-engine').value==='flow'&&creationPickIntent($('#goal').value);hint.hidden=!intent;if($('#create-engine').value==='flow')$('#submit-task').textContent=intent?.query?'打开 1688 并开始选品':'创建任务';hint.textContent=intent?(intent.query?'将打开 1688 搜索「'+intent.query+'」，并比较商品报价。':'加上品类即可开始，例如「在 1688 找露营灯」。'):'';}
$('#goal').addEventListener('input',pickHint);
function syncTeamChoice(){pickHint();const flow=$('#create-engine').value==='flow';$('label[for=team-selection]').hidden=flow;$('label[for=goal-kind]').hidden=flow;$('#goal-kind').hidden=flow;$('#team-selection').hidden=flow;const manual=$('#create-engine').value==='legacy'||$('#team-selection').value==='manual';$('#manual-team-options').hidden=flow||!manual;$('#auto-team-hint').hidden=flow||manual;$('#team-selection').disabled=$('#create-engine').value==='legacy';}
$('#team-selection').onchange=syncTeamChoice;
$('#create-engine').addEventListener('change',syncTeamChoice);
function showCreateStep(){const first=createStep===1;$('#create-step-one').hidden=!first;$('#create-step-two').hidden=first;$('#create-back').hidden=first;const flow=$('#create-engine').value==='flow';
 $('#new-step').hidden=flow;
 $('#new-step').textContent=flow?'':'第 '+createStep+' / 2 步';
 $('#new-title').textContent=assignedEmployee?'交办给'+assignedEmployee.name:first?'新建任务':'确认任务范围';
 if(first)$('#goal').after($('#form-error'));else $('#task-form .dialog-footer').before($('#form-error'));
 if(flow)pickHint();else $('#submit-task').textContent=first?'下一步':'创建任务';
 if(!first){const listing=$('#goal-kind').value==='listing';$('#scope-preview').innerHTML=`<h3>${esc($('#goal').value)}</h3>${scopeRow('负责成员',$('#create-engine').value==='team'?($('#team-selection').value==='auto'?'总控将按目标自动安排，无需手动选人':'保留你指定的成员'):listing?'商品运营数字员工':'经营分析数字员工')}${scopeRow('业务范围','由下方填写的店铺与 SKU / 分析范围确定')}${scopeRow('交付标准',listing?(createPermission==='draft'?'核验规格、准备上新草案并验收；不执行发布':'核验规格、准备草案；审批发布后观察7天'):'形成分析建议，负责人确认验收')}${scopeRow('资料准备度',listing?'待核验 · 创建后补齐演示资料':'创建后自动检查各员工所需资料')}`;$('#goal-permission').disabled=!listing||$('#create-engine').value==='team';$('#goal-permission').value=listing&&$('#create-engine').value!=='team'?createPermission:'draft';$('#create-price').parentElement.hidden=!listing;$('#scope-note').textContent='填写业务范围后，商品资料和经营账单在目标内补充。输入数据未自动同步店铺；发布动作仍为模拟。';}}
$('#goal-kind').onchange=()=>{createKindManual=true;const listing=$('#goal-kind').value==='listing';$('#create-sku').value=listing?'DEMO-JF-001':'全店汇总';$('#create-product').value=listing?'角阀':'经营分析';updateCreateMembers($('#goal-kind').value);};
$('#goal-permission').onchange=e=>{createPermission=e.target.value;showCreateStep();};
$('#close-dialog').onclick=()=>$('#task-dialog').close();$('#create-back').onclick=()=>{createStep=1;clearCreateError();showCreateStep();$('#goal').focus();};
async function recommendTeam(){
 const text=$('#goal').value.trim();if(!text||$('#create-engine').value!=='team')return;
 let recommendation=await post('workforce/recommend',{text});if(!recommendation.recipes.length&&!recommendation.employeeIds.length){$('#team-recommendation').textContent='暂未匹配业务工作包，请手动选择员工；不会猜测不存在的能力。';return;}
 for(const recipe of recommendation.recipes)await post('workforce/install',{recipeId:recipe.id});await refresh();recommendation=await post('workforce/recommend',{text});
 if(recommendation.missing.length)throw new Error('所需员工尚未就绪：'+recommendation.missing.join('、'));
 updateCreateMembers($('#goal-kind').value);document.querySelectorAll('[name=agents]').forEach(c=>c.checked=recommendation.employeeIds.includes(c.value));createMembersTouched=true;
 $('#team-recommendation').textContent='按关键词与已装配能力推荐：'+(recommendation.labels||recommendation.recipes.map(r=>r.name)).join(' → ')+'。请确认成员和业务范围；不是模型自主规划。';
}
$('#recommend-team').onclick=async()=>{const b=$('#recommend-team');b.disabled=true;try{await recommendTeam();}catch(err){$('#form-error').textContent=err.message;}finally{b.disabled=false;}};
function clearCreateError(){
 $('#task-form [aria-invalid=true]')?.removeAttribute('aria-invalid');
 $('#form-error').textContent='';
}
function createFieldError(field,message){
 const error=$('#form-error');
 field.after(error);
 field.setAttribute('aria-invalid','true');
 field.setAttribute('aria-describedby',field.id==='goal'?'form-error pick-intent':'form-error');
 error.textContent=message;
 field.focus();
}
$('#task-form').addEventListener('input',clearCreateError);
$('#task-form').onsubmit=async e=>{
 e.preventDefault();
 const goal=$('#goal'),text=goal.value.trim(),button=$('#submit-task');
 if(button.disabled)return;
 clearCreateError();
 if(!text||text.length>2000){
  createFieldError(goal,text?'请把任务要求缩短到 2000 字以内。':'写下想完成的事，再创建任务。');
  return;
 }
 if($('#create-engine').value==='flow'){
 const b=button,intent=creationPickIntent(text);
 if(intent&&!intent.query){createFieldError(goal,'想找哪个品类？请在任务要求里加上商品名称。');return;}
 const tab=intent?pickBrowser.reserve():null;b.disabled=true;b.textContent='正在创建…';
 try{const g=await post('goals',{...(assignedEmployee?{assignedEmployeeId:assignedEmployee.id}:{executionMode:'flow'}),text,requestId:createRequestId});receive(g);$('#task-dialog').close();openGoal(g.id);if(intent)pickBrowser.openSearch(g,tab);}
 catch(error){tab?.close();$('#form-error').textContent=error.message;}finally{b.disabled=false;pickHint();}return;}const automatic=$('#create-engine').value==='team'&&$('#team-selection').value==='auto',members=[...document.querySelectorAll('[name=agents]:checked')].map(x=>x.value);if(!automatic&&!members.length){
 $('#goal-advanced').open=true;
 $('#form-error').textContent='请选择至少一位已就绪的成员。';
 $('#manual-team-options').append($('#form-error'));
 const choice=$('#agent-options input:not(:disabled)')||$('#recommend-team');
 choice.focus();
 return;
 }
 if(createStep===1){if(!createKindManual){$('#submit-task').disabled=true;try{const suggestion=await post('goal-preview',{text:$('#goal').value});const previousKind=$('#goal-kind').value;$('#goal-kind').value=suggestion.kind;if(previousKind!==suggestion.kind&&!createMembersTouched&&$('#create-engine').value==='legacy')updateCreateMembers(suggestion.kind);$('#create-sku').value=suggestion.sku||(suggestion.kind==='listing'?'DEMO-JF-001':'全店汇总');$('#create-product').value=suggestion.product||(suggestion.kind==='listing'?'角阀':'经营分析');}catch(err){$('#form-error').textContent=err.message;return;}finally{$('#submit-task').disabled=false;}}createStep=2;showCreateStep();$('#new-title').tabIndex=-1;$('#new-title').focus();return;}
 const price=$('#create-price');
 if($('#goal-kind').value==='listing'&&!price.validity.valid){
  createFieldError(price,'售价应为 0.01 至 100000 元，最多保留两位小数。');
  return;
 }
 const b=button;b.disabled=true;b.textContent='正在创建…';busy=true;try{const g=await post('goals',{text:$('#goal').value,...($('#create-engine').value==='team'?{employeeIds:automatic?[]:members,teamSelection:automatic?'auto':'manual',startCollaboration:true}:{members}),kind:$('#goal-kind').value,permission:$('#goal-permission').value,sourceGoal,requestId:createRequestId,storeConnectionId:$('#create-connected-store').value||undefined,scope:{store:$('#create-store').value,sku:$('#create-sku').value,product:$('#create-product').value},proposal:$('#goal-kind').value==='listing'?{price:$('#create-price').value,title:$('#create-product').value}:undefined});receive(g);$('#task-dialog').close();openGoal(g.id);toast('任务已创建');}catch(err){$('#form-error').textContent=err.message;}finally{b.disabled=false;b.textContent='创建任务';busy=false;}};
function download(a){const text=`# ${a.title}\n\n版本：v${a.version} · ${artNames[a.status]}\n\n> 根据录入资料准备，未自动核对外部平台\n\n${a.body}\n\n来源：${a.evidence}`;const url=URL.createObjectURL(new Blob([text],{type:'text/markdown;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=a.title+'-v'+a.version+'.md';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('#team-close').onclick=()=>$('#team-dialog').close();
$('#team-edit-mode').onchange=()=>{$('#team-edit-members').hidden=$('#team-edit-mode').value==='auto';};
document.addEventListener('click',e=>{if(!e.target.closest('[data-team-edit]'))return;const g=current();$('#team-dialog').dataset.goal=g.id;$('#team-dialog').dataset.version=g.version;$('#team-goal-text').value=g.text;$('#team-edit-mode').value=g.teamSelection||'manual';$('#team-edit-members').hidden=$('#team-edit-mode').value==='auto';$('#team-edit-error').textContent='';$('#team-member-options').innerHTML=state.workforce.employees.map(e=>`<label class="team-member-option"><input type="checkbox" name="teamEmployee" value="${esc(e.id)}" ${g.members.includes(e.id)?'checked':''} ${e.readiness.ready?'':'disabled'}><span>${esc(e.name)}<small>${esc(e.readiness.ready?e.skillIds.map(id=>state.workforce.skills.find(s=>s.id===id)?.name||id).join('、'):e.readiness.blockers.join('；'))}</small></span></label>`).join('');$('#team-dialog').showModal();});
$('#team-form').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{const g=await post(`goals/${$('#team-dialog').dataset.goal}/actions`,{kind:'setTeam',expectedVersion:Number($('#team-dialog').dataset.version),text:$('#team-goal-text').value,teamSelection:$('#team-edit-mode').value,employeeIds:[...document.querySelectorAll('[name=teamEmployee]:checked')].map(e=>e.value)});receive(g);$('#team-dialog').close();toast('总控已保存新的成员安排');}catch(error){$('#team-edit-error').textContent=error.message;}finally{b.disabled=false;}};
$('#close-artifact').onclick=()=>$('#artifact-dialog').close();$('#download-preview').onclick=()=>{if(preview)download(preview);};$('#close-edit').onclick=()=>$('#edit-dialog').close();$('#close-reject').onclick=()=>$('#reject-dialog').close();
$('#edit-form').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;busy=true;try{await act('revise',{title:$('#publish-title').value,price:$('#publish-price').value},$('#edit-dialog').dataset.goal);$('#edit-dialog').close();state.tab='tasks';render(true);toast('已生成新版本，旧审批已失效');}catch(err){$('#edit-error').textContent=err.message;}finally{b.disabled=false;busy=false;}};
$('#reject-form').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;busy=true;try{await act('reject',{reason:$('#reject-reason').value,approvalId:state.goals.find(g=>g.id===$('#reject-dialog').dataset.goal)?.approval?.id},$('#reject-dialog').dataset.goal);$('#reject-dialog').close();toast('审批已退回，需重新准备');}catch(err){$('#reject-error').textContent=err.message;}finally{b.disabled=false;busy=false;}};
document.addEventListener('input',e=>{if(e.target.id==='chat-input')drafts[e.target.form.dataset.goal]=e.target.value;});
document.addEventListener('change',e=>{if(e.target.name==='agents')createMembersTouched=true;if(e.target.id==='chat-target')targets[state.goal]=e.target.value;if(e.target.id==='chat-intent')intents[state.goal]=e.target.value;});
document.addEventListener('keydown',e=>{if(e.target.id==='chat-input'&&e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.keyCode!==229){e.preventDefault();e.target.form.requestSubmit();}});
document.addEventListener('submit',async e=>{if(e.target.id!=='chat-form')return;e.preventDefault();const id=e.target.dataset.goal;if(sending.has(id))return;const field=$('#chat-input'),text=field.value;if(!text.trim()){field.setAttribute('aria-invalid','true');$('#chat-error').textContent='写下想说的话，再发送。';field.focus();return;}const target=$('#chat-target').value,intent=$('#chat-intent')?.value;const b=e.submitter||e.target.querySelector('[type=submit]');sending.add(id);b.disabled=true;try{const g=await post(`goals/${id}/actions`,{kind:'message',text,target,intent,...discussionUI.submission(state.goals.find(g=>g.id===id),text)});discussionUI.sent(id);if(drafts[id]===text)drafts[id]='';receive(g);if(state.goal===id){$('#chat-input')?.focus();const log=$('.chat-log');if(log)log.scrollTop=log.scrollHeight;}}catch(err){if(state.goal===id&&$('#chat-error'))$('#chat-error').textContent=err.message;else toast(err.message);}finally{sending.delete(id);if(state.goal===id){const live=$('#chat-form [type=submit]');if(live){live.disabled=false;live.textContent='发送 ↗';}}}});
function filterHistory(value){
 historySearch=value;
 const {filtersHTML,rowsHTML}=historyParts();
 $('.history-filters').innerHTML=filtersHTML;
 $('.history-panel').innerHTML=rowsHTML;
}
document.addEventListener('input',e=>{if(e.target.id==='history-search')filterHistory(e.target.value);});
document.addEventListener('change',e=>{if(e.target.id==='history-sort'){historySort=e.target.value;filterHistory(historySearch);}});
document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;let ownsAction=false;try{
 if(b.hasAttribute('data-business-center'))go('flows');
 if(b.hasAttribute('data-kb-center'))go('knowledge');
 if(b.hasAttribute('data-source-center'))go('ai-config/sources');
 if(b.dataset.seed)openCreate(b.dataset.seed);
 if(b.hasAttribute('data-new')){b.closest('#navigation-dialog')?.close();openCreate();}
 if(b.hasAttribute('data-sample'))openCreate('为角阀准备商品资料、内容大纲与经营测算，交付后由我验收','listing');
 if(b.dataset.agent)openCreate('',b.dataset.agent==='product'||b.dataset.agent==='content'?'listing':'analysis',b.dataset.agent);
 if(b.dataset.employeeGoal){
  const employee=[...(state.flows?.employees||[]),...(state.workforce?.employees||[])].find(e=>e.id===b.dataset.employeeGoal);
  if(!employee?.enabled||!employee.readiness?.ready){toast('该员工当前无法接单，请查看岗位设置。');return;}
  openCreate('','analysis',null,null,employee);
 }
 if(b.hasAttribute('data-nav-more')){$('#navigation-dialog').showModal();b.setAttribute('aria-expanded','true');}
 if(b.hasAttribute('data-nav-close'))$('#navigation-dialog').close();
 if(b.hasAttribute('data-clear-search')){const search=$('#history-search');search.value='';filterHistory('');search.focus();}
 if(b.dataset.inboxFilter){inboxFilter=b.dataset.inboxFilter;render(true);document.querySelector('[data-inbox-filter="'+inboxFilter+'"]')?.focus();}
 if(b.hasAttribute('data-inbox-home'))go('overview/home');
 if(b.dataset.view)go(b.dataset.view==='overview'?'overview/home':b.dataset.view);
 if(b.dataset.open){
  if(b.closest('.task-history'))historyReturn={id:b.dataset.open,scroll:window.scrollY};
  if(b.dataset.openFocus)openTaskDestination(b.dataset.open,b.dataset.openTab,b.dataset.openFocus,b.dataset.stepId);
  else openGoal(b.dataset.open,b.dataset.openTab||'discussion');
 }
 if(b.dataset.tab&&Object.hasOwn(tabNames,b.dataset.tab)&&state.view==='overview'&&current()){
  if(b.dataset.taskDestination)openTaskDestination(state.goal,b.dataset.tab,b.dataset.taskDestination,b.dataset.stepId);
  else {openGoal(state.goal,b.dataset.tab);$('.goal-tabs [aria-selected=true]')?.focus();}
 }
 if(b.dataset.filter){state.filter=b.dataset.filter;render(true);}
 if(b.dataset.mention){targets[state.goal]=b.dataset.mention;openGoal(state.goal,'discussion');$('#chat-input')?.focus();}
 if(b.dataset.action){if(busy)return;busy=true;ownsAction=true;b.disabled=true;const g=current(),extra={};if(b.dataset.action==='approve'){extra.version=g.version;extra.approvalId=g.approval.id;}if(b.dataset.mismatch)extra.mismatch=true;await act(b.dataset.action,extra);if(b.dataset.action==='facts'){state.tab='tasks';render(true);}if(b.dataset.action==='observe'||b.dataset.action==='complete'){state.tab='review';render(true);}toast('操作已记录');}
 if(b.hasAttribute('data-edit')){const g=current();$('#edit-dialog').dataset.goal=g.id;$('#publish-title').value=g.proposal.title;$('#publish-price').value=g.proposal.price;$('#edit-error').textContent='';$('#edit-dialog').showModal();}
 if(b.hasAttribute('data-reject')){$('#reject-dialog').dataset.goal=state.goal;$('#reject-reason').value='';$('#reject-error').textContent='';$('#reject-dialog').showModal();}
 if(b.dataset.preview||b.dataset.download){const g=state.goals.find(x=>x.id===b.dataset.parent),a=g.artifacts.find(x=>x.id===(b.dataset.preview||b.dataset.download));if(a.imageJobId){await imagesUI.openJob(a.imageJobId);}else if(b.dataset.download)download(a);else{preview=a;$('#artifact-title').textContent=a.title;$('#artifact-meta').textContent=`v${a.version} · ${artNames[a.status]} · 数据来源见正文`;$('#artifact-body').textContent=a.body;$('#artifact-evidence').textContent='来源：'+a.evidence;$('#artifact-dialog').showModal();}}
 if(b.hasAttribute('data-followup')){const g=current();openCreate('基于上一轮目标，分析商品贡献利润与退款情况，提出下一轮优化建议','analysis',null,g.id);}
 }catch(err){toast(err.message);}finally{if(ownsAction){busy=false;b.disabled=false;}}});
$('#nav-open').setAttribute('aria-expanded','false');
$('#navigation-dialog').addEventListener('close',()=>$('#nav-open').setAttribute('aria-expanded','false'));
window.matchMedia('(min-width:761px)').addEventListener('change',e=>{if(e.matches&&$('#navigation-dialog').open)$('#navigation-dialog').close();});
window.addEventListener('hashchange',()=>{const canonical=applyRoute(location.hash.slice(1));if(location.hash.slice(1)!==canonical)history.replaceState(null,'','#'+canonical);$('#navigation-dialog')?.close();render(true);});
const runNames={queued:'排队中',running:'执行中',succeeded:'成功',needs_input:'等待资料',failed:'失败',interrupted:'已中断',discarded:'旧版本已丢弃',waiting_resume:'等待恢复'};
let configEditing=null,testRunId=null,runPreviewId=null,createRequestId=null,createKindManual=false,createMembersTouched=false;
function runRows(runs){return runs.length?runs.slice(0,100).map(r=>`<button class="task-row" data-run="${r.id}"><span class="avatar">${r.purpose==='test'?'测':'执'}</span><div class="task-text"><strong>${esc(r.agentName)} · ${['test','skill_test','model_test','employee_test','external_test'].includes(r.purpose)?'配置测试':r.purpose==='chat'?'群聊请求':'目标执行'}</strong><small>${date(r.createdAt)} · 配置v${r.configVersion} · ${r.durationMs===undefined?'待计时':r.durationMs+' ms'}${r.error?' · '+esc(r.error):''}</small></div>${badge(runNames[r.status]||r.status,['queued','running'].includes(r.status))}</button>`).join(''):'<div class="note">暂无运行记录。可以在 Agent 配置中执行测试，或确认目标计划。</div>';}
function platformEmployees(){return '<div class=section-title><h2>旧版规则 / HTTP 适配器</h2></div>'+`<div class="role-note"><div><h3>旧版规则模块与 HTTP 适配器</h3><p>商品校验与利润计算使用你录入的数据。外部 Agent 可通过 HTTP 适配器接入；当前内置 Agent 不依赖大模型。</p></div>${badge('服务端持久化',true)}</div><div class="agent-grid">${state.agents.map(a=>`<article class="panel agent-card"><div class="artifact-top"><span class="avatar">${esc(a.initials)}</span>${badge(a.enabled?'已启用':'已停用',a.enabled)}</div><h2>${esc(a.name)}</h2><p>${esc(a.role)}</p><div class="config-meta">${scopeRow('适配器',a.adapter==='builtin'?'内置代码 Agent':'外部 HTTP Agent')}${scopeRow('配置版本','v'+a.revision)}${scopeRow('超时',a.timeoutMs/1000+' 秒')}${scopeRow('能力',a.capabilities.join(' / '))}</div><div class="action-buttons"><button class="primary" data-config="${a.id}">配置与测试</button><button class="text-button" data-agent="${a.id}" ${a.enabled?'':'disabled'}>用于新目标 ↗</button></div></article>`).join('')}</div><section class="panel runtime-panel"><div class="section-title"><h3>最近调用</h3><button class="text-button" data-view="runs">全部运行记录 →</button></div>${runRows(state.runs.slice(0,5))}</section>`;}
function runsView(){return heading('运行记录','每次 Agent 调用都保存配置版本、输入、结构化结果和异常。')+`<div class="panel">${runRows(state.runs)}</div>`;}
function platformRuntime(g){const r=g.runtime||{};return `<section class="action-card"><div class="action-kicker">后端自动执行 · ${esc(runNames[r.status]||'等待调度')}</div><h3>${r.status==='failed'?'本步骤调用失败':r.status==='needs_input'?'需要补齐数据后继续':'数字员工正在按计划推进'}</h3><p>${esc(r.error||'无需反复点击生成。主协调器按顺序调用所选能力，并保存每一步的交付物。')}</p>${r.missing?.length?`<div class="note">待处理：${r.missing.map(esc).join('、')}</div>`:''}<div class="action-buttons">${['failed','needs_input'].includes(r.status)?`<button class="primary" data-tab="facts">检查并补充资料</button>${actionButton('retry','重试当前步骤',true)}${g.mode==='team'?actionButton('replan','重新安排分工',true):''}`:''}${g.kind==='listing'?'<button class="text-button" data-edit>调整发布内容</button>':''}${r.runId?`<button class="text-button" data-run="${r.runId}">查看本次调用 →</button>`:''}</div></section>`;}
function field(name,label,value='',type='text',attrs=''){return `<div><label for="field-${name}">${label}</label><input id="field-${name}" name="${name}" type="${type}" value="${esc(value??'')}" ${attrs}></div>`;}
function platformFacts(g){const locked=g.paused||!(g.kind==='listing'?['facts','plan','draft']:['plan','draft']).includes(g.stage);const f=g.facts||{},ledger=g.financials||{};
 const itemFields=g.kind==='listing'&&g.assignedEmployeeId?`${field('product','商品名称',g.scope.product,'text','required maxlength="120"')}${field('sku','SKU',g.scope.sku,'text','required maxlength="120"')}${field('price','售价（元）',g.proposal?.price,'number','required min="0.01" max="100000" step="0.01"')}`:'';
 const controls=g.kind==='listing'?`${itemFields}${field('material','材质',f.confirmed?f.material:'','text','required maxlength="500"')}${field('connector','接口 / 适用规格',f.confirmed?f.connector:'','text','required maxlength="500"')}${field('cost','采购成本（元）',f.cost,'number','required min="0" max="1000000000" step="0.01"')}${field('stock','可售库存（件）',f.stock,'number','required min="0" max="1000000000" step="1"')}${field('source','资料来源',f.confirmed?f.source:'','text','required maxlength="500"')}`:`${[['netSales','净销售额'],['goods','商品成本'],['fees','平台及支付费用'],['fulfillment','履约费用'],['ads','归因广告费用'],['returns','售后额外损失'],['other','其他可变成本']].map(([k,n])=>field(k,n+'（元，可留空）',ledger[k],'number','min="0" max="1000000000000" step="0.01"')).join('')}${field('window','统计期间',ledger.window,'text','required maxlength="120"')}${field('source','账单来源',ledger.source,'text','required maxlength="500"')}`;
 return `<div class="tab-scroll"><div class="section-title"><div><h3>${g.kind==='listing'?'商品资料录入':'经营账单录入'}</h3><p class="field-hint">数据保存在后端，Agent 将据此校验或计算。缺失数值请留空，不以 0 代替未知。</p></div></div><div class="note">${esc(g.scope.store)} · ${esc(g.scope.sku)}${g.kind==='listing'&&g.proposal?.price!=null?' · 售价 '+money(g.proposal.price):''}</div><form id="${g.kind==='listing'?'facts-form':'ledger-form'}" data-goal="${g.id}"><fieldset ${locked?'disabled':''}><div class="data-fields">${controls}</div>${g.kind==='listing'?'<label class="confirm-check"><input name="confirmed" type="checkbox" required> 我已核对所填资料及来源</label>':'<p class="field-hint">净销售额已扣退款本金；售后损失只计额外成本，避免重复扣减。</p>'}<div class="action-buttons"><button type="submit" class="primary">保存${g.kind==='listing'?'并确认资料':'账单'}</button><button type="button" class="secondary" data-fill-data="${g.kind}">填入演示样例</button></div></fieldset><p class="form-error" id="data-error" role="alert"></p></form>${locked?'<div class="note">当前阶段不允许覆盖已确认输入。暂停时先恢复；已生成成果后，另建跟进目标或按内容变更重新审批。</div>':''}</div>`;
}
async function openConfig(id){const a=state.agents.find(a=>a.id===id);configEditing=structuredClone(a);testRunId=null;$('#test-agent').disabled=false;$('#config-title').textContent=a.name+' · 配置与测试';for(const key of ['name','role','adapter','timeoutMs','endpoint','secretEnv','instructions'])$('#cfg-'+key).value=a[key];$('#cfg-enabled').checked=a.enabled;$('#cfg-threshold').value=a.id==='product'?a.settings.minGrossMargin:a.settings.targetProfitRate;$('#threshold-label').textContent=a.id==='product'?'最低采购价差率（%）':'贡献利润率目标（%）';$('#config-revision').textContent='当前已保存版本 v'+a.revision;$('#config-error').textContent='';$('#agent-test-result').textContent='测试使用服务端已保存的配置。修改后请先保存。';$('#agent-test-input').value=JSON.stringify(await api(`agents/${id}/sample`),null,2);updateAdapterFields();$('#agent-config-dialog').showModal();}
function updateAdapterFields(){const remote=$('#cfg-adapter').value==='http';$('#remote-config').hidden=!remote;$('#cfg-instructions').disabled=!remote;$('#builtin-note').hidden=remote;}
async function updateRunPreview(){
 if(testRunId&&$('#agent-config-dialog').open){const id=testRunId;const r=await api('runs/'+id);if(id!==testRunId||!$('#agent-config-dialog').open)return;$('#agent-test-result').textContent=`${runNames[r.status]} · 配置v${r.configVersion}\n${r.error||''}\n${r.result?JSON.stringify(r.result,null,2):'等待后端执行…'}`;$('#test-agent').disabled=['queued','running'].includes(r.status);}
 if(runPreviewId&&$('#run-dialog').open){const id=runPreviewId;const r=await api('runs/'+id);if(id!==runPreviewId||!$('#run-dialog').open)return;const pick=r.input?.capability==='sourcing.1688'&&r.status==='needs_input';
 const goal=pick?state.goals.find(g=>g.id===r.goalId):null,node=goal?.flow?.nodes.find(n=>n.runId===r.id);
 const active=node?.status==='needs_input'&&!goal.paused;
 const count=active?(node.offers?.length||0):r.result?.offers?.length;
 const progress=count==null?'当时收集到的报价不足两件。':('已保存 '+count+'/2 件报价。');
 const diagnosis=pick?progress+(active?'还需 '+(2-count)+' 件不同商品，每件需要商品名称、页面报价和 1688 商品详情链接。工作台会通过浏览器连接器读取搜索结果，收齐后自动比较。':'本条记录保留当时的等待状态，最新进展见目标任务。'):[...new Set([r.error,...(r.result?.missing||[])].filter(Boolean))].join(' · ');
 $('#run-diagnosis').textContent=diagnosis;
 $('#run-title').textContent=r.agentName+' · '+(pick?'等待商品报价':runNames[r.status]);
 $('#run-meta').textContent=['运行 '+r.id,r.configVersion!=null?'配置 v'+r.configVersion:r.goalVersion!=null?'计划 v'+r.goalVersion:'',r.durationMs!=null?r.durationMs+' ms':''].filter(Boolean).join(' · ');
 const button=$('#run-pick-action');button.hidden=!goal;button.dataset.goal=goal?.id||'';button.dataset.stepId=active?node.id:'';button.textContent=active?'查看自动采集进度':goal?taskDestination(goal).label:'';
 if($('#run-data').dataset.run!==r.id){$('#run-data').dataset.run=r.id;$('#run-data').open=!pick;}
 $('#run-input').textContent=JSON.stringify(r.input,null,2);$('#run-output').textContent=JSON.stringify({status:r.status,error:r.error||undefined,result:r.result,trace:r.trace},null,2);}
}
$('#close-config').onclick=()=>{$('#agent-config-dialog').close();testRunId=null;};$('#cfg-adapter').onchange=updateAdapterFields;
$('#agent-config-form').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{const input={revision:configEditing.revision,enabled:$('#cfg-enabled').checked,settings:{[configEditing.id==='product'?'minGrossMargin':'targetProfitRate']:Number($('#cfg-threshold').value)}};for(const key of ['name','role','adapter','timeoutMs','endpoint','secretEnv','instructions'])input[key]=$('#cfg-'+key).value;const result=await api('agents/'+configEditing.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});configEditing=result;$('#config-revision').textContent='已保存版本 v'+result.revision;$('#config-error').textContent='';toast('配置已保存，后续调用使用新版本');await refresh();}catch(err){$('#config-error').textContent=err.message;}finally{b.disabled=false;}};
$('#test-agent').onclick=async()=>{const b=$('#test-agent');b.disabled=true;try{let input;try{input=JSON.parse($('#agent-test-input').value);}catch{throw new Error('测试输入不是有效JSON');}const r=await post(`agents/${configEditing.id}/test`,{input});testRunId=r.id;await updateRunPreview();await refresh();}catch(err){$('#agent-test-result').textContent=err.message;b.disabled=false;}};
$('#run-pick-action').onclick=e=>{const button=e.currentTarget,g=state.goals.find(g=>g.id===button.dataset.goal);if(!g)return;$('#run-dialog').close();runPreviewId=null;const next=button.dataset.stepId?{tab:'tasks',focus:'intervention',node:button.dataset.stepId}:taskDestination(g);openTaskDestination(g.id,next.tab,next.focus,next.node);};
$('#close-run').onclick=()=>{$('#run-dialog').close();runPreviewId=null;};
document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;try{if(b.dataset.config)await openConfig(b.dataset.config);if(b.dataset.run){runPreviewId=b.dataset.run;$('#run-input').textContent='正在载入输入…';$('#run-output').textContent='正在载入结果…';$('#run-diagnosis').textContent='';$('#run-pick-action').hidden=true;delete $('#run-data').dataset.run;$('#run-dialog').showModal();await updateRunPreview();}if(b.dataset.fillData){const values=b.dataset.fillData==='listing'?{material:'黄铜（演示）',connector:'G1/2（演示）',cost:12,stock:200,source:'内置虚构商品样例'}:{netSales:3000,goods:1200,fees:150,fulfillment:300,ads:600,returns:150,other:0,source:'内置虚构经营账单',window:'演示第1–7天'};for(const [k,v] of Object.entries(values))$('#field-'+k).value=v;toast('已填入演示数据，请核对后保存');}}catch(err){toast(err.message);}});
document.addEventListener('submit',async e=>{if(!['facts-form','ledger-form'].includes(e.target.id))return;e.preventDefault();const form=e.target,id=form.dataset.goal,b=e.submitter;b.disabled=true;busy=true;try{const data=Object.fromEntries(new FormData(form));const g=state.goals.find(g=>g.id===id);await act(form.id==='facts-form'?'facts':'ledger',form.id==='facts-form'?{facts:data,confirmed:data.confirmed==='on',expectedVersion:g.version}:{financials:data,expectedVersion:g.version},id);state.tab='tasks';render(true);toast('资料已保存，请确认当前版本计划');}catch(err){$('#data-error').textContent=err.message;}finally{b.disabled=false;busy=false;}});
$('#login-form').onsubmit=async e=>{
 e.preventDefault();const f=e.target,b=e.submitter;b.disabled=true;$('#login-error').textContent='';
 try{await post('auth/login',Object.fromEntries(new FormData(f)));f.reset();await refresh();}
 catch(err){$('#login-error').textContent=err.message;f.elements.password.select();}finally{b.disabled=false;}
};
$('#logout').onclick=async()=>{try{await post('auth/logout',{});location.reload();}catch(err){toast(err.message);}};



function updateCreateMembers(kind,only){$('#agent-options').innerHTML=$('#create-engine').value==='team'?workforceUI.memberOptions(kind,only):state.agents.filter(a=>a.enabled).map(a=>`<label class="agent-option"><input type="checkbox" name="agents" value="${a.id}" ${!only||only===a.id?'checked':''}>${esc(a.name)}</label>`).join('');}
$('#create-connected-store').onchange=()=>{const s=state.integrations?.stores.find(s=>s.id===$('#create-connected-store').value);$('#create-store').value=s?.name||'未关联店铺';$('#create-store').readOnly=!!s;};
$('#create-engine').onchange=()=>{updateCreateMembers($('#goal-kind').value);showCreateStep();};
const sourcesUI=createSourcesUI({state,api,esc,badge,toast,refresh,render,act});
const knowledgeUI=createKnowledgeUI({state,api,esc,badge,toast,refresh,render,act});
const discussionUI=createDiscussionUI({state,api,esc,receive,render,targets,drafts,storage:sessionStorage,navigate:go});
const planningUI=createPlanningUI({state,api,esc,badge,receive,render});
const businessUI=createBusinessUI({state,api,esc,badge,toast,refresh,render,openCreate,act});
const imagesUI=createImagesUI({state,api,esc,toast,refresh,render});
const contentUI=createContentUI({state,api,esc,receive,openGoal,render,act});
const setupUI=createSetupUI({state,api,esc,badge,toast,refresh,render,currentWorkspace:()=>sessionStorage.getItem('workspaceId')||'default',switchWorkspace:async id=>{sessionStorage.setItem('workspaceId',id);sessionStorage.removeItem('selectedGoal');history.replaceState(null,'','#overview/home');location.reload();}});
const workforceUI=createWorkforceUI({imagesUI,setupUI,contentUI,businessUI,knowledgeUI,sourcesUI,state,api,esc,badge,toast,refresh,render,navigate:go,legacyPage:platformEmployees,openRun:async id=>{runPreviewId=id;$('#run-input').textContent='正在载入…';$('#run-output').textContent='正在载入…';$('#run-diagnosis').textContent='';$('#run-pick-action').hidden=true;delete $('#run-data').dataset.run;$('#run-dialog').showModal();await updateRunPreview();}});

const pickBrowser=createPickBrowser({state,act,esc,render});
const flowsUI=createFlowsUI({expandedPanels,readQuotes:setupUI.readQuotes,pickBrowser,state,api,esc,badge,act,receive,refresh,render,toast,openCreate,knowledgeUI,sourcesUI,discussionUI,drafts});
const initialRoute=applyRoute(location.hash.slice(1)||'overview');if(location.hash.slice(1)!==initialRoute)history.replaceState(null,'','#'+initialRoute);
initializeSelects();await refresh();setInterval(refresh,1800);
