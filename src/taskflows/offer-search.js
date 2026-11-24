import {sourcingURL,cleanOffers} from '../../public/sourcing.js';

// Read only published Product offers on the official search page. Pages rendered
// after login are handled by the user's browser, without transferring its cookies.
export function publicProducts(html){
 const rows=[];
 function visit(item){
  if(!item||typeof item!=='object')return;
  if(Array.isArray(item)){item.forEach(visit);return;}
  if([item['@type']].flat().includes('Product')){
   for(const o of [item.offers].flat().filter(Boolean)){
    if(o.priceCurrency&&o.priceCurrency!=='CNY')continue;
    rows.push({url:o.url||item.url,title:item.name,price:Number(o.price??o.lowPrice),terms:'页面展示报价；规格与起订量待核对'});
   }
  }
  for(const key of ['@graph','itemListElement','item','mainEntity'])visit(item[key]);
 }
 for(const match of html.matchAll(/<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
  try{visit(JSON.parse(match[1]));}catch{}
 }
 // Some public pages serialize visible cards as an offer list instead of
 // Product markup. Accept concrete offer identifiers, titles and RMB quotes.
 function visitListings(value,depth=0){
  if(!value||typeof value!=='object'||depth>12)return;
  if(Array.isArray(value)){value.slice(0,100).forEach(v=>visitListings(v,depth+1));return;}
  const id=String(value.offerId||''),price=value.priceInfo?.price??value.offerPrice??value.price;
  if(/^\d{1,24}$/.test(id)&&typeof value.subject==='string'&&/^\d+(?:\.\d{1,2})?$/.test(String(price))&&(!value.currency||value.currency==='CNY')){
   rows.push({url:'https://detail.1688.com/offer/'+id+'.html',title:value.subject,price:Number(price),terms:'搜索展示价；规格与起订量待核对'});return;
  }
  Object.values(value).forEach(v=>visitListings(v,depth+1));
 }
 for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){
  const script=m[1].trim();if(!script.includes('"offerId"')||script.length>1800000)continue;
  const data=script.replace(/^(?:window\.)?[a-zA-Z_$][\w$]*\s*=\s*/,'').replace(/;$/,'');
  try{visitListings(JSON.parse(data));}catch{}
 }
 return cleanOffers(rows);
}
export async function searchPublicOffers(query){
 const response=await fetch(sourcingURL(query),{redirect:'error',signal:AbortSignal.timeout(6500),headers:{Accept:'text/html'}});
 if(!response.ok)throw Error('公开搜索页返回 HTTP '+response.status);
 const reader=response.body.getReader(),parts=[];let size=0;
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>3000000){await reader.cancel();throw Error('公开搜索页面过大');}parts.push(value);}
 return publicProducts(new TextDecoder(/charset=gb/i.test(response.headers.get('content-type')||'')?'gb18030':'utf-8').decode(Buffer.concat(parts)));
}
