import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {createPlatform} from '../src/platform.js';

test('knowledge media originals survive restart, recall captions, edit and delete independently',async t=>{
 const dir=await mkdtemp('/tmp/kb-media-');t.after(()=>rm(dir,{recursive:true,force:true}));
 let p=await createPlatform(dir);
 const png=(await readFile('public/product-demo.png')).toString('base64');
 const fields={baseId:'kb-default',enabled:true,confirmed:true,overlap:100,size:700,title:'产品图库',body:'品牌插画猫粮包装',source:'产品部'};
 const item=await p.knowledge.saveDocument(null,{...fields,media:{name:'cat.png',base64:png}});
 assert.equal(item.media.mime,'image/png');assert(!JSON.stringify(p.knowledge.view()).includes(png));
 p=await createPlatform(dir);assert.equal((await p.knowledge.media(item.id)).base64,png);
 const recall=await p.knowledge.search({baseIds:['kb-default'],query:'猫粮'});assert.equal(recall.hits[0].documentId,item.id);
 await assert.rejects(()=>p.knowledge.saveDocument(item.id,{...fields,revision:item.revision,media:{name:'cat.png',base64:btoa('something else')}}));
 const saved=await p.knowledge.saveDocument(item.id,{...fields,revision:item.revision,body:'修改后的图注'});assert.deepEqual(saved.media,item.media);
 await p.knowledge.deleteDocument(item.id,{confirmed:true,revision:saved.revision});assert.deepEqual(await readdir(dir+'/knowledge-media'),[]);
});
