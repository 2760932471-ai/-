// Self-contained so the Chromium connector can execute the same reader on the
// open marketplace page that the workbench uses for a pasted selection.
export function readOfferCards(root=document){
 const rows=[],seen=new Set();
 const detail=a=>{
  try{const url=new URL(a.getAttribute('href'),'https://s.1688.com');
   const id=url.hostname==='detail.1688.com'&&url.pathname.match(/^\/offer\/(\d+)\.html\/?$/)?.[1];
   return id?'https://detail.1688.com/offer/'+id+'.html':'';}catch{return '';}
 };
 for(const a of root.querySelectorAll('a[href*="/offer/"]')){
  const url=detail(a);if(!url||seen.has(url))continue;
  let card=a;
  for(let level=0;card&&level<6;level++,card=card.parentElement){
   const urls=new Set([...card.querySelectorAll('a[href*="/offer/"]')].map(detail).filter(Boolean));
   if(urls.size>1)break;
   const walker=card.ownerDocument.createTreeWalker(card,4),parts=[];
   while(walker.nextNode()){
    const node=walker.currentNode;
    if(!node.parentElement?.closest('script,style,[hidden],[aria-hidden="true"],del,s'))parts.push(node.textContent.trim());
   }
   const body=parts.filter(Boolean).join(' ').replace(/(\d)\s+(\.\d{1,2}\b)/g,'$1$2');
   if(!body||body.length>2000)continue;
   const quote=body.match(/[¥￥]\s*([\d,]+(?:\.\d{1,2})?)/)||body.match(/(\d+(?:\.\d{1,2})?)\s*元(?:\/|起|\s|$)/);
   const title=card.querySelector('[class*="title" i],h2,h3')?.textContent?.trim()||a.title||card.querySelector('img[alt]')?.alt||body.split(/[¥￥\n]/).map(s=>s.trim()).find(s=>s.length>3);
   if(!quote||!title)continue;
   const price=Number(quote[1].replaceAll(',',''));if(!Number.isFinite(price)||price<=0)continue;
   const rate=body.match(/(?:回购率|回头率)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*%/);
   const terms=body.match(/(?:\d+\s*(?:件|个|套|箱|只)\s*起(?:批|订)|(?:起批量|起订量)\s*[:：]?\s*\d+\s*(?:件|个|套|箱|只))/)?.[0]||'起订量待核对';
   // Some cards wrap the photo and the price in separate links to the same SKU.
   let product=card;
   for(let i=0;!product.querySelector('img')&&i<3&&product.parentElement;i++){
    const parent=product.parentElement;
    if([...parent.querySelectorAll('a[href*="/offer/"]')].some(link=>detail(link)!==url))break;
    product=parent;
   }
   const photos=[...product.querySelectorAll('img')].flatMap(img=>[img.getAttribute('data-original'),img.getAttribute('data-src'),img.getAttribute('data-lazy-src'),img.currentSrc,img.getAttribute('src'),...(img.srcset||'').split(',').map(v=>v.trim().split(/\s+/)[0])]).filter(src=>src&&/alicdn\.com\/|^\/?img\/ibank\//i.test(src)).slice(0,8);
   const photo=photos[0];
   rows.push({...(photo?{photo,photos}:{}),url,title:title.slice(0,160),price,repurchase:rate?Number(rate[1]):null,terms});seen.add(url);break;
  }
  if(rows.length>=40)break;
 }
 return rows;
}
