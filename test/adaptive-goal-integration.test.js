import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPlatform} from '../src/platform.js';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/S1sAAAAASUVORK5CYII=';
const cups = [
  {sku:'123', title:'皓月双饮杯子 500ml'},
  {sku:'456', title:'清泉随行杯子 500ml'}
].map(row => ({...row, price:10, terms:'元/件', url:'https://detail.1688.com/offer/' + row.sku + '.html'}));
const photo = sku => 'https://cbu01.alicdn.com/img/ibank/' + sku + '.jpg';
const step = (goal, capability) => goal.flow.nodes.find(n => n.capability === capability);
const request = season => '在1688上找卖得好的杯子，给我清单，选最有利润、最能在' + season +
  '卖出去的产品。售价30元，其他成本2元，给首选做一张淘宝主图并告诉我卖点。';

async function workspace(t) {
  const dir = await mkdtemp(join(tmpdir(), 'mas-adaptive-goal-'));
  t.after(() => rm(dir, {recursive:true, force:true}));
  return dir;
}

async function saveEvidence(platform, document) {
  return platform.knowledge.saveDocument(null, {baseId:'kb-default', enabled:true, confirmed:true,
    size:700, overlap:100, ...document});
}

function supplierTools(images) {
  return {
    offerSearch:async () => cups,
    offerDetail:async sku => ({sku, quote:cups.find(c => c.sku === sku), photo:photo(sku), facts:['容量：500ml']}),
    photoDownload:async () => png,
    imageReady:() => true,
    imageCall:async (_config, input) => {
      images.push(input.referenceUrl);
      return {base64:png, width:1, height:1};
    }
  };
}

async function createTask(platform, text) {
  return platform.create({executionMode:'flow', requestId:randomUUID(), text});
}

async function deliver(platform, id) {
  for (let pass = 0; pass < 25; pass++) {
    await platform.pump();
    await platform.images.pump();
    const goal = platform.goals().find(g => g.id === id);
    if (goal.stage === 'review') return goal;
  }
  const goal = platform.goals().find(g => g.id === id);
  assert.fail(JSON.stringify({status:goal.flow.status, question:goal.flow.question, error:goal.flow.error,
    steps:goal.flow.nodes.map(n => [n.capability, n.status, n.error])}));
}

test('changing only the sales season changes the recommended SKU, delivered photo and report', async t => {
  const images = [];
  const p = await createPlatform(await workspace(t), supplierTools(images));
  await p.images.save({revision:0, enabled:true, provider:'codex_local'});
  const windows = [
    {season:'冬季', month:'2025年12月', period:'2025-12', units:[120, 10], winner:cups[0]},
    {season:'夏季', month:'2026年7月', period:'2026-07', units:[10, 120], winner:cups[1]}
  ];
  for (const w of windows) {
    for (const [i, cup] of cups.entries()) {
      await saveEvidence(p, {sku:cup.sku, title:cup.title + ' ' + w.season + '淘宝经营记录',
        source:'淘宝经营月报 ' + w.month + ' ' + cup.title,
        body:'1688 SKU ' + cup.sku + '，' + cup.title + '。淘宝 ' + w.month + ' ' + w.season +
          '销量 ' + w.units[i] + ' 件，零售价30元。'});
    }
  }
  for (const w of windows) {
    const {id} = await createTask(p, request(w.season));
    const done = await deliver(p, id);
    const comparison = step(done, 'research.compare');
    assert.equal(comparison.selection?.sku, w.winner.sku);
    const sales = comparison.investigation.observations.filter(o => o.dimension === 'demand' &&
      o.scope === 'exact' && o.metric === 'unitsSold' && o.period === w.period);
    for (const [i, cup] of cups.entries()) {
      assert.ok(sales.some(o => o.sku === cup.sku && o.value === w.units[i]), cup.sku + ' ' + w.period);
    }
    assert.equal(step(done, 'copy.selling_points').preparation.candidate.sku, w.winner.sku);
    const report = done.artifacts.find(a => a.title === '选品交付报告');
    assert.equal(report.evidence, w.winner.url);
    assert.ok(report.body.includes(w.period));
    assert.match(report.body, /120\s*件/);
    assert.match(report.body, /10\s*件/);
    assert.match(report.body, /贡献 ¥2160\.00/);
    assert.match(report.body, /备选 ¥180\.00/);
  }
  assert.deepEqual(images, windows.map(w => photo(w.winner.sku)));
});

test('an older task waiting for an optional scenario resumes on restart and qualifies missing demand', async t => {
  const dir = await workspace(t), images = [];
  const tools = supplierTools(images);
  const first = await createPlatform(dir, tools);
  await first.images.save({revision:0, enabled:true, provider:'codex_local'});
  await saveEvidence(first, {title:'冬季杯子类目简报', source:'淘宝类目简报',
    body:'淘宝杯子类目 2025年12月 冬季销量 999 件。这里仅统计大类中的几家店铺。'});
  const {id} = await createTask(first, request('冬季'));
  const file = join(dir, 'platform.json');
  const store = JSON.parse(await readFile(file, 'utf8'));
  const goal = store.goals.find(g => g.id === id);
  goal.flow.status = 'awaiting_context';
  goal.flow.question = '这次选杯子是给谁、用在什么销售场景？';
  goal.flow.plan = null;
  goal.flow.nodes = [];
  delete goal.flow.clarificationVersion;
  await writeFile(file, JSON.stringify(store));

  const resumed = await createPlatform(dir, tools);
  const result = await deliver(resumed, id);
  assert.equal(result.version, goal.version);
  assert.equal(result.flow.question, undefined);
  const research = step(result, 'research.compare').investigation;
  assert.ok(research.observations.some(o => o.text.includes('999')));
  assert.ok(!research.observations.some(o => o.scope === 'exact' && o.metric === 'unitsSold'));
  const report = result.artifacts.find(a => a.title === '选品交付报告');
  assert.match(report.body, /暂列|待核实|尚无|小批量测试/);
  assert.doesNotMatch(report.body, /(?:该款|首选|备选)[^。\n]{0,20}(?:销量|记录)\s*999/);
  assert.equal(images.length, 1);
});

test('a two-sentence CRM comparison researches its criteria and delivers cited material without a planner model', async t => {
  const p = await createPlatform(await workspace(t));
  const dossiers = [
    {title:'云杉 CRM 方案试点', source:'项目组权限验收记录', body:'云杉 CRM 方案支持按区域限制客户可见范围。试点迁移用了三天。'},
    {title:'金杏 CRM 方案试点', source:'CRM 实施复盘会议', body:'金杏 CRM 方案只提供部门级权限。试点迁移用了一天。'}
  ];
  for (const document of dossiers) await saveEvidence(p, document);
  const {id} = await createTask(p, '比较云杉 CRM 和金杏 CRM 两套方案。重点看权限粒度与迁移成本，给采购组建议。');
  const result = await deliver(p, id);
  const caps = result.flow.nodes.map(n => n.capability);
  assert.ok(caps.includes('analysis.reason'));
  assert.ok(!caps.some(cap => /^(sourcing|image)\./.test(cap)));
  const research = step(result, 'research.compare').investigation;
  assert.ok(research.rounds.length >= 1);
  const report = result.artifacts.find(a => a.title === '目标交付汇总');
  for (const document of dossiers) {
    assert.ok(research.observations.some(o => o.source === document.source), document.source);
    assert.ok(report.body.includes(document.source), document.source);
  }
  assert.match(report.body, /按区域限制/);
  assert.match(report.body, /部门级权限/);
});
