import { randomUUID } from 'node:crypto';

export const agents = [
  { id: 'insight', name: '经营分析 Agent', role: '分析店铺表现，定位经营机会', color: 'blue', initials: '析', tools: ['shop.metrics', 'product.performance'] },
  { id: 'product', name: '商品运营 Agent', role: '商品诊断、标题与卖点优化', color: 'purple', initials: '商', tools: ['product.catalog', 'product.draft'] },
  { id: 'content', name: '内容营销 Agent', role: '策划活动，生成内容与投放草案', color: 'orange', initials: '创', tools: ['knowledge.search', 'content.draft'] },
  { id: 'service', name: '客户服务 Agent', role: '归纳咨询问题，输出服务建议', color: 'green', initials: '服', tools: ['service.summary', 'service.draft'] },
];

// Specialist adapters return structured observations to one orchestrator.
// Replace an adapter with an API-backed implementation; never expose credentials to the browser.
export const demoAdapters = Object.fromEntries(agents.map(agent => [agent.id, async ({ goal }) => ({
  summary: `${agent.name}已完成分析，并将结构化结果交回数字员工。`,
  evidence: '来源：内置演示数据；未读取真实店铺',
  artifact: `针对目标「${goal}」的建议：\n\n` + (agent.id === 'insight' ? '经营诊断：演示样本中，商品详情页访问充足，但卖点表达与常见咨询存在信息断层。建议优先补齐材质、尺寸、交付说明，并观察转化变化。' : agent.id === 'product' ? '商品优化草案：补齐规格参数；按“使用场景 → 核心卖点 → 材质与尺寸 → 服务说明”组织详情页。实际商品信息需要业务人员核实。' : agent.id === 'content' ? '内容与活动草案：围绕商品使用场景生成三组内容主题；先小范围验证点击与咨询质量。预算、折扣和发布渠道均待人工确认。' : '服务建议草案：整理尺寸、材质、发货与售后四类高频咨询，补充可核实的知识条目；无法确认的信息转人工处理。'),
  goal,
})]));

export function planGoal(goal) {
  if (typeof goal !== 'string' || !goal.trim() || goal.length > 2000) throw new Error('请输入 1–2000 字的任务目标');
  const rules = [['insight', /经营|分析|数据|销售|转化|诊断|复盘/], ['product', /商品|产品|标题|详情|卖点|上新|新品/], ['content', /营销|活动|文案|内容|推广|投放|直播|双11|双十一/], ['service', /客服|客户|咨询|售后|退款|投诉/]];
  const selected = rules.filter(([,pattern])=>pattern.test(goal)).map(([id])=>id);
  if (!selected.length) selected.push('insight');
  return { selected, source:'rules', steps:selected.map(id=>({agent:id, title:agents.find(a=>a.id===id).role})), note:'根据目标关键词推荐，可在高级设置调整。当前使用演示数据。' };
}

export function createTask(goal, selected = undefined) {
  if (typeof goal !== 'string' || !goal.trim() || goal.length > 2000) throw new Error('请输入 1–2000 字的任务目标');
  const plan = planGoal(goal);
  selected ??= plan.selected;
  if (!Array.isArray(selected) || !selected.length || selected.some(id => !agents.some(a => a.id === id))) throw new Error('请至少选择一个有效的协作 Agent');
  return { id: randomUUID(), goal: goal.trim(), plan, status: 'running', createdAt: new Date().toISOString(), selected: [...new Set(selected)], cursor: 0, events: [{ type: 'plan', title: '已理解目标，建立执行计划', detail: '由数字员工统一维护任务上下文，依次调用专长 Agent，检查结果后继续。', at: new Date().toISOString() }], artifacts: [], iterations: 0, maxIterations: 8, mode: 'demo' };
}

export async function tick(task, adapters = demoAdapters) {
  if (task.status !== 'running') return task;
  const emit = (type, title, detail) => task.events.push({ type, title, detail, at: new Date().toISOString() });
  if (task.iterations >= task.maxIterations) {
    task.status = 'failed'; emit('error', '达到执行轮次上限', '请调整目标或重新发起任务。'); return task;
  }
  task.iterations++;
  if (task.cursor < task.selected.length) {
    const id = task.selected[task.cursor];
    const agent = agents.find(a => a.id === id);
    try {
      const result = await adapters[id]({ goal: task.goal, observations: task.artifacts });
      if (!result || typeof result.artifact !== 'string' || !result.artifact.trim()) throw new Error('Agent 未返回有效交付物');
      task.artifacts.push({ id: randomUUID(), agent: id, title: agent.name.replace(' Agent', '') + '报告', body: result.artifact, evidence: result.evidence });
      emit('tool', `调用 ${agent.name}`, result.summary);
      emit('observe', '检查结果并更新上下文', result.evidence);
      task.cursor++;
    } catch (error) {
      task.status = 'failed'; emit('error', '协作调用失败', String(error.message));
    }
  } else {
    task.status = 'awaiting_approval';
    emit('approval', '交付物已整理，等待你的确认', '审核草案后可确认归档或退回。本演示不会发布内容、修改商品或使用预算。');
  }
  return task;
}

export function decide(task, decision) {
  if (task.status !== 'awaiting_approval') throw new Error('任务当前不处于待审批状态');
  if (!['approve', 'reject'].includes(decision)) throw new Error('无效的审批操作');
  task.status = decision === 'approve' ? 'completed' : 'rejected';
  task.events.push({ type: decision, title: decision === 'approve' ? '草案已确认并归档' : '草案已退回', detail: '已记录人工决定；未执行任何店铺写入操作。', at: new Date().toISOString() });
  return task;
}
