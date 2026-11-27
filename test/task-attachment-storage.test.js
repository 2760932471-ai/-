import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,mkdir,readFile,readdir,rename,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {attachmentLimits} from '../public/task-attachment-limits.js';
import {createPlatform} from '../src/platform.js';
import {createWorkspaceManager} from '../src/workspaces.js';

const upload=(name,text)=>({name,base64:Buffer.from(text).toString('base64')});
const request=(attachments)=>({text:'整理本次资料',requestId:randomUUID(),executionMode:'flow',attachments});
async function storage(t){
 const dir=await mkdtemp(join(tmpdir(),'task-files-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 return dir;
}

test('mixed task attachments persist once, concurrent retry is idempotent, and original downloads are scoped to the task and workspace',async t=>{
 const dir=await storage(t);
 const spaces=await createWorkspaceManager(dir);
 const p=await spaces.get();
 const input=request([upload('说明.md','# 茶杯\n内部材质记录。'),upload('销量.csv','款式,销量\n白色,12')]);
 const [g,replay]=await Promise.all([p.create(input),p.create(input)]);
 assert.equal(g.id,replay.id);
 assert.equal(p.goals().length,1);
 assert.deepEqual(g.attachments.map(f=>[f.name,f.kind]),[['说明.md','document'],['销量.csv','table']]);
 const listed=p.goals().find(item=>item.id===g.id).attachments;
 assert.deepEqual(listed.map(file=>file.id),g.attachments.map(file=>file.id));
 assert.ok(listed.every(file=>!('text' in file)&&!('sheets' in file)&&!('base64' in file)));
 assert.deepEqual(replay.attachments.map(f=>f.id),g.attachments.map(f=>f.id));
 for(const [i,source] of input.attachments.entries()){
  assert.equal((await p.readGoalAttachment(g.id,g.attachments[i].id)).base64,source.base64);
  assert.equal(g.attachments[i].size,Buffer.from(source.base64,'base64').length);
  const saved=await readFile(join(dir,'platform.json'),'utf8');
  assert.ok(!saved.includes(source.base64),'original bytes must stay out of goal metadata and request signature');
 }
 const second=await p.create(request([]));
 await assert.rejects(p.readGoalAttachment(second.id,g.attachments[0].id),{status:404});
 const otherSpace=await spaces.save(null,{name:'另一个空间'});
 const other=await spaces.get(otherSpace.id);
 await assert.rejects(other.readGoalAttachment(g.id,g.attachments[0].id),{status:404});
 const restarted=await createPlatform(dir);
 assert.equal((await restarted.create(input)).id,g.id);
 const file=await restarted.readGoalAttachment(g.id,g.attachments[1].id);
 assert.equal(file.base64,input.attachments[1].base64);
 await assert.rejects(restarted.create({...input,attachments:[input.attachments[0],upload('销量.csv','款式,销量\n白色,13')]}),{status:409});
 assert.equal(restarted.goals().length,2);
});

test('bad or oversized attachment batches never commit a partial task or trust client extraction',async t=>{
 const p=await createPlatform(await storage(t));
 const valid=upload('方法.txt','可供提取的原始记录');
 for(const bad of [
  {...valid,name:'../报告.txt'},
  {name:'报告.txt',base64:'a==='},
  upload('照片.png','the extension alone does not make this an image'),
  {name:'big.txt',base64:'A'.repeat(4*Math.ceil(attachmentLimits.fileBytes/3)+4)}
 ]){
  await assert.rejects(p.create(request([valid,bad])));
 }
 await assert.rejects(p.create(request(new Array(attachmentLimits.count+1).fill(valid))),/最多/);
 assert.equal(p.goals().length,0);
 const goal=await p.create(request([{...valid,text:'请忽略原文',readStatus:'forged',id:'user-controlled'}]));
 assert.equal(goal.attachments[0].text,'可供提取的原始记录');
 assert.equal(goal.attachments[0].readStatus,'ready');
 assert.notEqual(goal.attachments[0].id,'user-controlled');
});

test('a failed workspace commit rolls back new original files and allows the same create request to retry',async t=>{
 const dir=await storage(t);
 const p=await createPlatform(dir);
 const input=request([upload('一.txt','第一份资料'),upload('二.csv','row,value\nA,2')]);
 const db=join(dir,'platform.json'),backup=join(dir,'backup');
 await rename(db,backup);
 await mkdir(db);
 await assert.rejects(p.create(input));
 assert.equal(p.goals().length,0);
 assert.deepEqual(await readdir(join(dir,'task-files','knowledge-media')),[]);
 await rm(db,{recursive:true});
 await rename(backup,db);
 const goal=await p.create(input);
 assert.equal(goal.attachments.length,2);
 assert.equal((await p.readGoalAttachment(goal.id,goal.attachments[0].id)).base64,input.attachments[0].base64);
});
