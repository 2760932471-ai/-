import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPlatform} from '../src/platform.js';

// Only the supplier, model and image provider are simulated. Goals, dispatch,
// prerequisite checks, data persistence and delivery use the normal platform.
const samplePng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/S1sAAAAASUVORK5CYII=';
const offers = [
  {sku:'101', title:'猫粮 A', price:10, repurchase:65},
  {sku:'102', title:'猫粮 B', price:18, repurchase:30}
].map(row => ({...row, url:'https://detail.1688.com/offer/' + row.sku + '.html', terms:'元/袋'}));
const photo = sku => 'https://cbu01.alicdn.com/img/ibank/' + sku + '.jpg';
const step = (goal, capability) => goal.flow.nodes.find(node => node.capability === capability);

async function platform(t, options) {
  const dir = await mkdtemp(join(tmpdir(), 'mas-contract-'));
  t.after(() => rm(dir, {recursive:true, force:true}));
  return createPlatform(dir, options);
}

async function exercise(p, id, until) {
  for (let i = 0; i < 12; i++) {
    await p.pump();
    await p.images.pump();
    const goal = p.goals().find(item => item.id === id);
    if (until(goal)) return goal;
  }
  const goal = p.goals().find(item => item.id === id);
  assert.fail(JSON.stringify({stage:goal.stage, status:goal.flow.status, error:goal.flow.error,
    question:goal.flow.question, steps:goal.flow.nodes.map(n => [n.capability, n.status, n.error])}));
}

async function connectPlanner(t, p) {
  const variable = 'MODEL_SECRET_MAS_BEHAVIOR_TEST';
  const original = process.env[variable];
  process.env[variable] = 'fixture';
  t.after(() => {
    if (original === undefined) delete process.env[variable];
    else process.env[variable] = original;
  });
  const model = await p.workforce.saveModel(null, {name:'弱规划器', provider:'api', model:'fixture',
    endpoint:'https://api.example.com/chat', secretEnv:variable, timeoutMs:1000});
  await p.workforce.testModel(model.id);
  await p.pump();
  await p.flows.saveSettings({...p.flows.view().settings, modelId:model.id});
}

test('a weak planner cannot draw before selection or drop profit and selling points; verified MOQ changes the delivered SKU', async t => {
  const plannedNode = (id, capability, dependsOn) => ({
    id, capability, dependsOn, title:id, objective:id, acceptance:'检查交付文件'
  });
  const weakPlan = {name:'先作图再选品', rationale:'测试中的不完整提案', nodes:[
    plannedNode('draw', 'image.main', []),
    plannedNode('pick', 'sourcing.1688', ['draw']),
    plannedNode('summary', 'result.compile', ['pick'])
  ]};
  const research = [], images = [], queries = [];
  let plans = 0;
  const p = await platform(t, {
    modelCall:async (_model, messages) => {
      if (messages.length === 1) return {message:{content:'连接正常'}};
      plans++;
      return {message:{content:JSON.stringify(weakPlan)}};
    },
    offerSearch:async query => {queries.push(query); return offers;},
    offerDetail:async sku => {
      const row = offers.find(o => o.sku === sku);
      if (!row) return null;
      research.push(sku);
      const lot = sku === '101' ? '200袋起订' : '2袋起订';
      return {sku, quote:{...row, terms:row.terms + '，' + lot}, photo:photo(sku), facts:['重量：1kg']};
    },
    imageReady:() => true,
    photoDownload:async () => samplePng,
    imageCall:async (_config, input) => {
      images.push(input);
      return {base64:samplePng, width:1, height:1};
    }
  });
  await connectPlanner(t, p);
  await p.images.save({revision:0, enabled:true, provider:'codex_local'});
  const {id} = await p.create({executionMode:'flow', requestId:randomUUID(),
    text:'在1688找猫粮，新店小批量测款，最多进10袋。比较利润，售价30元，其他成本2元。给首选款制作淘宝主图和卖点文案。'});
  const goal = await exercise(p, id, g => g.stage === 'review');
  assert.equal(plans, 1);
  assert.deepEqual(queries, ['猫粮']);
  assert.deepEqual(new Set(research), new Set(['101', '102']));
  const finance = step(goal, 'sourcing.profit');
  assert.equal(finance?.status, 'succeeded');
  const amounts = goal.artifacts.filter(a => finance.artifactIds.includes(a.id)).map(a => a.body).join('\n');
  assert.match(amounts, /猫粮 A[^\n]*收益 ¥18\.00/);
  assert.match(amounts, /猫粮 B[^\n]*收益 ¥10\.00/);
  for (const offer of offers) assert.ok(amounts.includes(offer.url));
  const copy = step(goal, 'copy.selling_points');
  assert.equal(copy?.preparation?.candidate?.sku, '102');
  assert.equal(images.length, 1);
  assert.equal(images[0].referenceUrl, photo('102'));
  const report = goal.artifacts.find(a => a.title === '选品交付报告');
  assert.ok(report);
  assert.match(report.body, /推荐「猫粮 B」/);
  assert.match(report.body, /单件收益 ¥10\.00/);
  assert.match(report.body, /起订/);
  assert.equal(report.evidence, offers[1].url);
});

