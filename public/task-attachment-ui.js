import {attachmentLimits} from './task-attachment-limits.js';
import {taskAttachmentAccept} from './task-attachment-content.js';

function fileSize(bytes){
 if(bytes>=1024*1024)return (bytes/(1024*1024)).toFixed(1).replace(/\.0$/,'')+' MB';
 return bytes>=1024?Math.ceil(bytes/1024)+' KB':bytes+' B';
}

function fileBase64(file){
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>resolve(reader.result.slice(reader.result.indexOf(',')+1));
  reader.onerror=reader.onabort=()=>reject(new Error('无法读取「'+file.name+'」，请重新选择文件。'));
  reader.readAsDataURL(file);
 });
}

export function createTaskAttachmentUI({api,esc,icon,toast}){
 const extensions=new Set(taskAttachmentAccept.toLowerCase().split(',').map(value=>value.trim()));
 const supportedFormats=taskAttachmentAccept.split(',').map(ext=>ext.trim().slice(1).toUpperCase()).join('、');

 function picker(host){
  host.classList.add('attachment-picker');
  host.innerHTML=`<div class="attachment-picker-bar"><button type="button" class="attach-files-button" data-choose-task-files>${icon('paperclip')}添加附件</button><small>图片、文档、表格</small></div>
   <input type="file" data-task-files multiple hidden accept="${esc(taskAttachmentAccept)}" aria-label="选择任务附件">
   <ul class="task-file-list" aria-label="已选附件" hidden></ul>
   <p class="sr-only" data-selection-status role="status"></p><p class="attachment-picker-error" role="alert"></p>`;
  const choose=host.querySelector('[data-choose-task-files]'),input=host.querySelector('[data-task-files]');
  const list=host.querySelector('ul'),error=host.querySelector('[role=alert]'),status=host.querySelector('[role=status]');
  choose.title=`支持 ${supportedFormats}。最多 ${attachmentLimits.count} 个，每个 ${fileSize(attachmentLimits.fileBytes)} 以内，合计 ${fileSize(attachmentLimits.totalBytes)} 以内。`;
  const selected=[];
  let locked=false;

  function render(){
   list.innerHTML=selected.map(({file,thumbnail},index)=>{
    const mark=thumbnail?`<img src="${esc(thumbnail)}" alt="">`:icon('file');
    return `<li><span class="attachment-mark">${mark}</span><span class="attachment-file-info"><strong title="${esc(file.name)}">${esc(file.name)}</strong><small>${fileSize(file.size)}</small></span>
     <button type="button" class="remove-task-file" data-remove-task-file="${index}" aria-label="移除 ${esc(file.name)}">${icon('close')}</button></li>`;
   }).join('');
   list.hidden=!selected.length;
   status.textContent=selected.length?'已添加 '+selected.length+' 个附件':'';
  }
  function add(files){
   if(locked||!files.length)return;
   const issues=[];
   let total=selected.reduce((sum,item)=>sum+item.file.size,0);
   for(const file of files){
    const extension=file.name.match(/\.[^.]+$/)?.[0]?.toLowerCase();
    if(!extensions.has(extension))issues.push('「'+file.name+'」的格式暂不支持。支持 '+supportedFormats+'。');
    else if(!file.size)issues.push('「'+file.name+'」是空文件。');
    else if(file.size>attachmentLimits.fileBytes)issues.push('「'+file.name+'」超过单个文件 '+fileSize(attachmentLimits.fileBytes)+' 的限制。');
    else if(selected.some(item=>item.file.name===file.name&&item.file.size===file.size&&item.file.lastModified===file.lastModified))continue;
    else if(selected.length>=attachmentLimits.count){issues.push('每个任务最多添加 '+attachmentLimits.count+' 个附件。');break;}
    else if(total+file.size>attachmentLimits.totalBytes)issues.push('加入「'+file.name+'」后超过合计 '+fileSize(attachmentLimits.totalBytes)+' 的限制。');
    else{
     const thumbnail=/^\.(?:jpe?g|png|webp)$/.test(extension)?URL.createObjectURL(file):null;
     selected.push({file,thumbnail});
     total+=file.size;
    }
   }
   render();
   error.textContent=[...new Set(issues)].join(' ');
  }
  function reset(){
   for(const item of selected)if(item.thumbnail)URL.revokeObjectURL(item.thumbnail);
   selected.length=0;input.value='';error.textContent='';
   host.classList.remove('is-dragging');render();
  }
  choose.onclick=()=>input.click();
  input.onchange=()=>{add([...input.files]);input.value='';};
  list.onclick=event=>{
   const button=event.target.closest('[data-remove-task-file]');
   if(!button||locked)return;
   const index=Number(button.dataset.removeTaskFile),[removed]=selected.splice(index,1);
   if(removed.thumbnail)URL.revokeObjectURL(removed.thumbnail);
   error.textContent='';render();
   (list.querySelectorAll('button')[Math.min(index,selected.length-1)]||choose).focus();
   status.textContent='已移除 '+removed.file.name+'。剩余 '+selected.length+' 个附件。';
  };
  const dropArea=host.closest('form');
  dropArea.addEventListener('dragover',event=>{
   if(!event.dataTransfer.types.includes('Files'))return;
   event.preventDefault();event.dataTransfer.dropEffect=locked?'none':'copy';
   host.classList.toggle('is-dragging',!locked);
  });
  dropArea.addEventListener('dragleave',event=>{if(!dropArea.contains(event.relatedTarget))host.classList.remove('is-dragging');});
  dropArea.addEventListener('drop',event=>{
   if(!event.dataTransfer.types.includes('Files'))return;
   event.preventDefault();host.classList.remove('is-dragging');add([...event.dataTransfer.files]);
  });
  return {
   reset,
   setBusy(value){locked=value;choose.disabled=value;for(const button of list.querySelectorAll('button'))button.disabled=value;},
   async fields(){
    if(!selected.length)return {};
    const attachments=await Promise.all(selected.map(async({file})=>({name:file.name,base64:await fileBase64(file)})));
    return {attachments};
   },
   count(){return selected.length;}
  };
 }

 function materials(goal){
  if(!goal.attachments?.length)return '';
  const rows=goal.attachments.map(file=>{
   const extension=file.name.split('.').pop().toUpperCase();
   const details=[extension,fileSize(file.size),file.readNote].filter(Boolean).join(' · ');
   return `<li><span class="attachment-mark">${icon(file.mime?.startsWith('image/')?'photo':'file')}</span><span class="attachment-file-info">
    <strong>${esc(file.name)}</strong><small>${esc(details)}</small></span>
    <button type="button" class="attachment-download" data-download-task-file="${esc(file.id)}" data-attachment-goal="${esc(goal.id)}" aria-label="下载 ${esc(file.name)}">${icon('download')}<span>下载</span></button></li>`;
  }).join('');
  return `<section class="task-attachment-section" aria-label="任务附件"><h3>任务附件 <span>${goal.attachments.length}</span></h3><ul>${rows}</ul></section>`;
 }
 document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-download-task-file]');
  if(!button||button.disabled)return;
  button.disabled=true;
  try{
   const data=await api('goals/'+encodeURIComponent(button.dataset.attachmentGoal)+'/attachments/'+encodeURIComponent(button.dataset.downloadTaskFile));
   const binary=atob(data.base64),bytes=Uint8Array.from(binary,ch=>ch.charCodeAt(0));
   const url=URL.createObjectURL(new Blob([bytes],{type:data.mime}));
   const link=document.createElement('a');link.href=url;link.download=data.name;
   document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(problem){toast(problem.message||'附件下载失败，请重试。');}
  finally{button.disabled=false;}
 });
 return {picker,materials};
}
