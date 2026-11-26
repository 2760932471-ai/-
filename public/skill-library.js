import {createOfficeExport} from './office-export.js';

// Inputs for the built-in skills available directly from the Skill page.
const quickSkills=[
 {id:'web.search',category:'网络',description:'搜索公开网页，查看结果摘要与来源。',fields:[
  {key:'query',label:'搜索内容',max:600}]},
 {id:'web.read',category:'网络',description:'读取公开网页的标题和正文，保留来源链接。',fields:[
  {key:'url',label:'网页地址',type:'url',max:3000,hint:'输入公开网页的 HTTPS 地址。'}]},
 {id:'table.profile',category:'数据',description:'检查 CSV 的行列、缺失值和数值分布。',group:'table',file:{key:'csv',accept:'.csv',label:'导入 CSV 文件'},fields:[
  {key:'csv',label:'CSV 表格',type:'area',hint:'首行是列名，列之间用英文逗号分隔。',max:60000},
  {key:'source',label:'数据来源（选填）',optional:true,max:160}]},
 {id:'document.outline',category:'文档',description:'从原文中提取标题和要点，保留对应位置。',group:'document',file:{key:'text',accept:'.txt,.md,.markdown',label:'导入文本或 Markdown 文件'},fields:[
  {key:'text',label:'文档正文',type:'area',hint:'支持纯文本和 Markdown。',max:60000},
  {key:'source',label:'文档来源（选填）',optional:true,max:160}]},
 {id:'service.triage',category:'客服',description:'根据客户原话整理问题类别、所需凭证和答复草稿。',fields:[
  {key:'serviceQuestion',label:'客户原话',type:'area',max:4000}]},
 {id:'price.break_even',category:'经营',description:'用单件成本和平台费率测算保本售价。',group:'unitCosts',fields:[
  {key:'goods',label:'商品成本（元）',type:'number'},{key:'fulfillment',label:'履约成本（元）',type:'number'},
  {key:'ads',label:'推广成本（元）',type:'number'},{key:'returns',label:'售后成本（元）',type:'number'},
  {key:'other',label:'其他成本（元）',type:'number'},{key:'feeRate',label:'平台费率（%）',type:'number',max:99.9999},
  {key:'source',label:'成本数据来源',max:160}]},
 {id:'inventory.coverage',category:'库存',description:'根据库存、日销量与到货时间判断缺货风险。',group:'inventory',fields:[
  {key:'stock',label:'当前库存（件）',type:'number'},{key:'dailySales',label:'日均销量（件）',type:'number'},
  {key:'leadDays',label:'供货周期（天）',type:'number'},{key:'safetyDays',label:'安全库存天数',type:'number'},
  {key:'source',label:'库存数据来源',max:160}]}
];

function webSourceUrl(raw){
 try{
  const u=new URL(raw);
  return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;
 }catch{return null;}
}