test('without a planner, a missing quote holds all downstream deliveries; a late quote resumes in the same task', async t => {
  const p = await platform(t, {offerSearch:async () => [offers[0]], offerDetail:async () => null});
  const {id} = await p.create({executionMode:'flow', requestId:randomUUID(),
    text:'在阿里巴巴挑选猫粮，不用问，比较两款的利润，再给我制作淘宝主图。'});
  const waiting = await exercise(p, id, g => step(g, 'sourcing.1688')?.status === 'needs_input');
  assert.equal(waiting.flow.nodes.some(n => n.capability === 'sourcing.profit'), true);
  assert.equal(waiting.artifacts.some(a => a.imageJobId || a.title === '选品交付报告'), false);
  await p.action(id, {kind:'browserOffers', expectedVersion:waiting.version, query:'猫粮', rows:[offers[1]]});
  const continued = await exercise(p, id, g => step(g, 'image.main')?.status === 'needs_input');
  assert.equal(continued.version, waiting.version);
  const finance = step(continued, 'sourcing.profit');
  assert.equal(finance.status, 'succeeded');
  const calculation = [finance.error, ...continued.artifacts.filter(a => finance.artifactIds.includes(a.id)).map(a => a.body)].join('\n');
  assert.match(calculation, /售价|零售/);
  assert.match(calculation, /成本|费用/);
  assert.doesNotMatch(calculation, /(?:利润|收益)(?:为|是)?\s*[¥￥]\s*\d/);
  assert.match(step(continued, 'image.main').error, /图片|生图/);
  assert.notEqual(continued.stage, 'review');
  assert.equal(continued.artifacts.some(a => a.imageJobId || a.title === '选品交付报告'), false);
});

test('a strict trial order limit with no feasible SKU never triggers a paid listing image', async t => {
  const expensiveLots = offers.map(row => ({...row, terms:'元/袋，200袋起订'}));
  const checked = [];
  let renders = 0;
  const p = await platform(t, {
    offerSearch:async () => offers,
    offerDetail:async sku => {
      checked.push(sku);
      return {sku, quote:expensiveLots.find(row => row.sku === sku), photo:photo(sku)};
    },
    imageReady:() => true,
    photoDownload:async () => samplePng,
    imageCall:async () => {renders++; return {base64:samplePng, width:1, height:1};}
  });
  await p.images.save({revision:0, enabled:true, provider:'codex_local'});
  const {id} = await p.create({executionMode:'flow', requestId:randomUUID(),
    text:'在1688选猫粮，新店首批最多进10袋，给合适的那款制作淘宝主图。'});
  const blocked = await exercise(p, id, g => step(g, 'sourcing.1688')?.status === 'needs_input');
  assert.deepEqual(new Set(checked), new Set(['101', '102']));
  assert.match(step(blocked, 'sourcing.1688').error, /起订|首批/);
  assert.notEqual(blocked.stage, 'review');
  assert.equal(renders, 0);
  assert.equal(blocked.artifacts.some(a => a.imageJobId), false);
});

test('a break-even request uses the arithmetic skill without a model and cites the supplied unit costs', async t => {
  const p = await platform(t, {});
  const {id} = await p.create({executionMode:'flow', requestId:randomUUID(), text:'算出这款商品的单件保本价。'});
  const waiting = await exercise(p, id, g => step(g, 'price.break_even')?.status === 'needs_input');
  assert.equal(waiting.artifacts.some(a => a.title === '单件保本价测算'), false);
  const costs = {goods:16, fulfillment:2, ads:1, returns:1, other:0, feeRate:5, source:'店内单件费用明细'};
  await p.action(id, {kind:'inputs', expectedVersion:waiting.version, data:{unitCosts:costs}});
  const done = await exercise(p, id, g => g.stage === 'review');
  const result = done.artifacts.find(a => a.version === done.version && a.title === '单件保本价测算');
  assert.match(result?.body, /21\.06 元/);
  assert.equal(result.evidence, costs.source);
  assert.equal(done.flow.nodes.some(n => n.capability === 'analysis.reason'), false);
  assert.match(done.messages.at(-1).text, /21\.06/);
});
