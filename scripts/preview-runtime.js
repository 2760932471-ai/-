// Included only in the single-file preview. Production keeps its HTTP API and disk storage.
const previewKey='muyaju-platform-preview-v02';
const previewMemory=new Map();
let previewPersistent=true;
try{localStorage.setItem(previewKey+'-probe','1');localStorage.removeItem(previewKey+'-probe');}catch{previewPersistent=false;}
const previewSession={getItem:k=>previewMemory.get('session:'+k)??null,setItem:(k,v)=>previewMemory.set('session:'+k,String(v)),removeItem:k=>previewMemory.delete('session:'+k)};
const previewUUID=()=>globalThis.crypto?.randomUUID?.()||'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.floor(Math.random()*16);return(c==='x'?r:(r&3)|8).toString(16);});
const previewFS={
 async mkdir(){},
 async readFile(file){const value=file.endsWith('/platform.json')?(previewPersistent?localStorage.getItem(previewKey):previewMemory.get(file)):previewMemory.get(file);if(value==null)throw Object.assign(new Error('No preview data'),{code:'ENOENT'});return value;},
 async writeFile(file,value){previewMemory.set(file,value);},
 async rename(from,to){const value=previewMemory.get(from);if(previewPersistent&&to.endsWith('/platform.json')){try{localStorage.setItem(previewKey,value);}catch{throw new Error('浏览器本地存储已满，未保存本次更改。请导出或清理预览数据后再试。');}}previewMemory.set(to,value);previewMemory.delete(from);}
};
const previewBar=document.querySelector('#preview-status');
previewBar.textContent=previewPersistent?'免安装交互预览 · 数据仅保存在当前浏览器 · 未连接真实店铺和外部 Agent':'免安装交互预览 · 浏览器禁止存储，本次数据刷新即清空 · 未连接真实店铺';
document.querySelector('#preview-reset').onclick=()=>{if(!confirm('清空这个预览中的目标、消息和配置，并恢复演示样例？完整后端数据不受影响。'))return;if(previewPersistent)localStorage.removeItem(previewKey);location.reload();};
