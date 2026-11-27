import {spawn} from 'node:child_process';
import {StringDecoder} from 'node:string_decoder';

const originalOnly=readNote=>({text:'',readStatus:'original_only',readNote});

// Poppler is optional. Feed it the private upload over stdin, with a fixed
// argument list and bounded output/time. No shared input or output files.
export function readPdfAttachment(bytes){
 return new Promise(resolve=>{
  const process=spawn('pdftotext',['-enc','UTF-8','-nopgbrk','-','-'],{stdio:['pipe','pipe','pipe'],windowsHide:true});
  const decoder=new StringDecoder('utf8'),limit=60000;
  let text='',errorOutput='',truncated=false,timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;process.kill('SIGKILL');},6000);
  const finish=result=>{clearTimeout(timer);resolve(result);};
  process.on('error',error=>finish(originalOnly(error.code==='ENOENT'?'已保存 PDF，服务端未安装 PDF 文字提取工具。':'已保存 PDF，文字提取工具未能运行。')));
  process.stdout.on('data',part=>{
   if(truncated)return;
   text+=decoder.write(part);
   if(text.length>limit){
    text=text.slice(0,limit);truncated=true;process.kill('SIGKILL');
   }
  });
  process.stderr.on('data',part=>{if(errorOutput.length<4096)errorOutput+=part.toString('utf8',0,4096);});
  process.stdin.on('error',()=>{}); // The reader may exit early on encrypted or invalid input.
  process.on('close',code=>{
   if(!truncated)text=(text+decoder.end()).trim();
   if(truncated)return finish({text,readStatus:'partial',readNote:'已读取前 60,000 个字符。'});
   if(timedOut)return finish(text?{text,readStatus:'partial',readNote:'已到文字提取时限，仅保留已读取的部分。'}:originalOnly('已保存 PDF，文字提取超时。'));
   if(code!==0)return finish(originalOnly(/password|encrypted/i.test(errorOutput)?'已保存加密 PDF，读取正文需要未加密的副本。':'已保存 PDF，未能提取可读正文。'));
   finish(text?{text,readStatus:'ready',readNote:''}:originalOnly('已保存 PDF，未提取到文字；扫描件可另附文字版。'));
  });
  process.stdin.end(bytes);
 });
}
