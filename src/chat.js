import { randomUUID } from 'node:crypto';
import { agents, demoAdapters } from './engine.js';

const message = (role, author, text, extra = {}) => ({ id: randomUUID(), role, author, text, at: new Date().toISOString(), ...extra });
export function createRoom(goal, selected) {
  if (typeof goal !== 'string' || !goal.trim() || goal.length > 2000) throw new Error('请输入 1–2000 字的协作目标');
  if (!Array.isArray(selected) || !selected.length || selected.some(id=>!agents.some(a=>a.id===id))) throw new Error('请至少邀请一个有效 Agent');
  const members=[...new Set(selected)];
  const first=message('human','你',goal.trim());
  return { id:randomUUID(), goal:goal.trim(), createdAt:first.at, members, paused:false, mode:'demo', messages:[first,message('coordinator','数字员工',`协作群已建立。我会围绕这个目标，依次邀请 ${members.map(id=>agents.find(a=>a.id===id).name).join('、')} 提供建议。你可以随时补充信息，或指定一位 Agent 回复。`)], queue:members.map(agent=>({agent,source:first.id})), artifacts:[] };
}
export function sendMessage(room, text, target='all') {
  if(typeof text!=='string'||!text.trim()||text.length>2000)throw new Error('请输入 1–2000 字的消息');
  if(target!=='all'&&!room.members.includes(target))throw new Error('该 Agent 不在当前群里');
  const mentioned=room.members.filter(id=>text.includes('@'+agents.find(a=>a.id===id).name) || text.includes('@'+agents.find(a=>a.id===id).name.replace(' Agent','')));
  const recipients=target==='all'?(mentioned.length?mentioned:room.members):[target];
  if(room.queue.length+recipients.length>24)throw new Error('待回复消息较多，请等待团队处理后再发送');
  const item=message('human','你',text.trim(),{target});room.messages.push(item);
  room.queue.push(...recipients.map(agent=>({agent,source:item.id})));
  return item;
}
export async function tickRoom(room) {
  if(room.paused||!room.queue.length)return;
  const job=room.queue.shift();
  const source=room.messages.find(m=>m.id===job.source);
  const agent=agents.find(a=>a.id===job.agent);
  if(!source||!agent)return;
  const result=await demoAdapters[job.agent]({goal:source.text, observations:room.artifacts});
  const artifact={id:randomUUID(),agent:job.agent,title:agent.name.replace(' Agent','')+'建议',body:result.artifact,evidence:result.evidence};
  room.artifacts.push(artifact);
  room.messages.push(message('agent',agent.name,`收到你关于「${source.text.slice(0,120)}${source.text.length>120?'…':''}」的消息。\n\n${result.artifact.split('\n\n').slice(1).join('\n\n')}`,{agent:job.agent,replyTo:source.id,artifact:artifact.id}));
  if(!room.queue.length)room.messages.push(message('coordinator','数字员工','本轮建议已汇总。你可以继续补充约束、@ 某位 Agent 深入讨论，或查看右侧交付物。以上为模板演示回复，尚未调用真实模型。'));
}