export function createSkillLibrary({state,api,esc}){
 const definitions=()=>state.workforce?.skills||[];
 function page(){
  const cards=quickSkills.map(config=>{
   const skill=definitions().find(item=>item.id===config.id);
   if(!skill)return '';
   return `<article class="quick-skill"><div class="quick-skill-heading"><h3>${esc(skill.name)}</h3><span>${config.category}</span></div><p>${config.description}</p><div class="quick-skill-controls"><button type="button" class="secondary" data-launch-skill="${config.id}" aria-label="使用${esc(skill.name)}">使用技能</button><button type="button" class="text-button" data-skill-test="${config.id}" aria-label="测试${esc(skill.name)}">配置测试</button></div></article>`;
  }).join('');
  return `<section class="skill-library" aria-labelledby="quick-skills-title"><div class="section-title"><div><h2 id="quick-skills-title">常用内置技能</h2><p class="field-hint">可以直接运行，也可以在任务中由总控调用。</p></div></div><div class="quick-skills-grid">${cards}</div></section>`;
 }
 function fieldHtml(field){
  const required=field.optional?'':'required';
  let control;
  if(field.type==='area')control=`<textarea name="${field.key}" rows="7" maxlength="${field.max}" ${required}></textarea>`;
  else if(field.type==='number')control=`<input name="${field.key}" type="number" min="0" ${field.max?'max="'+field.max+'"':''} step="any" required>`;
  else control=`<input name="${field.key}" type="${field.type||'text'}" maxlength="${field.max}" ${required}>`;
  return `<label class="${field.type==='number'?'':'wide'}">${field.label}${control}${field.hint?'<small>'+field.hint+'</small>':''}</label>`;
 }
 function open(config,definition){
  const dialog=document.createElement('dialog');
  dialog.className='quick-skill-dialog';dialog.setAttribute('aria-labelledby','quick-skill-title');
  dialog.innerHTML=`<div class="dialog-head"><h2 id="quick-skill-title">${esc(definition.name)}</h2><button type="button" class="icon-btn" data-dismiss aria-label="关闭技能">×</button></div>
   <form><fieldset><legend class="sr-only">运行资料</legend>${config.file?'<label class="quick-skill-file">'+config.file.label+'<input type="file" accept="'+config.file.accept+'"></label>':''}<div class="quick-skill-fields">${config.fields.map(fieldHtml).join('')}</div></fieldset>
   <p class="form-error" role="alert"></p><div class="quick-skill-actions"><button type="button" class="text-button" data-fill>填入示例</button><button type="submit" class="primary">运行技能</button></div></form>
   <p class="quick-skill-status" role="status"></p><section class="quick-skill-result" aria-label="运行结果" hidden></section>`;
  const form=dialog.querySelector('form'),fieldset=form.querySelector('fieldset'),submit=form.querySelector('[type=submit]'),sample=form.querySelector('[data-fill]');
  const error=form.querySelector('[role=alert]'),status=dialog.querySelector('[role=status]'),output=dialog.querySelector('.quick-skill-result');
  function clearOutput(){output.hidden=true;output.replaceChildren();status.textContent='';error.textContent='';}
  form.oninput=clearOutput;
  const filePicker=form.querySelector('input[type=file]');
  let loadedSource='';
  if(filePicker)filePicker.onchange=async()=>{
   const file=filePicker.files[0];if(!file)return;
   submit.disabled=true;sample.disabled=true;fieldset.disabled=true;
   try{
    const field=config.fields.find(f=>f.key===config.file.key);
    if(file.size>4*field.max)throw new Error('文件过大，最多支持 '+field.max.toLocaleString()+' 个字符。');
    let contents;
    try{contents=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());}
    catch{throw new Error('无法读取文字，请将文件另存为 UTF-8 编码后重试。');}
    if(!contents.trim()||contents.length>field.max)throw new Error('文件内容应为 1 到 '+field.max.toLocaleString()+' 个字符。');
    form.elements[field.key].value=contents;
    const source=form.elements.source;
    if(source&&(!source.value||source.value===loadedSource))source.value=loadedSource=file.name.slice(0,160);
    clearOutput();status.textContent='文件已读入，可以查看或编辑后运行。';
   }catch(issue){error.textContent=issue.message;}
   finally{filePicker.value='';submit.disabled=false;sample.disabled=false;fieldset.disabled=false;}
  };
  sample.onclick=()=>{
   const values=config.group?definition.sample?.[config.group]:definition.sample;
   if(!values)return;
   for(const field of config.fields)form.elements[field.key].value=values[field.key]??'';
   loadedSource='';clearOutput();status.textContent='已填入示例，可修改后运行。';
  };
  function showResult(run){
   const result=run.result;
   if(run.status!=='succeeded'){
    const reasons=[...new Set([result?.summary,...(result?.missing||[])].filter(Boolean))];
    error.textContent=run.error||reasons.join(' · ')||'这次运行未完成，请检查输入资料。';
    status.textContent='';return;
   }
   const files=result?.artifacts||[];
   const report=files.length?files.map(file=>['## '+file.title,file.body,file.evidence&&'依据：'+file.evidence].filter(Boolean).join('\n\n')).join('\n\n'):result?.summary||'';
   const officeLabel=config.id==='document.outline'?'Word':config.id==='table.profile'?'Excel':'';
   const networkSkill=config.id==='web.search'||config.id==='web.read';
   const sourceList=networkSkill?(result.metrics?.sources||[]).map(item=>{
    const url=webSourceUrl(item.url);if(!url)return '';
    const snippet=config.id==='web.search'&&item.snippet?'<p>'+esc(item.snippet)+'</p>':'';
    return `<li><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(item.title||url)}</a><small>${esc(new URL(url).host)}</small>${snippet}</li>`;
   }).join(''):'';
   const sourceBlock=sourceList?'<ul class="web-skill-sources">'+sourceList+'</ul>':'';
   output.innerHTML=`<header><h3>运行结果</h3><div>${officeLabel?'<button type="button" class="text-button" data-office>下载 '+officeLabel+'</button>':''}<button type="button" class="text-button" data-save>下载 Markdown</button></div></header>`+
    (config.id==='web.search'&&sourceBlock?sourceBlock:files.map(file=>
     `<article><h4>${esc(file.title)}</h4><div>${esc(file.body)}</div>${file.evidence&&!sourceBlock?'<small>依据：'+esc(file.evidence)+'</small>':''}</article>`).join('')+sourceBlock);
   if(!files.length){const summary=document.createElement('p');summary.textContent=report;output.append(summary);}
   function download(blob,filename){
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');link.href=url;link.download=filename;link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
   }
   output.querySelector('[data-save]').onclick=()=>download(new Blob(['# '+definition.name+'\n\n'+report+'\n'],{type:'text/markdown;charset=utf-8'}),definition.name+'.md');
   if(officeLabel)output.querySelector('[data-office]').onclick=()=>{
    try{
     const file=createOfficeExport(config.id,result);
     if(!file)throw new Error('这份运行结果无法导出。');
     download(file.blob,file.filename);
    }catch(issue){error.textContent=issue.message;}
   };
   output.hidden=false;status.textContent='运行完成，已存入运行记录。';output.scrollIntoView({block:'nearest'});
  }
  form.onsubmit=async event=>{
   event.preventDefault();if(submit.disabled)return;
   clearOutput();
   const values={};
   for(const field of config.fields){
    const value=form.elements[field.key].value.trim();
    if(value)values[field.key]=field.type==='number'?Number(value):value;
   }
   const input=config.group?{[config.group]:values}:values;
   fieldset.disabled=true;submit.disabled=true;sample.disabled=true;
   status.textContent='正在运行…';
   try{
    const queued=await api('skills/'+config.id+'/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({input})});
    while(dialog.open){
     const run=await api('runs/'+encodeURIComponent(queued.id));
     if(!dialog.open)return;
     if(!['queued','running'].includes(run.status)){showResult(run);return;}
     await new Promise(resolve=>setTimeout(resolve,500));
    }
   }catch(issue){if(dialog.open){error.textContent=issue.message;status.textContent='';}}
   finally{fieldset.disabled=false;submit.disabled=false;sample.disabled=false;}
  };
  dialog.querySelector('[data-dismiss]').onclick=()=>dialog.close();
  const routeChanged=()=>dialog.close();
  window.addEventListener('hashchange',routeChanged);
  dialog.onclose=()=>{window.removeEventListener('hashchange',routeChanged);dialog.remove();};
  document.body.append(dialog);dialog.showModal();
 }
 document.addEventListener('click',event=>{
  const trigger=event.target.closest('[data-launch-skill]');
  if(!trigger)return;
  const config=quickSkills.find(item=>item.id===trigger.dataset.launchSkill);
  const definition=definitions().find(item=>item.id===config?.id);
  if(definition)open(config,definition);
 });
 return {page,includes:id=>quickSkills.some(skill=>skill.id===id)};
}
