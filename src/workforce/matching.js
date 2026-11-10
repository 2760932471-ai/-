import {isSelectionGoal} from '../agents/builtins.js';
import {skillDefinitions} from './skills.js';
import {employeeReadiness} from './employees.js';
import {publicModel} from './model.js';
import {publicExternal} from './external.js';
import {matchingRecipes} from './commerce.js';

// Bounded local capability routing. No claim of semantic model reasoning or market access.
export function matchingKey(d,g){return JSON.stringify([g.text,d.employees.map(e=>[e.id,e.revision,e.enabled,e.skillIds,e.modelId,e.mode]),d.models.map(m=>publicModel(m)),d.externalSkills.map(s=>publicExternal(s))]);}
export function matchMembers(d,text){
 text=String(text||'').replace(/(?:不需要|不要|不做|无需|不用)[^，。；\n]*/g,'');
 const required=[],add=id=>{if(!required.includes(id))required.push(id);};
 const selection=isSelectionGoal(text),listing=/(上新|上架|发布商品|商品.{0,6}草案)/.test(text);
 if(selection){add('product.compare');add('selection.score');}
 if(listing){add('product.validate');add('product.draft');}
 const copyRules=[[/标题/,'copy.titles'],[/卖点/,'copy.selling_points'],[/详情页文案|详情文案/,'copy.detail'],[/视频|分镜|口播/,'copy.video'],[/主图|图片|配图/,'copy.image_brief']];
 for(const [pattern,id]of copyRules)if(pattern.test(text))add(id);
 if(/文案|内容/.test(text)&&!required.some(id=>id.startsWith('copy.')))add(listing?'content.outline':'copy.detail');
 const packs=matchingRecipes(text);for(const r of packs)r.skillIds.forEach(add);
 if(/保本价|单件成本/.test(text))add('price.break_even');
 if(/利润|经营分析|经营测算|财务|账单|成本费用/.test(text)&&!required.includes('commerce.sku_profit')&&!required.includes('campaign.discount')&&!required.includes('price.break_even'))add('finance.calculate');
 if(/库存|供货周期/.test(text)&&!required.includes('inventory.replenish'))add('inventory.coverage');
 if(/推广|广告|转化率|漏斗/.test(text))add('traffic.funnel');
 if(/售后|客服|客户.*问题|退货|退款/.test(text)&&!required.includes('service.evidence'))add('service.triage');
 if(/合规|宣传审核|审核文案|检查文案/.test(text))add('content.review');
 const recognized=required.length>0;add('task.brief');
 const ready=d.employees.filter(e=>employeeReadiness(e,d.models.map(publicModel),d.externalSkills.map(publicExternal)).ready);
 const steps=[],missing=[];
 for(const skillId of required){
  const definition=skillDefinitions.find(s=>s.id===skillId);
  // Prefer a focused capability set, then reuse a suitable selected member. Stable ID breaks ties.
  const candidates=ready.filter(e=>e.skillIds.includes(skillId)).sort((a,b)=>
   (a.skillIds.filter(id=>!required.includes(id)).length-b.skillIds.filter(id=>!required.includes(id)).length)||
   (a.skillIds.length-b.skillIds.length)||
   (Number(!steps.some(s=>s.employeeId===a.id))-Number(!steps.some(s=>s.employeeId===b.id)))||a.id.localeCompare(b.id));
  const e=candidates[0];if(!e){missing.push('暂无就绪员工可执行「'+definition.name+'」');continue;}
  let step=steps.find(s=>s.employeeId===e.id);if(!step){step={employeeId:e.id,employeeName:e.name,skillIds:[],reasons:[]};steps.push(step);}
  step.skillIds.push(skillId);step.reasons.push('已装配「'+definition.name+'」，配置就绪');
 }
 if(steps.length>8){missing.push('目标涉及超过 8 位执行员工，请拆成多个目标');steps.splice(8);}
 if(!recognized)missing.unshift('尚未识别可执行工作，请说明需要选品、制作何种内容、核算什么或处理什么客户问题');
 for(const s of steps){s.objective=s.skillIds.map(id=>skillDefinitions.find(x=>x.id===id).name).join('、');s.deliverable=s.skillIds.map(id=>skillDefinitions.find(x=>x.id===id).description).join('；').slice(0,600);}
 const notes=['总控按目标关键词与已装配能力自动匹配，不是大模型语义推理。'];
 if(selection)notes.push('先检索可用候选；网络及 1688 站点搜索需要在 AI基础能力配置连接搜索服务。');
 if(required.includes('copy.image_brief'))notes.push('本轮员工先交付设计简报；可从群聊“生成图片”调用独立生图服务，概念图无需底图。');
 return {method:'本地能力匹配',intent:selection?'selection':listing?'listing':'analysis',recognized,steps,employeeIds:steps.map(s=>s.employeeId),missing,notes,summary:'总控按目标所需能力匹配就绪员工，避免无关工作；专业处理后统一汇总。'};
}
