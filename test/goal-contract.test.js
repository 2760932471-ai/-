import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGoalContract} from '../src/taskflows/contract.js';
import {sourcingIntent} from '../public/sourcing.js';
import {imageOutputs} from '../src/workforce/content-preparation.js';

const build=(text,context={})=>buildGoalContract({text,...context});
const capabilities=contract=>contract.requirements.map(row=>row.capability);
const step=(contract,cap)=>contract.requirements.find(row=>row.capability===cap);

test('the platform maps requested outputs to a common selection and profit decision',()=>{
 for(const text of ['在1688选猫粮','去阿里巴巴挑选猫粮','在1688上找卖得好的猫粮'])assert.equal(sourcingIntent(text).query,'猫粮');
 const contract=build('在1688选猫粮，小批量试单，最多进10袋，比较各款利润，做淘宝主图并告诉我卖点');
 assert.equal(contract.criteria.query,'猫粮');
 assert.deepEqual(contract.criteria.maxMinimumOrder,{count:10,unit:'袋'});
 assert.deepEqual(step(contract,'sourcing.profit').dependsOn,['research.compare']);
 for(const cap of ['image.main','copy.selling_points'])assert.deepEqual(step(contract,cap).dependsOn,['sourcing.profit']);
 assert.match(contract.pending.join(' '),/实际成交价/);
 assert.equal(contract.question,null);
});

test('examples, explicit exclusions and a selected SKU do not start a new sourcing or image job',()=>{
 const contract=build('商品来自1688，不用重新选品，只做主图；例如“去1688找花洒，制作详情图和视频脚本”');
 assert.deepEqual(capabilities(contract),['evidence.collect','image.main','result.compile']);
 assert.ok(contract.excludedCapabilities.includes('sourcing.1688'));
 assert.ok(contract.excludedCapabilities.includes('image.detail'));
 assert.equal(sourcingIntent('分析1688选品案例'),null);
 assert.equal(sourcingIntent('给之前在1688选好的猫粮改主图'),null);
 assert.equal(build('分析活动收益').requirements[1].fallback,true);
 assert.deepEqual(imageOutputs('不要做主图，给现有商品写卖点'),[]);
 assert.deepEqual(imageOutputs('只做主图设计简报'),[]);
 assert.deepEqual(imageOutputs('给猫粮制作主图，别出详情图'),['main']);
 assert.deepEqual(imageOutputs('只需要主图和卖点文案'),['main']);
});

test('criteria distinguish procurement limits from prices, freight and preferences',()=>{
 const {criteria}=build('在1688选猫粮，起订量不超过20袋，采购单价上限8元，首批采购预算300元（含运费），需要稳定供货');
 assert.deepEqual(criteria.maxMinimumOrder,{count:20,unit:'袋'});
 assert.equal(criteria.maxUnitPrice,8);
 assert.equal(criteria.maxBatchCost,300);
 assert.equal(criteria.batchBudgetIncludesFreight,true);
 assert.equal(criteria.stableSupply,true);
 const threshold=sourcingIntent('在1688选猫粮，单件利润至少3元，毛利率不低于15%，在达标款中选单件收益最高的');
 assert.equal(threshold.minUnitMargin,3);
 assert.equal(threshold.minMarginRate,15);
 assert.equal(threshold.decisionPriority,'unitMargin');
 assert.equal(sourcingIntent('在1688选猫粮，售价12美元').retail,null);
 const second=sourcingIntent('在1688选猫粮，活动预算500元，快递8元，不需要小批量试单');
 for(const field of ['smallTrial','maxMinimumOrder','maxUnitPrice','maxBatchCost','batchBudgetIncludesFreight'])assert.equal(second[field],undefined);
});

