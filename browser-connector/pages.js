// These functions run in the isolated world of the selected platform tab.
export function readProduct(){
 if(location.protocol!=='https:'||!/(^|\.)meituan\.com$/.test(location.hostname))throw Error('商品页面已切换，请重新选择。');
 const visible=el=>el?.getClientRects().length&&getComputedStyle(el).visibility==='visible';
 const value=selector=>{
  const nodes=Array.from(document.querySelectorAll(selector)).filter(visible);
  return nodes.length===1?nodes[0].innerText.trim():'';
 };
 const title=value('[itemprop="name"]')||value('main h1')||value('h1');
 if(!title)throw Error('未识别到唯一商品标题。请打开单件商品详情页。');
 return {title:title.slice(0,160),price:value('[itemprop="price"]').slice(0,60),
  terms:value('[itemprop="description"]').slice(0,1500),host:location.hostname};
}
export function fillDraft(draft){
 if(location.protocol!=='https:'||!/(^|\.)goofish\.com$/.test(location.hostname))throw Error('销售页面已切换，请重新选择。');
 const fields=[...document.querySelectorAll('input:not([type]),input[type=text],input[type=number],textarea')].filter(el=>
  el.getClientRects().length&&getComputedStyle(el).visibility==='visible'&&!el.disabled&&!el.readOnly);
 const label=el=>[el.getAttribute('aria-label'),el.placeholder,...Array.from(el.labels||[],l=>l.innerText)].filter(Boolean).join(' ');
 const specs=[
  ['title',/商品标题|宝贝标题|商品名称|宝贝名称|^标题$/],
  ['description',/商品描述|商品详情|宝贝描述|描述一下|^描述$/],
  ['price',/销售价|商品价格|宝贝价格|出售价格|^价格$/]
 ];
 const mapped=specs.map(([key,pattern])=>{
  const matches=fields.filter(el=>pattern.test(label(el)));
  if(matches.length!==1)throw Error('无法唯一识别标题、描述和售价字段，请核对是否在闲鱼网页发布表单。');
  return [key,matches[0]];
 });
 if(new Set(mapped.map(([,el])=>el)).size!==3)throw Error('字段有歧义，请人工核对。');
 for(const [key,el] of mapped){
  if(el.value.trim()&&el.value!==draft[key])throw Error('表单已有不同内容，请先核对已有草稿。');
  if(el.maxLength>=0&&draft[key].length>el.maxLength)throw Error('草稿超出网页字段长度，请缩短后再试。');
 }
 for(const [key,el] of mapped){
  const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto,'value').set.call(el,draft[key]);
  el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
 }
 return mapped.every(([key,el])=>el.isConnected&&el.value===draft[key]);
}
