import test from 'node:test';
import assert from 'node:assert/strict';
import {createMarketConnectors} from '../src/market-connectors.js';
import {basicFlow} from '../src/taskflows/planner.js';

function fixture({lostReceipt=false}={}){
 const offer={id:'sku-1',title:'双人餐',currency:'CNY',priceFen:9800,rights:'resale',channels:['xianyu'],fulfillment:'商户核销',terms:'指定门店，预约使用',validUntil:'2099-01-01T00:00:00Z'};
 const source={id:'source',revision:1,enabled:true,kind:'supplier',mode:'http',offerPlatform:'meituan_union'};
 const target={id:'store',shopId:'S01',revision:2,platform:'xianyu',driver:'gateway',endpoint:'https://test.example/',enabled:true,listingEnabled:true,lastTest:{revision:2,status:'succeeded',scopes:['listing.create']}};
 const data={sources:[source],stores:[target]},writes=[];
 const request=async(_,args)=>{
  if(args.operation==='offer.search')return {value:{schemaVersion:1,items:[offer]}};
  if(args.operation==='offer.get')return {value:{schemaVersion:1,item:offer}};
  writes.push(args);if(lostReceipt)throw new Error('timeout');return {value:{schemaVersion:1,shopId:'S01',listingId:'12345',status:'published'}};
 };
 const service=createMarketConnectors({getData:()=>data,transaction:async fn=>fn(data),request});
 return {offer,target,writes,service};
}
const params={sourceId:'source',storeId:'store',offerId:'sku-1',priceFen:10900};
test('route distinguishes promotion and resale; publishing rechecks current offer and scope',async()=>{
 const {offer,target,writes,service}=fixture();
 offer.rights='promotion';const result=await service.search({...params,query:'双人餐'});assert.match(result.items[0].blocker,/推广/);
 await assert.rejects(()=>service.prepare(params),/推广/);offer.rights='resale';
 const draft=await service.prepare(params),confirm={id:draft.id,revision:draft.revision,confirmed:true};
 target.lastTest.scopes=[];await assert.rejects(()=>service.publish(confirm),/权限/);target.lastTest.scopes=['listing.create'];
 offer.channels=[];await assert.rejects(()=>service.publish(confirm),/渠道|平台/);offer.channels=['xianyu'];
 offer.priceFen++;await assert.rejects(()=>service.publish(confirm),/变化/);offer.priceFen--;
 assert.equal(writes.length,0);
 const results=await Promise.allSettled([service.publish(confirm),service.publish(confirm)]);
 assert.equal(writes.length,1);assert.equal(results.find(r=>r.status==='fulfilled').value.listingId,'12345');
 assert.equal(writes[0].idempotencyKey,draft.id);
});
test('controller routes an alliance sourcing goal to the commerce connector',()=>{
 for(const text of ['美团联盟选品','在咸鱼找水龙头'])assert(basicFlow({text}).nodes.some(n=>n.capability==='product.compare'));
 for(const text of ['从美团联盟选品放到闲鱼卖','从美团联盟找餐券，放到咸鱼卖'])assert(basicFlow({text}).nodes.some(n=>n.capability==='market.offers'));
});

test('a missing publication receipt is never replayed as a new listing',async()=>{
 const {service,writes}=fixture({lostReceipt:true});
 const draft=await service.prepare(params),input={id:draft.id,revision:draft.revision,confirmed:true};
 assert.equal((await service.publish(input)).status,'unknown');
 await assert.rejects(()=>service.publish(input),/状态/);
 await assert.rejects(()=>service.prepare(params),/发布记录/);
 assert.equal(writes.length,1);
});

test('only confirmed Xianyu listings notify; manual and API receipts share one reminder per store and listing',async()=>{
 const failed=fixture({lostReceipt:true}),bad=await failed.service.prepare(params);
 await failed.service.publish({id:bad.id,revision:bad.revision,confirmed:true});
 assert.equal(failed.service.listNotices().length,0);
 const {service}=fixture(),d=await service.prepare(params);
 assert.equal(service.listNotices().length,0);
 await service.publish({id:d.id,revision:d.revision,confirmed:true});
 const [n]=service.listNotices();assert.equal(n.shopId,'S01');assert.equal(n.listingId,'12345');assert.equal(n.title,'双人餐');
 const same=await service.confirmBrowser({...n,confirmed:true});assert.equal(same.id,n.id);assert.equal(service.listNotices().length,1);
 await service.readNotice({id:n.id});assert.equal(service.listNotices()[0].read,true);
});
