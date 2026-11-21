import test from 'node:test';import assert from 'node:assert/strict';
import {pushOne,destination} from '../src/stock-push.js';
import {createMarketConnectors} from '../src/market-connectors.js';
test('background reminder includes live stock and listing identity, retries unsuccessful receipt and stops after success',async()=>{
 const d={},market=createMarketConnectors({getData:()=>d,transaction:f=>f(d)});
 await market.confirmBrowser({confirmed:true,shopId:'X1',listingId:'101',title:'双人餐',priceFen:10900,sourceName:'美团联盟 · 001'});
 const calls=[],ctx={market,env:{STOCK_NOTICE_WEBHOOK_DEFAULT:'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=fixture'},workspace:'default',name:'test',stock:async()=>3,send:async(u,o)=>{calls.push(JSON.parse(o.body));return Response.json({errcode:calls.length===1?1:0});}};
 await pushOne({...ctx,env:{}});assert.equal(calls.length,0);
 await pushOne(ctx);assert.equal(d.stockNotices[0].push,'pending');await pushOne(ctx);assert.equal(calls.length,1);
 d.stockNotices[0].nextAttempt=0;await pushOne(ctx);await pushOne(ctx);
 assert.equal(calls.length,2);assert.match(calls[1].text.content,/双人餐[\s\S]*101[\s\S]*109\.00[\s\S]*美团联盟[\s\S]*3 张/);
 assert.equal(d.stockNotices[0].push,'sent');assert.equal(destination('other',ctx.env),null);
});
