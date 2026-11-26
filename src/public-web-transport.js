import https from 'node:https';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';

// https.request calls this lookup when opening the socket, so a second DNS lookup
// cannot switch a validated hostname to an internal address.
export function publicAddress(address){
 if(isIP(address)===4){
  const [a,b,c]=address.split('.').map(Number);
  return a>0&&a<224&&a!==10&&a!==127&&!(a===100&&b>=64&&b<128)&&
   !(a===169&&b===254)&&!(a===172&&b>=16&&b<32)&&!(a===192&&(b===168||b===0||b===88&&c===99))&&
   !(a===198&&(b===18||b===19||b===51&&c===100))&&!(a===203&&b===0&&c===113);
 }
 const s=address.toLowerCase();
 return isIP(address)===6&&/^[23][0-9a-f]{3}:/.test(s)&&!s.startsWith('2002:')&&!/^2001:(?:0*:|0*[12][0-9a-f]?:|db8:)/.test(s);
}
export function webpageURL(input){
 let url;
 try{url=new URL(input);}catch{throw Error('请输入带 https:// 的公开网页地址。');}
 if(url.protocol!=='https:'||url.port||url.username||url.password||!url.hostname.includes('.')||isIP(url.hostname)||
   /(?:^|\.)(?:localhost|local|internal|localdomain|lan|home|test|invalid|onion)\.?$/i.test(url.hostname)||url.hostname.endsWith('.')||url.href.length>3000)
  throw Error('只能读取使用标准 HTTPS 端口的公开网站。');
 url.hash='';return url;
}
async function publicLookup(host,options,callback){
 try{
  const rows=await lookup(host,{all:true,verbatim:true});
  if(!rows.length||rows.some(row=>!publicAddress(row.address)))throw Error('该地址不能作为公开网页读取。');
  const allowed=options.family?rows.filter(row=>row.family===options.family):rows;
  if(!allowed.length)throw Error('该网站未解析到可用的公网地址。');
  if(options.all)callback(null,allowed);else callback(null,allowed[0].address,allowed[0].family);
 }catch(error){callback(error);}
}
const proxyPublicSites=new Set(['www.bing.com','html.duckduckgo.com','github.com','www.workbuddy.cn','www.codebuddy.cn','www.workbuddy.ai']);
function proxyFor(url){
 const proxy=process.env.https_proxy||process.env.HTTPS_PROXY||process.env.http_proxy||process.env.HTTP_PROXY;
 if(!proxy)return false;
 const excluded=(process.env.no_proxy||process.env.NO_PROXY||'').toLowerCase().split(',').map(x=>x.trim().replace(/:443$/,''));
 return !excluded.some(x=>x==='*'||x===url.hostname||x.startsWith('.')&&(url.hostname===x.slice(1)||url.hostname.endsWith(x)));
}
async function requestPage(url,signal){
 const proxy=proxyFor(url);
 if(proxy){
  // A forward proxy resolves the final hostname itself. Limit that route to the
  // public providers/publishers and domains the operator explicitly trusts.
  const trusted=(process.env.AGENT_ALLOWED_HOSTS||'').toLowerCase().split(',').map(s=>s.trim());
  if(!proxyPublicSites.has(url.hostname)&&!trusted.includes(url.hostname))throw Error('服务端出站代理尚未允许读取该网站，请将该公开域名加入 AGENT_ALLOWED_HOSTS。');
  const [major,minor]=process.versions.node.split('.').map(Number);
  if(major<22||major===22&&minor<21||major===23||major===24&&minor<5)throw Error('带出站代理的网页读取需要 Node 22.21 或更新的 LTS 版本。');
 }
 const agent=new https.Agent(proxy?{proxyEnv:process.env}:{lookup:publicLookup});
 try{
  return await new Promise((resolve,reject)=>{
   const req=https.get(url,{agent,signal,headers:{Accept:'text/html, application/rss+xml, application/xml, text/plain;q=0.9','Accept-Encoding':'identity','User-Agent':'Mozilla/5.0 (compatible; MAS-Workspace/1.0)'}},res=>{
    const status=res.statusCode||0;
    if([301,302,303,307,308].includes(status)){const location=res.headers.location;res.destroy();resolve({status,location});return;}
    if(status<200||status>=300){res.destroy();reject(Error('网站返回 HTTP '+status+'。'));return;}
    const type=String(res.headers['content-type']||'').toLowerCase();
    if(!/^(?:text\/(?:html|plain|xml|markdown)|application\/(?:rss\+xml|atom\+xml|xhtml\+xml|xml))(?:\s*;|$)/.test(type)){res.destroy();reject(Error('该地址没有返回可读取的网页、纯文本或搜索结果。'));return;}
    const parts=[];let bytes=0;
    res.on('error',reject);
    res.on('data',part=>{bytes+=part.length;if(bytes>1500000){res.destroy();reject(Error('网页超过本次可读取的大小。'));}else parts.push(part);});
    res.on('end',()=>{
     const body=Buffer.concat(parts),charset=type.match(/charset=["']?([\w-]+)/)?.[1]||body.subarray(0,4096).toString('ascii').match(/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i)?.[1]||'utf-8';
     let decoder;try{decoder=new TextDecoder(charset);}catch{decoder=new TextDecoder();}
     resolve({status,type,text:decoder.decode(body)});
    });
   });req.on('error',reject);
  });
 }finally{agent.destroy();}
}
export async function fetchPublicPage(input,{request=requestPage,signal=AbortSignal.timeout(10000)}={}){
 let url=webpageURL(input);
 for(let i=0;i<4;i++){
  const response=await request(url,signal);
  if(response.status>=300&&response.status<400){
   if(!response.location)throw Error('网站跳转缺少目标地址。');
   url=webpageURL(new URL(response.location,url).href);continue;
  }
  return {...response,url:url.href};
 }
 throw Error('网页跳转次数过多。');
}
