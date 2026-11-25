import {deliveryFiles} from './deliveries.js';

// A planner may propose ways to check its work. Only these observable checks
// run automatically. A judgement requiring a person remains a note for review.
const kinds=new Set(['artifact','sources','comparison','human_review']);

export function attachAcceptanceChecks(plan,proposal,contract){
 const available=new Set(plan.nodes.map(node=>node.capability));
 available.delete('result.compile');
 const checks=[];
 const add=check=>{
  if(!available.has(check.capability)||!kinds.has(check.kind))return;
  const existing=checks.find(x=>x.kind===check.kind&&x.capability===check.capability&&
   (check.kind!=='human_review'||x.label===check.label));
  if(existing){existing.minimum=Math.max(existing.minimum,check.minimum);return;}
  checks.push(check);
 };
 for(const req of contract.requirements||[]){
  if(req.capability==='evidence.collect'||req.fallback)continue;
  add({capability:req.capability,kind:'artifact',minimum:1,label:req.title});
 }
 for(const check of (Array.isArray(proposal?.checks)?proposal.checks:[]).slice(0,8)){
  if(!check||typeof check.label!=='string'||!check.label.trim())continue;
  const minimum=check.kind==='comparison'?2:1;
  add({kind:check.kind,capability:check.capability,label:check.label.trim().slice(0,120),
   minimum:check.kind==='sources'&&Number.isInteger(check.minimum)?Math.max(1,Math.min(6,check.minimum)):minimum});
 }
 return {...plan,checks};
}

function predecessors(nodes,targets){
 const byId=new Map(nodes.map(node=>[node.id,node]));
 const found=new Set(targets);
 const pending=[...targets];
 while(pending.length){
  for(const id of pending.pop().dependsOn||[]){
   const node=byId.get(id);
   if(node&&!found.has(node)){found.add(node);pending.push(node);}
  }
 }
 return [...found];
}

function sourceKeys(node){
 const hits=node.recall?.hits||[];
 const bySource=new Map(hits.filter(hit=>hit.documentId&&hit.source).map(hit=>[hit.source,hit.documentId]));
 const key=row=>{
  const source=row.url||row.source;
  if(typeof source==='string'&&/^https?:\/\//i.test(source)){
   try{const url=new URL(source);url.hash='';return url.href;}catch{}
  }
  return row.documentId||bySource.get(source)||source;
 };
 return [
  ...(node.investigation?.observations||[]).map(key),
  ...hits.map(key),
  ...(node.web?.results||[]).map(key),
  ...(node.offers||[]).map(key),
  ...(node.candidates||node.discovery?.candidates||[]).map(key),
  node.preparation?.candidate?.source,node.selection?.source
 ].filter(value=>typeof value==='string'&&value.trim());
}

export function evaluatePlanChecks(goal,plan,nodes){
 const failures=[],notes=[];
 for(const check of plan?.checks||[]){
  const targets=nodes.filter(node=>node.capability===check.capability);
  if(!targets.length)continue;
  if(check.kind==='artifact'){
   for(const node of targets){
    const present=deliveryFiles(goal,node).some(file=>!node.capability.startsWith('image.')||Boolean(file.imageJobId));
    if(!present)failures.push('「'+node.title+'」还没有本轮交付物。');
   }
  }else if(check.kind==='human_review'){
   notes.push('人工核对：'+check.label);
  }else{
   const branch=predecessors(nodes,targets);
   if(check.kind==='sources'){
    const count=new Set(branch.flatMap(sourceKeys)).size;
    if(count<check.minimum)notes.push('「'+check.label+'」目前可追溯到 '+count+' 个来源，仍需补证。');
   }else if(check.kind==='comparison'){
    const candidates=branch.flatMap(n=>[
     ...(n.offers||[]).map(row=>row.sku),
     ...(n.candidates||n.discovery?.candidates||[]).map(row=>row.sku||(row.source&&row.name)),
     ...(n.investigation?.observations||[]).filter(row=>row.scope==='exact').map(row=>row.sku)
    ]).filter(Boolean);
    if(new Set(candidates).size<2)notes.push('「'+check.label+'」尚缺两个可识别的备选，结论仅供初筛。');
   }
  }
 }
 return {failures:[...new Set(failures)],notes:[...new Set(notes)]};
}
