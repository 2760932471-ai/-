import assert from 'node:assert/strict';
import test from 'node:test';
import {fetchPublicPage,publicAddress,webpageURL} from '../src/public-web-transport.js';
import {runWebSkill} from '../src/workforce/web-skills.js';

const site='https://publisher.example.org/';
const page=(text,type='text/html',url=site)=>({text,type,url,status:200});

test('web page inputs accept standard public HTTPS URLs and reject unsupported destinations before reading',async()=>{
 assert.equal(webpageURL(site+'guide?q=scope#chapter').href,site+'guide?q=scope');
 for(const address of ['93.184.216.34','2606:4700:4700::1111'])assert.equal(publicAddress(address),true,address);
 for(const address of ['127.0.0.1','192.168.1.1','169.254.0.1','203.0.113.5','::1','fd00::2','2001:db8::42','example.org'])assert.equal(publicAddress(address),false,address);
 let calls=0;
 for(const url of ['http://publisher.example.org/', 'https://publisher.example.org:8443/', 'https://user@publisher.example.org/','https://localhost/','https://127.0.0.1/']){
  await assert.rejects(()=>fetchPublicPage(url,{request:async()=>{calls++;}}),/公开/);
 }
 assert.equal(calls,0);
});

test('relative redirects retain the final source, while an invalid target, missing target or redirect loop stops',async()=>{
 const seen=[];
 const read=await fetchPublicPage(site+'intro',{request:async url=>{
  seen.push(url.href);
  return seen.length===1?{status:302,location:'/docs/guide#part'}:page('article content');
 }});
 assert.deepEqual(seen,[site+'intro',site+'docs/guide']);
 assert.equal(read.url,site+'docs/guide');
 let visited=0;
 await assert.rejects(()=>fetchPublicPage(site,{request:async()=>{visited++;return {status:307,location:'http://publisher.example.org/archive'};}}),/公开/);
 assert.equal(visited,1);
 await assert.rejects(()=>fetchPublicPage(site,{request:async()=>({status:302})}),/跳转缺少/);
 let redirects=0;
 await assert.rejects(()=>fetchPublicPage(site,{request:async()=>({status:301,location:'/page/'+(++redirects)})}),/跳转次数/);
 assert.ok(redirects>1&&redirects<=5);
});

test('web reading keeps literal text and extracts the main article with the URL of the returned page',async()=>{
 const plain='  A < B\n说明保留原文和换行。  ';
 for(const type of ['text/plain; charset=UTF-8','text/markdown']){
  const r=await runWebSkill('web.read',{url:site},{readPage:async()=>page(plain,type)});
  assert.equal(r.status,'succeeded');
  assert.equal(r.artifacts[0].body,plain.trim());
  assert.equal(r.artifacts[0].evidence,site);
 }
 const finalURL=site+'policy',article='<html><head><title>费用 &amp; 配送</title></head><body><header>登录</header><nav>注册入口</nav><article><p>运费由承运商按重量和目的地计算，采购前请核实。</p><script>track()</script><p>货款 &amp; 运费分开结算，请保留对应报价。</p></article><footer>版权标志</footer></body></html>';
 const r=await runWebSkill('web.read',{url:site},{readPage:async()=>page(article,'text/html',finalURL)});
 assert.equal(r.status,'succeeded');
 assert.match(r.artifacts[0].body,/核实。\n货款 & 运费/);
 assert.doesNotMatch(r.artifacts[0].body,/track|登录|注册|版权/);
 assert.equal(r.metrics.sources[0].title,'费用 & 配送');
 assert.equal(r.artifacts[0].evidence,finalURL);
});

test('sign-in forms, verification screens, an empty client-rendered article, and transport failures report missing evidence',async()=>{
 const login='<html><title>Sign in</title><main><h1>Sign in to your account</h1><form><label>Enter your password to view the article<input type="password"></label></form></main></html>';
 for(const html of [login,'<title>安全验证</title><body>请先完成验证，然后进入您请求阅读的新闻文章。</body>','<title>通知</title><div id="app"></div>']){
  const r=await runWebSkill('web.read',{url:site},{readPage:async()=>page(html)});
  assert.equal(r.status,'needs_input');
  assert.match(r.missing.join(' '),/登录|验证|正文/);
  assert.deepEqual(r.artifacts,[]);
 }
 const r=await runWebSkill('web.read',{url:site},{readPage:async()=>{throw Error('网站返回 HTTP 403。');}});
 assert.equal(r.status,'needs_input');
 assert.match(r.summary,/403/);
 assert.equal(r.artifacts.length,0);
});

