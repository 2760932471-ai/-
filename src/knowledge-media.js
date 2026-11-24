import {mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';

export function knowledgeMediaFiles(root){
 const dir=path.join(root,'knowledge-media');
 const file=id=>{
  if(!/^[\da-f-]{36}$/i.test(id))throw new Error('媒体标识无效');
  return path.join(dir,id);
 };
 return {
  async put(id,base64){await mkdir(dir,{recursive:true});await writeFile(file(id),Buffer.from(base64,'base64'),{mode:0o600,flag:'wx'});},
  async get(id){return (await readFile(file(id))).toString('base64');},
  async remove(id){await rm(file(id),{force:true});}
 };
}
