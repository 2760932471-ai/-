import {DatabaseSync} from 'node:sqlite';
import {openSync,closeSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {requestIntegration} from './integration-transport.js';

const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
function field(v,label,max=160){
 if(typeof v!=='string'||!v.trim()||v.trim().length>max)fail('请检查'+label);
 return v.trim();
}
function gateway(store){
 if(!store?.enabled||store.driver!=='gateway'||store.platform!=='xianyu'||!store.endpoint)fail('请选择已启用的闲鱼授权网关');
 const c=store.connection;
 if(c?.status!=='succeeded'||!['order.read','voucher.deliver'].every(scope=>c.scopes?.includes(scope)))fail('请先核验店铺的 order.read 和 voucher.deliver 权限');
 return store;
}
export function openVouchers(path,{request=requestIntegration}={}){
 if(path!==':memory:')closeSync(openSync(path,'a',0o600));
 const db=new DatabaseSync(path);
 db.exec(`PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS vouchers (
 id TEXT PRIMARY KEY,workspace TEXT NOT NULL,shop TEXT NOT NULL,listing TEXT NOT NULL,
 serial TEXT NOT NULL UNIQUE,imageHash TEXT NOT NULL UNIQUE,png TEXT NOT NULL,expiry TEXT NOT NULL,
 delivery TEXT);
 CREATE INDEX IF NOT EXISTS stock ON vouchers(workspace,shop,listing,delivery,expiry);
 CREATE TABLE IF NOT EXISTS voucher_deliveries(
 id TEXT PRIMARY KEY,workspace TEXT NOT NULL,shop TEXT NOT NULL,listing TEXT NOT NULL,
 orderNo TEXT NOT NULL,buyer TEXT NOT NULL,qty INTEGER NOT NULL,state TEXT NOT NULL,
 receipt TEXT,updated TEXT NOT NULL,method TEXT NOT NULL, UNIQUE(shop,orderNo));`);
 const now=()=>new Date().toISOString();
 function atomic(fn){db.exec('BEGIN IMMEDIATE');try{const out=fn();db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}
 function view(ws){
  const inventory=db.prepare(`SELECT shop,listing,COUNT(*) AS total,
   SUM(CASE WHEN delivery IS NULL AND expiry>? THEN 1 ELSE 0 END) AS available
   FROM vouchers WHERE workspace=? GROUP BY shop,listing`).all(now(),ws);
  const deliveries=db.prepare('SELECT id,shop,listing,orderNo,buyer,qty,state,receipt,updated,method FROM voucher_deliveries WHERE workspace=? ORDER BY updated DESC LIMIT 100').all(ws);
  return {inventory,deliveries};
 }
 function add(ws,input){
  const shop=field(input.shop,'闲鱼店铺 ID'),listing=field(input.listing,'闲鱼商品 ID'),serial=field(input.serial,'供应方唯一券号',300);
  const expiry=field(input.expiry,'有效期',10);
  const end=Date.parse(expiry+'T15:59:59.999Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(expiry)||!Number.isFinite(end)||new Date(end).toISOString().slice(0,10)!==expiry||end<=Date.now())fail('有效期必须是尚未过期的日期（北京时间）');
  if(typeof input.png!=='string'||input.png.length>2800000||!/^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(input.png))fail('请上传不超过 2 MB 的静态二维码 PNG');
  const bytes=Buffer.from(input.png,'base64');
  if(bytes.length>2097152||bytes.length<40||bytes.toString('ascii',12,16)!=='IHDR'||bytes.toString('ascii',bytes.length-8,bytes.length-4)!=='IEND')fail('无效的二维码 PNG');
  const hash=createHash('sha256').update(bytes).digest('hex');
  return atomic(()=>{
   if(db.prepare('SELECT 1 FROM vouchers WHERE serial=? OR imageHash=?').get(serial,hash))fail('该券号或二维码已入库',409);
   db.prepare('INSERT INTO vouchers VALUES(?,?,?,?,?,?,?,?,NULL)').run(randomUUID(),ws,shop,listing,serial,hash,input.png,new Date(end).toISOString());
   return {added:true};
  });
 }
 const summary=id=>db.prepare('SELECT id,shop,listing,orderNo,buyer,qty,state,receipt,updated,method FROM voucher_deliveries WHERE id=?').get(id);
 function reserve(ws,shop,orderNo,buyer,listing,qty,method){
  if(!Number.isSafeInteger(qty)||qty<1||qty>20)fail('数量需为 1–20 张');
  return atomic(()=>{
   const existing=db.prepare('SELECT * FROM voucher_deliveries WHERE shop=? AND orderNo=?').get(shop,orderNo);
   if(existing){
    if(existing.workspace!==ws||existing.listing!==listing||existing.buyer!==buyer||existing.qty!==qty)fail('订单已绑定，买家、商品及数量不可变更',409);
    return {existing:summary(existing.id)};
   }
   const rows=db.prepare('SELECT id,png FROM vouchers WHERE workspace=? AND shop=? AND listing=? AND delivery IS NULL AND expiry>? ORDER BY expiry,rowid LIMIT ?').all(ws,shop,listing,now(),qty);
   if(rows.length!==qty)fail('可用券库存不足，本单未分配',409);
   const id=randomUUID();
   db.prepare('INSERT INTO voucher_deliveries VALUES(?,?,?,?,?,?,?,\'pending\',NULL,?,?)').run(id,ws,shop,listing,orderNo,buyer,qty,now(),method);
   for(const row of rows)db.prepare('UPDATE vouchers SET delivery=? WHERE id=? AND delivery IS NULL').run(id,row.id);
   return {id,rows};
  });
 }
 function manual(ws,i){
  if(i.verified!==true)fail('请核实订单已付款');
  const a=reserve(ws,field(i.shop,'店铺 ID'),field(i.orderNo,'订单号'),field(i.buyer,'买家 ID'),field(i.listing,'商品 ID'),i.qty,'manual');
  return a.existing||summary(a.id);
 }
 function manualRow(ws,id){
  const r=db.prepare("SELECT * FROM voucher_deliveries WHERE workspace=? AND id=? AND method='manual'").get(ws,field(id,'交付记录'));
  if(!r)fail('手工订单记录不存在',404);return r;
 }
 function original(ws,i){
  const row=manualRow(ws,i.id);
  return {order:summary(row.id),images:db.prepare('SELECT id,png FROM vouchers WHERE workspace=? AND delivery=? ORDER BY rowid').all(ws,row.id)};
 }
 function confirm(ws,i){
  const row=manualRow(ws,i.id);if(i.buyer!==row.buyer||i.confirmed!==true)fail('请核对原订单买家及发送记录');
  db.prepare("UPDATE voucher_deliveries SET state='sent',receipt='人工核实消息记录',updated=? WHERE id=? AND state!='sent'").run(now(),row.id);
  return summary(row.id);
 }
 async function deliver(ws,input,getStore){
  const store=gateway(getStore()),orderNo=field(input.orderNo,'订单号');
  const call=async(op,params)=>(await request(store.endpoint,{schemaVersion:1,operation:op,shopId:store.shopId,orderNo,...params},{secretEnv:store.secretEnv})).value;
  const prior=()=>db.prepare('SELECT * FROM voucher_deliveries WHERE shop=? AND orderNo=?').get(store.shopId,orderNo);
  function checkPrior(row){if(row.workspace!==ws)fail('该订单已在其他工作空间绑定',409);return summary(row.id);}
  const old=prior();if(old)return checkPrior(old);
  const order=await call('order.get',{});
  if(order?.schemaVersion!==1||order.shopId!==store.shopId||order.orderNo!==orderNo||order.status!=='paid')fail('未核实该订单已付款且可履约');
  const buyer=field(order.buyerId,'平台买家 ID'),listing=field(order.listingId,'平台商品 ID'),qty=order.quantity;
  if(!Number.isSafeInteger(qty)||qty<1||qty>20)fail('单次可处理 1–20 张券');
  if(gateway(getStore()).revision!==store.revision)fail('店铺连接已变更',409);
  const allocation=reserve(ws,store.shopId,orderNo,buyer,listing,qty,'gateway');
  if(allocation.existing)return allocation.existing;
  const {id,rows}=allocation;
  let receipt=null;
  try{
   const r=await call('voucher.deliver',{buyerId:buyer,listingId:listing,idempotencyKey:id,vouchers:rows.map(row=>({id:row.id,mime:'image/png',base64:row.png}))});
   if(r?.schemaVersion===1&&r.status==='delivered'&&r.shopId===store.shopId&&r.orderNo===orderNo&&r.buyerId===buyer&&r.idempotencyKey===id&&r.quantity===qty)receipt=field(r.receiptId,'送达回执',160);
  }catch{/* A timeout can follow a successful send. Keep the original assignment. */}
  db.prepare('UPDATE voucher_deliveries SET state=?,receipt=?,updated=? WHERE id=? AND state=\'pending\'').run(receipt?'sent':'unknown',receipt,now(),id);
  return summary(id);
 }
 async function reconcile(ws,input,getStore){
  const store=gateway(getStore()),id=field(input.id,'交付记录');
  const row=db.prepare('SELECT * FROM voucher_deliveries WHERE workspace=? AND shop=? AND id=?').get(ws,store.shopId,id);
  if(!row)fail('交付记录不存在',404);
  if(row.method!=='gateway')fail('此订单使用人工核对');if(row.state==='sent')return summary(id);
  const {value:r}=await request(store.endpoint,{schemaVersion:1,operation:'voucher.status',shopId:row.shop,orderNo:row.orderNo,buyerId:row.buyer,idempotencyKey:id},{secretEnv:store.secretEnv});
  if(r?.schemaVersion===1&&r.status==='delivered'&&r.shopId===row.shop&&r.orderNo===row.orderNo&&r.buyerId===row.buyer&&r.idempotencyKey===id&&r.quantity===row.qty){
   db.prepare("UPDATE voucher_deliveries SET state='sent',receipt=?,updated=? WHERE id=?").run(field(r.receiptId,'送达回执'),now(),id);
  }
  return summary(id);
 }
 return {add,view,manual,original,confirm,deliver,reconcile,close:()=>db.close()};
}
