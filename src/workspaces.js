import {randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import path from 'node:path';
import {createPlatform} from './platform.js';
export async function createWorkspaceManager(root,{factory=createPlatform}={}){
 await mkdir(root,{recursive:true});const file=path.join(root,'workspaces.json');let rows;
 try{rows=JSON.parse(await readFile(file,'utf8'));if(!Array.isArray(rows)||!rows.some(x=>x.id==='default'))throw new Error('工作空间目录格式错误');}catch(e){if(e.code!=='ENOENT')throw e;rows=[{id:'default',name:'我的工作空间',revision:1,createdAt:new Date().toISOString()}];await writeFile(file,JSON.stringify(rows));}
 const platforms=new Map();let chain=Promise.resolve();
 const find=id=>{const row=rows.find(w=>w.id===id);if(!row)throw Object.assign(new Error('工作空间不存在'),{status:404});return row;};
 const get=async(id='default')=>{find(id);if(!platforms.has(id)){const loading=factory(id==='default'?root:path.join(root,'workspaces',id)).catch(e=>{platforms.delete(id);throw e;});platforms.set(id,loading);}return platforms.get(id);};
 async function save(id,input){const op=chain.then(async()=>{const old=id?find(id):null;if(old&&old.revision!==input.revision)throw new Error('工作空间已更新，请重新打开');const name=String(input.name||'').trim();if(!name||name.length>60)throw new Error('名称需为 1–60 字');if(rows.some(w=>w.id!==id&&w.name===name))throw new Error('已存在同名工作空间');if(!old&&rows.length>=20)throw new Error('最多创建 20 个工作空间');const row={id:old?.id||randomUUID(),name,revision:(old?.revision||0)+1,createdAt:old?.createdAt||new Date().toISOString()},next=old?rows.map(w=>w.id===id?row:w):[...rows,row];await writeFile(file+'.tmp',JSON.stringify(next));await rename(file+'.tmp',file);rows=next;return structuredClone(row);});chain=op.catch(()=>{});return op;}
 // Resume persisted jobs in all workspaces; data and configuration stay in separate files.
 for(const row of rows)await get(row.id);
 return {list:()=>structuredClone(rows),get,save,pumpImages:async()=>{await Promise.all([...platforms.values()].map(async p=>(await p).images.pump()));},pump:async()=>{const results=await Promise.allSettled([...platforms.values()].map(async p=>(await p).pump()));const failure=results.find(r=>r.status==='rejected');if(failure)throw failure.reason;}};
}
