import {offerPhotos,embeddedOfferCandidates} from './offer-photos.js';
// Runs inside the selected offer tab. Never read fields from recommendations or account pages.
export function readOfferDetail(sku){
 const u=new URL(location.href);
 if(u.origin!=='https://detail.1688.com'||u.pathname!=='/offer/'+sku+'.html')return null;
 const scope=document.querySelector('main')||document;
 const facts=[];
 for(const root of scope.querySelectorAll('[class*="attribute" i],[id*="attribute" i],[class*="pc-attr" i],[class*="product-prop" i],#mod-detail-attributes,[class*="specification" i]')){
  if(root.closest('[class*="recommend" i]'))continue;
  for(const row of [root,...root.querySelectorAll('tr,li,dl,[class*="item" i]')]){
   const cells=[...row.children].map(el=>el.textContent.trim());
   for(let i=0;i+1<cells.length;i+=2)facts.push(cells[i].replace(/[：:]$/,'')+'：'+cells[i+1]);
   const text=row.textContent.trim();if(text.length<72&&/[：:]/.test(text))facts.push(text);
  }
 }
 const images=[...scope.querySelectorAll('img[alt*="白底"],[class*="od-gallery" i] img,[class*="swiper" i] img,[id*="gallery" i] img,[class*="main-img" i] img,[class*="mainImage" i] img,[class*="gallery" i] img,[class*="mainPic" i] img,[id*="mainPic" i] img,[class*="preview" i] img,[class*="main-image" i] img')].filter(img=>!img.closest('[class*="recommend" i],footer'));
 images.sort((a,b)=>Number(b.alt.includes('白底'))-Number(a.alt.includes('白底')));
 // Some supplier pages use generated class names. Anchor the large product
 // image to its adjacent thumbnail rail, excluding reviews and recommended items.
 const excluded='aside,[class*="recommend" i],[class*="review" i],footer,header,nav';
 const visible=[...scope.querySelectorAll('img,[style*="url("]')].filter(el=>!el.closest(excluded))
  .map(el=>({el,box:el.getBoundingClientRect()})).filter(({box})=>box.width>24&&box.height>24);
 const heroes=visible.filter(({box})=>{
  if(box.width<220||box.height<220||box.width/box.height>1.8||box.height/box.width>1.8)return false;
  const neighbors=visible.filter(({box:t})=>t.width>=36&&t.width<=125&&t.height>=36&&t.height<=125&&
   ((t.right<=box.left+6&&box.left-t.right<180&&t.top>=box.top-20&&t.bottom<=box.bottom+20)||
    (t.top>=box.bottom-6&&t.top-box.bottom<100&&t.left>=box.left-20&&t.right<=box.right+20)));
  return neighbors.length>=2;
 }).map(({el})=>el);
 const gallery=[...new Set([...images.filter(img=>img.alt.includes('白底')),...heroes,...images])];
 const candidates=gallery.flatMap(el=>{
  if(el.tagName!=='IMG')return [el.style.backgroundImage.match(/url\(["']?([^"')]+)/)?.[1]];
  return [el.getAttribute('data-original'),el.getAttribute('data-zoom-image'),el.getAttribute('data-lazy-src'),el.getAttribute('data-src'),el.currentSrc,el.getAttribute('src'),...(el.srcset||'').split(',').map(v=>v.trim().split(/\s+/)[0])];
 });
 candidates.push(document.querySelector('meta[property="og:image"],meta[name="twitter:image"],meta[itemprop="image"]')?.content);
 const title=document.querySelector('h1')?.textContent.trim();
 if(title&&title.length>3){
  for(const img of scope.querySelectorAll('img[alt]')){
   if(!img.closest('[class*="recommend" i],aside,footer')&&img.alt.includes(title.slice(0,12)))candidates.push(img.getAttribute('data-src'),img.currentSrc,img.src);
  }
 }
 for(const el of scope.querySelectorAll('[class*="gallery" i] [style*="url("],[class*="mainImage" i][style*="url("]')){
  if(!el.closest('[class*="recommend" i]'))candidates.push(el.style.backgroundImage.match(/url\(["']?([^"')]+)/)?.[1]);
 }
 for(const script of document.querySelectorAll('script[type="application/ld+json"]')){
  try{
   const data=JSON.parse(script.textContent);
   for(const item of [data['@graph']||data].flat()){
    if(item?.['@type']!=='Product'||item.url&&new URL(item.url,u).pathname!==u.pathname)continue;
    for(const p of [item.additionalProperty||[]].flat())facts.push(p.name+'：'+p.value);
    for(const [key,label]of [['material','材质'],['color','颜色'],['size','尺寸']])if(typeof item[key]==='string')facts.push(label+'：'+item[key]);
    for(const image of [item.image].flat())candidates.push(typeof image==='string'?image:image?.url);
   }
  }catch{}
 }
 const white=images.filter(img=>img.alt.includes('白底')).flatMap(img=>[img.getAttribute('data-original'),img.getAttribute('data-src'),img.currentSrc,img.src]);
 const login=document.querySelector('input[type=password]')||/请完成验证|滑动验证|登录后查看|登录查看全部规格/.test((document.body?.innerText||'').slice(0,2000));
 return {sku,login:!!login,facts:facts.filter(f=>f.length<=72).slice(0,60),white,photos:candidates.filter(Boolean).slice(0,40)};
}

export async function openOfferDetail(sku,windowId){
 if(!/^\d{1,24}$/.test(sku))throw Error('商品编号无效');
 const url='https://detail.1688.com/offer/'+sku+'.html';
 const tabs=await chrome.tabs.query({windowId,url:url+'*'});
 const open=tabs.filter(t=>new URL(t.url).pathname==='/offer/'+sku+'.html')
  .sort((a,b)=>Number(!!b.active)-Number(!!a.active)||(b.lastAccessed||0)-(a.lastAccessed||0))[0];
 const key='offer-photo-tab:'+windowId+':'+sku;
 let tab=open;
 if(!tab){
  const previous=(await chrome.storage.session.get(key))[key];
  if(previous){
   try{
    const t=await chrome.tabs.get(previous);
    if(t.windowId===windowId&&(!t.url||/^https:\/\/(?:login\.1688\.com|login\.taobao\.com|passport\.1688\.com)\//.test(t.url)))tab=t;
   }catch{}
  }
  if(!tab){tab=await chrome.tabs.create({windowId,url,active:false});await chrome.storage.session.set({[key]:tab.id});}
 }
 let best;
 for(let i=0;i<12;i++){
  try{
   const [probe]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:readOfferDetail,args:[sku]});
   if(probe?.result){
    best=probe.result;
    const [embedded]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:embeddedOfferCandidates,args:[sku]});
    best.photos=offerPhotos(best.white,embedded?.result,best.photos);best.photo=best.photos[0]||'';
    if(best.photo&&(best.facts.length||i>=2))break;
   }
  }catch{}
  await new Promise(resolve=>setTimeout(resolve,450));
 }
 if(!best?.photo&&best?.login)best.reason='当前详情页提示登录，尚未识别到商品图库。';
 return {...(best||{sku,facts:[],photo:''}),tabId:tab.id};
}

async function readImageBytes(url){
 const response=await fetch(url,{credentials:'omit',redirect:'error',signal:AbortSignal.timeout(6000)});
 if(!response.ok||!response.body)throw Error('图片下载失败');
 const limit=5*1024*1024,reader=response.body.getReader(),chunks=[];
 let length=0;
 for(;;){
  const {done,value}=await reader.read();if(done)break;
  length+=value.length;if(length>limit){await reader.cancel();throw Error('商品图过大');}
  chunks.push(value);
 }
 if(!length)throw Error('图片为空');
 let bytes=new Uint8Array(length);let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 if(response.headers.get('content-type')?.split(';')[0]==='image/avif'){
  const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/avif'}));
  try{
   const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
   const canvas=new OffscreenCanvas(Math.max(1,Math.round(bitmap.width*scale)),Math.max(1,Math.round(bitmap.height*scale)));
   canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
   bytes=new Uint8Array(await (await canvas.convertToBlob({type:'image/jpeg',quality:0.94})).arrayBuffer());
  }finally{bitmap.close();}
 }
 if(!(bytes[0]===0xff&&bytes[1]===0xd8||bytes[0]===137&&bytes[1]===80||String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP'))throw Error('图片格式不支持');
 let binary='';
 for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));
 return btoa(binary);
}

// Recover already displayed gallery pixels, or reload that same gallery URL
// from the offer page with its normal referrer and browser CORS checks.
export async function readDisplayedPhoto({sku,photo}){
 if(location.origin!=='https://detail.1688.com'||location.pathname!=='/offer/'+sku+'.html')return null;
 function encode(img){
  if(!img.complete||!img.naturalWidth||!img.naturalHeight)return null;
  const scale=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
  canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(img,0,0,canvas.width,canvas.height);
  try{return canvas.toDataURL('image/jpeg',0.95).split(',')[1];}catch{return null;}
 }
 for(const img of document.images){
  if(img.currentSrc===photo){const bytes=encode(img);if(bytes)return bytes;}
 }
 const img=new Image();img.crossOrigin='anonymous';
 return new Promise(resolve=>{
  const end=value=>{clearTimeout(timer);img.onload=img.onerror=null;resolve(value);};
  const timer=setTimeout(()=>end(null),2500);
  img.onload=()=>end(encode(img));img.onerror=()=>end(null);img.src=photo;
 });
}

export async function downloadSelectedPhoto(detail,cardImages){
 const photos=offerPhotos(detail.photo,detail.photos,cardImages);
 for(const photo of photos.slice(0,4)){
  try{return {...detail,photo,photos,base64:await readImageBytes(photo)};}catch{}
  if(Number.isInteger(detail.tabId)){
   try{
    const [frame]=await chrome.scripting.executeScript({target:{tabId:detail.tabId},func:readDisplayedPhoto,args:[{sku:detail.sku,photo}]});
    if(frame?.result)return {...detail,photo,photos,base64:frame.result};
   }catch{}
  }
 }
 return {...detail,photos,reason:detail.reason||(photos.length?'CDN 未返回可读取的商品图片':'详情页和该商品的搜索卡片均未显示可读取的图片')};
}
