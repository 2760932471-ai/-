import {fetchPublicPage,webpageURL} from '../public-web-transport.js';

function decodeText(text){
 const names={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ndash:'–',mdash:'—',hellip:'…'};
 return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi,(whole,key)=>{
  if(key[0]!=='#')return names[key.toLowerCase()]??whole;
  const hex=key[1]?.toLowerCase()==='x',n=parseInt(key.slice(hex?2:1),hex?16:10);
  return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):' ';
 });
}
const plain=s=>decodeText(s.replace(/<[^<>]*>/g,' ')).replace(/\s+/g,' ').trim();
function resultUrl(s,base){
 try{
  const u=new URL(decodeText(s.trim()),base);
  if(!['https:','http:'].includes(u.protocol)||u.username||u.password||!u.hostname.includes('.'))return '';
  return u.href;
 }catch{return '';}
}
function rssResults(xml){
 return xml.split(/<item(?:\s[^>]*)?>/i).slice(1,11).flatMap(item=>{
  const get=key=>(item.match(new RegExp('<'+key+'(?:\\s[^>]*)?>([\\s\\S]*?)</'+key+'>','i'))?.[1]||'').replace(/^\s*<!\[CDATA\[([\s\S]*)\]\]>\s*$/,'$1');
  const url=resultUrl(get('link')),title=plain(get('title'));
  return title&&url?[{title,url,snippet:plain(get('description')).slice(0,500)}]:[];
 });
}
function duckResults(html){
 const links=[...html.matchAll(/<a\b([^<>]*\bclass=["'][^"']*\bresult__a\b[^"']*["'][^<>]*)>([\s\S]*?)<\/a>/gi)].slice(0,10);
 return links.flatMap((m,i)=>{
  const href=m[1].match(/\shref\s*=\s*["']([^"']+)["']/i)?.[1];
  let url=href&&resultUrl(href,'https://html.duckduckgo.com');
  if(!url)return [];
  const parsed=new URL(url);
  if(/(?:^|\.)duckduckgo\.com$/i.test(parsed.hostname))url=resultUrl(parsed.searchParams.get('uddg')||'');
  const segment=html.slice(m.index+m[0].length,links[i+1]?.index??m.index+m[0].length+6000);
  const snippet=segment.match(/<a\b[^<>]*class=["'][^"']*result__snippet[^"']*["'][^<>]*>([\s\S]*?)<\/a>/i)?.[1]||'';
  return url?[{url,title:plain(m[2]),snippet:plain(snippet).slice(0,500)}]:[];
 });
}

// Consume an excluded subtree in one pass, including an unterminated script or comment.
function readableHTML(html){
 const token=/<!--|<(head|script|style|svg|noscript|template|header|footer|nav)\b[^<>]*>/gi;
 const parts=[];
 let start=0,match;
 while((match=token.exec(html))){
  parts.push(html.slice(start,match.index),' ');
  if(match[1]){
   const close=new RegExp('</'+match[1]+'\\s*>','ig');
   close.lastIndex=token.lastIndex;
   start=close.exec(html)?close.lastIndex:html.length;
  }else{
   const end=html.indexOf('-->',token.lastIndex);
   start=end===-1?html.length:end+3;
  }
  token.lastIndex=start;
 }
 parts.push(html.slice(start));
 return parts.join('');
}
export function readPageText(page){
 if(page.type?.startsWith('text/plain')||page.type?.startsWith('text/markdown'))return {title:new URL(page.url).hostname,body:page.text.trim().slice(0,15000)};
 const title=plain(page.text.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'');
 if(/just a moment|verify you are human|access denied|人机验证|安全验证|访问受限|captcha/i.test(title))throw Error('网站要求完成访问验证，尚未取得页面正文。');
 const content=readableHTML(page.text);
 const main=content.match(/<(article|main)\b[^<>]*>/i);
 const end=main&&content.toLowerCase().indexOf('</'+main[1].toLowerCase()+'>',main.index+main[0].length);
 const section=main?content.slice(main.index+main[0].length,end===-1?undefined:end):content;
 const body=decodeText(section.replace(/<(?:br\b[^>]*|\/(?:p|div|section|li|tr|h[1-6]|blockquote))\s*\/?\s*>/gi,'\n').replace(/<[^<>]+>/g,' '))
  .split(/\n+/).map(s=>s.replace(/\s+/g,' ').trim()).filter(Boolean).join('\n').slice(0,15000);
 const passwordForm=/<input\b[^<>]*\btype\s*=\s*["']?password\b/i.test(section);
 const loginTitle=/^(?:用户登录|账号登录|会员登录|登录|登入|登錄|sign\s*in|log\s*in)(?:$|\s|[·:：|—–-])/i.test(title);
 const asksToLogin=/请先登录|请登录后|登录后(?:才|方)?可(?:见|查|读)|sign in to (?:continue|access|view)|log in to (?:continue|access|view)/i.test(body);
 if(loginTitle||((passwordForm||body.length<450)&&asksToLogin)||(passwordForm&&body.length<300&&!/<article\b/i.test(section)))throw Error('该页面需要登录，尚未取得要阅读的正文。');
 if(body.length<25||body.length<400&&/enable javascript|requires? javascript|请启用\s*javascript/i.test(body))throw Error('页面没有返回足够的可读正文，可能需要登录或由浏览器动态加载。');
 return {title:title||new URL(page.url).hostname,body};
}

export async function runWebSkill(id,input={},options={}){
 const readPage=options.readPage||fetchPublicPage;
 const need=message=>({status:'needs_input',summary:message,missing:[message],artifacts:[],metrics:{}});
 const question=id==='web.read'?'请提供要阅读的公开 HTTPS 网页链接。':'请输入要查找的公开主题或关键词。';
 try{
  if(id==='web.read'){
   if(typeof input.url!=='string'||!input.url.trim())return {...need(question),question};
   const url=webpageURL(input.url.trim());
   const page=await readPage(url.href),{title,body}=readPageText(page);
   if(!body)throw Error('网页没有返回正文。');
   return {status:'succeeded',summary:'已读取「'+title.slice(0,120)+'」',missing:[],
    artifacts:[{title:'网页摘录 · '+title.slice(0,100),body,evidence:page.url}],
    metrics:{sources:[{title:title.slice(0,180),url:page.url,snippet:body.slice(0,320)}]}};
  }
  if(id!=='web.search')throw Error('未知的网页技能。');
  if(typeof input.query!=='string'||!input.query.trim()||input.query.length>600)return {...need(question),question};
  const query=input.query.trim();
  let rows,provider;
  if(options.integrations?.view().search.ready){
   const response=await options.integrations.query({query});
   rows=response.results;provider='工作空间搜索连接';
  }else{
   const providers=[
    ['Bing',new URL('https://www.bing.com/search'),rssResults],
    ['DuckDuckGo',new URL('https://html.duckduckgo.com/html/'),duckResults]
   ];
   const failures=[];
   for(const [name,url,parse] of providers){
    url.searchParams.set('q',query);
    if(name==='Bing')url.searchParams.set('format','rss');
    try{rows=parse((await readPage(url.href)).text);if(!rows.length)throw Error('没有返回可核对的结果');provider=name;break;}
    catch(error){failures.push(name+'（'+publicFailure(error)+'）');}
   }
   if(!provider)return need('未取得公开搜索结果。'+failures.join('、')+'。可以换关键词、提供具体网页链接，或在工作空间配置搜索服务。');
  }
  const seen=new Set(),sources=[];
  for(const hit of rows||[]){
   const url=resultUrl(hit.url||'');if(!url||seen.has(url)||!hit.title)continue;
   seen.add(url);sources.push({url,title:String(hit.title).slice(0,180),snippet:String(hit.snippet||hit.content||'').slice(0,500)});
   if(sources.length>=8)break;
  }
  if(!sources.length)return need('搜索服务未返回带来源链接的结果，请换关键词或提供网页链接。');
  return {status:'succeeded',summary:'找到 '+sources.length+' 条公开网页线索',missing:[],
   artifacts:[{title:'网页搜索 · '+query.slice(0,100),body:sources.map((s,i)=>(i+1)+'. '+s.title+'\n'+s.url+(s.snippet?'\n'+s.snippet:'')).join('\n\n'),evidence:provider}],
   metrics:{query,provider,sources}};
 }catch(error){return need((id==='web.read'?'网页读取未完成。':'网页搜索未完成。')+publicFailure(error));}
}
function publicFailure(error){
 if(error?.name==='TimeoutError'||error?.name==='AbortError'||error?.code==='ABORT_ERR')return '请求超时';
 if(error?.code==='ERR_PROXY_TUNNEL')return '出站代理拒绝连接该网站';
 if(error?.code||!/^[\u3400-\u9fff]/.test(error?.message||''))return '网络或代理连接失败';
 return error.message.slice(0,170);
}
