import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanOffers,decisionOrder,selectedOffer,sourcingIntent,sourcingReport} from '../public/sourcing.js';
import {publicProducts,publicOfferDetail} from '../src/taskflows/offer-search.js';

function offer(id,price,terms){
 return {url:'https://detail.1688.com/offer/'+id+'.html',title:'猫粮 '+id,price,terms,repurchase:50};
}

test('MOQ, purchase price and first-batch budget are gates before profit ranking',()=>{
 const basis={retail:30,expenses:0,maxMinimumOrder:{count:10,unit:'袋'},maxUnitPrice:15,maxBatchCost:30};
 const rows=[
  offer(1,1,'元/袋；50袋起订'), offer(2,10,'元/袋；3袋起订'), offer(3,9,'元/袋；4袋起订'),
  offer(4,5,'元/袋；2箱起订'), offer(5,16,'元/袋；1袋起订'), offer(6,1,'2袋起订')
 ];
 const ranked=decisionOrder(cleanOffers(rows),basis,'我想比较利润');
 assert.deepEqual(ranked.map(r=>[r.sku,r.eligibility]).sort(),[
  ['1','excluded'],['2','eligible'],['3','excluded'],['4','unverified'],['5','excluded'],['6','unverified']
 ]);
 assert.equal(ranked[0].sku,'2');
 assert.equal(ranked[0].firstBatchCost,30);
 assert.equal(selectedOffer(rows.filter(r=>r!==rows[1]),basis,'利润'),undefined);
});

test('a stated minimum profit requires compatible units, retail and expenses; borderline margins pass',()=>{
 const offers=[offer(1,8,'元/件'),offer(2,9,'元/件'),offer(3,1,'')];
 const basis=sourcingIntent('在1688找猫粮，单件利润至少10元，利润率至少50%，售价20元，其他成本2元');
 assert.equal(basis.minUnitMargin,10);
 assert.equal(basis.minMarginRate,50);
 const results=decisionOrder(cleanOffers(offers),basis,'高利润');
 assert.deepEqual(results.map(row=>[row.sku,row.eligibility]),[['1','eligible'],['3','unverified'],['2','excluded']]);
 assert.equal(selectedOffer(offers,{...basis,retail:null},'高利润'),undefined);
 assert.equal(selectedOffer(offers,{...basis,expenses:null},'高利润'),undefined);
 assert.equal(selectedOffer(offers,{...basis,minMarginRate:51},'高利润'),undefined);
 assert.equal(selectedOffer(offers,{},'高利润').sku,'3');
});

test('explicit decision metric controls the winner and report after both candidates pass the trial-order cap',()=>{
 const offers=[offer(1,18,'元/袋；2袋起订'),offer(2,10,'元/袋；3袋起订')];
 const base='在1688找猫粮，新店小批量测款，最多进10袋，售价30元，其他成本2元，';
 const nodes=[{capability:'sourcing.1688',status:'succeeded',offers}];
 const profitGoal=base+'在满足条件的款中选单件利润最高的';
 const trialGoal=base+'以低起订量为第一优先，利润高一些也好';
 for(const [text,expected,reason] of [[profitGoal,'2',/首选每件多 ¥8.00/],[trialGoal,'1',/所选款起订量最低/]]){
  assert.equal(selectedOffer(offers,sourcingIntent(text),text).sku,expected);
  const report=sourcingReport({text,version:1,artifacts:[],flow:{nodes}});
  assert.equal(report.selection.sku,expected);
  assert.match(report.text,reason);
 }
});

test('inbound first-batch freight is distinct from per-sale shipping; missing information can be enriched',()=>{
 const basis={maxBatchCost:50,batchBudgetIncludesFreight:true,fees:{shipping:0,service:0,promotion:0}};
 const card=offer(1,4,'元/袋');
 const lot=offer(1,4,'10袋起订');
 assert.equal(selectedOffer([card,lot],basis,''),undefined);
 const winning=selectedOffer([card,lot,offer(1,4,'首批运费10元')],basis,'');
 assert.equal(winning.firstBatchCost,40);
 assert.equal(selectedOffer([card,lot,offer(1,4,'首批运费11元')],basis,''),undefined);
});

test('stable replenishment uses disclosed dispatch time; unmatched images, old copy and superseded files are excluded',()=>{
 const offers=[offer(1,2,'元/袋；10袋起订'),offer(2,6,'元/袋；10袋起订；48小时内发货')];
 const flow={nodes:[
  {capability:'sourcing.1688',status:'succeeded',offers,selection:{sku:'2'}},
  ...['1','2'].map(sku=>({capability:'image.main',status:'succeeded',imageJobId:'job'+sku,preparation:{candidate:{sku}}})),
  {capability:'copy.selling_points',status:'succeeded',preparation:{candidate:{sku:'1'}},artifactIds:['old-copy']}
 ]};
 const artifacts=['1','2'].map(sku=>({version:1,id:sku,title:'主图 '+sku,imageJobId:'job'+sku}))
  .concat({version:1,id:'x',title:'旧图',status:'superseded',imageJobId:'job2'},{version:1,id:'old-copy',body:'推荐文案：旧款专属卖点'});
 const goal={text:'在1688找猫粮，优先稳定补货',flow,artifacts,version:1};
 assert.equal(selectedOffer(offers,{stableSupply:true},goal.text).sku,'2');
 const result=sourcingReport(goal);
 assert.equal(result.selection.sku,'2');
 assert.deepEqual(result.imageIds,['2']);
 assert.match(result.text,/48 小时内发货.*履约记录|48 小时内发货.*准时交付记录/s);
 assert.doesNotMatch(result.text,/旧款专属卖点|旧图/);
 goal.text+='，起订不超过2袋';
 assert.equal(sourcingReport(goal),null);
});

test('like-for-like recorded fulfillment takes priority over a faster promise in a replenishment scenario',()=>{
 const offers=[offer(1,2,'元/袋；24小时内发货；近30天准时发货率75%'),offer(2,6,'元/袋；48小时内发货；近30天准时发货率98%')];
 assert.equal(selectedOffer(offers,{stableSupply:true},'稳定补货').sku,'2');
 offers[1].terms='元/袋；48小时内发货；近7天准时发货率98%';
 assert.equal(selectedOffer(offers,{stableSupply:true},'稳定补货').sku,'1');
});

test('structured public detail supplies purchase units and order minimum with the same quote',()=>{
 const product=offer(12,7,'');
 const schema={'@type':'Product',name:product.title,url:product.url,offers:{price:7,priceCurrency:'CNY',eligibleQuantity:{minValue:3,unitText:'袋'},priceSpecification:{price:7,referenceQuantity:{value:1,unitText:'袋'}}}};
 const html='<script type="application/ld+json">'+JSON.stringify(schema)+'</script>';
 const detail=publicOfferDetail(html,'12').quote;
 for(const quote of [publicProducts(html)[0],detail]){
  const selected=selectedOffer([quote],{maxBatchCost:21},'');
  assert.equal(selected?.firstBatchCost,21);
 }
});
