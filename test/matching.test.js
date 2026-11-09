import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {createPlatform} from '../src/platform.js';
import {matchMembers} from '../src/workforce/matching.js';
import {defaultEmployees} from '../src/workforce/employees.js';
import {skillSample} from '../src/workforce/skills.js';
const selection='寻找市面上性价比高的淋浴头';
const base={requestId:'automatic-selection-01',text:selection,kind:'listing',permission:'draft',teamSelection:'auto',employeeIds:['employee-merchandise','employee-creative'],scope:{store:'测试店',sku:'DEMO-JF-001',product:'角阀'}};
async function setup(t){const dir=await mkdtemp('/tmp/matching-');t.after(()=>rm(dir,{recursive:true,force:true}));return {dir,p:await createPlatform(dir)};}
const d=()=>({employees:defaultEmployees(),models:[],externalSkills:[]});
test('automatic matcher uses executable skills, not display names or a fixed four-member template',()=>{
 const data=d();data.employees.find(e=>e.id==='employee-research').name='我的商品专家';
 const selected=matchMembers(data,selection);assert.deepEqual(selected.employeeIds,['employee-research','employee-selection','employee-coordination']);assert.deepEqual(selected.steps[1].skillIds,['selection.score']);assert.equal(selected.steps[0].employeeName,'我的商品专家');
 const content=matchMembers(data,'为淋浴头写商品标题和卖点');assert.deepEqual(content.steps.map(s=>s.skillIds),[['copy.titles'],['copy.selling_points'],['task.brief']]);assert(content.steps.every(s=>s.reasons.length));
 assert.deepEqual(matchMembers(data,'只写商品标题，不要视频').steps.map(s=>s.skillIds),[['copy.titles'],['task.brief']]);
 const finance=matchMembers(data,'分析本月经营利润');assert(finance.steps.some(s=>s.skillIds.includes('finance.calculate')));assert(!finance.steps.some(s=>s.skillIds.includes('product.draft')));
});
test('disabled and untested model employees are excluded; absent capabilities are reported instead of invented',()=>{
 const data=d();data.employees.find(e=>e.id==='employee-research').enabled=false;
 let r=matchMembers(data,selection);assert(!r.employeeIds.includes('employee-research'));assert(r.steps.some(s=>s.skillIds.includes('product.compare')));
 data.employees.find(e=>e.id==='employee-selection').mode='model';r=matchMembers(data,selection);assert(!r.employeeIds.includes('employee-selection'));assert(r.missing.some(s=>s.includes('候选商品评分')));
 assert.equal(matchMembers(data,'帮我订机票').recognized,false);
});
test('server creates and orders team itself, runs only matched skills, and persists automatic assignments',async t=>{
 const {p,dir}=await setup(t);let g=await p.create(base);assert.deepEqual(g.members,['employee-research','employee-selection','employee-coordination']);assert.equal(g.kind,'analysis');assert.equal(g.scope.sku,'待比较候选');assert.equal(g.artifacts.length,0);assert.equal(g.executionPlan.source,'auto-match');assert(g.messages.some(m=>m.text.includes('总控已自动安排团队')));
 const version=g.version;g=await p.action(g.id,{kind:'inputs',expectedVersion:g.version,data:{candidates:skillSample('selection.score').candidates}});assert.equal(g.version,version+1);assert.deepEqual(g.executionPlan.steps[1].skillIds,['selection.score']);await p.action(g.id,{kind:'plan',expectedVersion:g.version});for(let i=0;i<4;i++)await p.pump();g=p.goals()[0];assert.equal(g.stage,'review');assert.equal(g.artifacts.filter(a=>a.title==='候选商品参数比较').length,1);assert.equal(g.artifacts.length,3);
 const reopened=await createPlatform(dir);assert.equal(reopened.goals()[0].version,g.version);assert.equal(reopened.goals()[0].members.length,3);
});
test('opening legacy pending data auto-corrects the screenshot goal once, preserving existing discussion',async t=>{
 const {p,dir}=await setup(t);const g=await p.create({...base,teamSelection:'manual',startCollaboration:true});const file=dir+'/platform.json';let saved=JSON.parse(await readFile(file));delete saved.goals[0].teamSelection;await writeFile(file,JSON.stringify(saved));
 const current=await createPlatform(dir);const migrated=current.goals()[0];assert.equal(migrated.teamSelection,'auto');assert.equal(migrated.kind,'analysis');assert(!migrated.members.includes('employee-merchandise'));assert(migrated.participants.includes('employee-merchandise'));assert(g.messages.every(m=>migrated.messages.some(n=>n.id===m.id)));
 const again=await createPlatform(dir);assert.equal(again.goals()[0].messages.length,migrated.messages.length);assert.equal(again.goals()[0].version,migrated.version);
});
test('pending auto team replaces an unavailable member; manual overrides and started work are preserved',async t=>{
 const {p}=await setup(t);let g=await p.create(base);const e=p.workforce.view().employees.find(e=>e.id==='employee-research');await p.workforce.saveEmployee(e.id,{...e,enabled:false});await p.pump();g=p.goals()[0];assert(!g.members.includes(e.id));assert(g.executionPlan.steps.some(s=>s.skillIds.includes('product.compare')));
 g=await p.action(g.id,{kind:'setTeam',expectedVersion:g.version,teamSelection:'manual',employeeIds:['employee-coordination']});await p.pump();assert.deepEqual(p.goals()[0].members,['employee-coordination']);assert.equal(p.goals()[0].teamSelection,'manual');
 g=await p.action(g.id,{kind:'setTeam',expectedVersion:g.version,teamSelection:'auto'});g=await p.action(g.id,{kind:'inputs',expectedVersion:g.version,data:{candidates:skillSample('selection.score').candidates}});await p.action(g.id,{kind:'plan',expectedVersion:g.version});const members=[...g.members];const e2=p.workforce.view().employees.find(e=>e.id==='employee-selection');await p.workforce.saveEmployee(e2.id,{...e2,enabled:false});await p.pump();assert.deepEqual(p.goals()[0].members,members);assert.equal(p.goals()[0].runtime.status,'failed');
});
test('unknown work waits for clarification and can be refined without losing the goal or chat',async t=>{
 const {p}=await setup(t);let g=await p.create({...base,text:'帮我订机票'});assert(g.matching.missing.length);await assert.rejects(()=>p.action(g.id,{kind:'plan',expectedVersion:g.version}),/尚未匹配完整能力/);
 const id=g.id;g=await p.action(g.id,{kind:'setTeam',expectedVersion:g.version,teamSelection:'auto',text:'给商品写标题和卖点'});assert.equal(g.id,id);assert(g.members.includes('employee-copy-titles'));assert(g.members.includes('employee-copy-selling_points'));assert(g.messages.some(m=>m.text==='帮我订机票'));
});
