import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {createPlatform} from '../src/platform.js';
import {createNativeStoreTransport,parsePlatformJSON,platformId,topSignature,douyinSignature} from '../src/store-native.js';
const config={name:'测试淘宝店',platform:'taobao',driver:'official',url:'https://shop.example.com',shopId:'123',enabled:true,writesEnabled:true,appKeyEnv:'STORE_APP_KEY_TEST',appSecretEnv:'STORE_APP_SECRET_TEST',accessTokenEnv:'STORE_ACCESS_TOKEN_TEST'};
async function fixture(t,options={}){
 const dir=await mkdtemp('/tmp/store-ops-');t.after(()=>rm(dir,{recursive:true,force:true}));let product={id:'1234567890123456789',title:'测试花洒',state:'offline',quantity:30,updatedAt:'v1',reviewStatus:3},calls=[],wrong=false,behavior='success';
 const nativeStoreCall=async(c,op,input)=>{calls.push(op);if(options.hook)await options.hook(op);if(op==='identity')return {shopId:wrong?'456':c.shopId};if(op==='list')return {items:[structuredClone(product)],page:1,total:1};if(op==='detail')return structuredClone(product);if(behavior==='unknown')throw new Error('timeout');if(behavior==='rejected')throw Object.assign(new Error('平台拒绝'),{outcome:'rejected',storeSafe:true});if(behavior!=='delay')product.state=op;return {accepted:true};};
 const p=await createPlatform(dir,{nativeStoreCall});const store=await p.integrations.saveStore(null,config);return {p,store,dir,nativeStoreCall,product,calls,setWrong:v=>wrong=v,setBehavior:v=>behavior=v,prepare:()=>p.storeOperations.prepare(store.id,{productId:product.id,action:'online'})};
}
test('read, prepare, explicit confirmation, write and readback; repeat confirm never resubmits',async t=>{
 const f=await fixture(t),{p,store}=f;await p.integrations.testStore(store.id);assert.equal(p.integrations.view().stores[0].connection.identityOnly,true);assert.equal((await p.storeOperations.list(store.id,{state:'offline'})).items.length,1);const o=await f.prepare();assert.equal(f.calls.filter(x=>x==='online').length,0);await assert.rejects(()=>p.storeOperations.confirm(store.id,o.id,{}),/明确确认/);const done=await p.storeOperations.confirm(store.id,o.id,{confirmed:true});assert.equal(done.status,'succeeded');assert.equal(done.observed.state,'online');await p.storeOperations.confirm(store.id,o.id,{confirmed:true});assert.equal(f.calls.filter(x=>x==='online').length,1);
});
test('changed product, wrong shop and disabled write each stop before dispatch',async t=>{
 const f=await fixture(t),{p,store}=f;let o=await f.prepare();f.product.quantity++;assert.equal((await p.storeOperations.confirm(store.id,o.id,{confirmed:true})).status,'not_sent');f.setWrong(true);await assert.rejects(f.prepare,/店铺 ID 不匹配/);f.setWrong(false);o=await f.prepare();await p.integrations.saveStore(store.id,{...config,revision:1,writesEnabled:false});assert.equal((await p.storeOperations.confirm(store.id,o.id,{confirmed:true})).status,'not_sent');assert(!f.calls.includes('online'));
});
test('timeout is unknown; blocks new writes, supports read-only verification and human resolution',async t=>{
 const f=await fixture(t),{p,store}=f;f.setBehavior('unknown');const o=await f.prepare();assert.equal((await p.storeOperations.confirm(store.id,o.id,{confirmed:true})).status,'unknown');await p.storeOperations.confirm(store.id,o.id,{confirmed:true});assert.equal((await p.storeOperations.verify(store.id,o.id)).status,'unknown');await assert.rejects(f.prepare,/待核验/);assert.equal(f.calls.filter(x=>x==='online').length,1);await assert.rejects(()=>p.storeOperations.resolve(store.id,o.id,{confirmed:true,note:'没成功'}),/至少 10 字/);assert.equal((await p.storeOperations.resolve(store.id,o.id,{confirmed:true,note:'已在商家后台核对商品仍为下架状态'})).status,'closed');assert.equal((await f.prepare()).status,'prepared');
});
test('accepted write is not success until the observed platform state changes',async t=>{
 const f=await fixture(t);f.setBehavior('delay');const o=await f.prepare();assert.equal((await f.p.storeOperations.confirm(f.store.id,o.id,{confirmed:true})).status,'verifying');f.product.state='online';assert.equal((await f.p.storeOperations.verify(f.store.id,o.id)).status,'succeeded');
});
test('two prepared operations for one item and double clicks dispatch at most once',async t=>{
 let release,entered;const started=new Promise(r=>entered=r);const f=await fixture(t,{hook:op=>{if(op==='online'){entered();return new Promise(r=>release=r);}}});const a=await f.prepare(),b=await f.prepare(),first=f.p.storeOperations.confirm(f.store.id,a.id,{confirmed:true});await started;await f.p.storeOperations.confirm(f.store.id,a.id,{confirmed:true});const second=await f.p.storeOperations.confirm(f.store.id,b.id,{confirmed:true});assert.equal(second.status,'not_sent');release();await first;assert.equal(f.calls.filter(x=>x==='online').length,1);
});
test('restart converts submitting into unknown and never replays platform writes',async t=>{
 const f=await fixture(t),o=await f.prepare();const file=f.dir+'/platform.json',d=JSON.parse(await readFile(file,'utf8'));d.storeOperations[0].status='submitting';await writeFile(file,JSON.stringify(d));const restarted=await createPlatform(f.dir,{nativeStoreCall:f.nativeStoreCall});assert.equal(restarted.storeOperations.history(f.store.id)[0].status,'unknown');await restarted.storeOperations.confirm(f.store.id,o.id,{confirmed:true});assert(!f.calls.includes('online'));
});
test('platform rejection is retained without false success; records survive reload and cannot cross shops',async t=>{
 const f=await fixture(t);f.setBehavior('rejected');const o=await f.prepare();assert.equal((await f.p.storeOperations.confirm(f.store.id,o.id,{confirmed:true})).status,'rejected');await assert.rejects(()=>f.p.storeOperations.confirm('other',o.id,{confirmed:true}),/不存在/);const p=await createPlatform(f.dir,{nativeStoreCall:f.nativeStoreCall});assert.equal(p.storeOperations.history(f.store.id)[0].status,'rejected');
});
test('unsafe numeric platform IDs retain exact source; numeric or overflowing input IDs rejected',()=>{
 assert.equal(parsePlatformJSON('{"id":1234567890123456789}').id,'1234567890123456789');assert.throws(()=>platformId(123),/字符串/);assert.throws(()=>platformId('9223372036854775808'),/字符串/);
});
test('official transports sign requests, normalize IDs, post exact long IDs and reject platform errors',async t=>{
 const prior=process.env.AGENT_ALLOWED_HOSTS;process.env.AGENT_ALLOWED_HOSTS='eco.taobao.com,openapi-fxg.jinritemai.com';t.after(()=>prior===undefined?delete process.env.AGENT_ALLOWED_HOSTS:process.env.AGENT_ALLOWED_HOSTS=prior);
 const env={STORE_APP_KEY_TEST:'test-key',STORE_APP_SECRET_TEST:'test-secret-private',STORE_ACCESS_TOKEN_TEST:'test-token-private',PLATFORM_TOKEN:'test-admin-token'},calls=[];
 const transport=createNativeStoreTransport({env,now:()=>1700000000000,resolve:async()=>[{address:'8.8.8.8',family:4}],fetch:async(u,o)=>{calls.push({u,o});if(u.includes('jinritemai')){if(u.includes('/product/detail'))return new Response('{"code":10000,"data":{"product_id":1234567890123456789,"name":"测试","status":1,"check_status":3}}');return new Response('{"code":10000,"data":{}}');}const p=new URLSearchParams(o.body);assert.equal(p.get('sign'),topSignature(Object.fromEntries([...p].filter(([k])=>k!=='sign')),env.STORE_APP_SECRET_TEST));assert.equal(p.get('num'),'30');return new Response('{"item_update_listing_response":{"item":{"num_iid":123}}}');}});
 const d={...config,platform:'douyin'};const p=await transport(d,'detail',{productId:'1234567890123456789'});assert.equal(p.id,'1234567890123456789');await transport(d,'online',{productId:p.id});const last=calls.at(-1);assert.equal(last.o.body,'{"product_id":1234567890123456789}');assert.equal(last.o.redirect,'error');const params=Object.fromEntries(new URL(last.u).searchParams);assert.equal(params.sign,douyinSignature({...params,param_json:last.o.body},env.STORE_APP_SECRET_TEST));await transport(config,'online',{productId:'123',quantity:30});
 const denied=createNativeStoreTransport({env,resolve:async()=>[{address:'8.8.8.8',family:4}],fetch:async()=>new Response('{"code":40001,"msg":"sensitive platform response"}')});await assert.rejects(()=>denied(d,'offline',{productId:p.id}),e=>e.outcome==='rejected'&&!e.message.includes('sensitive'));
 const noLogin=createNativeStoreTransport({env:{...env,PLATFORM_TOKEN:''}});await assert.rejects(()=>noLogin(config,'online',{productId:'123',quantity:30}),/PLATFORM_TOKEN/);
});
