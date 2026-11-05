import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {mkdtemp,rm} from 'node:fs/promises';import {once} from 'node:events';import net from 'node:net';import os from 'node:os';import path from 'node:path';import {testSample} from '../src/agents/builtins.js';
test('HTTP platform protects configured access, runs agents and restores saved configuration after restart',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'platform-http-'));const socket=net.createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(r=>socket.close(r));let child;
 const start=async()=>{child=spawn(process.execPath,['src/server.js'],{cwd:new URL('../',import.meta.url),env:{...process.env,DATA_DIR:dir,PORT:String(port),PLATFORM_TOKEN:'integration-test-token'},stdio:['ignore','pipe','pipe']});await Promise.race([once(child.stdout,'data'),new Promise((_,reject)=>setTimeout(()=>reject(new Error('服务未启动')),8000).unref())]);};
 const stop=async()=>{if(child&&child.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}};
 t.after(async()=>{await stop();await rm(dir,{recursive:true,force:true});});await start();
 const base=`http://127.0.0.1:${port}/api/`,headers={'Authorization':'Bearer integration-test-token','Content-Type':'application/json'};
 assert.equal((await fetch(base+'goals')).status,401);
 assert.equal((await fetch(base+'health').then(r=>r.json())).authenticationRequired,true);
 assert.equal((await fetch(base+'goals',{method:'POST',headers:{...headers,Origin:'https://untrusted.example.com'},body:'{}'})).status,403);
 let agents=await fetch(base+'agents',{headers}).then(r=>r.json());let config=agents.find(a=>a.id==='insight');
 const saved=await fetch(base+'agents/insight',{method:'PUT',headers,body:JSON.stringify({...config,settings:{targetProfitRate:33}})});assert.equal(saved.status,200);config=await saved.json();
 const preview=await fetch(base+'goal-preview',{method:'POST',headers,body:JSON.stringify({text:'分析角阀利润'})}).then(r=>r.json());assert.equal(preview.kind,'analysis');
 const launch=await fetch(base+'agents/insight/test',{method:'POST',headers,body:JSON.stringify({input:testSample('insight')})});assert.equal(launch.status,202);const {id}=await launch.json();let run;
 for(let i=0;i<50;i++){run=await fetch(base+'runs/'+id,{headers}).then(r=>r.json());if(!['queued','running'].includes(run.status))break;await new Promise(r=>setTimeout(r,100));}
 assert.equal(run.status,'succeeded');assert.equal(run.result.metrics.profit,600);assert.equal(run.result.metrics.outcome,'未达标');assert.equal('config' in run,false);
 await stop();await start();agents=await fetch(base+'agents',{headers}).then(r=>r.json());assert.equal(agents.find(a=>a.id==='insight').settings.targetProfitRate,33);assert.equal((await fetch(base+'runs/'+id,{headers}).then(r=>r.json())).status,'succeeded');
});
