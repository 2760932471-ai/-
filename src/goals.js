import { randomUUID as goalUUID } from 'node:crypto';

const goalNow = () => new Date().toISOString();
const goalAgentNames = { insight:'经营分析 Agent', product:'商品运营 Agent', content:'内容营销 Agent', service:'客户服务 Agent' };
function goalEvent(g, text, card) { g.messages.push({id:goalUUID(),role:'coordinator',author:'数字员工',text,card,at:goalNow()}); }
function goalAudit(g,action,detail) { g.audit.push({id:goalUUID(),action,detail,at:goalNow(),version:g.version}); }
function requireStage(g,stages) { if(!stages.includes(g.stage))throw new Error('目标状态已变化，请刷新后重试'); }
function updateGoalTasks(g) {
 const passed = g.kind==='listing' && g.permission==='draft' ? {facts:0,plan:1,draft:2,review:3,completed:4}[g.stage] : g.kind==='listing' ? {facts:0,plan:1,draft:2,approval:3,ready:3,submitted:4,observing:5,review:5,completed:6}[g.stage] : {plan:0,draft:1,review:2,completed:3}[g.stage];
 g.tasks.forEach((t,i)=>{t.status=i<passed?'completed':i===passed?(g.paused?'paused':g.stage==='approval'?'approval':g.stage==='plan'?'confirmation':g.stage==='review'?'acceptance':g.stage==='facts'?'waiting':g.stage==='observing'?'observing':'active'):'pending';});
}
export function createGoal(input={}) {
 const text=typeof input.text==='string'?input.text.trim():'';
 if(!text||text.length>2000)throw new Error('请输入 1–2000 字的目标');
 const members=[...new Set(input.members||[])];
 if(!members.length||members.some(id=>!goalAgentNames[id]))throw new Error('请至少选择一个有效 Agent');
 if(!['listing','analysis'].includes(input.kind))throw new Error('请选择目标类型');
 if(!['draft','approval'].includes(input.permission))throw new Error('请选择执行边界');
 const listing=input.kind==='listing';
 const g={id:goalUUID(),roomId:goalUUID(),sourceGoal:typeof input.sourceGoal==='string'?input.sourceGoal:null,text,kind:input.kind,members,mode:'demo',createdAt:goalNow(),version:1,stage:listing?'facts':'plan',paused:false,repliesPaused:false,
  scope:{platform:'天猫（演示）',store:'慕雅居示例店',sku:listing?'DEMO-JF-001':'店铺汇总（演示）',product:listing?'角阀 · 样例商品':'经营分析',window:7},
  criterion:listing?(input.permission==='draft'?'基于已确认规格形成上新草案，由负责人确认交付；不执行发布':'商品状态核验通过，完成 7 天经营观察；贡献利润率目标 15%（演示阈值）'):'形成有来源和限制说明的分析建议，由负责人确认交付',
  permission:listing?input.permission:'draft',owner:'你',coordinator:listing?'商品运营数字员工':'经营分析数字员工',
  facts:{confirmed:false,material:'待确认',connector:'待确认',cost:null,stock:null,source:'未确认；仅可载入虚构样例资料'},
  proposal:{title:'角阀｜材质与接口待核验',price:29.9},approval:null,execution:null,review:null,
  messages:[],queue:[],artifacts:[],audit:[],tasks:[]};
 const titles=listing&&g.permission==='draft'?['核验商品事实','确认协作计划','准备上新草案','验收草案交付']:listing?['核验商品事实','确认协作计划','准备上新草案','审批并提交发布','核验商品状态','观察与经营复盘']:['确认分析计划','准备分析交付物','验收与复盘'];
 const owners=listing?['product','product','content','product','product','insight']:['insight','insight','insight'];
 g.tasks=titles.map((title,i)=>({id:goalUUID(),goalId:g.id,title,owner:members.includes(owners[i])?owners[i]:members[0],dependsOn:i?i-1:null,status:'pending'}));
 g.messages.push({id:goalUUID(),role:'human',author:'你',text,at:goalNow()});
 goalEvent(g,listing?'目标已建立。先核验商品事实，再准备草案。发布需独立审批；当前所有资料与操作均为演示。':'目标已建立。先确认分析计划，再准备建议；此目标不会进入商品发布流程。',listing?'facts':'plan');
 updateGoalTasks(g);goalAudit(g,'created','目标、任务与协作空间同时建立');return g;
}
export function goalAction(g,input={}) {
 const kind=input.kind;
 if(kind==='message'){
  const text=typeof input.text==='string'?input.text.trim():'';
  if(!text||text.length>2000)throw new Error('请输入 1–2000 字的消息');
  const target=input.target||'coordinator';
  if(target!=='coordinator'&&!g.members.includes(target))throw new Error('该 Agent 未参与此目标');
  if(g.queue.length>=24)throw new Error('待回复消息已满，请稍后发送');
  const intent=['discuss','context','change'].includes(input.intent)?input.intent:'discuss';
  const mentioned=g.members.find(id=>text.includes('@'+goalAgentNames[id].replace(' Agent','')));
  const m={id:goalUUID(),role:'human',author:'你',text,intent,at:goalNow()};g.messages.push(m);
  g.queue.push({id:goalUUID(),source:m.id,target:mentioned||target,intent});
 }else if(kind==='pauseReplies'){
  g.repliesPaused=!g.repliesPaused;
 }else if(kind==='pause'){
  if(g.stage==='completed')throw new Error('已结束的目标无需暂停');
  g.paused=!g.paused;goalEvent(g,g.paused?'目标推进已暂停。讨论仍可继续；已经提交的外部动作不能通过暂停撤回。':'目标已恢复，可从原检查点继续。');goalAudit(g,kind,g.paused?'暂停目标推进':'恢复目标推进');
 }else{
  if(g.paused)throw new Error('请先恢复目标推进');
  if(kind==='facts'){
   requireStage(g,['facts']);
   g.facts={confirmed:true,material:'黄铜（虚构样例）',connector:'G1/2（虚构样例）',cost:12,stock:200,source:'内置演示商品资料卡 / DEMO-SPEC-001',confirmedBy:'你',confirmedAt:goalNow()};
   g.proposal.title='黄铜角阀 G1/2｜样例发布草案';g.stage='plan';goalEvent(g,'已载入并确认演示资料。请确认任务顺序与交付标准。','plan');
  }else if(kind==='plan'){
   requireStage(g,['plan']);g.stage='draft';goalEvent(g,`计划 v${g.version} 已确认。专长 Agent 将按任务需要参与；不会让每位成员重复回复。`,'draft');
  }else if(kind==='draft'){
   requireStage(g,['draft']);
   const listing=g.kind==='listing';
   g.artifacts.push({id:goalUUID(),goalId:g.id,taskId:g.tasks[listing?2:1].id,version:g.version,title:listing?'商品上新草案':'经营分析建议',status:'draft',body:listing?`标题：${g.proposal.title}\n售价：¥${g.proposal.price.toFixed(2)}\nSKU：${g.scope.sku}\n材质：${g.facts.material}\n接口：${g.facts.connector}\n库存：${g.facts.stock} 件\n\n卖点文案、安装适配与售后话术需人工核验。不得将本样例规格用于真实商品。`:`目标：${g.text}\n\n1. 校验商品、订单与费用口径。\n2. 按 SKU 比较贡献利润与退款情况。\n3. 优先核查高销量低利润商品，形成调整建议。\n\n尚未连接真实数据，本内容只演示分析交付格式，没有证实任何经营结论。`,evidence:listing?g.facts.source:'内置分析模板；未读取真实经营数据'});
   g.stage=listing&&g.permission==='approval'?'approval':'review';
   if(g.stage==='approval')g.approval={id:goalUUID(),version:g.version,status:'pending',payload:JSON.stringify({scope:g.scope,proposal:g.proposal}),requestedAt:goalNow()};
   goalEvent(g,'草案已生成，可在交付物中预览。'+(g.stage==='approval'?'请检查精确发布内容后审批。':'当前权限仅准备草案，请验收交付。'),g.stage==='approval'?'approval':'review');
  }else if(kind==='revise'){
   requireStage(g,['plan','draft','approval','ready']);
   if(g.kind!=='listing')throw new Error('此目标没有发布内容');
   const price=Number(input.price), title=String(input.title||'').trim();
   if(!Number.isFinite(price)||price<=0||price>100000||!title||title.length>120)throw new Error('请输入有效标题和售价（0–100000 元，不含 0）');
   g.proposal={title,price};g.version++;if(g.approval)g.approval.status='invalidated';
   g.artifacts.forEach(a=>{if(a.status==='draft')a.status='superseded';});g.stage='plan';
   goalEvent(g,`发布内容已调整为 v${g.version}。旧审批失效，需重新确认计划与草案。`,'plan');
  }else if(kind==='approve'){
   requireStage(g,['approval']);
   if(input.version!==g.version||input.approvalId!==g.approval?.id||g.approval.status!=='pending')throw new Error('审批版本已变化，请重新检查当前动作');
   g.approval.status='approved';g.approval.approvedAt=goalNow();g.approval.approvedBy='你';g.stage='ready';goalEvent(g,`发布草案 v${g.version} 已获批准，尚未提交。`,'execute');
  }else if(kind==='reject'){
   requireStage(g,['approval']);const reason=String(input.reason||'').trim();if(!reason)throw new Error('请填写退回原因');g.approval.status='rejected';g.approval.reason=reason;g.version++;g.artifacts.forEach(a=>{if(a.status==='draft')a.status='superseded';});g.stage='plan';goalEvent(g,'审批已退回：'+reason+'。重新准备后需再次审批。','plan');
  }else if(kind==='execute'){
   if(g.stage==='submitted')return g;
   requireStage(g,['ready']);
   if(g.approval?.status!=='approved'||g.approval.version!==g.version||g.approval.payload!==JSON.stringify({scope:g.scope,proposal:g.proposal}))throw new Error('缺少有效审批，无法提交');
   g.execution={id:goalUUID(),key:`${g.id}:publish:${g.version}`,status:'submitted',submittedAt:goalNow(),version:g.version,receipt:'DEMO-'+g.id.slice(0,8)};g.stage='submitted';goalEvent(g,'模拟发布请求已提交，等待回读核验；提交成功不代表商品已上架。','verify');
  }else if(kind==='verify'){
   requireStage(g,['submitted']);
   if(input.mismatch){g.execution.status='mismatch';g.execution.error='演示异常：平台售价与审批草案不一致';goalEvent(g,'回读发现售价不一致，目标保持待核验。请核查平台后重试回读，不重复发布。','verify');}
   else{g.execution.status='verified';g.execution.verifiedAt=goalNow();g.execution.evidence='内置模拟回执：商品可售，SKU / 售价 / 标题匹配 v'+g.version;g.stage='observing';g.artifacts.filter(a=>a.version===g.version).forEach(a=>a.status='verified');goalEvent(g,'模拟核验通过，进入 7 天经营观察。当前还不能判断经营目标是否达成。','observe');}
  }else if(kind==='observe'){
   requireStage(g,['observing']);g.review={window:'模拟上架后第 1–7 天',netSales:3000,goods:1200,fees:150,fulfillment:300,ads:600,returns:150,other:0,profit:600,rate:20,target:15,baseline:null,source:'内置虚构经营账单 / DEMO-PNL-001',result:'样例利润率达到 15% 阈值；无对照基线，不能归因于 AI 或宣称提升。'};g.stage='review';goalEvent(g,'已载入 7 天演示数据。复盘显示口径、费用和限制，等待负责人验收。','review');
  }else if(kind==='complete'){
   requireStage(g,['review']);g.stage='completed';g.artifacts.filter(a=>a.version===g.version&&a.status==='draft').forEach(a=>a.status='accepted');goalEvent(g,'负责人已确认交付，本目标已结束。可从复盘创建下一轮优化目标。','completed');
  }else throw new Error('不支持的操作');
  goalAudit(g,kind,kind==='revise'?JSON.stringify(g.proposal):kind==='reject'?input.reason:`状态：${g.stage}`);
 }
 updateGoalTasks(g);g.updatedAt=goalNow();return g;
}
export function tickGoal(g) {
 if(g.repliesPaused||!g.queue.length)return false;
 const job=g.queue.shift(),source=g.messages.find(m=>m.id===job.source);
 const author=job.target==='coordinator'?g.coordinator:goalAgentNames[job.target];
 let text=job.intent==='context'?'已记录这条背景资料，供后续分析参考。商品事实仍以资料卡中的已确认字段为准。':job.intent==='change'?'已记录变更请求。请通过“调整发布内容”确认具体变更；确认后会生成新版本，并使旧审批失效。':'收到。当前目标需要先完成「'+g.tasks.find(t=>t.status!=='completed')?.title+'」。可在任务与资料中查看依据和下一步。';
 if(g.stage==='completed')text='目标已结束，仍可继续讨论。需要执行新工作时，请从复盘创建下一轮目标。';
 g.messages.push({id:goalUUID(),role:job.target==='coordinator'?'coordinator':'agent',author,text:'（演示回复）'+text,replyTo:source.id,at:goalNow()});
 return true;
}
