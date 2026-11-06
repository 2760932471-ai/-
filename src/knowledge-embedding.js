import {validateDestination} from './agents/registry.js';
import {validateVectors} from './knowledge-retrieval.js';
export function embeddingConfiguration(){
 const endpoint=process.env.KB_EMBEDDING_ENDPOINT||'',model=process.env.KB_EMBEDDING_MODEL||'';
 return {configured:!!(endpoint&&model&&process.env.KB_EMBEDDING_KEY),model,signature:endpoint+'|'+model};
}
export async function embedTexts(input,{fetch:request=fetch,resolve}={}){
 const config=embeddingConfiguration();if(!config.configured)throw new Error('未配置 Embedding 服务，请先使用 BM25 关键词召回');
 if(!Array.isArray(input)||!input.length||input.length>16)throw new Error('Embedding 每批接受 1–16 段文本');
 const signal=AbortSignal.timeout(20000),abort=new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('Embedding 请求超时')),{once:true}));
 try{
  await Promise.race([validateDestination(process.env.KB_EMBEDDING_ENDPOINT,resolve),abort]);
  const key=process.env.KB_EMBEDDING_KEY;
  const res=await request(process.env.KB_EMBEDDING_ENDPOINT,{method:'POST',redirect:'error',signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify({model:config.model,input,encoding_format:'float'})});
  if(!res.ok)throw new Error();const reader=res.body.getReader(),chunks=[];let size=0;
  while(true){const {done,value}=await Promise.race([reader.read(),abort]);if(done)break;size+=value.length;if(size>2000000){await reader.cancel();throw new Error();}chunks.push(value);}
  const raw=Buffer.concat(chunks).toString('utf8');if(raw.includes(key))throw new Error();
  const result=JSON.parse(raw);if(!Array.isArray(result.data)||result.data.length!==input.length)throw new Error();
  const sorted=result.data.slice().sort((a,b)=>a.index-b.index);if(sorted.some((r,i)=>r.index!==i))throw new Error();return validateVectors(sorted.map(r=>r.embedding),input.length);
 }catch{throw new Error('Embedding 请求失败，请检查模型、密钥、域名白名单、超时与响应格式；未写入部分索引');}
}
