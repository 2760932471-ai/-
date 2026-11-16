import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {mkdtemp, mkdir, copyFile, writeFile, rm} from 'node:fs/promises';
import {once} from 'node:events';
import {accessPolicy} from '../src/access-policy.js';

test('private Codespaces ignores legacy tokens; local binds loopback; public token access stays protected', () => {
  const codespaces = accessPolicy({CODESPACES:'true', PLATFORM_TOKEN:'legacy-token'});
  assert.equal(codespaces.mode, 'codespaces');
  assert.equal(codespaces.authenticationRequired, false);
  assert(codespaces.accepts());
  assert(codespaces.accepts('Bearer wrong-old-browser-token'));
  assert.equal(accessPolicy({}).host, '127.0.0.1');
  const publicAccess = accessPolicy({PLATFORM_TOKEN:'public-token'});
  assert.equal(publicAccess.host, '0.0.0.0');
  assert(!publicAccess.accepts());
  assert(!publicAccess.accepts('Bearer wrong'));
  assert(publicAccess.accepts('Bearer public-token'));
  assert.equal(accessPolicy({CODESPACES:'true', ENABLE_CODEX_LOCAL:'1'}).host, '127.0.0.1');
});

test('Codespaces API works without app login even with mismatched inherited and browser tokens', async t => {
  const dir = await mkdtemp('/tmp/codespaces-access-');
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: new URL('../', import.meta.url),
    env: {...process.env, DATA_DIR:dir, PORT:'0', CODESPACES:'true', PLATFORM_TOKEN:'stale-server-token', ENABLE_CODEX_LOCAL:'0'},
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
