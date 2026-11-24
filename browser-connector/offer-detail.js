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
 const images=[...scope.querySelectorAll('img[alt*="白底"],[class*="gallery" i] img,[class*="mainPic" i] img,[id*="mainPic" i] img,[class*="preview" i] img,[class*="main-image" i] img')].filter(img=>!img.closest('[class*="recommend" i],footer'));
 images.sort((a,b)=>Number(b.alt.includes('白底'))-Number(a.alt.includes('白底')));
 let photo=images.flatMap(img=>[img.getAttribute('data-original'),img.getAttribute('data-src'),img.currentSrc,img.getAttribute('src')]).find(url=>url?.includes('/img/ibank/'))||document.querySelector('meta[property="og:image"]')?.content;
 for(const script of document.querySelectorAll('script[type="application/ld+json"]')){
  try{
   const data=JSON.parse(script.textContent);
   for(const item of [data['@graph']||data].flat()){
    if(item?.['@type']!=='Product'||item.url&&new URL(item.url,u).pathname!==u.pathname)continue;
    for(const p of [item.additionalProperty||[]].flat())facts.push(p.name+'：'+p.value);
    for(const [key,label]of [['material','材质'],['color','颜色'],['size','尺寸']])if(typeof item[key]==='string')facts.push(label+'：'+item[key]);
    const image=[item.image].flat()[0];photo||=typeof image==='string'?image:image?.url;
   }
  }catch{}
 }
 return {sku,facts:facts.filter(f=>f.length<=72).slice(0,60),photo:photo||''};
}

export async function openOfferDetail(sku,windowId){
 if(!/^\d{1,24}$/.test(sku))throw Error('商品编号无效');
 const url='https://detail.1688.com/offer/'+sku+'.html';
 const [open]=await chrome.tabs.query({windowId,url:url+'*'});
 const tab=open||await chrome.tabs.create({windowId,url,active:false});
 let best;
 for(let i=0;i<12;i++){
  try{
   const [probe]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:readOfferDetail,args:[sku]});
   if(probe?.result){best=probe.result;if(best.photo&&best.facts.length)break;}
  }catch{}
  await new Promise(resolve=>setTimeout(resolve,450));
 }
 return best||{sku,facts:[],photo:''};
}
