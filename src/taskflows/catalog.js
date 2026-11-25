import {skillDefinitions} from '../workforce/skills.js';
import {skillRequestPatterns} from '../../public/goal-language.js';

// Workspace input keys are also used to resume only the work affected by an edit.
const skillInputs={
 'finance.calculate':['financials','facts','proposal'],
 'content.review':['reviewText','proposal','observations'],
 'service.triage':['question','serviceQuestion'],
 'service.evidence':['question','serviceQuestion','knowledgeRecall.hits']
};
export const flowCapabilities=[
 {id:'sourcing.1688',name:'1688 商品筛选',description:'按场景和采购条件比较可核对的报价，保存商品编号、来源及选款依据。',
  executor:'sourcing',roleIds:['selection'],inputs:['goal'],outputs:['sourcing.quotes','selected.sku']},
 {id:'sourcing.profit',name:'比较候选商品收益',description:'核对各款的计价单位、售价与费用。交付利润比较及影响结论的条件。',
  executor:'profit',roleIds:['profit','selection'],inputs:['sourcing.quotes','selected.sku'],outputs:['sourcing.profitComparison']},
 {id:'evidence.collect',name:'检索知识与外部线索',description:'自动检索目标知识库，并在搜索服务可用时查询网页。保留来源，不把网页摘要当成已核验事实。',
  executor:'evidence',roleIds:['research'],inputs:['goal'],outputs:['evidence']},
 {id:'research.compare',name:'调查备选与决策依据',description:'根据目标分头查询关键问题，复核最可能改变结论的资料，保留各备选的依据和缺口。',
  executor:'research',roleIds:['research','analysis'],inputs:['goal'],outputs:['research.comparison']},
 {id:'delivery.review',name:'复核对外发布材料',description:'核对本次商品、获准声明和实际生成的内容，标出需要人工核实的项目。',
  executor:'review',roleIds:['risk','creative'],inputs:['goal'],outputs:['delivery.review']},
 {id:'market.offers',name:'跨平台选品',description:'检索授权选品网关的商品并核对目标渠道、转售与履约条件。',
  executor:'market',roleIds:['selection'],inputs:['goal','sourceId','storeId'],outputs:['market.offers']},
 {id:'analysis.reason',name:'通用分析与方法设计',description:'根据当前问题和来源选择分析方法，输出有依据的判断、假设和缺口；需要可用模型。',
  executor:'model',roleIds:['analysis'],inputs:['goal','evidence'],outputs:['analysis.report']},
 {id:'image.main',name:'生成主图',description:'调用配置的图片服务交付真实 PNG；概念图与实拍参考图明确区分。',
  executor:'image',roleIds:['creative'],inputs:['goal'],outputs:['image.main.png']},
 {id:'image.detail',name:'生成详情图片模块',description:'生成竖版详情图片模块，需要图片服务，不是整张详情长图。',
  executor:'image',roleIds:['creative'],inputs:['goal'],outputs:['image.detail.png']},
 ...skillDefinitions.map(({id,name,description,roleIds,requires})=>({id,name,description,roleIds,executor:'skill',inputs:id.startsWith('copy.')?['copyBrief','autoContent']:skillInputs[id]||requires,outputs:['artifacts'],acceptance:skillRequestPatterns.find(request=>request.capability===id)?.acceptance})),
 {id:'result.compile',name:'核验并汇总结果',description:'汇总前序任务的真实交付物、来源和限制，不将未执行任务标为完成。',
  executor:'compile',roleIds:['coordination'],inputs:['artifacts'],outputs:['delivery.report']},
];
export const flowEmployees=[
 {id:'flow-sourcing',roleId:'selection',name:'选品分析员',instructions:'从货源平台核对同类商品的报价和来源，结合售价与费用比较候选。',skillIds:['sourcing.1688','sourcing.profit','market.offers']},
 {id:'flow-visual',roleId:'creative',name:'商品视觉设计师',instructions:'使用已连接的图片服务制作商品主图与详情图，保留商品依据和图片版本。',skillIds:['image.main','image.detail']}
].map(role=>({...role,enabled:true,mode:'flow',readiness:{ready:true,label:'任务流岗位',blockers:[]}}));

export function assignFlowCapability(capability, employees=[], preferredEmployeeId=null){
 const definition=flowCapabilities.find(item=>item.id===capability);
 if(!definition)return {employeeId:null,employeeName:'待验证能力',executor:'unverified',reason:'该能力尚未登记可用的执行方式'};

 // Code employees can carry out their equipped skill directly. Model employees have a separate runtime.
 const candidates=definition.executor==='skill'?employees.filter(e=>e.mode==='skills'):flowEmployees;
 const rolePriority=employee=>{
  const index=definition.roleIds.indexOf(employee.roleId);
  return index<0?definition.roleIds.length:index;
 };
 const eligible=candidates.filter(e=>e.enabled&&e.readiness?.ready!==false&&e.skillIds?.includes(capability));
 const assigned=eligible.find(e=>e.id===preferredEmployeeId)||eligible.sort((a,b)=>rolePriority(a)-rolePriority(b)||a.skillIds.length-b.skillIds.length||a.id.localeCompare(b.id))[0];
 if(assigned)return {employeeId:assigned.id,employeeName:assigned.name,executor:definition.executor,reason:'已装配「'+definition.name+'」'};
 return {employeeId:null,employeeName:'目标总控',executor:definition.executor,reason:'由总控直接调用「'+definition.name+'」'};
}
const node=(id,title,capability,dependsOn=[])=>({id,title,capability,dependsOn,objective:title,acceptance:'交付可检查的结果并说明来源与限制',required:true});
export const flowTemplates=[
 {id:'analysis',name:'证据驱动分析',description:'收集证据后，按问题选择分析方法，最后整合判断。',nodes:[node('evidence','收集相关证据','evidence.collect'),node('analysis','分析问题并验证结论','analysis.reason',['evidence']),node('summary','核验与汇总','result.compile',['analysis'])]},
 {id:'compare',name:'候选商品比较',description:'查找已有候选资料，比较参数和报价；不编造评分。',nodes:[node('evidence','查找候选资料','evidence.collect'),node('compare','比较商品参数与报价','product.compare',['evidence']),node('summary','汇总比较结果','result.compile',['compare'])]},
 {id:'content',name:'商品文案制作',description:'统一读取事实，标题和卖点并行产出，再汇总。',nodes:[node('evidence','整理商品来源','evidence.collect'),node('title','制作商品标题','copy.titles',['evidence']),node('selling','提炼商品卖点','copy.selling_points',['evidence']),node('summary','核验与汇总','result.compile',['title','selling'])]},
 {id:'images',name:'商品图片制作',description:'从可用来源整理商品资料，生成主图并交付。',nodes:[node('evidence','整理商品和参考素材','evidence.collect'),node('main','生成商品主图','image.main',['evidence']),node('summary','核验图片交付','result.compile',['main'])]},
];
export function flowDefaults(){return {revision:1,modelId:null,parallel:3,maxNodes:12,maxCalls:24};}
