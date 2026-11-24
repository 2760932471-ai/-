import {DatabaseSync} from 'node:sqlite';
import {openSync,closeSync} from 'node:fs';
import {createHash,randomBytes,scrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import path from 'node:path';

const derive=promisify(scrypt), cookie='__Host-workspace_session',ttl=12*60*60*1000;
const hash=(password,salt)=>derive(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
const digest=s=>createHash('sha256').update(s).digest('hex');
const fail=(message,status)=>{throw Object.assign(new Error(message),{status});};
function cookieId(header=''){
 const value=header.split(';').map(v=>v.trim()).find(v=>v.startsWith(cookie+'='))?.slice(cookie.length+1);
 return value&&/^[0-9a-f]{64}$/.test(value)?digest(value):'';
}
export async function accounts(dir,env=process.env,{reset=false}={}){
 const file=path.join(dir,'accounts.sqlite');closeSync(openSync(file,'a',0o600));
 const db=new DatabaseSync(file);
 db.exec(`CREATE TABLE IF NOT EXISTS admin (id INTEGER PRIMARY KEY CHECK(id=1),name TEXT NOT NULL,salt TEXT NOT NULL,verifier TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY,expires INTEGER NOT NULL);`);
 const get=()=>db.prepare('SELECT * FROM admin WHERE id=1').get();
 if(reset||(!get()&&env.WORKSPACE_ADMIN_PASSWORD)){
  const name=(env.WORKSPACE_ADMIN_USER||'admin').trim(),password=env.WORKSPACE_ADMIN_PASSWORD;
  if(!name||name.length>100||typeof password!=='string'||password.length<12||password.length>512)fail('请设置有效的管理员账号和 12–512 字符的初始密码',400);
  const salt=randomBytes(16).toString('hex'),verifier=(await hash(password,salt)).toString('hex');
  db.exec('BEGIN IMMEDIATE');
  try{if(reset||!get()){db.prepare('INSERT OR REPLACE INTO admin VALUES(1,?,?,?)').run(name,salt,verifier);db.exec('DELETE FROM sessions');}db.exec('COMMIT');}
  catch(e){db.exec('ROLLBACK');throw e;}
 }
 // This installation has one administrator, so the bound applies across all supplied usernames.
 let failures=[],active=0;
 const cookieHeader=(value,seconds)=>cookie+'='+value+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='+seconds;
 return {
  ready:()=>!!get(),
  accepts:header=>!!db.prepare('SELECT 1 FROM sessions WHERE id=? AND expires>?').get(cookieId(header),Date.now()),
  async login(input){
   const user=get();if(!user)fail('管理员尚未初始化，请在部署环境设置初始账号密码后重启服务',503);
   failures=failures.filter(t=>t>Date.now()-60000);
   if(failures.length>=10||active>=3)fail('尝试次数过多，请稍后再试',429);
   if(typeof input?.username!=='string'||typeof input?.password!=='string'||input.password.length>512)fail('账号或密码错误',401);
   active++;
   try{
    const computed=await hash(input.password,user.salt);
    if(!timingSafeEqual(computed,Buffer.from(user.verifier,'hex'))||input.username.trim()!==user.name||get()?.salt!==user.salt){failures.push(Date.now());fail('账号或密码错误',401);}
    failures=[];const id=randomBytes(32).toString('hex');
    db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());
    if(!db.prepare('INSERT INTO sessions SELECT ?,? FROM admin WHERE id=1 AND salt=?').run(digest(id),Date.now()+ttl,user.salt).changes)fail('登录信息已更新，请重新登录',401);
    return cookieHeader(id,ttl/1000);
   }finally{active--;}
  },
  logout(header){db.prepare('DELETE FROM sessions WHERE id=?').run(cookieId(header));return cookieHeader('',0);},
  close:()=>db.close()
 };
}
