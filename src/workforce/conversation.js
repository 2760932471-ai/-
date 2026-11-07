export function discussionMembers(g){const members=g.mode==='team'?g.members:g.members.map(id=>({product:'employee-merchandise',insight:'employee-profit',content:'employee-creative',service:'employee-service'}[id]||id));return [...new Set([...members,...(g.participants||[])])];}
export function contextSettings(g){return {revision:1,startAfter:null,pinnedIds:[],excludedIds:[],note:'',maxMessages:12,maxChars:12000,...g.chatContext};}
export function mentionedEmployees(text,employees,explicit=[]){
 if(!Array.isArray(explicit)||explicit.length>4||explicit.some(id=>!employees.some(e=>e.id===id)))throw new Error('请选择最多 4 位本群员工');
 const found=[];
 for(const token of text.matchAll(/(?<![a-zA-Z0-9_.+%-])[@＠]/g)){
  const tail=text.slice(token.index+token[0].length);
  const matches=employees.filter(e=>tail.startsWith(e.name)).sort((a,b)=>b.name.length-a.name.length);
  if(!matches.length)throw new Error('未找到 @ 的本群员工，请先邀请并从候选列表选择');
  for(const e of matches.filter(e=>e.name.length===matches[0].name.length))if(!found.some(x=>x.id===e.id))found.push(e);
 }
 for(const id of explicit)if(!found.some(e=>e.id===id))throw new Error('@文本与选择的员工不一致，请重新选择');
 const selected=[];for(const name of new Set(found.map(e=>e.name))){const same=found.filter(e=>e.name===name);if(same.length>1){const chosen=same.filter(e=>explicit.includes(e.id));if(!chosen.length)throw new Error('存在同名员工，请从 @ 列表选择');selected.push(...chosen);}else selected.push(...same);}
 if(selected.length>4)throw new Error('一次最多 @ 4 位员工');return selected.map(e=>e.id);
}
export function selectConversation(g,source){
 const settings=contextSettings(g),sourceIndex=g.messages.findIndex(m=>m.id===source?.id),end=sourceIndex<0?g.messages.length:sourceIndex;
 const start=settings.startAfter?g.messages.findIndex(m=>m.id===settings.startAfter):-1;
 const historical=g.messages.slice(start+1,end);
 const excluded=new Set(settings.excludedIds);for(const m of historical)if(m.replyTo&&excluded.has(m.replyTo))excluded.add(m.id);
 const eligible=historical.filter(m=>!excluded.has(m.id)&&['human','agent'].includes(m.role)&&(!m.replyTo||g.messages.findIndex(x=>x.id===m.replyTo)>start)&&(m.role!=='agent'||(m.goalVersion==null?g.version===1:m.goalVersion===g.version)&&!['failed','discarded'].includes(m.status)));
 const all=new Map(eligible.map(m=>[m.id,m])),chosen=new Map();
 const add=(m,reason)=>{if(m&&!chosen.has(m.id))chosen.set(m.id,{m,reason});};
 // The explicit reply chain and pinned messages take priority over recency.
 let parent=source?.replyTo;for(let i=0;i<4&&parent;i++){const m=all.get(parent);if(!m)break;add(m,'引用链');parent=m.replyTo;}
 for(const id of settings.pinnedIds)add(all.get(id),'固定消息');
 const question=String(source?.text||g.text).replace(/@[^\s，。！？]+/g,'');
 const terms=[...new Set((question.match(/[a-zA-Z0-9_-]{2,}|[\u4e00-\u9fff]{2,}/g)||[]).flatMap(w=>/^[\u4e00-\u9fff]+$/.test(w)?Array.from({length:w.length-1},(_,i)=>w.slice(i,i+2)):[w.toLowerCase()]))].slice(0,60);
 for(const m of eligible.slice(-4))add(m,'最近对话');
 for(const {m,score} of eligible.map(m=>({m,score:terms.filter(t=>m.text.toLowerCase().includes(t)).length})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score))add(m,'词项相关');
 for(const m of [...eligible].reverse())add(m,'近期补充');
 let budget=settings.maxChars,selected=[];
 const append=(m,reason)=>{if(selected.length>=settings.maxMessages||budget<=0)return;const text=String(m.text).slice(0,Math.min(2000,budget));if(!text)return;selected.push({id:m.id,role:m.role,author:m.author,text,replyTo:m.replyTo||null,reason,truncated:text.length<m.text.length});budget-=text.length;};
 // Reserve the current question; it is never dropped by exclusion or older history.
 if(source?.id&&sourceIndex>=0)append(source,'本次提问');
 for(const {m,reason}of chosen.values())append(m,reason);
 selected.sort((a,b)=>g.messages.findIndex(m=>m.id===a.id)-g.messages.findIndex(m=>m.id===b.id));
 return {conversation:selected.map(({reason,truncated,...m})=>m),conversationContext:{note:settings.note,policy:'历史为参考，不自动覆盖已确认业务事实；本地词项筛选，不是模型摘要',revision:settings.revision},contextSelection:{revision:settings.revision,selected:selected.map(({text,...m})=>m),totalMessages:g.messages.length,characters:settings.maxChars-budget,maxMessages:settings.maxMessages,maxChars:settings.maxChars}};
}
export function updateContext(g,input){
 const current=contextSettings(g);if(input.revision!==current.revision)throw new Error('上下文设置已变化，请重新打开');
 if(input.reset===true){g.chatContext={...current,revision:current.revision+1,startAfter:g.messages.at(-1)?.id||null,pinnedIds:[],excludedIds:[],note:''};return;}
 const note=String(input.note??current.note);if(note.length>2000)throw new Error('固定背景最多 2000 字');
 const maxMessages=Number(input.maxMessages??current.maxMessages),maxChars=Number(input.maxChars??current.maxChars);
 if(![6,12,20].includes(maxMessages)||!Number.isInteger(maxChars)||maxChars<4000||maxChars>24000)throw new Error('请选择 6 / 12 / 20 条消息，字符预算 4000–24000');
 const pinnedIds=input.pinnedIds??current.pinnedIds,excludedIds=input.excludedIds??current.excludedIds;
 for(const [ids,max]of [[pinnedIds,6],[excludedIds,500]])if(!Array.isArray(ids)||ids.length>max||new Set(ids).size!==ids.length||ids.some(id=>!g.messages.some(m=>m.id===id&&['human','agent'].includes(m.role))))throw new Error('消息选择无效，最多固定 6 条、排除 500 条');
 const start=g.messages.findIndex(m=>m.id===current.startAfter);
 if(pinnedIds.some(id=>g.messages.findIndex(m=>m.id===id)<=start))throw new Error('新话题之前的消息不能固定；可将必要背景重新填写到固定背景');
 if(pinnedIds.some(id=>{const m=g.messages.find(x=>x.id===id);return m.role==='agent'&&((m.goalVersion??1)!==g.version||['failed','discarded'].includes(m.status));}))throw new Error('旧版本或失败的回复不能固定，请按当前资料重新提问');
 if(pinnedIds.some(id=>excludedIds.includes(id)))throw new Error('同一条消息不能同时固定和排除');
 g.chatContext={...current,revision:current.revision+1,note,maxMessages,maxChars,pinnedIds,excludedIds};
}
