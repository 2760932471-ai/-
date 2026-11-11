import {imageOutputs,prepareContent} from './content-preparation.js';
const now=()=>new Date().toISOString();
const managed=g=>g&&g.mode==='team'&&!g.contentDraft&&imageOutputs(g.text).length>0&&g.stage!=='completed'&&!g.paused;
export function createProductionManager({getData,transaction,images,event}){
 const signature=g=>{const d=getData();return JSON.stringify([g.version,g.text,g.skillData,g.knowledge,d.knowledge.documents.map(x=>[x.id,x.revision,x.enabled]),d.knowledge.bases.map(x=>[x.id,x.enabled]),d.materials.map(x=>[x.id,x.revision,x.status]),d.sources.map(x=>[x.id,x.revision,x.enabled]),g.research?.at,!!g.researchRequest,images.view().config,d.imageJobs?.filter(j=>j.goalId===g.id).map(j=>[j.id,j.status])]);};
 const pending=()=>getData().goals.some(g=>managed(g)&&g.production?.signature!==signature(g));
 async function run(){
  const original=getData().goals.find(g=>managed(g)&&g.production?.signature!==signature(g));if(!original)return;
  const id=original.id,version=original.version,outputs=imageOutputs(original.text),prep=prepareContent(getData(),original);
  let blocked='';const config=images.view().config;
  const searching=/(?:找|搜|选品|性价比)/.test(original.text);
  if(original.researchRequest)blocked='正在自动查找商品来源，完成后继续整理与生图。';
  else if(prep.missing.length)blocked=prep.missing.join('；');
  else if(searching&&!prep.candidate)blocked=original.webResearch?.results?.length?'已找到网页线索，但尚未取得可用商品记录。请连接可读取商品参数的供应商接口，系统将继续整理。':(/1688/.test(original.text)?'未找到可追溯至 1688 的商品记录；':'未找到可用商品记录；')+'请在 AI基础能力配置连接网络搜索 / 供应商来源。无需反复填写卖点和目标人群。';
  else if(!config.enabled||!config.credentialConfigured)blocked='生图服务尚未就绪。请在 AI基础能力配置 → 图片生成连接图片服务，系统会继续当前目标，不会用文字简报替代图片。';
  const jobs=getData().imageJobs||[];
  await transaction(d=>{const g=d.goals.find(x=>x.id===id);if(!g||g.version!==version||g.paused)return;
   const fresh=!g.production||g.production.version!==version;
   g.autoContent=prep;if(prep.productName)g.scope.product=prep.productName;if(prep.selectedSku)g.scope.sku=prep.selectedSku;g.production={...g.production,version,outputs,blocked,phase:blocked?'blocked':'generating',signature:null};
   if(fresh){g.tasks=[{id:'auto-materials',title:'自动查找商品与整理卖点、人群',status:'active'},...outputs.map(kind=>({id:'image-'+kind,title:kind==='main'?'生成商品主图':'生成详情页图片模块',status:'pending'})),{id:'image-review',title:'验收图片交付',status:'pending'}].map(t=>({...t,goalId:id,owner:'图片制作'}));g.criterion='交付目标要求的 PNG 图片；主图简报属于过程资料，不能替代图片验收。';event(g,'已切换为自动制作：查找来源 → 整理卖点与建议人群 → 生成图片 → 交付。未指定渠道时使用全渠道；无需重复填写制作资料。');}
   g.stage='draft';g.runtime={status:blocked?'needs_input':'running',completed:[],missing:blocked?[blocked]:[]};
   if(blocked&&g.production.lastNotice!==blocked){event(g,blocked);g.production.lastNotice=blocked;}
  });
  if(!blocked)for(const kind of outputs){
   const live=getData().goals.find(x=>x.id===id);if(!managed(live)||live.version!==version)break;
   const requestId='auto-image-'+id+'-'+version+'-'+kind;if(jobs.some(j=>j.requestId===requestId))continue;
   const description=[kind==='main'?'制作 1 张商品主图，主体清晰，方形构图。':'制作 1 张竖版商品详情页图片模块，包含商品展示与有依据的特点；不是整张详情长图。','商品：'+prep.productName,'发布渠道：'+prep.channel+'；采用通用构图，发布前按实际平台裁切。','建议受众：'+prep.audience,'来源陈述：'+prep.facts.join('；'),'来源：'+prep.source,prep.boundary].join('\n');
   try{await images.create({requestId,goalId:id,outputKind:kind,description,mode:prep.referenceId?'reference':'concept',referenceId:prep.referenceId,size:kind==='main'?'1024x1024':'1024x1536',confirmed:true},{preparation:prep});}
   catch(error){blocked=String(error.message);break;}
  }
  await transaction(d=>{const g=d.goals.find(x=>x.id===id);if(!g||g.version!==version||g.paused)return;
   const rows=outputs.map(kind=>d.imageJobs?.find(j=>j.requestId==='auto-image-'+id+'-'+version+'-'+kind));
   const failure=rows.find(j=>['failed','unknown'].includes(j?.status));if(failure)blocked=failure.error;
   const invalid=[];for(const j of rows.filter(j=>j?.status==='succeeded'))try{images.assertDelivery(j.id);}catch(error){invalid.push(j.id);blocked=error.message;}
   const done=rows.every(j=>j?.status==='succeeded')&&!invalid.length;g.production.phase=done?'delivered':blocked?'blocked':'generating';g.production.blocked=blocked;g.production.jobIds=rows.filter(Boolean).map(j=>j.id);
   g.stage=done?'review':'draft';g.runtime={status:done?'completed':blocked?'needs_input':'running',completed:[],missing:blocked?[blocked]:[]};
   g.tasks[0].status=prep.productName&&!original.researchRequest&&(!searching||prep.candidate)?'completed':'waiting';
   outputs.forEach((kind,i)=>{const j=rows[i];g.tasks[i+1].status=j?.status==='succeeded'&&!invalid.includes(j.id)?'completed':blocked?'waiting':'active';});g.tasks.at(-1).status=done?'acceptance':'pending';
   if(blocked&&g.production.lastNotice!==blocked){event(g,blocked);g.production.lastNotice=blocked;}
   if(done&&g.production.lastNotice!=='delivered'){event(g,'要求的 '+outputs.length+' 张图片已生成，可在交付物查看和下载。全渠道指通用内容方向，尚未向任何店铺发布。');g.production.lastNotice='delivered';}
   g.updatedAt=now();g.production.signature=signature(g);
  });
 }
 return {pending,run};
}
