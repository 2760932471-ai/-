import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {openVouchers} from '../src/vouchers.js';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/S1sAAAAASUVORK5CYII=';
const item={shop:'X1',listing:'item1',serial:'s1',expiry:'2099-12-31',png};
const store=()=>({shopId:item.shop,platform:'xianyu',driver:'gateway',enabled:true,revision:1,endpoint:'https://gateway.example/',connection:{status:'succeeded',scopes:['order.read','voucher.deliver']}});
const manual={...item,orderNo:'A',buyer:'buyer-A',qty:1,verified:true};
function fake({lost=false}={}){
 const sends=[];
 const request=async(_,p)=>{
  const common={schemaVersion:1,shopId:p.shopId,orderNo:p.orderNo,buyerId:'buyer-'+p.orderNo};
  if(p.operation==='order.get')return {value:{...common,status:'paid',listingId:'item1',quantity:1}};
  if(p.operation==='voucher.deliver'){sends.push(p);if(lost)throw Error('timeout');}
  return {value:{...common,status:'delivered',idempotencyKey:p.idempotencyKey,quantity:1,receiptId:'receipt'}};
 };
 return {request,sends};
}
test('simultaneous duplicate order and competing buyer cannot send one QR twice',async()=>{
 const f=fake(),db=openVouchers(':memory:',f);
 try{
  db.add('w',item);assert.throws(()=>db.add('other',{...item,serial:'different'}),/入库/);
  const requests=['A','A','B'].map(orderNo=>db.deliver('w',{orderNo},store));
  const settled=await Promise.allSettled(requests);
  assert.equal(f.sends.length,1);assert.equal(f.sends[0].buyerId,'buyer-A');assert.equal(f.sends[0].vouchers[0].base64,png);
  assert.equal(settled[2].status,'rejected');assert.equal(db.view('w').deliveries[0].state,'sent');assert.equal(db.view('w').inventory[0].available,0);
  assert(!JSON.stringify(db.view('w')).includes(png));
 }finally{db.close();}
});
test('lost receipt survives restart and only a matching receipt can confirm delivery',async()=>{
 const dir=await mkdtemp('/tmp/voucher-test-'),file=dir+'/stock.sqlite',f=fake({lost:true});let db=openVouchers(file,f);
 try{
  db.add('w',item);const r=await db.deliver('w',{orderNo:'A'},store);assert.equal(r.state,'unknown');db.close();db=openVouchers(file,f);
  assert.equal((await db.deliver('w',{orderNo:'A'},store)).state,'unknown');assert.equal(f.sends.length,1);
  await assert.rejects(()=>db.deliver('w',{orderNo:'B'},store),/库存不足/);
  assert.equal((await db.reconcile('w',{id:r.id},store)).state,'sent');assert.equal(f.sends.length,1);
 }finally{db.close();await rm(dir,{recursive:true,force:true});}
});
test('manual delivery binds QR before reveal, prevents reassignment and allows original-order resend',()=>{
 const db=openVouchers(':memory:');try{
  db.add('w',item);assert.throws(()=>db.manual('w',{...manual,qty:2}),/库存不足/);assert.equal(db.view('w').inventory[0].available,1);
  const r=db.manual('w',manual);assert.equal(db.manual('w',manual).id,r.id);
  assert.throws(()=>db.manual('w',{...manual,buyer:'B'}),/不可变更/);
  assert.throws(()=>db.original('other',{id:r.id}),/不存在/);
  assert.throws(()=>db.confirm('w',{id:r.id,buyer:'B',confirmed:true}),/核对/);
  assert.equal(db.confirm('w',{id:r.id,buyer:manual.buyer,confirmed:true}).state,'sent');
  assert.equal(db.original('w',{id:r.id}).images[0].png,png);
  assert.throws(()=>db.manual('w',{...manual,orderNo:'B',buyer:'buyer-B'}),/库存不足/);
 }finally{db.close();}
});
