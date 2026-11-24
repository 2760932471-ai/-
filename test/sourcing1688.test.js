import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {sourcingIntent,rankedOffers,cleanOffers} from '../public/sourcing.js';
import {publicProducts} from '../src/taskflows/offer-search.js';
import {createPlatform} from '../src/platform.js';
const text='在1688上筛选高性价比、高利润的露营灯，预计售价 89 元，单件其他成本 12 元';
const rows=[{title:'露营灯 A',url:'https://detail.1688.com/offer/123.html',price:35,repurchase:40},{title:'露营灯 B',url:'https://detail.1688.com/offer/456.html',price:42,repurchase:30}];
test('category and sourced offer ranking handle missing economic inputs',()=>{
 assert.deepEqual(sourcingIntent(text),{query:'露营灯',retail:89,expenses:12});
 assert.equal(sourcingIntent('在1688上选品').query,'');assert.equal(sourcingIntent('为水龙头做主图'),null);
 const candidates=cleanOffers([...rows,rows[0],{...rows[1],url:'https://other.example/offer/123.html'}]);assert.equal(candidates.length,2);
 const ranked=rankedOffers(candidates,sourcingIntent(text));assert.equal(ranked[0].margin,42);assert.equal(ranked[1].shortlist,false);
 assert.equal(rankedOffers(candidates,sourcingIntent('在1688找露营灯'))[0].margin,null);
 const json={'@type':'Product',name:'露营灯 A',url:rows[0].url,offers:{priceCurrency:'CNY',price:'35'}};
 assert.equal(publicProducts('<script type="application/ld+json">'+JSON.stringify(json)+'</script>')[0].price,35);
 assert.deepEqual(publicProducts('<h1>请登录</h1>'),[]);
});
for(const source of ['server','browser'])test('1688 goal to deliverable using '+source+' evidence',async t=>{
 const dir=await mkdtemp('/tmp/pick-goal-');t.after(()=>rm(dir,{recursive:true,force:true}));
 const p=await createPlatform(dir,{offerSearch:async query=>{assert.equal(query,'露营灯');return source==='server'?rows:[];}});
 const g=await p.create({executionMode:'flow',requestId:randomUUID(),text});await p.pump();await p.pump();
 const goal=()=>p.goals().find(x=>x.id===g.id);
 if(source==='browser'){
  assert.equal(goal().flow.nodes[1].status,'needs_input');
  const action={kind:'browserOffers',expectedVersion:1,query:'露营灯',rows};
  await assert.rejects(()=>p.action(g.id,{...action,query:'其他'}));await assert.rejects(()=>p.action(g.id,{...action,rows:[]}));
  const first={...action,rows:rows.slice(0,1)};
  await p.action(g.id,first);await p.action(g.id,first);assert.equal(goal().flow.nodes[1].offers.length,1);assert.match(goal().flow.nodes[1].error,/还需 1 件/);
  await p.action(g.id,{...action,rows:rows.slice(1)});await assert.rejects(()=>p.action(g.id,action));await p.pump();
 }
 await p.pump();assert.equal(goal().stage,'review');assert.match(goal().artifacts.at(-1).body,/估算单件收益 ¥42.00/);
});
