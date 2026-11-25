export function createKnowledgeUI({state,api,esc,badge,toast,refresh,render,act}){
 const $=s=>document.querySelector(s),data=()=>state.knowledge||{bases:[],documents:[],embedding:{configured:false}};
 const post=(route,input)=>api('knowledge/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
 const save=(type,id,input)=>api('knowledge/'+type+(id?'/'+id:''),{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
 const states={not_indexed:'未建向量索引',indexing:'向量索引中',ready:'向量索引就绪',failed:'向量索引失败',stale:'模型已变更，需重建向量索引'};
 let baseId='',editing=null,editingBase=null,lastRecall=null,recallError='',searching=false,query='',searchSequence=0,searchSettings={mode:'bm25',topK:5,sku:''};
 const baseName=id=>data().bases.find(b=>b.id===id)?.name||'未知知识库';
 const modes=(current='bm25')=>[['bm25','BM25 关键词召回'],['vector','向量语义召回'],['hybrid','混合召回 · RRF']].map(([id,name])=>`<option value="${id}" ${current===id?'selected':''} ${id!=='bm25'&&!data().embedding.configured?'disabled':''}>${name}${id!=='bm25'&&!data().embedding.configured?'（需配置 Embedding）':''}</option>`).join('');
 const baseOptions=(selected,all=false)=>`${all?'<option value="">全部启用知识库</option>':''}${data().bases.map(b=>`<option value="${b.id}" ${b.id===selected?'selected':''}>${esc(b.name)}${b.enabled?'':' · 已停用'}</option>`).join('')}`;
 function results(r){const stale=r?.hits.some(h=>!data().documents.some(d=>d.id===h.documentId&&d.revision===h.revision&&d.enabled&&data().bases.find(b=>b.id===d.baseId)?.enabled));return r?` ${stale?'<p class="note">这是历史测试结果，文档或知识库已改变，请重新检索。</p>':''}<div class="kb-recall-meta">${esc(r.algorithm)} · 检索 ${r.totalChunks} 个切片 · 返回 ${r.hits.length} 项</div>${r.hits.length?r.hits.map(h=>`<article class="kb-hit"><div class="artifact-top"><strong>${esc(h.title)}</strong>${badge('得分 '+h.score)}</div><p class="field-hint">${esc(h.baseName)} · v${h.revision} · 切片 ${h.ordinal} · ${esc(h.sku||'通用知识')}</p><pre>${esc(h.text)}</pre><p class="field-hint">来源：${esc(h.source)}</p>${!stale&&data().documents.find(d=>d.id===h.documentId)?.media?`<button class="text-button" data-kb-chunks="${esc(h.documentId)}">查看原件</button>`:''}</article>`).join(''):'<div class="note">未召回相关切片。请检查文档是否启用、知识库范围和关键词；不会用虚构内容补足结果。</div>'}`:'';}
 function documentCard(doc,d){
  const available=doc.enabled&&d.bases.find(b=>b.id===doc.baseId)?.enabled;
  const kind=doc.media?(doc.media.mime.startsWith('image/')?'图片':'视频'):'文档';
  return `<article class="kb-document">
   <div class="kb-doc-head"><span class="kb-kind">${kind}</span><h3>${esc(doc.title)}</h3>${badge(available?'参与召回':'已停用',available)}</div>
   <p>${esc(baseName(doc.baseId))} · ${esc(doc.sku||'通用知识')} · ${doc.chunkCount} 个切片 · v${doc.revision}</p>
   <p class="field-hint">${esc(states[doc.index.status])}${doc.index.status==='indexing'?' · '+doc.index.completed+'/'+doc.index.total:''}${doc.index.model?' · '+esc(doc.index.model):''} · ${doc.characters} 字符 · 切片长度 ${doc.size} / 重叠 ${doc.overlap}</p>
   ${doc.index.error?`<p class="form-error">${esc(doc.index.error)}</p>`:''}
   <div class="action-buttons"><button class="secondary" data-kb-chunks="${doc.id}">${kind==='图片'?'查看图片':kind==='视频'?'播放视频':'查看切片'}</button><button class="text-button" data-kb-edit="${doc.id}">编辑与重切片</button><button class="text-button" data-kb-toggle="${doc.id}">${doc.enabled?'停用':'启用'}</button><button class="text-button" data-kb-delete="${doc.id}">删除</button><button class="text-button" data-kb-index="${doc.id}" ${!d.embedding.configured||!doc.enabled||doc.index.status==='indexing'?'disabled':''}>${doc.index.status==='indexing'?'索引中…':'构建向量索引'}</button></div>
  </article>`;
 }
 let recallOptionsOpen=false;
 document.addEventListener('toggle',e=>{if(e.target.id==='kb-recall-options'&&e.target.isConnected)recallOptionsOpen=e.target.open;},true);
 function page(){
  const d=data(),docs=d.documents.filter(doc=>!baseId||doc.baseId===baseId);
  return `<section class="kb-studio" aria-labelledby="kb-title">
   <header class="page-heading kb-heading"><div><h1 id="kb-title">知识库</h1><p>保存业务文档、图片和视频，检索时可查看原件。</p></div><div class="action-buttons"><button class="secondary" data-kb-starters>企业知识资料</button><button class="primary" data-kb-import>＋ 导入资料</button></div></header>
   <div class="kb-layout"><section class="kb-library" aria-labelledby="kb-library-title">
    <header class="kb-pane-title"><h2 id="kb-library-title">资料库</h2><span>${docs.length} 份资料 · ${docs.reduce((n,doc)=>n+doc.chunkCount,0)} 个切片</span></header>
    <div class="kb-toolbar"><label for="kb-filter" class="sr-only">知识库范围</label><select id="kb-filter">${baseOptions(baseId,true)}</select><button class="text-button" data-kb-base-new>新建知识库</button>${baseId?`<button class="text-button" data-kb-base-edit="${esc(baseId)}">库设置</button><button class="text-button" data-kb-base-delete="${esc(baseId)}">删除空库</button>`:''}</div>
    <div class="kb-documents">${docs.map(doc=>documentCard(doc,d)).join('')||'<div class="kb-empty"><span class="kb-empty-file" aria-hidden="true"></span><h3>暂无资料</h3><p>可导入 TXT、Markdown、图片或视频。</p><button class="text-button" data-kb-import>导入第一份资料 →</button></div>'}</div>
   </section><section class="kb-recall" aria-labelledby="kb-recall-title">
    <header class="kb-pane-title"><h2 id="kb-recall-title">召回测试</h2></header>
    <form id="kb-search"><label>检索问题<textarea name="query" rows="3" required maxlength="2000" placeholder="例如，角阀漏水时需要提供哪些售后凭证？">${esc(query)}</textarea></label>
     <details id="kb-recall-options" ${recallOptionsOpen?'open':''}><summary>检索设置</summary><label>召回方式<select name="mode">${modes(searchSettings.mode)}</select></label><div class="data-fields"><label>返回数量 Top K<input name="topK" type="number" min="1" max="8" value="${searchSettings.topK}" required></label><label>限定 SKU（可选）<input name="sku" maxlength="120" value="${esc(searchSettings.sku)}" placeholder="如 JF-001"></label></div><p class="field-hint">向量检索的最低余弦相似度为 0.3，混合检索根据结果排名融合。</p></details>
     <button class="primary" ${searching?'disabled':''}>${searching?'正在检索…':'测试召回'}</button><p class="form-error" role="alert">${esc(recallError)}</p>
    </form><div id="kb-results" aria-live="polite">${results(lastRecall)}</div>
   </section></div>
   <details class="kb-support"><summary>索引与检索范围</summary><p>关键词索引随文档保存生效。向量模式需要服务器设置 KB_EMBEDDING_ENDPOINT、KB_EMBEDDING_MODEL、KB_EMBEDDING_KEY，并将接口域名加入 AGENT_ALLOWED_HOSTS，然后为文档构建索引。图片和视频保存原件，按标题、说明和录入的字幕检索。</p></details>
  </section>`;
 }
 function goal(g){const config=g.knowledge||{baseIds:[],mode:'bm25',topK:5},locked=g.paused||!['plan','draft'].includes(g.stage);return `<section class="reference-section"><div class="section-title"><div><h3>知识库自动召回</h3><p class="field-hint">员工按目标或最新提问检索所选库，并保留切片引用。</p></div><button class="text-button" data-kb-center>管理知识库 →</button></div><form id="kb-goal-form" data-goal="${g.id}" data-version="${g.version}"><fieldset ${locked?'disabled':''}><div class="reference-options">${data().bases.map(b=>`<label><input type="checkbox" name="baseId" value="${b.id}" ${config.baseIds.includes(b.id)?'checked':''} ${!b.enabled&&!config.baseIds.includes(b.id)?'disabled':''}><span><strong>${esc(b.name)}</strong><small>${b.enabled?esc(b.description):'已停用，请取消选用'}</small></span></label>`).join('')}</div><div class="data-fields"><label>召回方式<select name="mode">${modes(config.mode)}</select></label><label>每次最多召回<input name="topK" type="number" min="1" max="8" value="${config.topK}" required></label></div><div class="action-buttons"><button class="secondary">保存知识库范围</button><button class="text-button" type="button" data-kb-goal-test>按当前目标测试召回</button></div></fieldset><p class="form-error" role="alert"></p></form><div id="kb-goal-results"></div>${locked?'<p class="field-hint">检索配置已锁定；需要更改时请恢复目标或新建跟进目标。</p>':''}</section>`;}
 const chunksHTML=chunks=>`<p class="field-hint">共 ${chunks.length} 个切片，按原文段落 / 句末优先分割，保留有限重叠。</p>${chunks.map(c=>`<details class="kb-chunk"><summary>切片 ${c.ordinal} · ${c.text.length} 字符 · 原文位置 ${c.start}–${c.end}</summary><pre>${esc(c.text)}</pre></details>`).join('')}`;
 function mount(){if($('#kb-document-dialog'))return;document.body.insertAdjacentHTML('beforeend',`
 <dialog id="kb-base-dialog" aria-labelledby="kb-base-title"><form id="kb-base-form"><div class="dialog-head"><h2 id="kb-base-title">知识库设置</h2><button type="button" class="icon-btn" data-kb-close="kb-base-dialog" aria-label="关闭知识库设置">×</button></div><label>知识库名称<input name="name" required maxlength="80"></label><label>说明<textarea name="description" rows="2" maxlength="500"></textarea></label><label class="confirm-check"><input type="checkbox" name="enabled" checked>启用知识库</label><p class="form-error" role="alert"></p><button class="primary">保存知识库</button></form></dialog>
 <dialog id="kb-document-dialog" aria-labelledby="kb-document-title"><form id="kb-document-form"><div class="dialog-head"><h2 id="kb-document-title">导入与切片</h2><button type="button" class="icon-btn" data-kb-close="kb-document-dialog" aria-label="关闭文档导入">×</button></div><label>所属知识库<select name="baseId" required></select></label><label>选择文档、图片或视频<input id="kb-file" type="file" accept=".txt,.md,.markdown,.jpg,.jpeg,.png,.webp,.mp4,.webm"></label><p class="field-hint">TXT / Markdown 最大 256 KB，JPG / PNG / WebP 最大 8 MB，MP4 / WebM 最大 32 MB。</p><div class="data-fields"><label>文档标题<input name="title" required maxlength="160"></label><label>对应 SKU（通用知识留空）<input name="sku" maxlength="120"></label></div><label>来源说明<input name="source" required maxlength="500" placeholder="如：售后部门审核，政策 v2"></label><label><span id="kb-body-label">文档正文</span><textarea name="body" required maxlength="80000" rows="8"></textarea></label><div class="data-fields"><label>切片长度<input name="size" type="number" min="200" max="1600" value="700" required></label><label>重叠长度<input name="overlap" type="number" min="0" max="800" value="100" required></label></div><button type="button" class="secondary" data-kb-preview>预览切片</button><div id="kb-split-preview"></div><label class="confirm-check"><input name="enabled" type="checkbox" checked>保存后启用，参与关键词召回</label><label class="confirm-check"><input name="confirmed" type="checkbox" required>我已核对正文和来源，可供员工参考</label><p class="form-error" role="alert"></p><div class="dialog-footer"><span>修改会重建切片，旧向量索引失效</span><button class="primary">保存并切片入库</button></div></form></dialog>
 <dialog id="kb-chunks-dialog" aria-labelledby="kb-chunks-title"><div class="dialog-head"><h2 id="kb-chunks-title">文档切片</h2><button class="icon-btn" data-kb-close="kb-chunks-dialog" aria-label="关闭切片预览">×</button></div><div id="kb-chunks-body"></div></dialog>`);}
 function mediaFields(file){
  $('#kb-document-form').elements.body.required=!file;
  $('#kb-body-label').textContent=file?'资料说明或字幕（可选，用于检索）':'文档正文';
 }
 function encodeFile(file){return new Promise((resolve,reject)=>{
  const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);
  reader.onerror=()=>reject(new Error('文件读取失败'));reader.readAsDataURL(file);
 });}
 function fill(form,values){for(const [key,value]of Object.entries(values)){const el=form.elements.namedItem(key);if(el){if(el.type==='checkbox')el.checked=!!value;else el.value=value??'';}}form.querySelector('.form-error').textContent='';}
 document.addEventListener('input',e=>{if(e.target.closest('#kb-document-form')&&['body','size','overlap'].includes(e.target.name))$('#kb-split-preview').innerHTML='';});
 document.addEventListener('change',async e=>{if(e.target.id==='kb-filter'){baseId=e.target.value;searchSequence++;searching=false;lastRecall=null;recallError='';render(true);}if(e.target.id==='kb-file'){const f=$('#kb-document-form'),file=e.target.files[0];if(!file){mediaFields(editing?.media);return;}try{
   const image=/\.(jpe?g|png|webp)$/i.test(file.name),video=/\.(mp4|webm)$/i.test(file.name);
   if(image||video){
    if(file.size>(image?8:32)*1024*1024)throw new Error(image?'图片最大 8 MB':'视频最大 32 MB');
    fill(f,{title:file.name,body:'',source:'上传文件：'+file.name,confirmed:false});mediaFields(file);$('#kb-split-preview').innerHTML='';return;
   }
   mediaFields(null);if(!/\.(txt|md|markdown)$/i.test(file.name)||file.size>256000)throw new Error('只支持 256KB 以内 TXT / Markdown 文件');const body=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());if(body.length>80000||body.includes('\0'))throw new Error('文件过长或包含二进制内容');if(e.target.files[0]!==file)return;fill(f,{title:file.name,body,source:'上传文件：'+file.name,confirmed:false});$('#kb-split-preview').innerHTML='';}catch(err){e.target.value='';mediaFields(editing?.media);f.querySelector('.form-error').textContent=err.message;}}});
 document.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b||!Object.keys(b.dataset).some(k=>k.startsWith('kb')))return;mount();
  const oldText=b.textContent;try{
   if(b.hasAttribute('data-kb-starters')){let dialog=$('#kb-starters-dialog');if(!dialog){document.body.insertAdjacentHTML('beforeend','<dialog id="kb-starters-dialog" aria-labelledby="kb-starters-title"><div class="dialog-head"><h2 id="kb-starters-title">企业知识资料</h2><button class="icon-btn" data-kb-close="kb-starters-dialog" aria-label="关闭">×</button></div><p>知识是企业事实与可查询的业务资料，不是员工执行步骤。这里包含有出处的方案摘录、通用商品知识和待补齐的企业台账；待补台账默认不参与召回。</p><div id="kb-starters-list"></div></dialog>');dialog=$('#kb-starters-dialog');}$('#kb-starters-list').innerHTML=(data().starters||[]).map(t=>`<article class="starter-row"><div><strong>${esc(t.title)}</strong><p class="field-hint">${esc(t.kind)} · ${esc(t.source)}</p></div><button class="secondary" data-kb-starter="${esc(t.id)}">预览并导入</button></article>`).join('');dialog.showModal();}
   if(b.dataset.kbStarter){const t=data().starters.find(t=>t.id===b.dataset.kbStarter);if(!data().bases.some(b=>b.enabled))throw new Error('请先创建并启用一个知识库');editing=null;$('#kb-file').value='';mediaFields(null);const f=$('#kb-document-form');f.elements.baseId.innerHTML=baseOptions(baseId||data().bases.find(b=>b.enabled).id);f.elements.baseId.disabled=false;fill(f,{title:t.title,body:t.body,source:t.source,sku:'',size:700,overlap:100,enabled:!t.needsFill});f.elements.confirmed.checked=false;$('#kb-split-preview').innerHTML='';$('#kb-starters-dialog').close();$('#kb-document-dialog').showModal();}
   if(b.dataset.kbDelete||b.dataset.kbBaseDelete){const isBase=!!b.dataset.kbBaseDelete,id=b.dataset.kbDelete||b.dataset.kbBaseDelete,row=data()[isBase?'bases':'documents'].find(x=>x.id===id);if(!confirm(isBase?'删除空知识库「'+row.name+'」？已有目标将移除此检索范围。':'删除文档「'+row.title+'」及其全部切片和向量？历史交付保留，但引用将失效。'))return;await api('knowledge/'+(isBase?'bases/':'documents/')+id,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmed:true,revision:row.revision})});if(isBase)baseId='';lastRecall=null;await refresh();render(true);toast('已删除，后续检索不再使用该资料');}
   if(b.dataset.kbClose)$('#'+b.dataset.kbClose).close();
   if(b.hasAttribute('data-kb-base-new')||b.dataset.kbBaseEdit){editingBase=data().bases.find(x=>x.id===b.dataset.kbBaseEdit)||null;fill($('#kb-base-form'),editingBase||{name:'',description:'',enabled:true});$('#kb-base-dialog').showModal();}
   if(b.hasAttribute('data-kb-import')||b.dataset.kbEdit){editing=b.dataset.kbEdit?await api('knowledge/documents/'+b.dataset.kbEdit):null;const f=$('#kb-document-form');f.elements.baseId.innerHTML=baseOptions(editing?.baseId||baseId||data().bases[0]?.id);f.elements.baseId.disabled=!!editing;mediaFields(editing?.media);fill(f,editing||{title:'',body:'',sku:'',source:'',size:700,overlap:100,enabled:true});f.elements.confirmed.checked=false;$('#kb-file').value='';$('#kb-split-preview').innerHTML='';$('#kb-document-dialog').showModal();}
   if(b.hasAttribute('data-kb-preview')){const f=$('#kb-document-form');try{const values=Object.fromEntries(new FormData(f));if(!values.body&&!f.elements.body.required)values.body=values.title;const split=await post('preview',values);$('#kb-split-preview').innerHTML=chunksHTML(split.chunks);f.querySelector('.form-error').textContent='';}catch(err){f.querySelector('.form-error').textContent=err.message;}}
   if(b.dataset.kbChunks){const doc=await api('knowledge/documents/'+b.dataset.kbChunks);$('#kb-chunks-title').textContent=doc.title+' · v'+doc.revision;$('#kb-chunks-body').innerHTML=chunksHTML(doc.chunks);if(doc.media){
     const source=await api('knowledge/documents/'+doc.id+'/media');
     const blob=new Blob([Uint8Array.from(atob(source.base64),c=>c.charCodeAt(0))],{type:source.mime});
     const url=URL.createObjectURL(blob),isVideo=source.mime.startsWith('video/'),player=document.createElement(isVideo?'video':'img');
     player.className='kb-media-preview';if(isVideo){player.controls=true;player.preload='metadata';}else player.alt=doc.title;
     player.src=url;$('#kb-chunks-body').prepend(player);
     $('#kb-chunks-dialog').addEventListener('close',()=>{player.removeAttribute('src');if(isVideo)player.load();player.remove();URL.revokeObjectURL(url);},{once:true});
    }$('#kb-chunks-dialog').showModal();}
   if(b.dataset.kbToggle||b.dataset.kbIndex){const doc=data().documents.find(x=>x.id===(b.dataset.kbToggle||b.dataset.kbIndex));b.disabled=true;b.textContent=b.dataset.kbIndex?'正在构建…':'正在保存…';await post('documents/'+doc.id+(b.dataset.kbIndex?'/index':'/toggle'),{revision:doc.revision,enabled:!doc.enabled});lastRecall=null;await refresh();render(true);toast(b.dataset.kbIndex?'向量索引已保存':'文档状态已更新');}
   if(b.hasAttribute('data-kb-goal-test')){const f=$('#kb-goal-form'),g=state.goals.find(x=>x.id===f.dataset.goal),v=new FormData(f);b.disabled=true;b.textContent='检索中…';try{const r=await post('search',{query:g.text,sku:g.scope.sku,baseIds:v.getAll('baseId'),mode:v.get('mode'),topK:Number(v.get('topK'))});if($('#kb-goal-form')?.dataset.goal===g.id)$('#kb-goal-results').innerHTML=results(r);}catch(err){f.querySelector('.form-error').textContent=err.message;}}
  }catch(err){toast(err.message);}finally{if(b.dataset.kbToggle||b.dataset.kbIndex||b.hasAttribute('data-kb-goal-test')){b.disabled=false;b.textContent=oldText;}}
 });
 document.addEventListener('submit',async e=>{
  const f=e.target;if(!['kb-base-form','kb-document-form','kb-search','kb-goal-form'].includes(f.id))return;e.preventDefault();const button=e.submitter,v=Object.fromEntries(new FormData(f)),error=f.querySelector('.form-error');let requestSequence=null;button.disabled=true;error.textContent='';try{
   if(f.id==='kb-base-form'){const b=await save('bases',editingBase?.id,{...v,revision:editingBase?.revision,enabled:v.enabled==='on'});baseId=b.id;lastRecall=null;$('#kb-base-dialog').close();}
   if(f.id==='kb-document-form'){
    const file=$('#kb-file').files[0];
    if(file)v.media=/\.(txt|md|markdown)$/i.test(file.name)?null:{name:file.name,base64:await encodeFile(file)};
    await save('documents',editing?.id,{...v,baseId:editing?.baseId||v.baseId,revision:editing?.revision,size:Number(v.size),overlap:Number(v.overlap),enabled:v.enabled==='on',confirmed:v.confirmed==='on'});$('#kb-document-dialog').close();toast('文档已切片入库，可进行关键词召回');lastRecall=null;}
   if(f.id==='kb-search'){query=v.query;searchSettings={mode:v.mode,topK:Number(v.topK),sku:v.sku};const sequence=++searchSequence;requestSequence=sequence;searching=true;lastRecall=null;recallError='';$('#kb-results').innerHTML='正在检索…';const r=await post('search',{...v,topK:Number(v.topK),baseIds:baseId?[baseId]:data().bases.filter(b=>b.enabled).map(b=>b.id)});if(sequence!==searchSequence)return;lastRecall=r;searching=false;render(true);return;}
   if(f.id==='kb-goal-form'){await act('knowledge',{expectedVersion:Number(f.dataset.version),knowledge:{baseIds:new FormData(f).getAll('baseId'),mode:v.mode,topK:Number(v.topK)}},f.dataset.goal);toast('知识库范围已保存，请重新确认计划');}
   await refresh();render(true);
  }catch(err){if(f.id==='kb-search'){if(requestSequence!==searchSequence)return;recallError=err.message;searching=false;lastRecall=null;render(true);}else error.textContent=err.message;}finally{button.disabled=false;}
 });
 return {page,goal};
}
