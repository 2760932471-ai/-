// Only product-image paths on the documented Alibaba image hosts are eligible.
export function offerPhoto(value){
 if(typeof value!=='string'||value.length>2048)return '';
 let src=value.trim().replaceAll('&amp;','&');
 if(/^\/?(?:img\/ibank|bao\/uploaded\/i\d)\//.test(src))src='https://cbu01.alicdn.com/'+src.replace(/^\//,'');
 if(!/^(?:https?:)?\/\//i.test(src))return '';
 try{
  const u=new URL(src,'https://cbu01.alicdn.com');
  if(u.username||u.password||u.port||!/^(?:cbu0[1-4]|img|imgextra|gw|img1)\.alicdn\.com$/.test(u.hostname))return '';
  if(!/^\/(?:img\/ibank\/|bao\/uploaded\/i\d\/|imgextra\/i\d\/|i\d\/)[\w.!/@%-]+\.(?:jpe?g|png|webp|avif)$/i.test(u.pathname))return '';
  return 'https://'+u.hostname+u.pathname+u.search;
 }catch{return '';}
}

export function offerPhotos(...values){
 const list=values.flat(2).map(offerPhoto).filter(Boolean);
 return [...new Set(list)].slice(0,8);
}

// Inspect JSON data only. Image lists are scoped to the current offer, excluding
// recommendations and other products serialized in the same response.
export function embeddedOfferCandidates(sku,scripts){
 if(!scripts){
  if(location.origin!=='https://detail.1688.com'||location.pathname!=='/offer/'+sku+'.html')return [];
  scripts=Array.from(document.scripts,script=>script.textContent);
 }
 const white=[],ordinary=[];
 const imageKeys=/^(?:whiteBgImage(?:Url)?|whiteBackgroundImage|whiteImage(?:Url)?|mainImage(?:Url|s)?|imageList|images|offerImages|imageUrlList)$/i;
 function add(value,out){
  for(const entry of [value].flat().slice(0,12)){
   if(typeof entry==='string')out.push(entry);
   else if(entry&&typeof entry==='object')out.push(entry.originalImageURI,entry.fullPathImageURI,entry.originalImageUrl,entry.imageUrl,entry.fullPath,entry.url,entry.src);
  }
 }
 function visit(obj,depth=0,matched=false){
  if(!obj||typeof obj!=='object'||depth>13)return;
  const id=obj.offerId??obj.offerID;
  if(id!=null&&String(id)!==sku)return;
  for(const [key,v]of Object.entries(obj)){
   if(/recommend|related|similar|advert|shopInfo/i.test(key))continue;
   const scoped=matched||String(id)===sku;
   if(imageKeys.test(key)&&(scoped||/^(?:whiteBgImage|offerImages|mainImage|imageList)/i.test(key)))add(v,/white/i.test(key)?white:ordinary);
   else if(typeof v==='object')visit(v,depth+1,scoped);
  }
 }
 for(const script of scripts){
  if(typeof script!=='string'||script.length>2500000||!/(?:mainImage|whiteBgImage|imageList|offerImages|offerId)/i.test(script))continue;
  try{visit(JSON.parse(script.trim().replace(/^(?:window\.)?[\w$.]+\s*=\s*/,'').replace(/;$/,'')));}catch{}
 }
 return [...white,...ordinary].filter(v=>typeof v==='string'&&v.length<=2048).slice(0,48);
}
