import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createPlatform} from '../src/platform.js';
import {contentPacks,contentSample,executeContent,validateCopyBrief} from '../src/workforce/content.js';
const make=async()=>{const dir=await mkdtemp(join(tmpdir(),'copy-'));return {p:await createPlatform(dir),dir};};
const input=(id='titles')=>({requestId:randomUUID(),text:'为测试商品制作可核验的文字草稿',kind:'analysis',employeeIds:['employee-copy-'+id],permission:'draft',scope:{store:'测试店',sku:'TEST-COPY',product:'测试商品'},contentDraft:id,copyBrief:contentSample().copyBrief});
test('five content skills use confirmed facts and distinguish text, image briefs and video scripts',()=>{
 for(const p of contentPacks){const first=executeContent(p.skillId,contentSample());assert.equal(first.status,'succeeded');const other=contentSample();other.copyBrief.productName='不锈钢测试产品';other.copyBrief.facts=['包装：2 只装'];other.copyBrief.source='新的规格凭证';const next=executeContent(p.skillId,other);assert.match(next.artifacts[0].body,/不锈钢测试产品/);assert.match(next.artifacts[0].body,/新的规格凭证/);assert.doesNotMatch(next.artifacts[0].body,/黄铜|G1\/2/);assert.notEqual(first.artifacts[0].body,next.artifacts[0].body);assert.equal(executeContent(p.skillId,{}).status,'needs_input');}
 const sample=contentSample();sample.copyBrief.duration=60;assert.match(executeContent('copy.video',sample).artifacts[0].body,/48–60 秒/);assert.match(executeContent('copy.image_brief',sample).artifacts[0].body,/未生成图片/);
});
test('unconfirmed, excessive or suspect copy facts stop drafting with actionable errors',()=>{
 for(const patch of [{confirmed:false},{facts:[]},{facts:Array(9).fill('事实')},{facts:['永久不漏']},{productName:'全网最低商品'},{duration:45},{source:''}]){const b={...contentSample().copyBrief,...patch};assert.throws(()=>validateCopyBrief(b));assert.equal(executeContent('copy.detail',{copyBrief:b}).status,'needs_input');}
});
test('content quick start persists facts, runs all five employees and deduplicates retries',async()=>{
 const {p,dir}=await make();for(const pack of contentPacks){const request=input(pack.id);const [g,retry]=await Promise.all([p.create(request),p.create(request)]);assert.equal(g.id,retry.id);assert.equal(g.stage,'draft');assert.equal(g.proposal,null);await p.pump();const done=p.goals().find(x=>x.id===g.id);assert.equal(done.stage,'review');assert.equal(done.artifacts.length,1);assert.match(done.artifacts[0].body,new RegExp(pack.name));assert.equal(p.runs().filter(r=>r.goalId===g.id).length,1);const run=p.run(done.artifacts[0].runId);assert.deepEqual(run.input.copyBrief,request.copyBrief);}
 const again=await createPlatform(dir);assert.equal(again.goals().length,5);assert(again.goals().every(g=>g.artifacts.length===1));
});
test('invalid quick starts are atomic, and reusing changed requests cannot overwrite results',async()=>{
 const {p}=await make();const bad=input();bad.copyBrief.confirmed=false;await assert.rejects(p.create(bad),/确认/);assert.equal(p.goals().length,0);assert.equal(p.runs().length,0);
 const wrong=input();wrong.employeeIds=['employee-coordination'];await assert.rejects(p.create(wrong),/对应/);
 const valid=input(),g=await p.create(valid);await assert.rejects(p.create({...valid,copyBrief:{...valid.copyBrief,productName:'改变'}}),/同一/);assert.equal(p.goals().length,1);
 // Editing before execution invalidates the queued old version and creates a fresh plan.
 const next={...valid.copyBrief,productName:'新版本商品'};const changed=await p.action(g.id,{kind:'inputs',expectedVersion:g.version,data:{copyBrief:next}});assert.equal(changed.stage,'plan');await p.pump();assert.equal(p.goals()[0].artifacts.length,0);await p.action(g.id,{kind:'plan',expectedVersion:changed.version});await p.pump();assert.match(p.goals()[0].artifacts[0].body,/新版本商品/);
});
