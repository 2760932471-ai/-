import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough,Writable} from 'node:stream';
import {runCodexImage} from '../src/codex-image.js';
import {generateImage} from '../src/image-transport.js';

const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/S1sAAAAASUVORK5CYII=';
function protocol({authorized=true,sendImage=true,accountError=false}={}){
 const calls=[];
 function launch(bin,args,options){
  assert(args.includes('features.image_generation=true'));assert(args.includes('features.shell_tool=false'));
  assert(!options.env.OPENAI_API_KEY);
  const child=new EventEmitter();child.stdout=new PassThrough();child.exitCode=null;
  const emit=r=>child.stdout.write(JSON.stringify(r)+'\n');
  child.stdin=new Writable({write(chunk,encoding,done){
   const m=JSON.parse(chunk);calls.push(m);
   if(m.method==='initialize')emit({id:m.id,result:{}});
   if(m.method==='account/read')emit({id:m.id,result:{account:authorized?{type:'chatgpt'}:null}});
   if(m.method==='account/rateLimits/read')emit(accountError?{id:m.id,error:{message:'failed to read rate limits: HTTP 401'}}:{id:m.id,result:{rateLimits:{}}});
   if(m.method==='thread/start'){assert.equal(m.params.sandbox,'read-only');emit({id:m.id,result:{thread:{id:'thread'}}});}
   if(m.method==='turn/start'){
    emit({id:m.id,result:{turn:{id:'turn'}}});
    const item={type:'imageGeneration',status:'completed',result:png};
    const completed=(threadId,turnId,item)=>emit({method:'item/completed',params:{threadId,turnId,item}});
    completed('elsewhere','turn',item);completed('thread','elsewhere',item);completed('thread','turn',{type:'agentMessage',text:'result.png'});
    if(sendImage)completed('thread','turn',item);
    emit({method:'turn/completed',params:{threadId:'thread',turn:{id:'turn',status:'completed'}}});
   }
   done();
  }});
  child.kill=()=>{child.stdout.end();child.emit('close',0);};return child;
 }
 return {calls,launch,cli:'test-cli'};
}
test('Codex login probe and native PNG job use distinct requests and preserve reference input',async t=>{
 const before=process.env.ENABLE_CODEX_LOCAL;t.after(()=>{if(before===undefined)delete process.env.ENABLE_CODEX_LOCAL;else process.env.ENABLE_CODEX_LOCAL=before;});
 process.env.ENABLE_CODEX_LOCAL='1';
 const check=protocol();assert.deepEqual(await runCodexImage(null,check),{scope:'codex_account'});assert(!check.calls.some(r=>r.method==='turn/start'));
 await assert.rejects(runCodexImage(null,protocol({authorized:false})),/登录 ChatGPT/);
 await assert.rejects(runCodexImage(null,protocol({accountError:true})),/认证未通过/);
 const job=protocol();
 const input={prompt:'以底图制作商品主图',size:'1024x1024',upload:{mime:'image/png',buffer:Buffer.from(png,'base64')}};
 assert.deepEqual(await generateImage({provider:'codex_local'},input,{codexCall:i=>runCodexImage(i,job)}),{base64:png,width:1,height:1});
 assert.equal(job.calls.find(r=>r.method==='turn/start').params.input[1].url,'data:image/png;base64,'+png);
 await assert.rejects(runCodexImage(input,protocol({sendImage:false})),/没有原生图片/);
});

test('Codex receives the supplier photo bytes from the selected offer',async()=>{
 const url='https://cbu01.alicdn.com/img/ibank/123.png';
 const input={referenceUrl:url,offerPhoto:true,prompt:'基于白底图制作淘宝主图',size:'1024x1024'};
 let ref;
 const options={resolve:async()=>[{address:'8.8.8.8'}],fetch:async(address,request)=>{
  assert.equal(address,url);assert.equal(request.redirect,'error');
  return new Response(Buffer.from(png,'base64'),{headers:{'content-type':'image/png'}});
 },codexCall:async i=>{ref=i.reference;return png;}};
 await generateImage({provider:'codex_local'},input,options);
 assert.equal(ref.mime,'image/png');assert.equal(ref.buffer.toString('base64'),png);
 await assert.rejects(generateImage({provider:'codex_local'},{...input,referenceUrl:'https://wrong.invalid/123.png'},options));
});