test('Bing RSS results retain citations and decode text, discard unusable items and deduplicate by URL',async()=>{
 const xml='<rss><channel><item><title><![CDATA[<b>公开</b> 指南]]></title><link>'+site+'guide?a=1&amp;b=2</link><description>价格 &amp; 费用</description></item><item><title>重复条目</title><link>'+site+'guide?a=1&amp;b=2</link></item><item><title>无地址</title></item></channel></rss>';
 const query='测试费用说明',requests=[];
 const result=await runWebSkill('web.search',{query},{readPage:async url=>{requests.push(new URL(url));return page(xml,'application/rss+xml',url);}});
 assert.equal(result.status,'succeeded');
 assert.equal(requests.length,1);
 assert.equal(requests[0].hostname,'www.bing.com');
 assert.equal(requests[0].searchParams.get('format'),'rss');
 assert.equal(requests[0].searchParams.get('q'),query);
 assert.equal(result.metrics.provider,'Bing');
 assert.deepEqual(result.metrics.sources,[{title:'公开 指南',url:site+'guide?a=1&b=2',snippet:'价格 & 费用'}]);
 assert.match(result.artifacts[0].body,/公开 指南/);
});

test('an unavailable or empty primary search falls back to DuckDuckGo and reports when neither returns sources',async()=>{
 const query='报表阅读',href='//duckduckgo.com/l/?uddg='+encodeURIComponent(site+'reports');
 const html='<div><a class="result__a" href="'+href+'">报表 <b>说明</b></a><a class="result__snippet">指标口径</a></div>';
 for(const unavailable of [true,false]){
  const seen=[];
  const r=await runWebSkill('web.search',{query},{readPage:async input=>{
   const url=new URL(input);seen.push(url.hostname);
   assert.equal(url.searchParams.get('q'),query);
   if(url.hostname==='www.bing.com'){
    if(unavailable)throw Error('检索未完成');
    return page('<rss><channel/></rss>');
   }
   return page(html);
  }});
  assert.equal(r.status,'succeeded');
  assert.equal(r.metrics.provider,'DuckDuckGo');
  assert.deepEqual(seen,['www.bing.com','html.duckduckgo.com']);
  assert.deepEqual(r.metrics.sources,[{title:'报表 说明',url:site+'reports',snippet:'指标口径'}]);
 }
 const noResults=await runWebSkill('web.search',{query},{readPage:async()=>page('')});
 assert.equal(noResults.status,'needs_input');
 assert.match(noResults.summary,/Bing/);
 assert.match(noResults.summary,/DuckDuckGo/);
 assert.equal(noResults.artifacts.length,0);
});

test('a ready workspace search takes precedence, and missing inputs start no request',async()=>{
 const queries=[],reads=[];
 const options={
  integrations:{view:()=>({search:{ready:true}}),query:async({query})=>{queries.push(query);return {results:[{title:'空间来源',url:site,content:'工作空间索引的摘要'}]};}},
  readPage:async url=>{reads.push(url);return page('')}
 };
 const r=await runWebSkill('web.search',{query:' 指标口径 '},options);
 assert.equal(r.status,'succeeded');
 assert.equal(r.metrics.provider,'工作空间搜索连接');
 assert.equal(r.metrics.sources[0].snippet,'工作空间索引的摘要');
 assert.deepEqual(queries,['指标口径']);
 for(const [id,input] of [['web.search',{}],['web.search',{query:' '.repeat(5)}],['web.search',{query:'x'.repeat(601)}],['web.read',{}]]){
  const missing=await runWebSkill(id,input,options);
  assert.equal(missing.status,'needs_input');
  assert.ok(missing.question);
  assert.equal(missing.artifacts.length,0);
 }
 assert.deepEqual(queries,['指标口径']);
 assert.deepEqual(reads,[]);
});
