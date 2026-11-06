import {randomUUID} from 'node:crypto';
import {pullSource} from './sources-transport.js';

const stamp=()=>new Date().toISOString();
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const text=(v,label,max,required=true)=>{if(typeof v!=='string'||v.length>max||(required&&!v.trim()))fail(label+'格式无效');return v.trim();};
export function sourceURL(value,required=false){
 if(!value&&!required)return '';
 if(typeof value!=='string'||value.length>2048)fail('链接长度不能超过 2048 字符');
 let u;try{u=new URL(value);}catch{fail('请输入完整 HTTPS 链接');}
 if(u.protocol!=='https:'||u.username||u.password||u.hash||u.hostname==='localhost'||!u.hostname.includes('.')||/^[\d.]+$/.test(u.hostname)||u.hostname.includes(':'))fail('链接需为 HTTPS 域名，不能包含登录凭证或片段');
 return u.href;
}
export function initialSources(){return [
 {id:'source-knowledge',name:'企业知识与内容库',kind:'knowledge',mode:'manual'},
 {id:'source-supplier',name:'供应商商品来源',kind:'supplier',mode:'manual'}
].map(s=>({...s,enabled:true,revision:1,endpoint:'',secretEnv:'',updatedAt:stamp()}));}
export function validateSource(input,old){
 if(old&&input.revision!==old.revision)fail('来源配置已更新，请重新打开',409);
 const name=text(input.name,'来源名称',80),kind=input.kind,mode=input.mode;
 if(!['knowledge','supplier'].includes(kind)||!['manual','http'].includes(mode)||typeof input.enabled!=='boolean')fail('来源类型或接入方式无效');
 if(old&&kind!==old.kind)fail('已有来源不能变更类型，请新建来源');
 const endpoint=mode==='http'?sourceURL(input.endpoint,true):'';
 if(endpoint&&new URL(endpoint).search)fail('接口地址不能带查询参数，凭据请放在服务器环境变量');
 const secretEnv=mode==='http'?text(input.secretEnv||'','密钥变量名',80,false):'';
 if(secretEnv&&!/^SOURCE_SECRET_[A-Z0-9_]{1,60}$/.test(secretEnv))fail('请输入 SOURCE_SECRET_ 开头的环境变量名，不要填写密钥值');
 return {id:old?.id||randomUUID(),name,kind,mode,enabled:input.enabled,endpoint,secretEnv,revision:(old?.revision||0)+1,updatedAt:stamp(),lastSync:old?.lastSync||null};
}
export function validateMaterial(input,source){
 const title=text(input.title,'资料标题',160),sku=text(input.sku||'','SKU',120,false),body=text(input.body||'','资料正文',6000,false);
 const type=input.type;if(!['document','image'].includes(type))fail('资料类型无效');
 const url=sourceURL(input.url,source.kind==='supplier'),imageUrl=type==='image'?sourceURL(input.imageUrl,true):'';
 if(type==='document'&&!body)fail('知识资料需要正文；仅有链接无法供员工检索');
 if(type==='image'&&!sku)fail('商品图片必须填写对应 SKU');
 if(!['reference','authorized','unknown'].includes(input.rights))fail('请选择使用范围');
 const rightsNote=text(input.rightsNote||'','授权或参考依据',500,false);
 if(input.rights==='authorized'&&!rightsNote)fail('授权使用需要填写依据');
 let expiresAt='';if(input.expiresAt){if(!/^\d{4}-\d{2}-\d{2}$/.test(input.expiresAt)||(!Number.isFinite(Date.parse(input.expiresAt))||new Date(input.expiresAt).toISOString().slice(0,10)!==input.expiresAt))fail('有效期格式无效');expiresAt=input.expiresAt;}
 return {title,sku,body,type,url,imageUrl,rights:input.rights,rightsNote,expiresAt};
}
export function materialProblem(item,source,sku){
 if(!source?.enabled)return '来源已停用';
 if(item.status!=='approved')return '资料尚未通过审核';
 if(item.expiresAt&&Date.parse(item.expiresAt+'T23:59:59+08:00')<Date.now())return '资料已过期';
 if(item.rights==='unknown')return '使用范围尚未确认';
 if(item.type==='image'&&item.rights!=='authorized')return '图片需要使用授权';
 if(sku!==undefined&&item.sku&&item.sku!==sku)return 'SKU 不匹配';
 return '';
}
export function createSourceManager({getData,transaction,transport=pullSource}){
 const find=(list,id,label)=>list.find(x=>x.id===id)||fail(label+'不存在',404);
 const publicSource=s=>({...s,credentialConfigured:!!(s.secretEnv&&process.env[s.secretEnv])});
 function view(){const d=getData();return structuredClone({sources:d.sources.map(publicSource),materials:d.materials.map(m=>({...m,problem:materialProblem(m,d.sources.find(s=>s.id===m.sourceId))}))});}
 function select(d,g,refs){
  if(!Array.isArray(refs)||refs.length>8||new Set(refs.map(r=>r.id)).size!==refs.length)fail('每个目标最多选用 8 项不同资料');
  return refs.map(ref=>{
   const m=find(d.materials,ref.id,'资料'),s=find(d.sources,m.sourceId,'来源');
   if(ref.revision!==m.revision)fail('资料版本已改变，请重新选用：'+m.title,409);
   const problem=materialProblem(m,s,g.scope.sku);if(problem)fail(m.title+'：'+problem);
   return {...structuredClone(m),sourceName:s.name,sourceKind:s.kind};
  });
 }
 function resolve(g,d=getData()){return select(d,g,(g.references||[]).map(m=>({id:m.id,revision:m.revision})));}
 const saveSource=(id,input)=>transaction(d=>{const old=id?find(d.sources,id,'来源'):null;if(old?.syncing)fail('来源正在同步，请稍后修改',409);const s=validateSource(input,old);if(old)d.sources[d.sources.indexOf(old)]=s;else d.sources.push(s);return publicSource(s);});
 const saveMaterial=(id,input)=>transaction(d=>{
  const old=id?find(d.materials,id,'资料'):null;if(old&&input.revision!==old.revision)fail('资料版本已更新，请重新打开',409);
  const source=find(d.sources,old?.sourceId||input.sourceId,'来源');if(!source.enabled)fail('来源已停用');
  if(old?.externalId)fail('同步资料请在原系统修改，再重新同步');
  const m={...validateMaterial(input,source),id:old?.id||randomUUID(),sourceId:source.id,revision:(old?.revision||0)+1,status:'pending',updatedAt:stamp()};
  if(old)d.materials[d.materials.indexOf(old)]=m;else d.materials.unshift(m);return m;
 });
 const review=(id,input)=>transaction(d=>{
  const m=find(d.materials,id,'资料');if(input.revision!==m.revision)fail('资料版本已更新，请重新核对',409);
  if(!['approved','rejected'].includes(input.status))fail('审核状态无效');
  const note=text(input.note||'','审核说明',500);
  if(input.status==='approved'){
   if(input.confirmed!==true)fail('请确认已核对内容、SKU 与使用范围');
   const problem=materialProblem({...m,status:'approved'},d.sources.find(s=>s.id===m.sourceId));if(problem)fail(problem);
  }
  m.status=input.status;m.revision++;m.review={note,at:stamp(),by:'工作空间用户'};m.updatedAt=stamp();return m;
 });
 async function sync(id){
  const source=await transaction(d=>{const s=find(d.sources,id,'来源');if(!s.enabled||s.mode!=='http')fail('请启用 HTTP 来源并配置授权接口');if(s.syncing)fail('该来源正在同步，请勿重复提交',409);s.syncing=true;return s;});
  try{
   const payload=await transport(source);
   if(!payload||payload.schemaVersion!==1||!Array.isArray(payload.items)||payload.items.length>50)fail('接口需返回 schemaVersion:1 和最多 50 项 items');
   const records=payload.items.map(item=>({externalId:text(item.externalId,'外部编号',120),...validateMaterial(item,source)}));
   if(new Set(records.map(r=>r.externalId)).size!==records.length)fail('返回资料的外部编号重复');
   return await transaction(d=>{
    const s=find(d.sources,id,'来源');if(s.revision!==source.revision)fail('同步期间配置已改变，请重试',409);
    let added=0,updated=0;
    for(const r of records){const old=d.materials.find(m=>m.sourceId===id&&m.externalId===r.externalId);
     if(old&&Object.keys(r).every(k=>old[k]===r[k]))continue;
     const m={...r,id:old?.id||randomUUID(),sourceId:id,revision:(old?.revision||0)+1,status:'pending',updatedAt:stamp()};
     if(old){d.materials[d.materials.indexOf(old)]=m;updated++;}else{d.materials.unshift(m);added++;}
    }
    s.syncing=false;s.lastSync={status:'succeeded',at:stamp(),revision:s.revision,received:records.length,added,updated};return s.lastSync;
   });
  }catch(e){const message=e.sourceSafe||e.status?e.message:'来源同步失败，请检查接口、授权、域名白名单与返回格式';await transaction(d=>{const s=find(d.sources,id,'来源');s.syncing=false;s.lastSync={status:'failed',at:stamp(),revision:source.revision,error:message};});throw Object.assign(new Error(message),{status:400});}
 }
 return {view,saveSource,saveMaterial,review,sync,resolve,select};
}
