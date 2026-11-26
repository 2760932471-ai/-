import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createPlatform} from '../src/platform.js';
import {defaultEmployees,designRole} from '../src/workforce/employees.js';

test('open job names survive clarification and a selected role family does not replace the title',()=>{
 for(const name of ['HRBP','海外 BD','数据标注','用户研究']){
  const draft=designRole({description:name});
  assert.equal(draft.employee.name,name);
  assert.equal(draft.employee.profile.position,name);
  assert.equal(draft.employee.profile.responsibilities,'');
  assert.equal(draft.question.key,'responsibilities');
  const updated=designRole({description:name,roleId:'research',answers:{responsibilities:'每周整理文档',audience:'项目组',deliverable:'资料摘要'}});
  assert.equal(updated.employee.name,name);
  assert.equal(updated.employee.roleId,'research');
  assert.equal(updated.question,null);
 }
 for(const description of ['帮我核对库存','每周汇总考勤','帮我核对今年的库存']){
  const {employee,question}=designRole({description});
  assert.notEqual(employee.name,description.replace(/^帮我/,''));
  assert.ok(employee.profile.responsibilities.includes(description));
  assert.notEqual(question?.key,'responsibilities');
 }
});

test('a job can be defined in stages; matched skills, exclusions and scope come from the brief',()=>{
 const description='我想做一个法务助理';
 const initial=designRole({description});
 assert.equal(initial.employee.name,'法务助理');
 assert.equal(initial.employee.roleId,'custom');
 assert.equal(initial.question.key,'responsibilities');
 assert.deepEqual(initial.employee.skillIds,[]);
 const completed=designRole({description,answers:{responsibilities:'每周给法务团队整理文档，不负责审批',deliverable:'合同材料周报'}});
 assert.equal(completed.question,null);
 assert.equal(completed.employee.name,'法务助理');
 assert.equal(completed.employee.profile.audience,'法务团队');
 assert.equal(completed.employee.profile.deliverable,'合同材料周报');
 assert.match(completed.employee.profile.boundaries,/不负责审批/);
 assert.deepEqual(completed.employee.skillIds,['document.outline']);
 const complete=designRole({description:'仓库管理员，为仓库组每周编制补货清单，不要写商品标题'});
 assert.equal(complete.question,null);
 assert.equal(complete.employee.roleId,'supply');
 assert.ok(complete.employee.skillIds.includes('inventory.replenish'));
 assert.ok(!complete.employee.skillIds.includes('copy.titles'));
 assert.throws(()=>designRole({description:'做个员工',roleId:'unknown'}),/岗位方向/);
 assert.throws(()=>designRole({description:' '.repeat(4)}),/描述/);
 const outreach=designRole({description:'通知大家开会，输出通知草稿'});
 assert.equal(outreach.question.key,'audience');
 assert.equal(designRole({description:'通知大家开会，输出通知草稿',answers:{audience:'研发组'}}).question,null);
 assert.equal(designRole({description:'为客户安排调解会议',roleId:'custom'}).question.key,'deliverable');
});

test('saved jobs keep their confirmed positioning and assignments across old client edits and restart',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'employee-profiles-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 await createPlatform(dir);
 const path=join(dir,'platform.json'),old=JSON.parse(await readFile(path,'utf8'));
 const legacy=old.employees.find(e=>e.id==='employee-service');
 legacy.instructions='引用店内已有退换货政策。';legacy.enabled=false;
 await writeFile(path,JSON.stringify(old));
 const p=await createPlatform(dir),d=p.workforce.view();
 assert.equal(d.roles.filter(r=>r.id!=='custom').length,12);
 assert.equal(d.roles.some(r=>r.id==='custom'),true);
 assert.equal(d.employees.length,defaultEmployees().length);
 const retained=d.employees.find(e=>e.id===legacy.id);
 assert.equal(retained.enabled,false);
 assert.equal(retained.instructions,legacy.instructions);
 const description='项目档案员，每周为项目组整理会议纪要，输出会议摘要，不负责对外发布';
 const draft=p.workforce.designRole({description}),role=draft.employee;
 assert.equal(draft.question,null);
 assert.equal(p.workforce.view().employees.length,d.employees.length);
 role.profile.persona='先列本次会议的结论。';
 role.profile.strategy='按议题和责任人整理。';
 const created=await p.workforce.saveEmployee(null,role);
 const updated=await p.workforce.saveEmployee(created.id,{...created,profile:{audience:'两个项目组'}});
 assert.equal(updated.profile.strategy,role.profile.strategy);
 assert.equal(updated.profile.audience,'两个项目组');
 await assert.rejects(()=>p.workforce.saveEmployee(created.id,{...created}),/已更新/);
 await assert.rejects(()=>p.workforce.saveEmployee(created.id,{...updated,profile:{channel:'invalid'}}),/平台策略/);
 await assert.rejects(()=>p.workforce.saveEmployee(created.id,{...updated,profile:{responsibilities:'字'.repeat(1601)}}),/1600/);
 const {profile,...oldForm}=updated;
 await p.workforce.saveEmployee(created.id,{...oldForm,name:'交付档案员'});
 const restarted=await createPlatform(dir),restored=restarted.workforce.view().employees;
 assert.equal(restored.length,d.employees.length+1);
 assert.deepEqual(restored.find(e=>e.id===created.id).profile,profile);
 const g=await restarted.create({requestId:'intro-profile-after-upgrade',text:'讨论项目归档',kind:'analysis',permission:'draft',employeeIds:[created.id]});
 await restarted.action(g.id,{kind:'message',intent:'discuss',text:'介绍一下自己',target:created.id});
 await restarted.pump();
 const intro=restarted.goals().find(item=>item.id===g.id).messages.at(-1);
 assert.equal(intro.employeeId,created.id);
 assert.ok(intro.text.includes(profile.audience));
 assert.ok(intro.text.includes(profile.boundaries));
});
