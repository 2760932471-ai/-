import test from 'node:test';
import assert from 'node:assert/strict';
import {rememberSearch,collectSearch,readSearch} from '../browser-connector/collect-1688.js';

test('a login interrupt preserves the binding and the collector resumes on the same search after login',async t=>{
 const key='bb000000-0000-4000-a000-000000000001',query='露营灯',doc='search-doc';
 const tab={id:42,windowId:8,url:'https://s.1688.com/selloffer/offer_search.htm?keywords='+encodeURIComponent(query)+'#pick-'+key};
 const saved={},rows=Array.from({length:12},(_,i)=>({url:'https://detail.1688.com/offer/'+i+'.html'}));
 let phase='login',reads=0,visible=true;
 const previous=globalThis.chrome;t.after(()=>{if(previous)globalThis.chrome=previous;else delete globalThis.chrome;});
 globalThis.chrome={tabs:{query:async()=>visible?[tab]:[]},storage:{session:{get:async k=>structuredClone(k===null?saved:{[k]:saved[k]}),set:async v=>Object.assign(saved,structuredClone(v)),remove:async ks=>ks.forEach(k=>delete saved[k])}},scripting:{executeScript:async({func,args})=>{
  if(func.name==='readOfferCards'){reads++;return [{documentId:doc,result:rows}];}
  assert.equal(args[0].advance,undefined);return [{documentId:doc,result:phase}];
 }}};
 await rememberSearch(tab);assert.equal((await collectSearch(tab)).phase,'login');assert.equal(reads,0);
 tab.url=tab.url.split('#')[0];phase='ready';saved['pick1688:42'].checked-=10000;
 const cmd={key,query},sender={tab:{windowId:8}};
 const resumed=await readSearch(cmd,sender);assert.equal(resumed.phase,'complete');assert.equal(resumed.rows.length,12);
 visible=false;assert.equal((await readSearch(cmd,sender)).rows.length,12);
 assert.equal((await readSearch(cmd,{tab:{windowId:9}})).phase,'unavailable');
 assert.equal((await readSearch({...cmd,query:'其他品类'},sender)).phase,'unavailable');
});
