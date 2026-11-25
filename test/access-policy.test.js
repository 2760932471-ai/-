import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {mkdtemp, mkdir, copyFile, writeFile, rm} from 'node:fs/promises';
import {once} from 'node:events';
import {accessPolicy} from '../src/access-policy.js';

test('legacy secrets cannot enable the old login; public hosting uses accounts',()=>{
 for(const env of [{},{PLATFORM_TOKEN:'unused'}]){
  assert.equal(accessPolicy(env).authenticationRequired,false);
  assert.equal(accessPolicy(env).host,'127.0.0.1');
 }
 assert.equal(accessPolicy({CODESPACES:'true',NODE_ENV:'production',PLATFORM_TOKEN:'unused'}).mode,'codespaces');
 assert.equal(accessPolicy({RENDER:'true'}).mode,'account');
 assert.equal(accessPolicy({NODE_ENV:'production'}).mode,'account');
 assert.equal(accessPolicy({WORKSPACE_ACCESS:'account'}).mode,'account');
 assert.equal(accessPolicy({CODESPACES:'true',ENABLE_CODEX_LOCAL:'1'}).host,'0.0.0.0');
});

test('Codespaces API works without app login even with mismatched inherited and browser tokens', async t => {
  const dir = await mkdtemp('/tmp/codespaces-access-');
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: new URL('../', import.meta.url),
    env: {...process.env, DATA_DIR:dir, PORT:'0', CODESPACES:'true', PLATFORM_TOKEN:'stale-server-token', ENABLE_CODEX_LOCAL:'1'},
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    if (child.exitCode === null) { child.kill(); await once(child, 'exit'); }
    await rm(dir, {recursive:true, force:true});
  });
  const [output] = await Promise.race([
    once(child.stdout, 'data'),
    once(child, 'exit').then(() => {throw new Error('Server exited before startup');}),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Startup timed out')), 8000).unref()),
  ]);
  const port = String(output).match(/port (\d+)/)[1];
  const base = `http://127.0.0.1:${port}/api/`;
  const health = await fetch(base+'health').then(r => r.json());
  assert.equal(health.accessMode, 'codespaces');
  assert.equal(health.authenticationRequired, false);
  for (const headers of [{}, {Authorization:'Bearer wrong-browser-token'}]) {
    assert.equal((await fetch(base+'workspaces', {headers})).status, 200);
    assert.equal((await fetch(base+'images', {headers})).status, 200);
  }
  const response = await fetch(base+'workspaces', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name:'无需 Token 的工作空间'})});
  assert.equal(response.status, 201);
  assert.equal((await fetch(base+'workspaces', {method:'POST', headers:{Origin:'https://other.example.com'}, body:'{}'})).status, 403);
});

test('project env file loads with normal node entry, tolerates missing file, and preserves host overrides', async t => {
  const dir = await mkdtemp('/tmp/platform-env-');
  t.after(() => rm(dir, {recursive:true, force:true}));
  await mkdir(dir+'/src');
  await copyFile(new URL('../src/environment.js', import.meta.url), dir+'/src/environment.mjs');
  const args = ['--input-type=module', '-e', `import ${JSON.stringify(dir+'/src/environment.mjs')}; console.log(process.env.PLATFORM_ENV_TEST || 'missing')`];
  const env = {...process.env}; delete env.PLATFORM_ENV_TEST;
  assert.equal(execFileSync(process.execPath, args, {env, encoding:'utf8'}).trim(), 'missing');
  await writeFile(dir+'/.env', 'PLATFORM_ENV_TEST=file-value\n');
  assert.equal(execFileSync(process.execPath, args, {env, encoding:'utf8'}).trim(), 'file-value');
  assert.equal(execFileSync(process.execPath, args, {env:{...env, PLATFORM_ENV_TEST:'host-value'}, encoding:'utf8'}).trim(), 'host-value');
});
