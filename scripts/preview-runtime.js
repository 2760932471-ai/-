// Included only in the single-file preview. Production keeps its HTTP API and disk storage.
const previewKey='muyaju-platform-preview-v02';
const previewMemory=new Map();
let previewPersistent=true;
try{localStorage.setItem(previewKey+'-probe','1');localStorage.removeItem(previewKey+'-probe');}catch{previewPersistent=false;}
const previewSession={getItem:k=>{try{return sessionStorage.getItem(k);}catch{return previewMemory.get('session:'+k)??null;}},setItem:(k,v)=>{try{sessionStorage.setItem(k,String(v));}catch{previewMemory.set('session:'+k,String(v));}},removeItem:k=>{try{sessionStorage.removeItem(k);}catch{previewMemory.delete('session:'+k);}}};
const previewStorageKey=file=>file==='/preview/platform.json'?previewKey:previewKey+':'+file;
const previewUUID=()=>globalThis.crypto?.randomUUID?.()||'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.floor(Math.random()*16);return(c==='x'?r:(r&3)|8).toString(16);});
const previewFS={
 async mkdir(){},
 async readFile(file){const value=previewPersistent?localStorage.getItem(previewStorageKey(file)):previewMemory.get(file);if(value==null)throw Object.assign(new Error('No preview data'),{code:'ENOENT'});return value;},
 async writeFile(file,value){previewMemory.set(file,value);if(previewPersistent&&!file.endsWith('.tmp'))localStorage.setItem(previewStorageKey(file),value);},
 async rename(from,to){const value=previewMemory.get(from);if(previewPersistent){try{localStorage.setItem(previewStorageKey(to),value);}catch{throw new Error('浏览器本地存储已满，未保存本次更改。请导出或清理预览数据后再试。');}}previewMemory.set(to,value);previewMemory.delete(from);}
};
const previewBar=document.querySelector('#preview-status');
previewBar.textContent=previewPersistent?'V0.16 · 免安装交互预览 · 数据仅保存在当前浏览器 · 未连接真实店铺和外部 Agent':'V0.16 · 免安装交互预览 · 浏览器禁止存储，本次数据刷新即清空 · 未连接真实店铺';
document.querySelector('#preview-reset').onclick=()=>{if(!confirm('清空当前工作空间的目标、消息和配置？其他工作空间和完整后端不受影响。'))return;if(previewPersistent){const id=previewSession.getItem('workspaceId')||'default';localStorage.removeItem(id==='default'?previewKey:previewStorageKey('/preview/workspaces/'+id+'/platform.json'));}location.reload();};
