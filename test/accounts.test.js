import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,readFile} from 'node:fs/promises';import {accounts} from '../src/accounts.js';
test('fresh public deployment stays locked; credentials are hashed and rotation invalidates sessions',async t=>{
 const dir=await mkdtemp('/tmp/workspace-accounts-');t.after(()=>rm(dir,{recursive:true,force:true}));
 let auth=await accounts(dir,{});assert.equal(auth.ready(),false);await assert.rejects(auth.login({}),/尚未初始化/);auth.close();
 const input={username:'admin',password:'fixture-password-001'};
 auth=await accounts(dir,{WORKSPACE_ADMIN_PASSWORD:input.password});const cookie=(await auth.login(input)).split(';')[0];
 assert.equal(auth.accepts(cookie),true);
 const data=await readFile(dir+'/accounts.sqlite');assert.equal(data.includes(input.password),false);assert.equal(data.includes(cookie.split('=')[1]),false);auth.close();
 auth=await accounts(dir,{WORKSPACE_ADMIN_PASSWORD:'ignored-after-setup'});
 assert.equal(auth.accepts(cookie),true);auth.close();
 auth=await accounts(dir,{WORKSPACE_ADMIN_PASSWORD:'replacement-002'},{reset:true});assert.equal(auth.accepts(cookie),false);
 await assert.rejects(auth.login(input),/错误/);assert(auth.accepts((await auth.login({...input,password:'replacement-002'})).split(';')[0]));auth.close();
});