test('a known category or a clarification supplies missing context without adding tasks from it',()=>{
 assert.match(build('在1688选品').question,/品类/);
 assert.equal(build('在1688选品',{scope:{product:'猫粮'}}).criteria.query,'猫粮');
 const scenario={question:build('在1688选品').question,answer:'猫粮，小批量测款，不用主图'};
 const clarified=build('在1688选品',{scenario});
 assert.equal(clarified.criteria.query,'猫粮');
 assert.equal(clarified.criteria.smallTrial,true);
 assert.equal(clarified.question,null);
 assert.deepEqual(capabilities(clarified),['evidence.collect','sourcing.1688','result.compile']);
 const answer=build('在1688找猫粮，推荐最有利润的品',{scenario:{answer:'线下老客稳定补货，举例“要做主图”'}});
 assert.equal(answer.question,null);
 assert.equal(answer.criteria.stableSupply,true);
 assert.equal(step(answer,'image.main'),undefined);
});

test('non-sourcing outputs keep independent checks, and unsupported deliverables remain explicit',()=>{
 const goal=build('算出保本价，核算库存覆盖天数，另外导出 Excel');
 assert.deepEqual(step(goal,'price.break_even').dependsOn,['evidence.collect']);
 assert.deepEqual(step(goal,'inventory.coverage').dependsOn,['evidence.collect']);
 assert.deepEqual(new Set(step(goal,'result.compile').dependsOn),new Set(['price.break_even','inventory.coverage']));
 assert.deepEqual(goal.unresolvedRequests,['另外导出 Excel']);
 assert.deepEqual(capabilities(build('对比两套 CRM 私域运营方案的实施风险')),['evidence.collect','research.compare','analysis.reason','result.compile']);
 const employee={assignedEmployeeId:'flow-sourcing'};
 assert.equal(build('水龙头',employee).criteria.query,'水龙头');
 assert.equal(build('美团联盟找货并铺到闲鱼',employee).criteria,null);
 assert.equal(build('按现有采购单测算保本价',employee).criteria,null);
});

test('a two-sentence winter sourcing goal is actionable and carries the selection into public deliverables',()=>{
 const request='在1688上找卖得好的杯子，选完品给我清单，并且选一个最有利润、最能在冬天卖出去的产品，帮我做能上架到淘宝的主图、告诉我卖点';
 const result=build(request),brief=result.decision;
 assert.equal(result.question,null);assert.equal(brief.season,'冬季');assert.equal(brief.channel,'淘宝');
 assert.equal(brief.subject,'杯子');assert.equal(brief.kind,'sourcing');
 assert.ok(brief.questions.find(q=>q.kind==='retail'&&/杯子/.test(q.query)));
 assert.ok(brief.questions.find(q=>q.kind==='demand'&&/冬季/.test(q.query)));
 assert.deepEqual(step(result,'research.compare').dependsOn,['sourcing.1688']);
 assert.deepEqual(step(result,'delivery.review').dependsOn.sort(),['copy.selling_points','image.main']);
 assert.deepEqual(step(result,'result.compile').dependsOn,['delivery.review']);
 assert.equal(build('帮我处理一下').question?.includes('什么对象'),true);
});

test('comparison criteria can come from the user and respect workspace-only investigation',()=>{
 const result=build('比较飞书和钉钉，关注知识迁移和权限颗粒度，不用联网');
 assert.equal(result.question,null);assert.equal(result.decision.sources,'workspace');
 assert.ok(result.decision.criteria.includes('知识迁移'));
 assert.ok(result.decision.questions.some(q=>q.kind==='criterion'&&q.query.includes('权限颗粒度')));
 assert.deepEqual(step(result,'analysis.reason').dependsOn,['research.compare']);
 assert.equal(step(result,'delivery.review'),undefined);
});

test('contextual references use current materials and goal clarification retains the original request',()=>{
 assert.match(build('帮我安排一下这个').question,/什么对象/);
 assert.match(build('帮我做个方案').question,/什么对象/);
 assert.match(build('处理一下',{version:2,artifacts:[{version:1,status:'superseded'}]}).question,/什么对象/);
 assert.equal(build('处理一下',{version:2,artifacts:[{version:2,status:'draft',title:'活动清单'}]}).question,null);
 const goal=build('帮我做个方案，不要作图',{scenario:{kind:'goal',question:'你希望我处理什么对象？',answer:'对比两个 CRM 平台的迁移成本'}});
 assert.equal(goal.question,null);
 assert.ok(goal.requirements.some(n=>n.capability==='research.compare'));
 assert.ok(goal.excludedCapabilities.includes('image.main'));
});
