// Task uploads belong to this task only. The planner receives an inventory,
// while the document/table and image skills read the material they actually use.
export function attachmentInventory(files=[]){
 return files.map(({name,kind,readStatus,readNote})=>({name,kind,readStatus,readNote}));
}
export function attachmentEvidence(files=[]){
 return files.map(file=>{
  let content='';
  if(file.kind==='document')content=(file.text||'').slice(0,1400);
  if(file.kind==='table')content=(file.sheets||[]).slice(0,10)
   .map(sheet=>(sheet.name?sheet.name+' · ':'')+(sheet.csv||'').split(/\r?\n/,1)[0].slice(0,400)).join('\n');
  if(file.kind==='image')content='本任务已附图片。';
  return {title:file.name,text:[content,file.readNote].filter(Boolean).join('\n')||'已保存原文件，暂无可读正文。',source:'任务附件 · '+file.name};
 });
}
export function withAttachmentMaterial(id,input,files=[]){
 // Explicitly supplied replacement material in a follow-up takes precedence.
 const table=id==='table.profile';
 if(!table&&id!=='document.outline')return input;
 const key=table?'table':'document';
 if(input[key])return input;
 const candidates=files.filter(f=>f.kind===(table?'table':'document'));
 const named=candidates.filter(file=>String(input.goal||'').includes(file.name));
 const selected=named.length?named:candidates;
 if(!selected.length)return input;
 const parts=selected.flatMap(file=>{
  const source=file.name.slice(0,160),note=file.readNote||(file.readStatus==='partial'?'仅处理此次提取到的内容。':'');
  if(table&&file.sheets?.length)return file.sheets.map(sheet=>({csv:sheet.csv,
   source:([...new Set([source,sheet.name].filter(Boolean))].join(' · ')).slice(0,160),note}));
  return [{[table?'csv':'text']:file.text||'',source,note}];
 });
 return {...input,[key]:parts.length===1?parts[0]:{files:parts}};
}
export function taskImageReference(files=[],request='',sku=''){
 const images=files.filter(f=>f.kind==='image');
 if(!images.length)return {};
 const named=images.filter(f=>request.includes(f.name));
 // At selection time the exact product might not have been known when the
 // files were uploaded. Only a file tied to the selected SKU may represent it.
 const eligible=sku?images.filter(f=>f.name.includes(sku)):images;
 const candidates=named.length?eligible.filter(f=>named.includes(f)):eligible;
 if(!candidates.length)return {};
 if(candidates.length>1)return {issue:'本任务有多张候选参考图，请说明这张图片要使用的附件全名：'+candidates.map(f=>f.name).join('、')+'。'};
 const file=candidates[0];
 if(!['image/png','image/jpeg','image/webp'].includes(file.mime)||file.size>5*1024*1024)
  return {issue:'已保存「'+file.name+'」。当前生图服务需要 5 MB 以内的 PNG、JPEG 或 WebP 参考图，请提供相应图片。'};
 return {file};
}
