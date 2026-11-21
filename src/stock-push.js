import {createHmac} from 'node:crypto';
// Each workspace explicitly selects its own destination through a server-side secret.
export function destination(ws,env=process.env){
 const suffix=ws.toUpperCase().replaceAll('-','_');
 const raw=env['STOCK_NOTICE_WEBHOOK_'+suffix];if(!raw)return null;
 const u=new URL(raw);
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash)throw Error('通知机器人地址无效');
 const wecom=u.hostname==='qyapi.weixin.qq.com'&&u.pathname==='/cgi-bin/webhook/send'&&u.searchParams.has('key');
 const ding=u.hostname==='oapi.dingtalk.com'&&u.pathname==='/robot/send'&&u.searchParams.has('access_token');
 if(!wecom&&!ding)throw Error('需要企业微信或钉钉的官方机器人地址');
 const secret=ding&&env['STOCK_NOTICE_SIGN_'+suffix];
 if(secret){const timestamp=String(Date.now());u.searchParams.set('timestamp',timestamp);u.searchParams.set('sign',createHmac('sha256',secret).update(timestamp+'\n'+secret).digest('base64'));}
 return {url:u,channel:wecom?'企业微信':'钉钉'};
}
export async function pushOne({market,workspace,name,stock,send=fetch,env=process.env}){
 const pending=market.listNotices().find(n=>n.push==='pending'&&!(n.nextAttempt>Date.now()));
 if(!pending)return;
 const dest=destination(workspace,env);if(!dest)return;
 const n=await market.claimPush(pending.id);if(!n)return;
 let ok=false;
 try{
  const available=await stock(workspace,n.shopId,n.listingId);
  const content=['闲鱼上架备券提醒 · '+name,n.title,'店铺 '+n.storeName+'（'+n.shopId+'）','商品编号 '+n.listingId+' · 售价 ¥'+(n.priceFen/100).toFixed(2),'货源 '+n.sourceName,'券库可售 '+available+' 张，请核对并备券。'].join('\n');
  const r=await send(dest.url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{'Content-Type':'application/json'},body:JSON.stringify({msgtype:'text',text:{content}})});
  ok=r.ok&&(await r.json()).errcode===0;
 }catch{/* Keep tokens out of responses and logs. */}
 await market.finishPush(n.id,ok);
}
