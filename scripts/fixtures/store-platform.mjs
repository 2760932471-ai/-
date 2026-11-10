import dns from 'node:dns/promises';
import {syncBuiltinESMExports} from 'node:module';
const realLookup=dns.lookup;
dns.lookup=async(host,options)=>host==='eco.taobao.com'?[{address:'8.8.8.8',family:4}]:realLookup(host,options);
syncBuiltinESMExports();
// Test-only preload. Never loaded by npm start. All store responses are synthetic.
const realFetch=globalThis.fetch;
let state='instock';
globalThis.fetch=async(url,options)=>{
 if(new URL(url).hostname!=='eco.taobao.com')return realFetch(url,options);
 const p=new URLSearchParams(options.body),method=p.get('method');
 const item={num_iid:123456789,title:'【测试商品】恒温花洒',approve_status:state,num:25,price:'128.00',modified:'2026-11-10 12:00:00'};
 let value;
 if(method==='taobao.shop.seller.get')value={shop:{sid:123,title:'测试店铺',nick:'test-store'}};
 else if(method==='taobao.item.seller.get')value={item};
 else if(method==='taobao.items.onsale.get'||method==='taobao.items.inventory.get')value={items:{item:(method.includes('onsale')?state==='onsale':state==='instock')?[item]:[]},total_results:(method.includes('onsale')?state==='onsale':state==='instock')?1:0};
 else if(method==='taobao.item.update.listing'){state='onsale';value={item:{num_iid:123456789}};}
 else if(method==='taobao.item.update.delisting'){state='instock';value={item:{num_iid:123456789}};}
 else return new Response('{"error_response":{"code":15}}');
 return Response.json({[method.replace(/^taobao\./,'').replaceAll('.','_')+'_response']:value});
};
