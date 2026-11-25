import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanOffers,decisionOrder,goalSelection,sourcingIntent,sourcingReport} from '../public/sourcing.js';
import {profitComparison} from '../src/taskflows/deliveries.js';
import {taskMemory} from '../src/taskflows/memory.js';

const offers=cleanOffers([['110','甲款',10],['220','乙款',20]].map(([sku,title,price])=>({
 title,url:'https://detail.1688.com/offer/'+sku+'.html',price,terms:'元/件，1件起订'
})));
const brief='在1688找灯具，冬天卖得好，比较利润，售价50元，其他成本5元';
const basis=sourcingIntent(brief);
const sale=(sku,period,value,extra={})=>({
 sku,period,value,scope:'exact',source:'淘宝零售记录',kind:'knowledge',strength:'document',
 dimension:'demand',unit:'件',metric:'unitsSold',...extra
});
const price=(sku,value,scope='exact')=>({sku,scope,value,source:'淘宝零售报价记录',kind:'knowledge',strength:'document',dimension:'retail',unit:'元',metric:'listingPrice'});
const observations=[
 sale('110','2025-12',10),sale('220','2025-12',100),
 sale('110','2026年7月',90),sale('220','2026年7月',5)
];

test('the same sourcing offers change order with the requested retail period; checkpoint, memory and reports agree',()=>{
 const nodes=[
  {capability:'sourcing.1688',status:'succeeded',selection:{sku:'110'},offers},
  {capability:'research.compare',status:'succeeded',selection:{sku:'220'},investigation:{observations}},
 ];
 const goal={text:brief,version:1,flow:{nodes},artifacts:[]};
 assert.equal(basis.season,'冬季');assert.equal(basis.compareProfit,true);
 const winter=goalSelection(goal);
 assert.equal(winter.winner.sku,'220');assert.equal(winter.rows[0].sku,'220');
 assert.equal(winter.rows[0].market.contribution[0],2500);
 const report=sourcingReport(goal);
 assert.equal(report.selection.sku,'220');
 assert.match(report.text,/2025-12.*100 件/);assert.match(report.text,/首选贡献 ¥2500.00，备选 ¥350.00/);
 assert.equal(taskMemory(goal).selection.selected.sku,'220');
 const profit=profitComparison(winter.rows,winter.winner,winter.criteria);
 assert.match(profit.body,/甲款.+350.00/);assert.match(profit.body,/乙款.+2500.00/);
 const summerText=brief.replace('冬天','夏天');
 assert.equal(decisionOrder(offers,sourcingIntent(summerText),summerText,{observations})[0].sku,'110');
});

test('brand totals, unmatched months and conflicting measurements never become SKU contributions',()=>{
 const scopeObs=[sale('110','2025-12',10),sale('220','2024-12',100),sale('220','2025-12',99999,{scope:'category'}),
  sale('110','2025-12',12),sale('220','2025-12',13),sale('220','2025-12',999,{scope:'comparable'})];
 const rows=decisionOrder(offers,basis,brief,{observations:scopeObs});
 assert.ok(rows.every(row=>!row.market.sample&&!row.market.contribution));
 const report=profitComparison(rows,rows[0],basis);
 assert.match(report.body,/各款缺少共同统计窗口/);assert.match(report.body,/品类需求线索/);
 assert.doesNotMatch(report.body,/贡献 ¥99999/);
});

test('separates a listing-based fee ceiling from a contribution, respects unknown-cost and eligibility constraints',()=>{
 const text='在1688找灯具，比较利润';const criteria=sourcingIntent(text);
 const investigation={observations:[price('110',90,'category'),price('110',30,'comparable'),price('220',80)]};
 const rows=decisionOrder(offers,criteria,text,investigation);
 assert.equal(rows[0].sku,'220');assert.deepEqual(rows[0].market.priceRange,[80,80]);
 assert.equal(rows[0].margin,null);assert.equal(rows[0].market.margin,null);
 assert.deepEqual(rows[0].market.feeCeiling,[60,60]);assert.deepEqual(rows[1].market.priceRange,[30,30]);
 assert.match(profitComparison(rows,rows[0],criteria).body,/其他费用 ¥60.00/);
 const costKnown=decisionOrder(offers,{...criteria,expenses:5},text,investigation);
 assert.equal(costKnown[0].market.margin[0],55);assert.equal(costKnown[0].margin,null);
 const variable=decisionOrder(offers,{...criteria,fees:{shipping:5,service:1,promotion:9}},text,{observations:[]});
 assert.equal(variable[0].market.breakEvenSale,16.67);
 assert.match(profitComparison(variable,variable[0],criteria).body,/估算保本售价 ¥16.67/);
 const constrained=decisionOrder(offers,{...criteria,maxUnitPrice:15},text,investigation);
 assert.equal(constrained[0].sku,'110');assert.equal(constrained[1].eligibility,'excluded');
 const minimum=decisionOrder(offers,{...criteria,minUnitMargin:1},text,investigation);
 assert.ok(minimum.every(row=>row.eligibility==='unverified'));
});
