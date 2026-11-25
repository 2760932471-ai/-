import {businessBrief,cleanOffers, expenseDescription, scenarioExpenses, rankedOffers, selectedOffer, sourcingIntent, sourcingReport} from '../../public/sourcing.js';

// Rebuild from the persisted checkpoint so older goals, retries and superseded
// images use the same evidence as the runner. Never serialize model credentials.
export function taskMemory(goal, nodes = goal.flow?.nodes || []) {
 const steps = nodes.map(node => ({
  capability: node.capability, title: node.title, status: node.status,
  issue: node.error || undefined, method: node.offerSource || undefined,
  attempts: node.sourceAttempts,
  files: (node.artifactIds || []).flatMap(id => {
   const file = goal.artifacts?.find(a => a.id === id && a.version === goal.version && a.status !== 'superseded');
   return file ? [{id, title: file.title, evidence: file.evidence?.slice(0, 300), excerpt: file.body?.slice(0, 500)}] : [];
  })
 }));
 const memory = {version: goal.version, steps};
 const pick = nodes.find(n => n.capability === 'sourcing.1688' && n.status === 'succeeded');
 const basis = sourcingIntent(businessBrief(goal));
 if (!pick || !basis) return memory;
 const offers = cleanOffers(pick.offers);
 const deliveredSku=nodes.find(n=>n.capability.startsWith('image.')&&n.status==='succeeded'&&n.preparation?.candidate)?.preparation.candidate.sku;
 const best = deliveredSku ? rankedOffers(offers,basis).find(row=>row.sku===deliveredSku) : selectedOffer(offers, basis, businessBrief(goal));
 if (!best) return memory;
 memory.selection = {
  count: offers.length, grams:basis.grams, category: basis.query, asOf: pick.finishedAt, method: pick.offerSource,
  selected: {sku: best.sku, name: best.title, url: best.url, price: best.price, cost: best.cost, terms: best.terms, quoteNotes: best.quoteNotes},
  retail: best.retail, expenses: best.expenses, fees: basis.fees, estimatedMargin: best.margin,
  openQuestions: [
   ...offers.filter(row=>row.quoteNotes?.length).map(row=>row.title+' 报价或单位待核对：'+row.quoteNotes.join(' / ')),
   ...(best.cost===null&&!best.quoteNotes?.length?['销售规格与报价单位尚未对应']:[]),
   ...(best.retail === null ? ['待确认零售价'] : []),
   ...(best.expenses === null && !basis.fees ? ['待确认其他单件成本'] : []),
   '展示报价对应的规格、计价单位和起订量需向供应商核对'
  ]
 };
 return memory;
}

// Reuse successful methods across comparable goals in this workspace, never
// carry an old supplier quote or store-specific financial assumption into a new one.
export function relatedMethods(goal, goals, capabilities = []) {
 const category = sourcingIntent(businessBrief(goal))?.query;
 const comparable = capabilities.filter(c=>!['evidence.collect','result.compile','analysis.reason'].includes(c));
 if (!category && !comparable.length) return [];
 return goals.filter(other => other.id !== goal.id && other.mode === 'flow' &&
  ['review','completed'].includes(other.stage) &&
  (category ? sourcingIntent(other.text)?.query === category :
   comparable.every(capability=>other.flow.nodes.some(n=>n.capability===capability&&n.status==='succeeded'))) &&
  (other.storeConnectionId || other.scope?.store) === (goal.storeConnectionId || goal.scope?.store))
  .slice(0, 3).flatMap(other => {
   const pick = other.flow.nodes.find(n => n.capability === 'sourcing.1688' && n.status === 'succeeded');
   const steps=other.flow.nodes.filter(n=>n.status==='succeeded').map(n=>({capability:n.capability,dependsOn:n.dependsOn.map(id=>other.flow.nodes.find(p=>p.id===id)?.capability)}));
   return [{category, method:pick?.offerSource, steps, usedAt:other.flow.nodes.find(n=>n.capability==='result.compile')?.finishedAt, goalId:other.id}];
  });
}

export function recalledReply(goal, question) {
 const memory = taskMemory(goal);
 const selection = memory.selection;
 const statusQuestion = /进度|做到哪|卡在哪|完成了吗|好了吗/.test(question);
 if (statusQuestion) {
  const blocked = memory.steps.find(s => ['failed','needs_input','needs_capability'].includes(s.status));
  return blocked ? '当前停在「' + blocked.title + '」。' + (blocked.issue || '') :
   '已完成 ' + memory.steps.filter(s => s.status === 'succeeded').length + ' / ' + memory.steps.length + ' 步。';
 }
 if (selection) {
  // A what-if is a read-only calculation. Only parse an unambiguous sale
  // price, never treat a proposed freight charge as the total per-unit cost.
  const price = question.match(/(?:如果|假设|要是)?(?:售价|卖价|定价|卖到|卖)\s*(?:改为|改成|降到|调到|按|为)?\s*[¥￥]?\s*(\d{1,7}(?:\.\d{1,2})?)\s*元?(?:的话)?[，,、？? ]*(?:每[件袋单])?(?:还(?:能)?|能|有)?(?:赚|盈利|利润|有利润|有多少收益|划算)/);
  if (price && Number(price[1]) > 0 && !/运费|快递|推广|佣金|服务费|其他成本|折扣/.test(question)) {
   const {selected} = selection;
   const sale = Number(price[1]);
   const expenses = scenarioExpenses(selection,sale);
   if(selected.quoteNotes?.length)return '「'+selected.name+'」有多种报价或计价单位：'+selected.quoteNotes.join(' / ')+'。需确认对应规格后才能计算。';
   if(selected.cost===null)return '「'+selected.name+'」的报价是 ¥'+selected.price+'（'+selected.terms+'），还需要确认每单规格与这条报价的对应关系。';
   if (expenses === null) return '「' + selected.name + '」的页面报价是 ¥' + selected.price + '。还缺其他单件成本，需计入运费和费用后才能估算收益。';
   const margin = (sale - selected.cost - expenses).toFixed(2);
   return '沿用「' + selected.name + '」的已存报价，按同一销售单位试算：售价 ¥' + sale + ' − 采购成本 ¥' + selected.cost + ' − 其他单件成本 ¥' + expenses + ' = 预计单件收益 ¥' + margin + '。' + (selection.fees ? expenseDescription(selection)+'。' : '') + selection.openQuestions.filter(issue=>issue!=='待确认零售价').join('；') + '。\n' + selected.url;
  }
  if (/为什么选|为啥选|选了哪|推荐哪|选品结论|推荐理由|选品依据/.test(question)) {
   const report = sourcingReport(goal);
   if (report) return report.text + '\n来源：' + (selection.method||'已保存的 1688 报价') + ' · ' + report.source + '\n待核实：' + selection.openQuestions.join('；') + '。';
  }
 }
 if (/怎么做的|怎么做成|复盘一下|执行记忆|用了哪些来源|还有什么待核实|哪些没确认/.test(question)) {
  const lines = memory.steps.filter(s => s.files.length || s.issue).map(s =>
   s.title + ' · ' + (s.issue || s.files.map(f => f.title).join('、')) +
   (s.method ? '（' + s.method + '）' : '') + (s.attempts?.length ? '\n' + s.attempts.join('；') : ''));
  if (selection) lines.push('待核实：' + selection.openQuestions.join('；'));
  return lines.join('\n') || '这个目标还没有已交付的结果。';
 }
 return null;
}
