import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createPlatform} from '../src/platform.js';
import {publicOfferDetail} from '../src/taskflows/offer-search.js';
import {taskMemory, relatedMethods} from '../src/taskflows/memory.js';
import {cleanOffers,rankedOffers} from '../public/sourcing.js';

const goalText='在1688找卖得好的猫粮，售价69.9元，快递8元，服务费0.6%，推广12%';
const url=id=>'https://detail.1688.com/offer/'+id+'.html';
const product=(sku,price)=>({title:'猫粮 '+sku,url:url(sku),price});
test('sourcing switches to verified detail quotes and reuses the method with fresh prices after restart',async t=>{
 const dir=await mkdtemp('/tmp/goal-memory-');
 t.after(()=>rm(dir,{recursive:true,force:true}));
 let attempts=0,price=32.3;
 const options={
  offerSearch:async()=>{attempts++;throw Error('unavailable');},
  searchCall:async()=>['123','456','789'].map(id=>({title:'猫粮',url:url(id),content:'¥0.01（未证实）'})),
  offerDetail:async id=>({sku:id,quote:id==='789'?product('999',0.01):product(id,id==='123'?price:45)})
 };
 let p=await createPlatform(dir,options);
 await p.integrations.saveSearch({revision:0,provider:'tavily',enabled:true,secretEnv:'SEARCH_SECRET_PRIMARY',readOnlyConfirmed:true});
 await p.integrations.testSearch({query:'猫粮',site:'1688.com'});
 async function run(){
  const g=await p.create({text:goalText,executionMode:'flow',requestId:randomUUID()});
  for(let i=0;i<3;i++)await p.pump();
  return p.goals().find(x=>x.id===g.id);
 }
 const first=await run();
 assert.equal(first.stage,'review');
 let memory=taskMemory(first);
 assert.equal(memory.selection.count,2);
 assert.equal(memory.selection.estimatedMargin,20.79);
 assert.match(memory.steps.find(s=>s.capability==='sourcing.1688').attempts.join(' '),/未能读取.*回查 3.*取得 2/);
 await p.action(first.id,{kind:'complete',expectedVersion:1});
 p=await createPlatform(dir,options);
 const answer=await p.action(first.id,{kind:'message',text:'卖59.9元还能赚多少？'});
 assert.match(answer.messages.at(-1).text,/预计单件收益 ¥12.05/);
 assert.match(answer.messages.at(-1).text,/服务费 0.6%/);
 assert.equal(answer.stage,'completed');
 assert.equal(answer.flow.calls,first.flow.calls);
 price=39;
 const second=await run();
 assert.equal(attempts,1);
 assert.equal(second.flow.previousMethods[0].goalId,first.id);
 assert.equal(taskMemory(second).selection.selected.price,39);
 assert.equal(relatedMethods({...second,scope:{store:'另一家店'}},[first]).length,0);
});

test('conflicting prices and units stay alongside the SKU through persistence and suppress its margin',()=>{
 const offers=cleanOffers([{...product('123',3.23),terms:'元/斤'},{...product('123',3.20),terms:'元/公斤'},product('456',40)]);
 const persisted=cleanOffers(JSON.parse(JSON.stringify(offers)));
 assert.deepEqual(persisted,offers);
 const ranked=rankedOffers(persisted,{retail:69.9,expenses:16.81});
 assert.equal(ranked[0].sku,'456');
 assert.equal(ranked[1].margin,null);
 assert.match(ranked[1].quoteNotes.join(' '),/3.23.*斤.*3.2.*公斤/);
 const g={text:goalText,version:1,artifacts:[],flow:{nodes:[{capability:'sourcing.1688',status:'succeeded',offers}]}};
 assert.match(taskMemory(g).selection.openQuestions.join(' '),/3.23.*3.2/);
});

test('detail quotes must identify the selected product with an explicit currency',()=>{
 const page=offer=>'<script type="application/ld+json">'+JSON.stringify({'@type':'Product',name:'猫粮',url:url('123'),offers:offer})+'</script>';
 for(const offer of [{price:32.3},{priceCurrency:'USD',price:32.3},{priceCurrency:'CNY',price:0},{url:url('456'),priceCurrency:'CNY',price:32.3}]){
  assert.equal(publicOfferDetail(page(offer),'123').quote,undefined);
 }
 assert.equal(publicOfferDetail(page({priceCurrency:'CNY',price:32.3}),'123').quote.price,32.3);
});

test('per-jin and per-kilogram quotes use the explicit sale weight, and a missing unit stays unknown',()=>{
 const offers=[{...product('101',3.23),terms:'元/斤'},{...product('102',18.98),terms:'元/kg'},product('103',1)];
 const goal={text:goalText+'，每单10斤',version:1,artifacts:[],flow:{nodes:[{capability:'sourcing.1688',status:'succeeded',offers}]}};
 const memory=taskMemory(goal);
 assert.equal(memory.selection.grams,5000);
 assert.equal(memory.selection.selected.sku,'101');
 assert.equal(memory.selection.selected.cost,32.3);
 assert.equal(memory.selection.estimatedMargin,20.79);
 const rows=rankedOffers(offers,{grams:5000,retail:69.9,expenses:16.81});
 assert.equal(rows.find(r=>r.url===url('102')).cost,94.9);
 assert.equal(rows.find(r=>r.url===url('103')).margin,null);
 const detail={'@type':'Product',url:url('101'),name:'猫粮',offers:{priceSpecification:{price:12,priceCurrency:'CNY',referenceQuantity:{value:1,unitCode:'KGM'}}}};
 assert.match(publicOfferDetail('<script type="application/ld+json">'+JSON.stringify(detail)+'</script>','101').quote.terms,/元\/1公斤/);
});
