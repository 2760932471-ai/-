export function createPlanningUI({state,api,esc,badge,receive,render}){
 const choices=new Map(),pending=new Set(),errors=new Map();
 function panel(g){
  if(g.mode!=='team')return '';
  const plan=g.planProposal||g.executionPlan,editable=g.stage==='plan'&&!g.paused,waiting=pending.has(g.id),models=state.workforce?.models||[];
  const choice=choices.get(g.id)||'rules';
  const names=ids=>ids.map(id=>state.workforce?.skills.find(s=>s.id===id)?.name||id).join('、');
  return `<section class="planning-panel" aria-label="总控分工"><div class="section-title"><div><small>PLAN · CHECK · EXECUTE</small><h3>总控分工</h3><p>先核对工作与资料，再让员工开始执行。</p></div>${badge(g.planProposal?'待你确认':g.executionPlan?'已采用分工':'尚未生成')}</div>
   ${editable?`<div class="planning-controls"><label for="planning-model">分工方式<select id="planning-model" data-plan-choice="${g.id}" ${waiting?'disabled':''}><option value="rules" ${choice==='rules'?'selected':''}>基础分工 · 不消耗模型额度</option>${models.map(m=>{const ready=m.credentialConfigured&&m.lastTest?.status==='succeeded'&&m.lastTest.revision===m.revision;return `<option value="${esc(m.id)}" ${choice===m.id?'selected':''} ${ready?'':'disabled'}>${esc(m.name)}${ready?' · 模型分工':' · 先完成连接测试'}</option>`;}).join('')}</select></label><button class="secondary" data-plan-generate="${g.id}" ${waiting?'disabled':''}>${waiting?'正在生成与检查…':plan?'重新生成分工':'生成分工并检查资料'}</button></div><p class="field-hint">模型分工只发送目标、业务范围与成员能力目录；不发送账单和知识库正文。没有可用模型时，可先用基础分工。</p>`:''}
   <p class="form-error" role="alert">${esc(errors.get(g.id)||'')}</p><div role="status" class="field-hint">${waiting?'正在整理步骤，原计划保持不变。你可以切换页面，结果会保存在此目标。':''}</div>
   ${plan?`<p>${esc(plan.summary)}</p><small>${plan.mode==='model'?'模型分工 · '+esc(plan.model.name):'基础分工 · 本地规则'} · 资料 v${plan.goalVersion}</small><ol class="planning-steps">${plan.steps.map((s,i)=>`<li><span class="planning-number">${String(i+1).padStart(2,'0')}</span><div><strong>${esc(s.employeeName)}</strong><p>${esc(s.objective)}</p><small>调用：${esc(names(s.skillIds))}</small><p class="planning-deliverable">交付标准：${esc(s.deliverable)}</p><small>${i?'收到上一步交付后继续':'确认计划后开始'}</small></div></li>`).join('')}</ol>
   <details class="planning-checks" open><summary>资料检查 · ${plan.checks.filter(c=>c.status==='missing').length} 项待补 · ${plan.checks.filter(c=>c.status==='runtime').length} 项执行时核验</summary><p class="field-hint">这是生成分工时的检查快照，不代表业务结论已验证。修改资料后请重新生成分工。</p>${plan.checks.map(c=>`<div class="planning-check"><strong>${esc(c.name)} · ${{ready:'输入校验通过',missing:'待补资料',runtime:'运行时核验'}[c.status]}</strong><p>${esc(c.missing.length?c.missing.join('；'):c.detail)}</p></div>`).join('')}</details>
   <details class="planning-notes"><summary>需要你确认的边界</summary><ul>${plan.notes.map(n=>`<li>${esc(n)}</li>`).join('')}</ul></details>
   ${g.planProposal&&editable?`<div class="action-buttons"><button class="primary" data-plan-adopt="${g.id}" ${waiting?'disabled':''}>采用这份分工</button><button class="secondary" data-plan-discard="${g.id}" ${waiting?'disabled':''}>放弃草案</button><button class="text-button" data-tab="facts">去补充资料 →</button></div><p class="field-hint">采用后仍需点击“确认计划”才会执行；补充资料会使这份草案失效。</p>`:''}`:'<p class="note">保留你选择的成员，列出每步负责员工、调用能力与交付标准，并检查本地资料。不会自动增加成员或执行外部业务动作。</p>'}
  </section>`;
 }
 document.addEventListener('change',event=>{const el=event.target.closest('[data-plan-choice]');if(el)choices.set(el.dataset.planChoice,el.value);});
 document.addEventListener('click',async event=>{
  const b=event.target.closest('[data-plan-generate],[data-plan-adopt],[data-plan-discard]');if(!b)return;
  const id=b.dataset.planGenerate||b.dataset.planAdopt||b.dataset.planDiscard,g=state.goals.find(g=>g.id===id);if(!g||pending.has(id))return;
  pending.add(id);errors.delete(id);render(true);
  try{
   let updated;
   if(b.dataset.planGenerate){const choice=choices.get(id)||'rules';updated=await api(`goals/${id}/planning`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedVersion:g.version,mode:choice==='rules'?'rules':'model',modelId:choice==='rules'?undefined:choice})});}
   else updated=await api(`goals/${id}/actions`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:b.dataset.planAdopt?'adoptPlan':'discardPlan',expectedVersion:g.version,proposalId:g.planProposal?.id})});
   receive(updated);
  }catch(error){errors.set(id,error.message);}
  finally{pending.delete(id);render(true);}
 });
 return {panel};
}
